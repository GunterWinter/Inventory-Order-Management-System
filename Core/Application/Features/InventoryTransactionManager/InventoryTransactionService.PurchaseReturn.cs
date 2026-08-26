using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task<List<ReturnSourceLineDto>> PurchaseReturnGetSourceLineList(
        string? purchaseOrderId,
        string? purchaseReturnId,
        CancellationToken cancellationToken = default)
    {
        var validSource = await _queryContext.Set<PurchaseOrder>().AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Id == purchaseOrderId
                && x.OrderStatus == PurchaseOrderStatus.Confirmed, cancellationToken);
        if (!validSource) throw new InvalidOperationException("Đơn mua hàng nguồn phải ở trạng thái Đã xác nhận.");

        var sourceLines = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(PurchaseOrder) && x.ModuleId == purchaseOrderId
                && x.Status == InventoryTransactionStatus.Confirmed && x.ModuleItemId != null
                && x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                SourceItemId = x.ModuleItemId!, x.ProductId, ProductName = x.Product!.Name,
                ProductReferenceCode = x.Product.ReferenceCode, x.WarehouseId,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : string.Empty,
                SerialTrackingMode = (int)(x.Product.SerialTrackingMode ?? SerialTrackingMode.None),
                SourceQuantity = x.Movement ?? 0m
            })
            .ToListAsync(cancellationToken);

        var currentLines = await PurchaseReturnGetInvenTransList(purchaseReturnId, nameof(PurchaseReturn), cancellationToken);
        var activeReturns = await (from line in _queryContext.Set<InventoryTransaction>().AsNoTracking().ApplyIsDeletedFilter(false)
            join header in _queryContext.Set<PurchaseReturn>().AsNoTracking().ApplyIsDeletedFilter(false)
                on line.ModuleId equals header.Id
            where line.ModuleName == nameof(PurchaseReturn) && header.PurchaseOrderId == purchaseOrderId
                && header.Id != purchaseReturnId && header.Status != PurchaseReturnStatus.Cancelled
            select new { line.ModuleItemId, line.ProductId, line.WarehouseId, line.Movement, header.Status })
            .ToListAsync(cancellationToken);

        var result = new List<ReturnSourceLineDto>();
        foreach (var source in sourceLines)
        {
            var current = currentLines.SingleOrDefault(x => x.ModuleItemId == source.SourceItemId);
            var previous = activeReturns.Where(x => x.ModuleItemId == source.SourceItemId).Sum(x => x.Movement ?? 0m);
            var stock = await _queryContext.Set<InventoryTransaction>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.Status == InventoryTransactionStatus.Confirmed
                    && x.ProductId == source.ProductId && x.WarehouseId == source.WarehouseId)
                .SumAsync(x => x.Stock ?? 0m, cancellationToken);
            var draftReserved = activeReturns.Where(x => x.Status == PurchaseReturnStatus.Draft
                    && x.ProductId == source.ProductId && x.WarehouseId == source.WarehouseId)
                .Sum(x => x.Movement ?? 0m);
            var available = Math.Max(0m, Math.Min(source.SourceQuantity - previous, stock - draftReserved));

            if (source.SerialTrackingMode > 0)
            {
                var ownIds = current?.ProductSerialIds ?? [];
                var serialCount = await _queryContext.Set<ProductSerial>().AsNoTracking().ApplyIsDeletedFilter(false)
                    .CountAsync(x => x.PurchaseOrderItemId == source.SourceItemId
                        && ((x.CurrentWarehouseId == source.WarehouseId
                                && (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.ReturnedByCustomer))
                            || ownIds.Contains(x.Id)), cancellationToken);
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
                CurrentReturnQuantity = current?.Movement ?? 0m, WarehouseStock = stock,
                AvailableReturnQuantity = available,
                ProductSerialIds = current?.ProductSerialIds ?? [],
                ProductSerialNumbers = current?.ProductSerialNumbers ?? string.Empty
            });
        }
        return result;
    }

    public async Task<InventoryTransaction> PurchaseReturnCreateInvenTrans(
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
            .PurchaseReturn
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == moduleId, cancellationToken);

        if (parent == null)
        {
            throw new Exception($"Parent entity not found: {moduleId}");
        }
        await _unitOfWork.AcquireTransactionLockAsync($"PurchaseReturn:{parent.PurchaseOrderId}", cancellationToken);
        await EnsureOutboundParentIsDraftAsync(nameof(PurchaseReturn), parent.Id, cancellationToken);
        var sourceLines = await PurchaseReturnGetSourceLineList(parent.PurchaseOrderId, parent.Id, cancellationToken);
        var candidates = sourceLines.Where(x => sourceItemId != null
            ? x.SourceItemId == sourceItemId
            : x.ProductId == productId && x.WarehouseId == warehouseId).ToList();
        if (candidates.Count != 1) throw new InvalidOperationException("Không xác định được duy nhất dòng đơn mua hàng nguồn.");
        var source = candidates[0];
        ValidateReturnQuantity(source, movement, productSerialIds);
        await ValidatePurchaseReturnSerialsAsync(source, productSerialIds, null, cancellationToken);

        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = parent.Id;
        child.ModuleName = nameof(PurchaseReturn);
        child.ModuleCode = "PRN";
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

    public async Task<InventoryTransaction> PurchaseReturnUpdateInvenTrans(
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
        await EnsureOutboundParentIsDraftAsync(nameof(PurchaseReturn), child.ModuleId, cancellationToken);
        var parent = await _queryContext.Set<PurchaseReturn>().AsNoTracking().SingleAsync(x => x.Id == child.ModuleId, cancellationToken);
        await _unitOfWork.AcquireTransactionLockAsync($"PurchaseReturn:{parent.PurchaseOrderId}", cancellationToken);
        var source = (await PurchaseReturnGetSourceLineList(parent.PurchaseOrderId, parent.Id, cancellationToken))
            .SingleOrDefault(x => x.SourceItemId == child.ModuleItemId)
            ?? throw new InvalidOperationException("Không tìm thấy dòng đơn mua hàng nguồn.");
        ValidateReturnQuantity(source, movement, productSerialIds);
        await ValidatePurchaseReturnSerialsAsync(source, productSerialIds, child.Id, cancellationToken);

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

    private static void ValidateReturnQuantity(ReturnSourceLineDto source, decimal? movement, IReadOnlyCollection<string>? serialIds)
    {
        var quantity = movement ?? 0m;
        if (quantity <= 0m) throw new InvalidOperationException("Số lượng trả phải lớn hơn 0.");
        if (quantity > source.AvailableReturnQuantity + 0.000001m)
            throw new InvalidOperationException($"Số lượng trả vượt quá số có thể trả ({source.AvailableReturnQuantity}).");
        if (source.SerialTrackingMode > 0
            && (quantity != decimal.Truncate(quantity) || serialIds?.Distinct().Count() != quantity))
            throw new InvalidOperationException("Số lượng trả phải bằng số serial duy nhất đã chọn.");
    }

    private async Task ValidatePurchaseReturnSerialsAsync(ReturnSourceLineDto source, IReadOnlyCollection<string>? serialIds, string? currentLineId, CancellationToken ct)
    {
        if (source.SerialTrackingMode <= 0) return;
        var ids = serialIds?.Distinct().ToList() ?? [];
        var ownIds = string.IsNullOrWhiteSpace(currentLineId)
            ? []
            : await _queryContext.Set<ProductSerialMovement>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.InventoryTransactionId == currentLineId && x.ReversedAtUtc == null && x.ProductSerialId != null)
                .Select(x => x.ProductSerialId!).ToListAsync(ct);
        var valid = await _queryContext.Set<ProductSerial>().AsNoTracking().ApplyIsDeletedFilter(false)
            .CountAsync(x => ids.Contains(x.Id) && x.PurchaseOrderItemId == source.SourceItemId
                && ((x.CurrentWarehouseId == source.WarehouseId
                        && (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.ReturnedByCustomer))
                    || ownIds.Contains(x.Id)), ct);
        if (valid != ids.Count) throw new InvalidOperationException("Serial trả hàng phải thuộc đúng dòng đơn mua và còn tại kho nguồn.");
    }

    public async Task<InventoryTransaction> PurchaseReturnDeleteInvenTrans(
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
        await EnsureOutboundParentIsDraftAsync(nameof(PurchaseReturn), child.ModuleId, cancellationToken);
        var sourceOrderId = await _queryContext.Set<PurchaseReturn>().AsNoTracking()
            .Where(x => x.Id == child.ModuleId).Select(x => x.PurchaseOrderId).SingleAsync(cancellationToken);
        await _unitOfWork.AcquireTransactionLockAsync($"PurchaseReturn:{sourceOrderId}", cancellationToken);

        child.UpdatedById = updatedById;

        _inventoryTransactionRepository.Delete(child);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReleaseInventoryTransactionSerialsAsync(id, updatedById, cancellationToken);

        return child;
    }
    public async Task<List<InventoryTransaction>> PurchaseReturnGetInvenTransList(
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
