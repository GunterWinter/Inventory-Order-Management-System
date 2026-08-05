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
        double? movement,
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
            throw new Exception($"Parent entity not found: {moduleId}");
        }

        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = parent.Id;
        child.ModuleName = nameof(MaterialExport);
        child.ModuleCode = "MTEX-";
        child.ModuleNumber = parent.Number;
        child.MovementDate = parent.ExportDate;
        child.Status = InventoryTransactionStatus.Confirmed; // Always confirmed — direct stock deduction
        child.WarehouseId = warehouseId;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _inventoryTransactionRepository.CreateAsync(child, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Apply serial movements if serial-tracked
        if (productSerialIds != null && productSerialIds.Count > 0)
        {
            await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, createdById, cancellationToken);
        }

        return child;
    }

    public async Task<InventoryTransaction> MaterialExportUpdateInvenTrans(
        string? id,
        string? productId,
        double? movement,
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

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        _inventoryTransactionRepository.Update(child);
        await _unitOfWork.SaveAsync(cancellationToken);

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

        _inventoryTransactionRepository.Delete(child);
        await _unitOfWork.SaveAsync(cancellationToken);

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
}
