using Domain.Entities;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task UpdateSalesOrderItemCostAsync(
        SalesOrderItem salesOrderItem,
        string? updatedById,
        CancellationToken cancellationToken = default)
    {
        var quantity = salesOrderItem.Quantity ?? 0m;
        var salesUnitPrice = salesOrderItem.UnitPrice ?? 0m;

        if (quantity <= 0m)
        {
            salesOrderItem.CogsAmount = 0m;
            salesOrderItem.ProfitAmount = 0m;
            return;
        }

        var unitCost = await GetUnitCostAsync(
            salesOrderItem.Id,
            salesOrderItem.ProductId,
            salesOrderItem.WarehouseId,
            cancellationToken
        );

        var totalCogs = Math.Round(unitCost * quantity, 0, MidpointRounding.AwayFromZero);
        var totalSales = salesUnitPrice * quantity;

        salesOrderItem.CogsAmount = totalCogs;
        salesOrderItem.ProfitAmount = Math.Round(totalSales - totalCogs, 0, MidpointRounding.AwayFromZero);
        salesOrderItem.UpdatedById = updatedById;

        _salesOrderItemRepository.Update(salesOrderItem);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    private async Task<decimal> GetUnitCostAsync(
        string? salesOrderItemId,
        string? productId,
        string? warehouseId,
        CancellationToken cancellationToken)
    {
        var resolution = await _inventoryCostResolver.ResolveAsync(
            productId,
            warehouseId,
            salesOrderItemId,
            cancellationToken);
        return resolution.UnitCost;
    }
}
