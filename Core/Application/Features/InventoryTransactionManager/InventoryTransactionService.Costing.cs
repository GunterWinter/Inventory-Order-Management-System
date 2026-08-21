using Domain.Entities;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task UpdateSalesOrderItemCostAsync(
        SalesOrderItem salesOrderItem,
        string? updatedById,
        CancellationToken cancellationToken = default)
    {
        var quantity = salesOrderItem.Quantity ?? 0d;
        var salesUnitPrice = salesOrderItem.UnitPrice ?? 0d;

        if (quantity <= 0d)
        {
            salesOrderItem.CogsAmount = 0d;
            salesOrderItem.ProfitAmount = 0d;
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

    private async Task<double> GetUnitCostAsync(
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
