using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class InventoryAvailabilityServiceTests
{
    [Fact]
    public async Task SerialTrackedAvailability_UsesPhysicalSerialsInsteadOfLedgerQuantity()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"serial-availability-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product
        {
            Name = "Tracked product",
            Physical = true,
            SerialTrackingMode = SerialTrackingMode.InternalAuto
        };
        var warehouse = new Warehouse { Name = "Warehouse", SystemWarehouse = false };
        commandContext.AddRange(product, warehouse);
        commandContext.AddRange(
            new InventoryTransaction
            {
                ProductId = product.Id,
                WarehouseId = warehouse.Id,
                Status = InventoryTransactionStatus.Confirmed,
                Stock = 42d
            },
            new InventoryTransaction
            {
                ProductId = product.Id,
                WarehouseId = warehouse.Id,
                Status = InventoryTransactionStatus.Confirmed,
                Stock = -2d
            });

        for (var index = 0; index < 40; index++)
        {
            commandContext.Add(new ProductSerial
            {
                ProductId = product.Id,
                CurrentWarehouseId = warehouse.Id,
                InternalSerialNumber = $"SERIAL-{index:D3}",
                Status = ProductSerialStatus.InStock
            });
        }
        await commandContext.SaveChangesAsync();

        var service = new InventoryAvailabilityService(queryContext);
        var available = await service.GetAvailableStockAsync(
            product.Id, warehouse.Id, null, CancellationToken.None);

        Assert.Equal(40d, available);
    }

    [Fact]
    public async Task SerialTrackedAvailability_IncludesSerialsReservedByTheItemBeingEdited()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"reserved-availability-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { SerialTrackingMode = SerialTrackingMode.InternalAuto };
        var warehouse = new Warehouse { SystemWarehouse = false };
        var salesOrderItemId = Guid.NewGuid().ToString();
        commandContext.AddRange(product, warehouse,
            new ProductSerial
            {
                ProductId = product.Id,
                CurrentWarehouseId = warehouse.Id,
                Status = ProductSerialStatus.InStock
            },
            new ProductSerial
            {
                ProductId = product.Id,
                CurrentWarehouseId = warehouse.Id,
                Status = ProductSerialStatus.Reserved,
                SalesOrderItemId = salesOrderItemId
            },
            new ProductSerial
            {
                ProductId = product.Id,
                CurrentWarehouseId = warehouse.Id,
                Status = ProductSerialStatus.Reserved,
                SalesOrderItemId = "another-item"
            });
        await commandContext.SaveChangesAsync();

        var service = new InventoryAvailabilityService(queryContext);
        var available = await service.GetAvailableStockAsync(
            product.Id, warehouse.Id, salesOrderItemId, CancellationToken.None);

        Assert.Equal(2d, available);
    }
}
