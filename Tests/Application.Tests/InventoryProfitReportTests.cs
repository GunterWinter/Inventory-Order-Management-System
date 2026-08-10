using Application.Features.SalesOrderItemManager.Queries;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class InventoryProfitReportTests
{
    [Fact]
    public async Task ConfirmedSale_UsesActualReceivedPurchaseOrderPrice()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Camera", CostPrice = 350_000d, Physical = true };
        var warehouse = new Warehouse { Name = "Kho chính", SystemWarehouse = false };
        var purchaseOrder = new PurchaseOrder { Number = "PO-001", OrderStatus = PurchaseOrderStatus.Confirmed };
        var purchaseItem = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Quantity = 1d,
            UnitPrice = 400_000d
        };
        var salesOrder = new SalesOrder
        {
            Number = "SO-001",
            OrderStatus = SalesOrderStatus.Confirmed,
            OrderDate = new DateTime(2026, 8, 10)
        };
        var salesItem = new SalesOrderItem
        {
            SalesOrderId = salesOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Quantity = 1d,
            UnitPrice = 500_000d
        };

        commandContext.AddRange(product, warehouse, purchaseOrder, purchaseItem, salesOrder, salesItem);
        commandContext.Add(new InventoryTransaction
        {
            ModuleName = nameof(PurchaseOrder),
            ModuleItemId = purchaseItem.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Status = InventoryTransactionStatus.Confirmed,
            Movement = 1d,
            Stock = 1d
        });
        await commandContext.SaveChangesAsync();

        var result = await new GetInventoryProfitReportHandler(queryContext)
            .Handle(new GetInventoryProfitReportRequest(), CancellationToken.None);

        var row = Assert.Single(result.Data);
        Assert.Equal(400_000d, row.UnitCost);
        Assert.Equal(400_000d, row.TotalCost);
        Assert.Equal(100_000d, row.Profit);
        Assert.Equal("PO thực nhập bình quân", row.CostSource);
        Assert.False(row.IsFallbackCost);
    }

    [Fact]
    public async Task MissingPurchaseSource_UsesProductCostAndExcludesDraftSales()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Fallback", CostPrice = 350_000d };
        var confirmed = new SalesOrder { Number = "SO-C", OrderStatus = SalesOrderStatus.Confirmed };
        var draft = new SalesOrder { Number = "SO-D", OrderStatus = SalesOrderStatus.Draft };
        commandContext.AddRange(product, confirmed, draft,
            new SalesOrderItem
            {
                SalesOrderId = confirmed.Id,
                ProductId = product.Id,
                Quantity = 2d,
                UnitPrice = 500_000d
            },
            new SalesOrderItem
            {
                SalesOrderId = draft.Id,
                ProductId = product.Id,
                Quantity = 5d,
                UnitPrice = 500_000d
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetInventoryProfitReportHandler(queryContext)
            .Handle(new GetInventoryProfitReportRequest(), CancellationToken.None);

        var row = Assert.Single(result.Data);
        Assert.Equal("SO-C", row.SalesOrderNumber);
        Assert.Equal(350_000d, row.UnitCost);
        Assert.Equal(300_000d, row.Profit);
        Assert.True(row.IsFallbackCost);
    }

    [Fact]
    public async Task SerialSale_UsesExactSerialPurchaseOrderItemPrice()
    {
        var options = CreateOptions();
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product
        {
            Name = "Serial camera",
            CostPrice = 350_000d,
            SerialTrackingMode = SerialTrackingMode.InternalAuto
        };
        var purchaseItem = new PurchaseOrderItem { ProductId = product.Id, UnitPrice = 400_000d, Quantity = 1d };
        var salesOrder = new SalesOrder { Number = "SO-SERIAL", OrderStatus = SalesOrderStatus.Confirmed };
        var salesItem = new SalesOrderItem
        {
            SalesOrderId = salesOrder.Id,
            ProductId = product.Id,
            Quantity = 1d,
            UnitPrice = 500_000d
        };
        commandContext.AddRange(product, purchaseItem, salesOrder, salesItem,
            new ProductSerial
            {
                ProductId = product.Id,
                PurchaseOrderItemId = purchaseItem.Id,
                SalesOrderItemId = salesItem.Id,
                InternalSerialNumber = "SERIAL-001"
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetInventoryProfitReportHandler(queryContext)
            .Handle(new GetInventoryProfitReportRequest(), CancellationToken.None);

        var row = Assert.Single(result.Data);
        Assert.Equal(400_000d, row.UnitCost);
        Assert.Equal(100_000d, row.Profit);
        Assert.Equal("PO theo serial", row.CostSource);
    }

    private static DbContextOptions<DataContext> CreateOptions() =>
        new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"inventory-profit-{Guid.NewGuid()}")
            .Options;
}
