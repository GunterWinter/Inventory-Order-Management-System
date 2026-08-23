using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task<InventoryTransaction> TransferOutCreateInvenTrans(
        string? moduleId,
        string? productId,
        decimal? movement,
        string? createdById,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<string>? productSerialIds = null
        )
    {
        var parent = await _queryContext
            .TransferOut
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == moduleId, cancellationToken);

        if (parent == null)
        {
            throw new Exception($"Parent entity not found: {moduleId}");
        }
        await EnsureOutboundParentIsDraftAsync(nameof(TransferOut), parent.Id, cancellationToken);

        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = parent.Id;
        child.ModuleName = nameof(TransferOut);
        child.ModuleCode = "TO-OUT";
        child.ModuleNumber = parent.Number;
        child.MovementDate = parent.TransferReleaseDate;
        child.Status = (InventoryTransactionStatus?)parent.Status;
        child.WarehouseId = parent.WarehouseFromId;
        child.WarehouseFromId = parent.WarehouseFromId;
        child.WarehouseToId = parent.WarehouseToId;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _inventoryTransactionRepository.CreateAsync(child, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, createdById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> TransferOutUpdateInvenTrans(
        string? id,
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
        await EnsureOutboundParentIsDraftAsync(nameof(TransferOut), child.ModuleId, cancellationToken);

        child.UpdatedById = updatedById;
        var parent = await _queryContext
            .TransferOut
            .AsNoTracking()
            .SingleOrDefaultAsync(x => x.Id == child.ModuleId, cancellationToken);

        child.WarehouseId = parent?.WarehouseFromId;
        child.WarehouseFromId = parent?.WarehouseFromId;
        child.WarehouseToId = parent?.WarehouseToId;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        _inventoryTransactionRepository.Update(child);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, updatedById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> TransferOutDeleteInvenTrans(
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
        await EnsureOutboundParentIsDraftAsync(nameof(TransferOut), child.ModuleId, cancellationToken);

        child.UpdatedById = updatedById;

        _inventoryTransactionRepository.Delete(child);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReleaseInventoryTransactionSerialsAsync(id, updatedById, cancellationToken);

        return child;
    }
    public async Task<List<InventoryTransaction>> TransferOutGetInvenTransList(
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
