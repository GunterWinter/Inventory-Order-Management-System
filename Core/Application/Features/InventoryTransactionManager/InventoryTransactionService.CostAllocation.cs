using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    public async Task<InventoryTransaction> CostAllocationCreateInvenTrans(
        string? moduleId,
        string? productId,
        decimal? movement,
        string? warehouseId,
        string? moduleNumber,
        string? createdById,
        CancellationToken cancellationToken = default,
        IReadOnlyCollection<string>? productSerialIds = null
        )
    {
        var child = new InventoryTransaction();
        child.CreatedById = createdById;

        child.Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), "", "IVT");
        child.ModuleId = moduleId;
        child.ModuleName = "CostAllocation";
        child.ModuleCode = "CSAL";
        child.ModuleNumber = moduleNumber;
        child.MovementDate = DateTime.Now;
        child.Status = InventoryTransactionStatus.Confirmed;
        child.WarehouseId = warehouseId;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        await _inventoryTransactionRepository.CreateAsync(child, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, createdById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> CostAllocationUpdateInvenTrans(
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

        child.UpdatedById = updatedById;

        child.ProductId = productId;
        child.Movement = movement;

        CalculateInvenTrans(child);

        _inventoryTransactionRepository.Update(child);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ApplyInventoryTransactionSerialsAsync(child, productSerialIds, updatedById, cancellationToken);

        return child;
    }

    public async Task<InventoryTransaction> CostAllocationDeleteInvenTrans(
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
        await _productSerialService.ReleaseInventoryTransactionSerialsAsync(id, updatedById, cancellationToken);

        return child;
    }
    
    public async Task<List<InventoryTransaction>> CostAllocationGetInvenTransList(
        string? moduleId,
        CancellationToken cancellationToken = default
        )
    {
        var childs = await _queryContext
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == moduleId && x.ModuleName == "CostAllocation")
            .ToListAsync(cancellationToken);

        return await EnrichProductSerialsAsync(childs, cancellationToken);
    }
}
