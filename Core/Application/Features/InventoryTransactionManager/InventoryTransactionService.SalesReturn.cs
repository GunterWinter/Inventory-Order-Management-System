using Application.Common.Extensions;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task<List<ReturnSourceLineDto>> SalesReturnGetSourceLineList(
        string? salesOrderId,
        string? salesReturnId,
        CancellationToken cancellationToken = default)
    {
        var validSource = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Id == salesOrderId
                && x.OrderStatus == SalesOrderStatus.Confirmed, cancellationToken);
        if (!validSource) throw new InvalidOperationException("Đơn bán hàng nguồn phải ở trạng thái Đã xác nhận.");

        var sourceLines = await _queryContext.Set<InventoryTransaction>().AsNoTracking().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesOrder) && x.ModuleId == salesOrderId
                && x.Status == InventoryTransactionStatus.Confirmed && x.ModuleItemId != null
                && x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                SourceTransactionId = x.Id, SourceItemId = x.ModuleItemId!, x.ProductId, ProductName = x.Product!.Name,
                ProductReferenceCode = x.Product.ReferenceCode, x.WarehouseId,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : string.Empty,
                SerialTrackingMode = (int)(x.Product.SerialTrackingMode ?? SerialTrackingMode.None),
                SourceQuantity = x.Movement ?? 0m
            }).ToListAsync(cancellationToken);

        var sourceTransactionIds = sourceLines.Select(x => x.SourceTransactionId).ToList();
        var sourceCostLayers = await (from allocation in _queryContext.Set<MaterialExportItem>().AsNoTracking()
            join receipt in _queryContext.Set<InventoryTransaction>().AsNoTracking()
                on allocation.SourceInventoryTransactionId equals receipt.Id
            join serial in _queryContext.Set<ProductSerial>().AsNoTracking()
                on allocation.ProductSerialId equals serial.Id into serials
            from serial in serials.DefaultIfEmpty()
            where !allocation.IsDeleted && allocation.InventoryTransactionId != null
                && sourceTransactionIds.Contains(allocation.InventoryTransactionId)
            select new
            {
                allocation.Id,
                allocation.InventoryTransactionId,
                allocation.SourceInventoryTransactionId,
                allocation.ProductSerialId,
                ProductSerialNumber = serial != null
                    ? serial.ManufacturerSerialNumber ?? serial.InternalSerialNumber
                    : null,
                SoldQuantity = allocation.Quantity ?? 0m,
                UnitCost = allocation.UnitPrice ?? 0m,
                SourceModule = receipt.ModuleName,
                SourceNumber = receipt.ModuleNumber ?? receipt.Number,
                SourceDate = receipt.MovementDate
            }).ToListAsync(cancellationToken);

        var currentLines = await SalesReturnGetInvenTransList(salesReturnId, nameof(SalesReturn), cancellationToken);
        var activeReturns = await (from line in _queryContext.Set<InventoryTransaction>().AsNoTracking().ApplyIsDeletedFilter(false)
            join header in _queryContext.Set<SalesReturn>().AsNoTracking().ApplyIsDeletedFilter(false)
                on line.ModuleId equals header.Id
            where line.ModuleName == nameof(SalesReturn) && header.SalesOrderId == salesOrderId
                && header.Id != salesReturnId && header.Status != SalesReturnStatus.Cancelled
            select new { line.ModuleItemId, line.Movement }).ToListAsync(cancellationToken);
        var previouslyReturnedLayers = await (from allocation in _queryContext.Set<MaterialExportItem>().AsNoTracking()
            join line in _queryContext.Set<InventoryTransaction>().AsNoTracking()
                on allocation.InventoryTransactionId equals line.Id
            join header in _queryContext.Set<SalesReturn>().AsNoTracking()
                on line.ModuleId equals header.Id
            where !allocation.IsDeleted && !line.IsDeleted && !header.IsDeleted
                && line.ModuleName == nameof(SalesReturn)
                && header.SalesOrderId == salesOrderId
                && header.Id != salesReturnId
                && header.Status != SalesReturnStatus.Cancelled
                && allocation.SourceCostAllocationId != null
            select new { allocation.SourceCostAllocationId, Quantity = allocation.Quantity ?? 0m })
            .ToListAsync(cancellationToken);

        var result = new List<ReturnSourceLineDto>();
        foreach (var source in sourceLines)
        {
            var current = currentLines.SingleOrDefault(x => x.ModuleItemId == source.SourceItemId);
            var previous = activeReturns.Where(x => x.ModuleItemId == source.SourceItemId).Sum(x => x.Movement ?? 0m);
            var available = Math.Max(0m, source.SourceQuantity - previous);
            if (source.SerialTrackingMode > 0)
            {
                var ownIds = current?.ProductSerialIds ?? [];
                var serialCount = await _queryContext.Set<ProductSerial>().AsNoTracking().ApplyIsDeletedFilter(false)
                    .CountAsync(x => x.SalesOrderItemId == source.SourceItemId
                        && (x.Status == ProductSerialStatus.Sold || ownIds.Contains(x.Id)), cancellationToken);
                available = Math.Min(available, serialCount);
            }
            result.Add(new ReturnSourceLineDto
            {
                SourceItemId = source.SourceItemId, ReturnLineId = current?.Id,
                ProductId = source.ProductId, ProductName = source.ProductName,
                ProductReferenceCode = source.ProductReferenceCode,
                WarehouseId = source.WarehouseId, WarehouseName = source.WarehouseName,
                Physical = true, SerialTrackingMode = source.SerialTrackingMode,
                SourceQuantity = source.SourceQuantity, PreviouslyReturnedQuantity = previous,
                CurrentReturnQuantity = current?.Movement ?? 0m,
                AvailableReturnQuantity = available,
                ProductSerialIds = current?.ProductSerialIds ?? [],
                ProductSerialNumbers = current?.ProductSerialNumbers ?? string.Empty,
                CostLayers = sourceCostLayers
                    .Where(x => x.InventoryTransactionId == source.SourceTransactionId)
                    .Select(x =>
                    {
                        var previousLayerQuantity = previouslyReturnedLayers
                            .Where(y => y.SourceCostAllocationId == x.Id)
                            .Sum(y => y.Quantity);
                        var currentLayerQuantity = current?.CostAllocations
                            .Where(y => y.SourceCostAllocationId == x.Id)
                            .Sum(y => y.Quantity ?? 0m) ?? 0m;
                        return new ReturnCostLayerDto
                        {
                            SourceCostAllocationId = x.Id,
                            SourceInventoryTransactionId = x.SourceInventoryTransactionId,
                            SourceModule = x.SourceModule,
                            SourceNumber = x.SourceNumber,
                            SourceDate = x.SourceDate,
                            ProductSerialId = x.ProductSerialId,
                            ProductSerialNumber = x.ProductSerialNumber,
                            SoldQuantity = x.SoldQuantity,
                            PreviouslyReturnedQuantity = previousLayerQuantity,
                            CurrentReturnQuantity = currentLayerQuantity,
                            AvailableReturnQuantity = Math.Max(0m, x.SoldQuantity - previousLayerQuantity),
                            UnitCost = x.UnitCost,
                            TotalCost = AccountingMath.RoundVnd(currentLayerQuantity * x.UnitCost)
                        };
                    }).ToList()
            });
        }
        return result;
    }

    public async Task<InventoryTransaction> SalesReturnCreateInvenTrans(
        string? moduleId,
        string? warehouseId,
        string? productId,
        decimal? movement,
        string? createdById,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<string>? productSerialIds = null,
        string? sourceItemId = null,
        IReadOnlyCollection<ReturnCostLayerSelectionDto>? costLayers = null
        )
    {
        var parent = await _queryContext
            .SalesReturn
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == moduleId, cancellationToken);

        if (parent == null)
        {
            throw new Exception($"Parent entity not found: {moduleId}");
        }
        await _unitOfWork.AcquireTransactionLockAsync($"SalesReturn:{parent.SalesOrderId}", cancellationToken);
        await EnsureSalesReturnParentIsDraftAsync(parent.Id, cancellationToken);
        var candidates = (await SalesReturnGetSourceLineList(parent.SalesOrderId, parent.Id, cancellationToken))
            .Where(x => sourceItemId != null ? x.SourceItemId == sourceItemId : x.ProductId == productId && x.WarehouseId == warehouseId)
            .ToList();
        if (candidates.Count != 1) throw new InvalidOperationException("Không xác định được duy nhất dòng đơn bán hàng nguồn.");
        var source = candidates[0];
        ValidateReturnQuantity(source, movement, productSerialIds);
        await ValidateSalesReturnSerialsAsync(source, productSerialIds, null, cancellationToken);

        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = parent.Id;
        child.ModuleName = nameof(SalesReturn);
        child.ModuleCode = "SRN";
        child.ModuleNumber = parent.Number;
        child.MovementDate = parent.ReturnDate;
        child.Status = (InventoryTransactionStatus?)parent.Status;

        child.WarehouseId = source.WarehouseId;
        child.ProductId = source.ProductId;
        child.ModuleItemId = source.SourceItemId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _inventoryTransactionRepository.CreateAsync(child, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
        await ReplaceSalesReturnCostAllocationsAsync(child, source, productSerialIds, costLayers, createdById, cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, createdById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> SalesReturnUpdateInvenTrans(
        string? id,
        string? warehouseId,
        string? productId,
        decimal? movement,
        string? updatedById,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<string>? productSerialIds = null,
        IReadOnlyCollection<ReturnCostLayerSelectionDto>? costLayers = null
        )
    {
        var child = await _inventoryTransactionRepository.GetAsync(id ?? string.Empty, cancellationToken);

        if (child == null)
        {
            throw new Exception($"Child entity not found: {id}");
        }
        await EnsureSalesReturnParentIsDraftAsync(child.ModuleId, cancellationToken);
        var parent = await _queryContext.Set<SalesReturn>().AsNoTracking().SingleAsync(x => x.Id == child.ModuleId, cancellationToken);
        await _unitOfWork.AcquireTransactionLockAsync($"SalesReturn:{parent.SalesOrderId}", cancellationToken);
        var source = (await SalesReturnGetSourceLineList(parent.SalesOrderId, parent.Id, cancellationToken))
            .SingleOrDefault(x => x.SourceItemId == child.ModuleItemId)
            ?? throw new InvalidOperationException("Không tìm thấy dòng đơn bán hàng nguồn.");
        ValidateReturnQuantity(source, movement, productSerialIds);
        await ValidateSalesReturnSerialsAsync(source, productSerialIds, child.Id, cancellationToken);

        child.UpdatedById = updatedById;

        child.WarehouseId = source.WarehouseId;
        child.ProductId = source.ProductId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        _inventoryTransactionRepository.Update(child);
        await _unitOfWork.SaveAsync(cancellationToken);
        await ReplaceSalesReturnCostAllocationsAsync(child, source, productSerialIds, costLayers, updatedById, cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, updatedById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> SalesReturnDeleteInvenTrans(
        string? id,
        string? updatedById,
        CancellationToken cancellationToken = default
        )
    {
        var child = await _inventoryTransactionRepository.GetAsync(id ?? string.Empty, cancellationToken);

        if (child == null)
        {
            throw new Exception($"Child entity not found: {id}");
        }
        await EnsureSalesReturnParentIsDraftAsync(child.ModuleId, cancellationToken);
        var sourceOrderId = await _queryContext.Set<SalesReturn>().AsNoTracking()
            .Where(x => x.Id == child.ModuleId).Select(x => x.SalesOrderId).SingleAsync(cancellationToken);
        await _unitOfWork.AcquireTransactionLockAsync($"SalesReturn:{sourceOrderId}", cancellationToken);

        child.UpdatedById = updatedById;

        _inventoryTransactionRepository.Delete(child);
        await DeleteCostAllocationsAsync(child.Id, updatedById, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReleaseInventoryTransactionSerialsAsync(id, updatedById, cancellationToken);

        return child;
    }

    private async Task ReplaceSalesReturnCostAllocationsAsync(
        InventoryTransaction returnLine,
        ReturnSourceLineDto source,
        IReadOnlyCollection<string>? productSerialIds,
        IReadOnlyCollection<ReturnCostLayerSelectionDto>? requestedLayers,
        string? userId,
        CancellationToken cancellationToken)
    {
        var saleTransactionId = await _queryContext.Set<InventoryTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.ModuleName == nameof(SalesOrder)
                && x.ModuleItemId == source.SourceItemId)
            .Select(x => x.Id)
            .SingleAsync(cancellationToken);
        var sourceAllocations = await _queryContext.Set<MaterialExportItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == saleTransactionId)
            .ToListAsync(cancellationToken);
        if (sourceAllocations.Count == 0)
            throw new InvalidOperationException("Dòng bán nguồn chưa có chi tiết lớp giá vốn. Hãy chạy backfill hoặc xác nhận lại đơn bán trước khi trả hàng.");

        List<(MaterialExportItem Source, decimal Quantity)> selected;
        if (source.SerialTrackingMode > 0)
        {
            var serialIds = (productSerialIds ?? []).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            selected = sourceAllocations
                .Where(x => x.ProductSerialId != null && serialIds.Contains(x.ProductSerialId))
                .Select(x => (x, 1m))
                .ToList();
            if (selected.Count != serialIds.Count)
                throw new InvalidOperationException("Không tìm thấy giá vốn nguồn của một hoặc nhiều serial trả hàng.");
        }
        else
        {
            var requested = (requestedLayers ?? [])
                .Where(x => x.Quantity > 0m && !string.IsNullOrWhiteSpace(x.SourceCostAllocationId))
                .GroupBy(x => x.SourceCostAllocationId!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(x => x.Key, x => x.Sum(y => y.Quantity), StringComparer.OrdinalIgnoreCase);
            selected = sourceAllocations
                .Where(x => requested.ContainsKey(x.Id))
                .Select(x => (x, requested[x.Id]))
                .ToList();
            if (selected.Count != requested.Count)
                throw new InvalidOperationException("Có lớp giá vốn trả hàng không thuộc dòng bán nguồn.");
        }

        var movement = returnLine.Movement ?? 0m;
        if (Math.Abs(selected.Sum(x => x.Quantity) - movement) > 0.000001m)
            throw new InvalidOperationException("Tổng số lượng chọn theo lớp giá vốn phải bằng số lượng trả hàng.");

        var selectedIds = selected.Select(x => x.Source.Id).ToList();
        var previousUsage = await (from allocation in _queryContext.Set<MaterialExportItem>().AsNoTracking()
            join line in _queryContext.Set<InventoryTransaction>().AsNoTracking()
                on allocation.InventoryTransactionId equals line.Id
            join header in _queryContext.Set<SalesReturn>().AsNoTracking()
                on line.ModuleId equals header.Id
            where !allocation.IsDeleted && !line.IsDeleted && !header.IsDeleted
                && line.Id != returnLine.Id
                && line.ModuleName == nameof(SalesReturn)
                && header.Status != SalesReturnStatus.Cancelled
                && allocation.SourceCostAllocationId != null
                && selectedIds.Contains(allocation.SourceCostAllocationId)
            select new { allocation.SourceCostAllocationId, Quantity = allocation.Quantity ?? 0m })
            .ToListAsync(cancellationToken);
        foreach (var item in selected)
        {
            var alreadyReturned = previousUsage
                .Where(x => x.SourceCostAllocationId == item.Source.Id)
                .Sum(x => x.Quantity);
            if (item.Quantity > (item.Source.Quantity ?? 0m) - alreadyReturned + 0.000001m)
                throw new InvalidOperationException("Số lượng trả theo lớp giá vốn đã vượt số lượng còn có thể trả.");
            if (!item.Source.UnitPrice.HasValue || item.Source.UnitPrice < 0m)
                throw new InvalidOperationException("Lớp giá vốn nguồn không hợp lệ.");
        }

        await DeleteCostAllocationsAsync(returnLine.Id, userId, cancellationToken);
        decimal totalCost = 0m;
        foreach (var item in selected)
        {
            var total = AccountingMath.RoundVnd(item.Quantity * item.Source.UnitPrice!.Value);
            totalCost += total;
            await _costAllocationRepository.CreateAsync(new MaterialExportItem
            {
                CreatedById = userId,
                InventoryTransactionId = returnLine.Id,
                SourceInventoryTransactionId = item.Source.SourceInventoryTransactionId,
                SourceCostAllocationId = item.Source.Id,
                PurchaseOrderItemId = item.Source.PurchaseOrderItemId,
                ProductSerialId = item.Source.ProductSerialId,
                ProductId = returnLine.ProductId,
                WarehouseId = returnLine.WarehouseId,
                Quantity = item.Quantity,
                UnitPrice = item.Source.UnitPrice,
                Total = total,
                CostSource = item.Source.CostSource
            }, cancellationToken);
        }
        returnLine.UnitCost = movement > 0m ? AccountingMath.RoundVnd(totalCost / movement) : 0m;
        _inventoryTransactionRepository.Update(returnLine);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    private async Task EnsureSalesReturnParentIsDraftAsync(string? moduleId, CancellationToken ct)
    {
        if (!await _queryContext.Set<SalesReturn>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Id == moduleId && x.Status == SalesReturnStatus.Draft, ct))
            throw new InvalidOperationException("Chỉ được thay đổi dòng hàng khi phiếu trả hàng bán còn ở trạng thái Nháp.");
    }

    private async Task ValidateSalesReturnSerialsAsync(ReturnSourceLineDto source, IReadOnlyCollection<string>? serialIds, string? currentLineId, CancellationToken ct)
    {
        if (source.SerialTrackingMode <= 0) return;
        var ids = serialIds?.Distinct().ToList() ?? [];
        var ownIds = string.IsNullOrWhiteSpace(currentLineId)
            ? []
            : await _queryContext.Set<ProductSerialMovement>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.InventoryTransactionId == currentLineId && x.ReversedAtUtc == null && x.ProductSerialId != null)
                .Select(x => x.ProductSerialId!).ToListAsync(ct);
        var valid = await _queryContext.Set<ProductSerial>().AsNoTracking().ApplyIsDeletedFilter(false)
            .CountAsync(x => ids.Contains(x.Id) && x.SalesOrderItemId == source.SourceItemId
                && (x.Status == ProductSerialStatus.Sold || ownIds.Contains(x.Id)), ct);
        if (valid != ids.Count) throw new InvalidOperationException("Serial trả hàng phải thuộc đúng dòng đơn bán nguồn và chưa được trả trước đó.");
    }
    public async Task<List<InventoryTransaction>> SalesReturnGetInvenTransList(
        string? moduleId,
        string? moduleName,
        CancellationToken cancellationToken = default
        )
    {
        var childs = await _queryContext
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == moduleId && x.ModuleName == moduleName)
            .ToListAsync(cancellationToken);

        await EnrichProductSerialsAsync(childs, cancellationToken);
        return await EnrichCostAllocationsAsync(childs, cancellationToken);
    }
}
