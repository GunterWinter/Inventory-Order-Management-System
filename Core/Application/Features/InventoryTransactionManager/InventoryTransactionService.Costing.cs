using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

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
        string? productId,
        string? warehouseId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(productId))
        {
            return 0d;
        }

        var receivedPurchaseOrderIds = await _queryContext
            .Set<GoodsReceive>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status == GoodsReceiveStatus.Confirmed && x.PurchaseOrderId != null)
            .Select(x => x.PurchaseOrderId!)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (!receivedPurchaseOrderIds.Any())
        {
            return 0d;
        }

        var query = _queryContext
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => receivedPurchaseOrderIds.Contains(x.PurchaseOrderId!) && x.ProductId == productId);

        if (!string.IsNullOrWhiteSpace(warehouseId))
        {
            query = query.Where(x => x.WarehouseId == warehouseId);
        }

        var purchaseItems = await query.ToListAsync(cancellationToken);
        var totalQty = purchaseItems.Sum(x => x.Quantity ?? 0d);
        if (totalQty <= 0d)
        {
            return 0d;
        }

        return purchaseItems.Sum(x => (x.UnitPrice ?? 0d) * (x.Quantity ?? 0d)) / totalQty;
    }
}
