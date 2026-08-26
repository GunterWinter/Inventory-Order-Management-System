using Application.Common.Extensions;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    private async Task<List<InventoryTransaction>> EnrichCostAllocationsAsync(
        List<InventoryTransaction> transactions,
        CancellationToken cancellationToken)
    {
        var transactionIds = transactions.Select(x => x.Id).ToList();
        var rows = await (from allocation in _queryContext.Set<MaterialExportItem>().AsNoTracking()
            join source in _queryContext.Set<InventoryTransaction>().AsNoTracking()
                on allocation.SourceInventoryTransactionId equals source.Id into sources
            from source in sources.DefaultIfEmpty()
            join serial in _queryContext.Set<ProductSerial>().AsNoTracking()
                on allocation.ProductSerialId equals serial.Id into serials
            from serial in serials.DefaultIfEmpty()
            where !allocation.IsDeleted
                && allocation.InventoryTransactionId != null
                && transactionIds.Contains(allocation.InventoryTransactionId!)
            orderby source.MovementDate, source.CreatedAtUtc, source.Id, allocation.Id
            select new
            {
                allocation.Id,
                allocation.InventoryTransactionId,
                allocation.SourceInventoryTransactionId,
                allocation.SourceCostAllocationId,
                allocation.PurchaseOrderItemId,
                allocation.ProductSerialId,
                allocation.ProductId,
                allocation.WarehouseId,
                allocation.Quantity,
                allocation.UnitPrice,
                allocation.Total,
                allocation.CostSource,
                SourceModule = source != null ? source.ModuleName : null,
                SourceNumber = source != null ? source.ModuleNumber ?? source.Number : null,
                SourceDate = source != null ? source.MovementDate : null,
                ProductSerialNumber = serial != null
                    ? serial.ManufacturerSerialNumber ?? serial.InternalSerialNumber
                    : null
            }).ToListAsync(cancellationToken);

        var lookup = rows.GroupBy(x => x.InventoryTransactionId!)
            .ToDictionary(x => x.Key, x => x.ToList());
        foreach (var transaction in transactions)
        {
            if (!lookup.TryGetValue(transaction.Id, out var allocations)) continue;
            transaction.CostAllocations = allocations.Select(x => new MaterialExportItem
            {
                Id = x.Id,
                InventoryTransactionId = x.InventoryTransactionId,
                SourceInventoryTransactionId = x.SourceInventoryTransactionId,
                SourceCostAllocationId = x.SourceCostAllocationId,
                PurchaseOrderItemId = x.PurchaseOrderItemId,
                ProductSerialId = x.ProductSerialId,
                ProductId = x.ProductId,
                WarehouseId = x.WarehouseId,
                Quantity = x.Quantity,
                UnitPrice = x.UnitPrice,
                Total = x.Total,
                CostSource = x.CostSource,
                SourceModule = x.SourceModule,
                SourceNumber = x.SourceNumber,
                SourceDate = x.SourceDate,
                ProductSerialNumber = x.ProductSerialNumber
            }).ToList();
        }
        return transactions;
    }

    public async Task ReplaceFifoCostAllocationsAsync(
        InventoryTransaction transaction,
        IReadOnlyCollection<InventoryCostSlice> slices,
        string? userId,
        string? materialExportId = null,
        CancellationToken cancellationToken = default)
    {
        await DeleteCostAllocationsAsync(transaction.Id, userId, cancellationToken);
        foreach (var slice in slices.GroupBy(x => new
        {
            x.SourceInventoryTransactionId,
            x.SourceCostAllocationId,
            x.PurchaseOrderItemId,
            x.UnitCost,
            x.CostSource
        }).Select(x => new
        {
            x.Key,
            Quantity = x.Sum(y => y.Quantity)
        }))
        {
            await _costAllocationRepository.CreateAsync(new MaterialExportItem
            {
                CreatedById = userId,
                MaterialExportId = materialExportId,
                InventoryTransactionId = transaction.Id,
                SourceInventoryTransactionId = slice.Key.SourceInventoryTransactionId,
                SourceCostAllocationId = slice.Key.SourceCostAllocationId,
                PurchaseOrderItemId = slice.Key.PurchaseOrderItemId,
                ProductId = transaction.ProductId,
                WarehouseId = transaction.WarehouseId,
                Quantity = slice.Quantity,
                UnitPrice = slice.Key.UnitCost,
                Total = AccountingMath.RoundVnd(slice.Quantity * slice.Key.UnitCost),
                CostSource = slice.Key.CostSource
            }, cancellationToken);
        }
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task ReplaceSerialCostAllocationsAsync(
        InventoryTransaction transaction,
        IReadOnlyCollection<ProductSerial> serials,
        string? userId,
        string? materialExportId = null,
        CancellationToken cancellationToken = default)
    {
        await DeleteCostAllocationsAsync(transaction.Id, userId, cancellationToken);
        var serialIds = serials.Select(x => x.Id).ToList();
        var receiptRows = await (from movement in _queryContext.Set<ProductSerialMovement>().AsNoTracking()
            join inventory in _queryContext.Set<InventoryTransaction>().AsNoTracking()
                on movement.InventoryTransactionId equals inventory.Id
            where !movement.IsDeleted && movement.ReversedAtUtc == null
                && movement.ProductSerialId != null && serialIds.Contains(movement.ProductSerialId)
                && !inventory.IsDeleted && (inventory.Stock ?? 0m) > 0m
            orderby inventory.MovementDate, inventory.CreatedAtUtc, inventory.Id
            select new { movement.ProductSerialId, InventoryTransactionId = inventory.Id })
            .ToListAsync(cancellationToken);
        var receiptBySerial = receiptRows
            .GroupBy(x => x.ProductSerialId!)
            .ToDictionary(x => x.Key, x => x.First().InventoryTransactionId);

        foreach (var serial in serials)
        {
            var resolved = _inventoryCostResolver.ResolveSerial(serial);
            if (!receiptBySerial.TryGetValue(serial.Id, out var sourceTransactionId))
                throw new InvalidOperationException($"Không tìm thấy giao dịch nhập nguồn của serial {serial.InternalSerialNumber ?? serial.Id}.");
            await _costAllocationRepository.CreateAsync(new MaterialExportItem
            {
                CreatedById = userId,
                MaterialExportId = materialExportId,
                InventoryTransactionId = transaction.Id,
                SourceInventoryTransactionId = sourceTransactionId,
                PurchaseOrderItemId = serial.PurchaseOrderItemId,
                ProductSerialId = serial.Id,
                ProductId = transaction.ProductId,
                WarehouseId = transaction.WarehouseId,
                Quantity = 1m,
                UnitPrice = resolved.UnitCost,
                Total = resolved.UnitCost,
                CostSource = resolved.CostSource
            }, cancellationToken);
        }
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task DeleteCostAllocationsAsync(
        string? inventoryTransactionId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(inventoryTransactionId)) return;
        var existing = await _costAllocationRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == inventoryTransactionId)
            .ToListAsync(cancellationToken);
        foreach (var allocation in existing)
        {
            allocation.UpdatedById = userId;
            _costAllocationRepository.Delete(allocation);
        }
    }

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

        var context = await _salesOrderItemRepository.GetQuery()
            .AsNoTracking()
            .Where(x => x.Id == salesOrderItem.Id)
            .Select(x => new
            {
                Physical = x.Product != null && x.Product.Physical == true,
                SerialTrackingMode = x.Product != null
                    ? x.Product.SerialTrackingMode ?? SerialTrackingMode.None
                    : SerialTrackingMode.None,
                OrderDate = x.SalesOrder != null ? x.SalesOrder.OrderDate : null,
                OrderStatus = x.SalesOrder != null ? x.SalesOrder.OrderStatus : null
            })
            .SingleAsync(cancellationToken);
        var inventoryTransaction = context.Physical
            ? await _inventoryTransactionRepository.GetQuery()
                .SingleOrDefaultAsync(x => !x.IsDeleted
                    && x.ModuleName == nameof(SalesOrder)
                    && x.ModuleItemId == salesOrderItem.Id, cancellationToken)
            : null;

        decimal totalCogs;
        if (!context.Physical)
        {
            var unitCost = await GetUnitCostAsync(
                salesOrderItem.Id,
                salesOrderItem.ProductId,
                salesOrderItem.WarehouseId,
                cancellationToken);
            totalCogs = AccountingMath.RoundVnd(unitCost * quantity);
        }
        else if (context.SerialTrackingMode == SerialTrackingMode.None)
        {
            var fifo = await _inventoryCostResolver.ResolveFifoAsync(
                salesOrderItem.ProductId,
                salesOrderItem.WarehouseId,
                quantity,
                context.OrderDate,
                inventoryTransaction?.Id,
                cancellationToken);
            totalCogs = fifo.TotalCost;
            if (context.OrderStatus == SalesOrderStatus.Confirmed && inventoryTransaction != null)
                await ReplaceFifoCostAllocationsAsync(inventoryTransaction, fifo.Slices, updatedById, null, cancellationToken);
        }
        else
        {
            var serials = await _queryContext.Set<ProductSerial>()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.PurchaseOrderItem)
                .Include(x => x.Product)
                .Where(x => x.SalesOrderItemId == salesOrderItem.Id)
                .ToListAsync(cancellationToken);
            if (serials.Count != decimal.ToInt32(quantity))
                throw new InvalidOperationException("Số serial đã chọn phải bằng số lượng bán.");
            totalCogs = AccountingMath.RoundVnd(serials.Sum(x => _inventoryCostResolver.ResolveSerial(x).UnitCost));
            if (context.OrderStatus == SalesOrderStatus.Confirmed && inventoryTransaction != null)
                await ReplaceSerialCostAllocationsAsync(inventoryTransaction, serials, updatedById, null, cancellationToken);
        }

        var totalSales = salesUnitPrice * quantity;

        salesOrderItem.CogsAmount = totalCogs;
        salesOrderItem.ProfitAmount = AccountingMath.RoundVnd(totalSales - totalCogs);
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
