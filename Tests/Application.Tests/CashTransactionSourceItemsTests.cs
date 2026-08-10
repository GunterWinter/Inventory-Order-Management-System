using Application.Features.CashTransactionManager.Queries;
using Domain.Entities;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class CashTransactionSourceItemsTests
{
    [Fact]
    public async Task PurchaseOrderWithoutAllocations_ReturnsOriginalItems()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "PO product" };
        var order = new PurchaseOrder { Number = "PO-001" };
        var transaction = new CashTransaction
        {
            SourceModule = nameof(PurchaseOrder),
            SourceModuleId = order.Id,
            SourceModuleNumber = order.Number
        };
        commandContext.AddRange(product, order, transaction,
            new PurchaseOrderItem
            {
                PurchaseOrderId = order.Id,
                ProductId = product.Id,
                Quantity = 2d,
                UnitPrice = 400_000d,
                Total = 800_000d
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetCashTransactionSourceItemsHandler(queryContext).Handle(
            new GetCashTransactionSourceItemsRequest { CashTransactionId = transaction.Id },
            CancellationToken.None);

        var item = Assert.Single(result.Data);
        Assert.Equal("PO product", item.ProductName);
        Assert.Equal(800_000d, item.Total);
    }

    [Fact]
    public async Task SalesOrder_ReturnsItemsAndSerialNumbers()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "SO product" };
        var order = new SalesOrder { Number = "SO-001" };
        var item = new SalesOrderItem
        {
            SalesOrderId = order.Id,
            ProductId = product.Id,
            Quantity = 1d,
            UnitPrice = 500_000d,
            Total = 500_000d
        };
        var transaction = new CashTransaction
        {
            SourceModule = nameof(SalesOrder),
            SourceModuleId = order.Id,
            SourceModuleNumber = order.Number
        };
        commandContext.AddRange(product, order, item, transaction,
            new ProductSerial
            {
                ProductId = product.Id,
                SalesOrderItemId = item.Id,
                InternalSerialNumber = "SERIAL-001",
                ManufacturerSerialNumber = "NSX-001"
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetCashTransactionSourceItemsHandler(queryContext).Handle(
            new GetCashTransactionSourceItemsRequest { CashTransactionId = transaction.Id },
            CancellationToken.None);

        var sourceItem = Assert.Single(result.Data);
        Assert.Equal("SO product", sourceItem.ProductName);
        Assert.Equal("SERIAL-001 / NSX-001", sourceItem.ProductSerialNumbers);
    }

    [Fact]
    public async Task MaterialExport_ReturnsExportedProductsAndProject()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Ván MDF", CostPrice = 400_000d };
        var warehouse = new Warehouse { Name = "Kho chính" };
        var customer = new Customer { Name = "Công trình A" };
        var export = new MaterialExport
        {
            Number = "XVT-001",
            CustomerId = customer.Id,
            WarehouseId = warehouse.Id
        };
        var transaction = new CashTransaction
        {
            SourceModule = nameof(MaterialExport),
            SourceModuleId = export.Id,
            SourceModuleNumber = export.Number,
            Amount = 800_000d
        };
        commandContext.AddRange(product, warehouse, customer, export, transaction,
            new InventoryTransaction
            {
                ModuleName = nameof(MaterialExport),
                ModuleId = export.Id,
                ProductId = product.Id,
                WarehouseId = warehouse.Id,
                Movement = 2d,
                Stock = -2d
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetCashTransactionSourceItemsHandler(queryContext).Handle(
            new GetCashTransactionSourceItemsRequest { CashTransactionId = transaction.Id },
            CancellationToken.None);

        var sourceItem = Assert.Single(result.Data);
        Assert.Equal("Ván MDF", sourceItem.ProductName);
        Assert.Equal("Công trình A", sourceItem.CustomerName);
        Assert.Equal("Kho chính", sourceItem.WarehouseName);
        Assert.Equal(2d, sourceItem.Quantity);
        Assert.Equal(400_000d, sourceItem.UnitPrice);
        Assert.Equal(800_000d, sourceItem.Total);
    }

    private static DbContextOptions<DataContext> CreateOptions() =>
        new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"cash-source-items-{Guid.NewGuid()}")
            .Options;
}
