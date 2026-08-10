using Application.Features.ProductSerialManager.Queries;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class WarrantyLookupTests
{
    [Fact]
    public async Task EmptySearch_ReturnsAllSerialsThroughPaging()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"warranty-empty-search-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Thiết bị" };
        commandContext.Add(product);
        for (var index = 1; index <= 3; index++)
        {
            commandContext.Add(new ProductSerial
            {
                ProductId = product.Id,
                InternalSerialNumber = $"SERIAL-{index:000}",
                ManufacturerSerialNumber = $"NSX-{index:000}"
            });
        }
        await commandContext.SaveChangesAsync();

        var firstPage = await new GetWarrantyLookupHandler(queryContext).Handle(
            new GetWarrantyLookupRequest { Search = "", Page = 1, PageSize = 2 },
            CancellationToken.None);
        var secondPage = await new GetWarrantyLookupHandler(queryContext).Handle(
            new GetWarrantyLookupRequest { Search = null, Page = 2, PageSize = 2 },
            CancellationToken.None);

        Assert.Equal(3, firstPage.TotalCount);
        Assert.Equal(2, firstPage.Data!.Count);
        Assert.Single(secondPage.Data!);
        Assert.Equal(2, secondPage.Page);
        Assert.Equal(2, secondPage.PageSize);
    }

    [Fact]
    public async Task Search_FindsManufacturerSerial()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"warranty-manufacturer-search-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Máy lạnh" };
        commandContext.AddRange(product,
            new ProductSerial
            {
                ProductId = product.Id,
                InternalSerialNumber = "INTERNAL-001",
                ManufacturerSerialNumber = "DAIKIN-ABC-999"
            },
            new ProductSerial
            {
                ProductId = product.Id,
                InternalSerialNumber = "INTERNAL-002",
                ManufacturerSerialNumber = "OTHER-001"
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetWarrantyLookupHandler(queryContext).Handle(
            new GetWarrantyLookupRequest { Search = "ABC-999" },
            CancellationToken.None);

        var serial = Assert.Single(result.Data!);
        Assert.Equal("DAIKIN-ABC-999", serial.ManufacturerSerialNumber);
        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task VoidedPurchaseSerial_IsNotReturnedAsActiveWarranty()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"warranty-voided-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Thiết bị" };
        commandContext.AddRange(product,
            new ProductSerial
            {
                ProductId = product.Id,
                InternalSerialNumber = "ACTIVE-001",
                Status = ProductSerialStatus.InStock
            },
            new ProductSerial
            {
                ProductId = product.Id,
                InternalSerialNumber = "VOIDED-001",
                Status = ProductSerialStatus.Voided
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetWarrantyLookupHandler(queryContext).Handle(
            new GetWarrantyLookupRequest(), CancellationToken.None);

        var serial = Assert.Single(result.Data!);
        Assert.Equal("ACTIVE-001", serial.InternalSerialNumber);
        Assert.Equal(1, result.TotalCount);
    }

    [Fact]
    public async Task CostAllocationMovement_ReturnsProjectAllocationDetails()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"warranty-allocation-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var product = new Product { Name = "Camera" };
        var warehouse = new Warehouse { Name = "Kho công trình" };
        var customer = new Customer { Name = "Công trình A" };
        var purchaseOrder = new PurchaseOrder { Number = "PO-001" };
        var purchaseItem = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id
        };
        var allocation = new PurchaseOrderCostAllocation
        {
            PurchaseOrderId = purchaseOrder.Id,
            PurchaseOrderItemId = purchaseItem.Id,
            WarehouseId = warehouse.Id,
            CustomerId = customer.Id,
            Quantity = 1d,
            UnitPrice = 400_000d,
            Amount = 400_000d
        };
        var serial = new ProductSerial
        {
            ProductId = product.Id,
            InternalSerialNumber = "SERIAL-001"
        };
        commandContext.AddRange(product, warehouse, customer, purchaseOrder, purchaseItem, allocation, serial,
            new ProductSerialMovement
            {
                ProductSerialId = serial.Id,
                ModuleName = "CostAllocation",
                ModuleId = allocation.Id,
                MovementDate = new DateTime(2026, 8, 10)
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetWarrantyLookupHandler(queryContext).Handle(
            new GetWarrantyLookupRequest { Search = "SERIAL-001" },
            CancellationToken.None);

        var movement = Assert.Single(Assert.Single(result.Data!).Movements!);
        Assert.Equal("CostAllocation", movement.ViewModuleName);
        Assert.Equal(allocation.Id, movement.ViewModuleId);
        Assert.Equal("PO-001", movement.PurchaseOrderNumber);
        Assert.Equal("Công trình A", movement.AllocationCustomerName);
        Assert.Equal("Camera", movement.AllocationProductName);
        Assert.Equal(400_000d, movement.AllocationTotal);
    }
}
