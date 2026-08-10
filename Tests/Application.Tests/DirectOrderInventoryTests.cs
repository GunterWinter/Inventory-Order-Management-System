using Application.Features.CashTransactionManager;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.PurchaseOrderManager;
using Application.Features.SalesOrderManager;
using Application.Features.WarehouseManager;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class DirectOrderInventoryTests
{
    [Fact]
    public async Task ConfirmingOutboundDocument_RejectsQuantityAboveAvailableStockWithoutPartialUpdate()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"outbound-stock-validation-{Guid.NewGuid()}").Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var warehouse = new Warehouse { Name = "Main", SystemWarehouse = false };
        var product = new Product
        {
            Name = "Board",
            Physical = true,
            SerialTrackingMode = SerialTrackingMode.None
        };
        var receipt = new InventoryTransaction
        {
            ModuleId = "PO-1",
            ModuleName = nameof(PurchaseOrder),
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Status = InventoryTransactionStatus.Confirmed,
            Movement = 5d,
            Stock = 5d
        };
        var outbound = new InventoryTransaction
        {
            ModuleId = "TRANSFER-1",
            ModuleName = nameof(TransferOut),
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Status = InventoryTransactionStatus.Draft,
            Movement = 6d,
            Stock = -6d
        };
        commandContext.AddRange(warehouse, product, receipt, outbound);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var numberService = new NumberSequenceService(new CommandRepository<NumberSequence>(commandContext), unitOfWork);
        var serialService = new ProductSerialService(
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<ProductSerialMovement>(commandContext), queryContext, unitOfWork);
        var inventoryService = new InventoryTransactionService(
            numberService, new WarehouseService(queryContext), queryContext,
            new CommandRepository<InventoryTransaction>(commandContext), unitOfWork,
            new CommandRepository<SalesOrderItem>(commandContext), serialService);

        var error = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            inventoryService.PropagateParentUpdate(
                "TRANSFER-1", nameof(TransferOut), DateTime.Today,
                InventoryTransactionStatus.Confirmed, false, null, warehouse.Id));

        Assert.Contains("Không đủ tồn kho", error.Message);
        Assert.Equal(InventoryTransactionStatus.Draft,
            (await commandContext.Set<InventoryTransaction>().SingleAsync(x => x.Id == outbound.Id)).Status);
        Assert.Equal(5d, await commandContext.Set<InventoryTransaction>()
            .Where(x => x.Status == InventoryTransactionStatus.Confirmed && x.ProductId == product.Id)
            .SumAsync(x => x.Stock ?? 0d));
    }

    [Fact]
    public async Task ConfirmedPurchaseAndSalesOrders_UpdatePhysicalStockAndCreateDebtsDirectly()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"direct-order-inventory-{Guid.NewGuid()}").Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var vendor = new Vendor { Name = "Vendor" };
        var customer = new Customer { Name = "Project A" };
        var warehouse = new Warehouse { Name = "Main", SystemWarehouse = false };
        var vendorWarehouse = new Warehouse { Name = "Vendor", SystemWarehouse = true };
        var customerWarehouse = new Warehouse { Name = "Customer", SystemWarehouse = true };
        var physical = new Product { Name = "Board", Physical = true, SerialTrackingMode = SerialTrackingMode.None };
        var service = new Product { Name = "Desk service", Physical = false, SerialTrackingMode = SerialTrackingMode.None };
        var purchase = new PurchaseOrder
        {
            Number = "PO-DIRECT", VendorId = vendor.Id, OrderDate = new DateTime(2026, 8, 10),
            OrderStatus = PurchaseOrderStatus.Confirmed, AfterTaxAmount = 2_200d
        };
        var purchasePhysical = new PurchaseOrderItem
        {
            PurchaseOrderId = purchase.Id, ProductId = physical.Id, WarehouseId = warehouse.Id,
            Quantity = 5d, UnitPrice = 400d, AfterTaxAmount = 2_000d
        };
        var purchaseService = new PurchaseOrderItem
        {
            PurchaseOrderId = purchase.Id, ProductId = service.Id, WarehouseId = null,
            Quantity = 1d, UnitPrice = 200d, AfterTaxAmount = 200d
        };
        commandContext.AddRange(vendor, customer, warehouse, vendorWarehouse, customerWarehouse, physical, service, purchase, purchasePhysical, purchaseService);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var numberService = new NumberSequenceService(new CommandRepository<NumberSequence>(commandContext), unitOfWork);
        var serialService = new ProductSerialService(
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<ProductSerialMovement>(commandContext), queryContext, unitOfWork);
        var inventoryService = new InventoryTransactionService(
            numberService, new WarehouseService(queryContext), queryContext,
            new CommandRepository<InventoryTransaction>(commandContext), unitOfWork,
            new CommandRepository<SalesOrderItem>(commandContext), serialService);
        var cashBalance = new CashBalanceService(queryContext, new CommandRepository<CashAccount>(commandContext), unitOfWork);
        var purchaseServiceManager = new PurchaseOrderService(
            new CommandRepository<PurchaseOrder>(commandContext),
            new CommandRepository<PurchaseOrderItem>(commandContext),
            new CommandRepository<InventoryTransaction>(commandContext),
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<PurchaseOrderCostAllocation>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashTransactionPayment>(commandContext),
            queryContext, unitOfWork, numberService, inventoryService, serialService, cashBalance);

        await purchaseServiceManager.SynchronizeInventoryAsync(purchase.Id, null);
        await purchaseServiceManager.EnsureVendorObligationAsync(purchase.Id, null);

        var purchaseMovement = Assert.Single(await commandContext.Set<InventoryTransaction>()
            .Where(x => !x.IsDeleted && x.ModuleName == nameof(PurchaseOrder)).ToListAsync());
        Assert.Equal(physical.Id, purchaseMovement.ProductId);
        Assert.Equal(5d, purchaseMovement.Stock);
        Assert.DoesNotContain(await commandContext.Set<InventoryTransaction>().ToListAsync(), x => x.ProductId == service.Id);
        var payable = Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(PurchaseOrder)).ToListAsync());
        Assert.Equal(2_200d, payable.Amount);
        Assert.Equal(CashTransactionType.Credit, payable.TransactionType);

        var sales = new SalesOrder
        {
            Number = "SO-DIRECT", CustomerId = customer.Id, OrderDate = new DateTime(2026, 8, 10),
            OrderStatus = SalesOrderStatus.Confirmed, AfterTaxAmount = 1_500d
        };
        var salesPhysical = new SalesOrderItem
        {
            SalesOrderId = sales.Id, ProductId = physical.Id, WarehouseId = warehouse.Id,
            Quantity = 2d, UnitPrice = 500d
        };
        var salesService = new SalesOrderItem
        {
            SalesOrderId = sales.Id, ProductId = service.Id, WarehouseId = null,
            Quantity = 1d, UnitPrice = 500d
        };
        commandContext.AddRange(sales, salesPhysical, salesService);
        await commandContext.SaveChangesAsync();

        var salesServiceManager = new SalesOrderService(
            new CommandRepository<SalesOrder>(commandContext),
            new CommandRepository<SalesOrderItem>(commandContext),
            new CommandRepository<InventoryTransaction>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashTransactionPayment>(commandContext),
            queryContext, unitOfWork, numberService, inventoryService, serialService,
            new WarehouseService(queryContext), cashBalance);
        await salesServiceManager.SynchronizeInventoryAsync(sales.Id, null);

        var salesMovement = Assert.Single(await commandContext.Set<InventoryTransaction>()
            .Where(x => !x.IsDeleted && x.ModuleName == nameof(SalesOrder)).ToListAsync());
        Assert.Equal(physical.Id, salesMovement.ProductId);
        Assert.Equal(-2d, salesMovement.Stock);
        Assert.Equal(3d, await commandContext.Set<InventoryTransaction>()
            .Where(x => !x.IsDeleted && x.Status == InventoryTransactionStatus.Confirmed && x.ProductId == physical.Id)
            .SumAsync(x => x.Stock ?? 0d));
        var receivable = Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(SalesOrder)).ToListAsync());
        Assert.Equal(1_500d, receivable.Amount);
        Assert.Equal(CashTransactionType.Debit, receivable.TransactionType);
    }
}
