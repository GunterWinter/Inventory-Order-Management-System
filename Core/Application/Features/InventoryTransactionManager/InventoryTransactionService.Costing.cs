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
        if (string.IsNullOrWhiteSpace(productId))
        {
            return 0d;
        }

        if (!string.IsNullOrWhiteSpace(salesOrderItemId))
        {
            var serialCosts = await _queryContext.Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderItemId == salesOrderItemId && x.PurchaseOrderItem != null)
                .Select(x => x.PurchaseOrderItem!.UnitPrice ?? 0d)
                .ToListAsync(cancellationToken);
            if (serialCosts.Count > 0)
            {
                return serialCosts.Average();
            }
        }

        var receiptCosts = await (
            from transaction in _queryContext.Set<InventoryTransaction>().AsNoTracking()
            join purchaseItem in _queryContext.Set<PurchaseOrderItem>().AsNoTracking()
                on transaction.ModuleItemId equals purchaseItem.Id
            where !transaction.IsDeleted
                && !purchaseItem.IsDeleted
                && transaction.Status == InventoryTransactionStatus.Confirmed
                && transaction.ModuleName == nameof(PurchaseOrder)
                && transaction.ProductId == productId
                && (string.IsNullOrWhiteSpace(warehouseId) || transaction.WarehouseId == warehouseId)
                && (transaction.Stock ?? transaction.Movement ?? 0d) > 0d
            select new
            {
                Quantity = transaction.Stock ?? transaction.Movement ?? 0d,
                UnitCost = purchaseItem.UnitPrice ?? 0d
            })
            .ToListAsync(cancellationToken);

        var receivedQuantity = receiptCosts.Sum(x => x.Quantity);
        if (receivedQuantity > 0d)
        {
            return receiptCosts.Sum(x => x.Quantity * x.UnitCost) / receivedQuantity;
        }

        return await _queryContext.Set<Product>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == productId)
            .Select(x => x.CostPrice ?? 0d)
            .SingleOrDefaultAsync(cancellationToken);
    }
}
