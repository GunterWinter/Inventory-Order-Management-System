using Application.Features.PurchaseOrderItemManager.Commands;
using Xunit;

namespace Application.Tests;

public class PurchaseOrderItemValidatorTests
{
    [Fact]
    public void CreateValidator_AllowsEmptyManufacturerSerialList_ForNonManufacturerProducts()
    {
        var request = new CreatePurchaseOrderItemRequest
        {
            PurchaseOrderId = "po-1",
            ProductId = "product-1",
            WarehouseId = "warehouse-1",
            TaxId = "tax-1",
            UnitPrice = 450_000,
            Quantity = 1,
            ManufacturerSerialNumbers = []
        };

        var result = new CreatePurchaseOrderItemValidator().Validate(request);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors.Select(x => x.ErrorMessage)));
    }

    [Fact]
    public void UpdateValidator_AllowsEmptyManufacturerSerialList_ForNonManufacturerProducts()
    {
        var request = new UpdatePurchaseOrderItemRequest
        {
            Id = "item-1",
            PurchaseOrderId = "po-1",
            ProductId = "product-1",
            WarehouseId = "warehouse-1",
            TaxId = "tax-1",
            UnitPrice = 450_000,
            Quantity = 1,
            ManufacturerSerialNumbers = []
        };

        var result = new UpdatePurchaseOrderItemValidator().Validate(request);

        Assert.True(result.IsValid, string.Join(Environment.NewLine, result.Errors.Select(x => x.ErrorMessage)));
    }
}
