using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task CreateInboundLayerAsync(
        InventoryTransaction inventoryTransaction,
        PurchaseOrderItem purchaseOrderItem,
        DateTime? receivedDate,
        string? createdById,
        CancellationToken cancellationToken = default)
    {
        var qty = (decimal)(purchaseOrderItem.Quantity ?? 0d);
        var unitCost = (decimal)(purchaseOrderItem.UnitPrice ?? 0d);

        if (qty <= 0m)
        {
            return;
        }

        var hasExistingLayer = await _queryContext
            .Set<InventoryCostLayer>()
            .AsNoTracking()
            .AnyAsync(
                x => !x.IsDeleted && x.InventoryTransactionId == inventoryTransaction.Id,
                cancellationToken
            );

        if (hasExistingLayer)
        {
            return;
        }

        var layer = new InventoryCostLayer
        {
            CreatedById = createdById,
            InventoryTransactionId = inventoryTransaction.Id,
            ModuleItemId = purchaseOrderItem.Id,
            WarehouseId = inventoryTransaction.WarehouseId,
            ProductId = purchaseOrderItem.ProductId,
            BatchNumber = purchaseOrderItem.BatchNumber,
            ReceivedDate = receivedDate,
            UnitCost = unitCost,
            OriginalQty = qty,
            RemainingQty = qty,
            LayerStatus = 1
        };

        await _inventoryCostLayerRepository.CreateAsync(layer, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task AllocateDeliveryAsync(
        InventoryTransaction inventoryTransaction,
        SalesOrderItem salesOrderItem,
        DateTime? allocationDate,
        string? createdById,
        CancellationToken cancellationToken = default)
    {
        var salesOrderItemId = salesOrderItem.Id;
        var requestQty = (decimal)(salesOrderItem.Quantity ?? 0d);
        var salesUnitPrice = (decimal)(salesOrderItem.UnitPrice ?? 0d);

        if (requestQty <= 0m)
        {
            return;
        }

        var existingAllocations = await _queryContext
            .Set<InventoryIssueAllocation>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.InventoryTransactionId == inventoryTransaction.Id)
            .ToListAsync(cancellationToken);

        if (existingAllocations.Any())
        {
            await UpdateSalesOrderItemAmountsAsync(
                salesOrderItemId,
                existingAllocations.Sum(x => (double)(x.CostAmount ?? 0m)),
                existingAllocations.Sum(x => (double)(x.ProfitAmount ?? 0m)),
                createdById,
                cancellationToken
            );
            return;
        }

        var query = _queryContext
            .Set<InventoryCostLayer>()
            .AsNoTracking()
            .Include(x => x.InventoryTransaction)
            .Where(x =>
                !x.IsDeleted &&
                x.InventoryTransaction != null &&
                !x.InventoryTransaction.IsDeleted &&
                x.InventoryTransaction.Status == InventoryTransactionStatus.Confirmed &&
                x.WarehouseId == inventoryTransaction.WarehouseId &&
                x.ProductId == salesOrderItem.ProductId &&
                (x.RemainingQty ?? 0m) > 0m);

        if (!string.IsNullOrWhiteSpace(salesOrderItem.BatchNumber))
        {
            query = query.Where(x => x.BatchNumber == salesOrderItem.BatchNumber);
        }

        var layers = await query
            .OrderBy(x => x.ReceivedDate)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

        decimal remainingToIssue = requestQty;
        double totalCogs = 0d;
        double totalProfit = 0d;

        foreach (var layer in layers)
        {
            if (remainingToIssue <= 0m)
            {
                break;
            }

            var layerRemaining = layer.RemainingQty ?? 0m;
            if (layerRemaining <= 0m)
            {
                continue;
            }

            var issueQty = Math.Min(remainingToIssue, layerRemaining);
            var unitCost = layer.UnitCost ?? 0m;
            var costAmount = issueQty * unitCost;
            var salesAmount = issueQty * salesUnitPrice;
            var profitAmount = salesAmount - costAmount;

            var allocation = new InventoryIssueAllocation
            {
                CreatedById = createdById,
                InventoryTransactionId = inventoryTransaction.Id,
                ModuleItemId = salesOrderItem.Id,
                SalesOrderItemId = salesOrderItem.Id,
                CostLayerId = layer.Id,
                WarehouseId = inventoryTransaction.WarehouseId,
                ProductId = salesOrderItem.ProductId,
                BatchNumber = layer.BatchNumber,
                QtyIssued = issueQty,
                UnitCost = unitCost,
                SalesUnitPrice = salesUnitPrice,
                CostAmount = costAmount,
                SalesAmount = salesAmount,
                ProfitAmount = profitAmount,
                AllocationDate = allocationDate
            };

            await _inventoryIssueAllocationRepository.CreateAsync(allocation, cancellationToken);

            var trackedLayer = await _inventoryCostLayerRepository.GetAsync(layer.Id, cancellationToken);
            if (trackedLayer == null)
            {
                throw new Exception($"Cost layer not found for update: {layer.Id}");
            }

            trackedLayer.RemainingQty = layerRemaining - issueQty;
            trackedLayer.LayerStatus = (trackedLayer.RemainingQty ?? 0m) > 0m ? 1 : 2;
            trackedLayer.UpdatedById = createdById;

            _inventoryCostLayerRepository.Update(trackedLayer);

            totalCogs += (double)costAmount;
            totalProfit += (double)profitAmount;
            remainingToIssue -= issueQty;
        }

        if (remainingToIssue > 0m)
        {
            throw new Exception($"Not enough stock in cost layers for Product: {salesOrderItem.ProductId}, Batch: {salesOrderItem.BatchNumber ?? "ANY"}");
        }

        await UpdateSalesOrderItemAmountsAsync(
            salesOrderItemId,
            totalCogs,
            totalProfit,
            createdById,
            cancellationToken
        );
    }

    private async Task UpdateSalesOrderItemAmountsAsync(
        string? salesOrderItemId,
        double totalCogs,
        double totalProfit,
        string? updatedById,
        CancellationToken cancellationToken)
    {
        var trackedSalesOrderItem = await _salesOrderItemRepository.GetAsync(salesOrderItemId ?? string.Empty, cancellationToken);
        if (trackedSalesOrderItem == null)
        {
            throw new Exception($"Sales order item not found for update: {salesOrderItemId}");
        }

        trackedSalesOrderItem.CogsAmount = totalCogs;
        trackedSalesOrderItem.ProfitAmount = totalProfit;
        trackedSalesOrderItem.UpdatedById = updatedById;

        _salesOrderItemRepository.Update(trackedSalesOrderItem);
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
