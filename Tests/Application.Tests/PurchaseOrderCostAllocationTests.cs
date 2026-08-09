using Application.Features.CashTransactionManager;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.PurchaseOrderManager.Commands;
using Application.Features.PurchaseOrderManager;
using Application.Features.WarehouseManager;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class PurchaseOrderCostAllocationTests
{
    [Fact]
    public async Task AllocateConfirmedPurchaseOrder_RepairsMissingInternalSerialsFromInboundStock()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"po-allocation-serial-repair-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var vendor = new Vendor { Name = "Vendor" };
        var customer = new Customer { Name = "Project" };
        var warehouse = new Warehouse { Name = "Warehouse" };
        var customerWarehouse = new Warehouse { Name = "Customer", SystemWarehouse = true };
        var vendorWarehouse = new Warehouse { Name = "Vendor", SystemWarehouse = true };
        var product = new Product
        {
            Name = "Internal serial product",
            Physical = true,
            SerialTrackingMode = SerialTrackingMode.InternalAuto,
            InternalSerialFixedCode = "SN"
        };
        var purchaseOrder = new PurchaseOrder
        {
            Number = "PO-ALLOCATE",
            OrderDate = new DateTime(2026, 8, 10),
            OrderStatus = PurchaseOrderStatus.Confirmed,
            VendorId = vendor.Id,
            AfterTaxAmount = 40d
        };
        var item = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Quantity = 4d,
            Total = 40d,
            AfterTaxAmount = 40d
        };
        var goodsReceive = new GoodsReceive
        {
            Number = "GR-ALLOCATE",
            PurchaseOrderId = purchaseOrder.Id,
            ReceiveDate = purchaseOrder.OrderDate,
            Status = GoodsReceiveStatus.Confirmed
        };
        var inbound = new InventoryTransaction
        {
            ModuleId = goodsReceive.Id,
            ModuleName = nameof(GoodsReceive),
            ModuleItemId = item.Id,
            ModuleNumber = goodsReceive.Number,
            MovementDate = goodsReceive.ReceiveDate,
            Status = InventoryTransactionStatus.Confirmed,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Movement = 4d,
            Stock = 4d,
            TransType = InventoryTransType.In
        };
        commandContext.AddRange(vendor, customer, warehouse, customerWarehouse, vendorWarehouse, product, purchaseOrder, item, goodsReceive, inbound);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var numberSequenceService = new NumberSequenceService(
            new CommandRepository<NumberSequence>(commandContext), unitOfWork);
        var serialService = new ProductSerialService(
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<ProductSerialMovement>(commandContext),
            queryContext,
            unitOfWork);
        var inventoryService = new InventoryTransactionService(
            numberSequenceService,
            new WarehouseService(queryContext),
            queryContext,
            new CommandRepository<InventoryTransaction>(commandContext),
            unitOfWork,
            new CommandRepository<SalesOrderItem>(commandContext),
            serialService);
        var handler = new AllocatePurchaseOrderCostsHandler(
            new CommandRepository<PurchaseOrder>(commandContext),
            new CommandRepository<PurchaseOrderItem>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<PurchaseOrderCostAllocation>(commandContext),
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<InventoryTransaction>(commandContext),
            new CommandRepository<Customer>(commandContext),
            unitOfWork,
            numberSequenceService,
            inventoryService,
            serialService);

        await handler.Handle(new AllocatePurchaseOrderCostsRequest
        {
            PurchaseOrderId = purchaseOrder.Id,
            Items = []
        }, CancellationToken.None);

        var warehouseAllocation = Assert.Single(await commandContext.Set<PurchaseOrderCostAllocation>()
            .Where(x => !x.IsDeleted)
            .ToListAsync());
        Assert.Null(warehouseAllocation.CustomerId);
        Assert.Equal(warehouse.Id, warehouseAllocation.WarehouseId);
        Assert.Equal(4d, warehouseAllocation.Quantity);
        var obligation = Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(PurchaseOrder))
            .ToListAsync());
        Assert.Equal(40d, obligation.Amount);
        Assert.Equal(CashTransactionStatus.Unpaid, obligation.Status);

        await handler.Handle(new AllocatePurchaseOrderCostsRequest
        {
            PurchaseOrderId = purchaseOrder.Id,
            Items = new List<AllocatePurchaseOrderCostsItem>
            {
                new()
                {
                    PurchaseOrderItemId = item.Id,
                    CustomerId = customer.Id,
                    Quantity = 4d,
                    UnitPrice = 10d
                }
            }
        }, CancellationToken.None);

        var allocation = Assert.Single(await commandContext.Set<PurchaseOrderCostAllocation>()
            .Where(x => !x.IsDeleted)
            .ToListAsync());
        var serials = await commandContext.Set<ProductSerial>()
            .Where(x => !x.IsDeleted && x.PurchaseOrderItemId == item.Id)
            .ToListAsync();
        Assert.Equal(4, serials.Count);
        Assert.All(serials, serial =>
        {
            Assert.Equal(ProductSerialStatus.Reserved, serial.Status);
            Assert.Equal(allocation.Id, serial.CostAllocationId);
            Assert.Equal(warehouse.Id, serial.CurrentWarehouseId);
        });

        var purchaseOrderService = new PurchaseOrderService(
            new CommandRepository<PurchaseOrder>(commandContext),
            new CommandRepository<PurchaseOrderItem>(commandContext),
            new CommandRepository<GoodsReceive>(commandContext),
            queryContext,
            unitOfWork,
            numberSequenceService,
            inventoryService,
            serialService,
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashTransactionPayment>(commandContext),
            new CommandRepository<CashTransactionCostAllocation>(commandContext),
            new CashBalanceService(queryContext, new CommandRepository<CashAccount>(commandContext), unitOfWork));

        // Saving the confirmed PO again must keep the full inbound receipt even
        // after AllocatedQuantity equals the purchased quantity.
        await purchaseOrderService.SynchronizeGoodsReceiveAsync(purchaseOrder.Id, null);
        var activeInbound = Assert.Single(await commandContext.Set<InventoryTransaction>()
            .Where(x => !x.IsDeleted
                && x.ModuleName == nameof(GoodsReceive)
                && x.ModuleItemId == item.Id)
            .ToListAsync());
        Assert.Equal(4d, activeInbound.Movement);
        Assert.Equal(4d, activeInbound.Stock);
    }
}
