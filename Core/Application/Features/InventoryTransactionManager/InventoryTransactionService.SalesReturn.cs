using Application.Common.Extensions;
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
                SourceItemId = x.ModuleItemId!, x.ProductId, ProductName = x.Product!.Name,
                ProductReferenceCode = x.Product.ReferenceCode, x.WarehouseId,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : string.Empty,
                SerialTrackingMode = (int)(x.Product.SerialTrackingMode ?? SerialTrackingMode.None),
                SourceQuantity = x.Movement ?? 0m
            }).ToListAsync(cancellationToken);

        var currentLines = await SalesReturnGetInvenTransList(salesReturnId, nameof(SalesReturn), cancellationToken);
        var activeReturns = await (from line in _queryContext.Set<InventoryTransaction>().AsNoTracking().ApplyIsDeletedFilter(false)
            join header in _queryContext.Set<SalesReturn>().AsNoTracking().ApplyIsDeletedFilter(false)
                on line.ModuleId equals header.Id
            where line.ModuleName == nameof(SalesReturn) && header.SalesOrderId == salesOrderId
                && header.Id != salesReturnId && header.Status != SalesReturnStatus.Cancelled
            select new { line.ModuleItemId, line.Movement }).ToListAsync(cancellationToken);

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
                ProductSerialNumbers = current?.ProductSerialNumbers ?? string.Empty
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
        string? sourceItemId = null
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
        IReadOnlyCollection<string>? productSerialIds = null
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
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReleaseInventoryTransactionSerialsAsync(id, updatedById, cancellationToken);

        return child;
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

        return await EnrichProductSerialsAsync(childs, cancellationToken);
    }
}
