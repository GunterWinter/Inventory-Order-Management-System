using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task UpdateSalesOrderItemBatchCostAsync(
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

        var unitCost = await GetBatchUnitCostAsync(
            salesOrderItem.ProductId,
            salesOrderItem.WarehouseId,
            salesOrderItem.BatchNumber,
            cancellationToken
        );

        var totalCogs = unitCost * quantity;
        var totalSales = salesUnitPrice * quantity;

        salesOrderItem.CogsAmount = totalCogs;
        salesOrderItem.ProfitAmount = totalSales - totalCogs;
        salesOrderItem.UpdatedById = updatedById;

        _salesOrderItemRepository.Update(salesOrderItem);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    private async Task<double> GetBatchUnitCostAsync(
        string? productId,
        string? warehouseId,
        string? batchNumber,
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
            .Where(x =>
                x.Status == GoodsReceiveStatus.Confirmed &&
                x.PurchaseOrderId != null)
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
            .Where(x =>
                receivedPurchaseOrderIds.Contains(x.PurchaseOrderId!) &&
                x.ProductId == productId);

        if (!string.IsNullOrWhiteSpace(warehouseId))
        {
            query = query.Where(x => x.WarehouseId == warehouseId);
        }

        if (!string.IsNullOrWhiteSpace(batchNumber))
        {
            query = query.Where(x => x.BatchNumber == batchNumber);
        }

        var purchaseItems = await query.ToListAsync(cancellationToken);

        if (!purchaseItems.Any() && !string.IsNullOrWhiteSpace(batchNumber))
        {
            purchaseItems = await _queryContext
                .Set<PurchaseOrderItem>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x =>
                    receivedPurchaseOrderIds.Contains(x.PurchaseOrderId!) &&
                    x.ProductId == productId &&
                    x.BatchNumber == batchNumber)
                .ToListAsync(cancellationToken);
        }

        var totalQty = purchaseItems.Sum(x => x.Quantity ?? 0d);
        if (totalQty <= 0d)
        {
            return 0d;
        }

        return purchaseItems.Sum(x => (x.UnitPrice ?? 0d) * (x.Quantity ?? 0d)) / totalQty;
    }
}
