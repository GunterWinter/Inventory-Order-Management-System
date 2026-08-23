using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task<InventoryTransaction> MaterialExportCreateInvenTrans(
        string? moduleId,
        string? productId,
        decimal? movement,
        string? warehouseId,
        string? createdById,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<string>? productSerialIds = null
        )
    {
        var parent = await _queryContext
            .MaterialExport
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == moduleId, cancellationToken);

        if (parent == null)
        {
            throw new InvalidOperationException($"Material export was not found: {moduleId}");
        }
        if (parent.Status != MaterialExportStatus.Draft)
        {
            throw new InvalidOperationException("Only draft material exports can be edited.");
        }

        await ValidateMaterialExportQuantityAsync(
            parent,
            productId,
            movement,
            null,
            productSerialIds,
            cancellationToken);

        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = parent.Id;
        child.ModuleName = nameof(MaterialExport);
        child.ModuleCode = "MTEX-";
        child.ModuleNumber = parent.Number;
        child.MovementDate = parent.ExportDate;
        child.Status = InventoryTransactionStatus.Draft;
        child.WarehouseId = parent.WarehouseId;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _inventoryTransactionRepository.CreateAsync(child, ct);
            await _unitOfWork.SaveAsync(ct);

            if (productSerialIds != null && productSerialIds.Count > 0)
            {
                await _productSerialService.ApplyInventoryTransactionSerialsAsync(
                    child, productSerialIds, createdById, ct);
            }
        }, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> MaterialExportUpdateInvenTrans(
        string? id,
        string? productId,
        decimal? movement,
        IReadOnlyCollection<string>? productSerialIds,
        string? updatedById,
        CancellationToken cancellationToken = default
        )
    {
        var child = await _inventoryTransactionRepository.GetAsync(id ?? string.Empty, cancellationToken);

        if (child == null)
        {
            throw new InvalidOperationException($"Material export line was not found: {id}");
        }
        if (child.Status != InventoryTransactionStatus.Draft)
        {
            throw new InvalidOperationException("Only draft material export lines can be edited.");
        }


        var parent = await _queryContext.MaterialExport
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == child.ModuleId && !x.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException($"Material export was not found: {child.ModuleId}");
        if (parent.Status != MaterialExportStatus.Draft)
        {
            throw new InvalidOperationException("Only draft material exports can be edited.");
        }

        await ValidateMaterialExportQuantityAsync(
            parent,
            productId,
            movement,
            child.Id,
            productSerialIds,
            cancellationToken);

        child.UpdatedById = updatedById;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            _inventoryTransactionRepository.Update(child);
            await _unitOfWork.SaveAsync(ct);

            if (productSerialIds != null && productSerialIds.Count > 0)
            {
                await _productSerialService.ApplyInventoryTransactionSerialsAsync(
                    child, productSerialIds, updatedById, ct);
            }
            else
            {
                await _productSerialService.ReleaseInventoryTransactionSerialsAsync(
                    child.Id, updatedById, ct);
            }
        }, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> MaterialExportDeleteInvenTrans(
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

        child.UpdatedById = updatedById;

        if (child.Status != InventoryTransactionStatus.Draft)
        {
            throw new InvalidOperationException("Only draft material export lines can be deleted.");
        }

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _productSerialService.ReleaseInventoryTransactionSerialsAsync(
                child.Id, updatedById, ct);
            _inventoryTransactionRepository.Delete(child);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return child;
    }

    public async Task<List<InventoryTransaction>> MaterialExportGetInvenTransList(
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

    private InventoryTransaction MaterialExportProcessing(InventoryTransaction transaction)
    {
        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = null;
        return transaction;
    }

    private async Task ValidateMaterialExportQuantityAsync(
        MaterialExport parent,
        string? productId,
        decimal? movement,
        string? currentLineId,
        IReadOnlyCollection<string>? productSerialIds,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(parent.WarehouseId))
        {
            throw new InvalidOperationException("Select a warehouse before adding material export lines.");
        }

        var product = await _queryContext.Set<Product>()
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == productId && !x.IsDeleted, cancellationToken)
            ?? throw new InvalidOperationException($"Product was not found: {productId}");

        if (product.Physical != true)
        {
            throw new InvalidOperationException("Only physical products can be exported from a warehouse.");
        }

        var requestedQuantity = movement ?? 0m;
        if (requestedQuantity <= 0m)
        {
            throw new InvalidOperationException("Material export quantity must be greater than zero.");
        }

        var trackingMode = product.SerialTrackingMode ?? SerialTrackingMode.None;
        if (trackingMode == SerialTrackingMode.None)
        {
            if (productSerialIds?.Count > 0)
            {
                throw new InvalidOperationException("Products without serial tracking cannot contain selected serials.");
            }

            var confirmedStock = await _queryContext.Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.ProductId == productId
                    && x.WarehouseId == parent.WarehouseId
                    && x.Status == InventoryTransactionStatus.Confirmed)
                .SumAsync(x => x.Stock ?? 0m, cancellationToken);
            var otherDraftQuantity = await _queryContext.Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.ModuleName == nameof(MaterialExport)
                    && x.ModuleId == parent.Id
                    && x.ProductId == productId
                    && x.Id != currentLineId
                    && x.Status == InventoryTransactionStatus.Draft)
                .SumAsync(x => x.Movement ?? 0m, cancellationToken);
            if (otherDraftQuantity + requestedQuantity > confirmedStock + 0.000001m)
            {
                throw new InvalidOperationException(
                    $"The total material export quantity for {product.Name ?? productId} exceeds available stock ({confirmedStock}).");
            }
            return;
        }

        if (Math.Abs(requestedQuantity - Math.Round(requestedQuantity)) > 0.000001m)
        {
            throw new InvalidOperationException("Serial-tracked products require a positive whole-number quantity.");
        }

        var manualSerialIds = (productSerialIds ?? Array.Empty<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (manualSerialIds.Count > 0 && manualSerialIds.Count != Convert.ToInt32(requestedQuantity))
        {
            throw new InvalidOperationException("The selected serial count must match the material export quantity.");
        }

        var otherQuantity = await _queryContext.Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(MaterialExport)
                && x.ModuleId == parent.Id
                && x.ProductId == productId
                && x.Id != currentLineId)
            .SumAsync(x => x.Movement ?? 0m, cancellationToken);

        var ownReservedSerialIds = await _queryContext.Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(MaterialExport)
                && x.ModuleId == parent.Id
                && x.ProductSerialId != null)
            .Select(x => x.ProductSerialId!)
            .Distinct()
            .ToListAsync(cancellationToken);

        var availableQuantity = await _queryContext.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .CountAsync(x => x.ProductId == productId
                && x.CurrentWarehouseId == parent.WarehouseId
                && (x.Status == ProductSerialStatus.InStock
                    || (x.Status == ProductSerialStatus.Reserved && ownReservedSerialIds.Contains(x.Id))),
                cancellationToken);

        if (otherQuantity + requestedQuantity > availableQuantity + 0.000001m)
        {
            throw new InvalidOperationException(
                $"The total material export quantity for {product.Name ?? productId} exceeds available serial stock ({availableQuantity}).");
        }
    }
}
