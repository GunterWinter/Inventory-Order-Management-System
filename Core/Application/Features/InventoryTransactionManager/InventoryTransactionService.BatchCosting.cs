using Application.Common.Repositories;
using Domain.Entities;
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

        if (qty <= 0m) return;

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
            LayerStatus = 1 // 1: Mở (Open)
        };

        // ĐÚNG CHUẨN: Dùng CommandRepository để Create
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
        var requestQty = (decimal)(salesOrderItem.Quantity ?? 0d);
        var salesUnitPrice = (decimal)(salesOrderItem.UnitPrice ?? 0d);

        if (requestQty <= 0m) return;

        // ĐÚNG CHUẨN: Dùng _queryContext ĐỂ ĐỌC DỮ LIỆU
        var query = _queryContext.Set<InventoryCostLayer>()
            .Where(x =>
                !x.IsDeleted &&
                x.WarehouseId == inventoryTransaction.WarehouseId &&
                x.ProductId == salesOrderItem.ProductId &&
                (x.RemainingQty ?? 0m) > 0m);

        if (!string.IsNullOrWhiteSpace(salesOrderItem.BatchNumber))
        {
            query = query.Where(x => x.BatchNumber == salesOrderItem.BatchNumber);
        }
        else
        {
            query = query.OrderBy(x => x.ReceivedDate).ThenBy(x => x.Id);
        }

        var layers = await query.ToListAsync(cancellationToken);

        decimal remainingToIssue = requestQty;
        double totalCogs = 0d;
        double totalProfit = 0d;

        foreach (var layer in layers)
        {
            if (remainingToIssue <= 0m) break;

            var layerRemaining = layer.RemainingQty ?? 0m;
            if (layerRemaining <= 0m) continue;

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

            // Dùng CommandRepository để Create
            await _inventoryIssueAllocationRepository.CreateAsync(allocation, cancellationToken);

            layer.RemainingQty = layerRemaining - issueQty;
            layer.LayerStatus = (layer.RemainingQty ?? 0m) > 0m ? 1 : 2;
            layer.UpdatedById = createdById;

            // BẮT BUỘC gọi Update trên CommandRepository
            _inventoryCostLayerRepository.Update(layer);

            totalCogs += (double)costAmount;
            totalProfit += (double)profitAmount;
            remainingToIssue -= issueQty;
        }

        if (remainingToIssue > 0m)
        {
            throw new Exception($"Not enough stock in cost layers for Product: {salesOrderItem.ProductId}, Batch: {salesOrderItem.BatchNumber ?? "ANY"}");
        }

        salesOrderItem.CogsAmount = totalCogs;
        salesOrderItem.ProfitAmount = totalProfit;
        salesOrderItem.UpdatedById = createdById;

        // BẮT BUỘC gọi Update để lưu Cogs/Profit
        _salesOrderItemRepository.Update(salesOrderItem);

        await _unitOfWork.SaveAsync(cancellationToken);
    }
}