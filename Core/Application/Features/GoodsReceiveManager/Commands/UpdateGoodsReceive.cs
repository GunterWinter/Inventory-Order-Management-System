using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.GoodsReceiveManager.Commands;

public class UpdateGoodsReceiveResult
{
    public GoodsReceive? Data { get; set; }
}

public class UpdateGoodsReceiveRequest : IRequest<UpdateGoodsReceiveResult>
{
    public string? Id { get; init; }
    public DateTime? ReceiveDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateGoodsReceiveValidator : AbstractValidator<UpdateGoodsReceiveRequest>
{
    public UpdateGoodsReceiveValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ReceiveDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class UpdateGoodsReceiveHandler : IRequestHandler<UpdateGoodsReceiveRequest, UpdateGoodsReceiveResult>
{
    private readonly ICommandRepository<GoodsReceive> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public UpdateGoodsReceiveHandler(
        ICommandRepository<GoodsReceive> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
    }

    public async Task<UpdateGoodsReceiveResult> Handle(UpdateGoodsReceiveRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        if (entity.Status != GoodsReceiveStatus.Draft)
        {
            throw new Exception("Only draft goods receive can be updated.");
        }

        entity.UpdatedById = request.UpdatedById;
        entity.ReceiveDate = request.ReceiveDate;
        entity.Status = (GoodsReceiveStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        entity.PurchaseOrderId = request.PurchaseOrderId;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        await SynchronizeInventoryTransactionsAsync(entity, cancellationToken);

        if (entity.Status == GoodsReceiveStatus.Confirmed)
        {
            await EnsureInboundLayersAsync(entity, cancellationToken);
        }

        await _inventoryTransactionService.PropagateParentUpdate(
            entity.Id,
            nameof(GoodsReceive),
            entity.ReceiveDate,
            (InventoryTransactionStatus?)entity.Status,
            entity.IsDeleted,
            entity.UpdatedById,
            null,
            cancellationToken
            );

        return new UpdateGoodsReceiveResult
        {
            Data = entity
        };
    }

    private async Task SynchronizeInventoryTransactionsAsync(GoodsReceive entity, CancellationToken cancellationToken)
    {
        var items = await _queryContext
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x =>
                x.PurchaseOrderId == entity.PurchaseOrderId &&
                x.Product != null &&
                x.Product.Physical == true)
            .ToListAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == entity.Id && x.ModuleName == nameof(GoodsReceive))
            .ToListAsync(cancellationToken);

        var validModuleItemIds = items
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .Select(x => x.Id!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var obsoleteTransaction in inventoryTransactions.Where(x => !validModuleItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            await _inventoryTransactionService.GoodsReceiveDeleteInvenTrans(
                obsoleteTransaction.Id,
                entity.UpdatedById ?? entity.CreatedById,
                cancellationToken
            );
        }

        var defaultWarehouseId = await GetDefaultWarehouseIdAsync(cancellationToken);

        foreach (var item in items)
        {
            var existingTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);
            var warehouseId = existingTransaction?.WarehouseId ?? defaultWarehouseId;

            if (string.IsNullOrWhiteSpace(warehouseId))
            {
                throw new Exception("Default warehouse not found.");
            }

            if (existingTransaction == null)
            {
                await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
                    entity.Id,
                    warehouseId,
                    item.ProductId,
                    item.Quantity,
                    entity.UpdatedById ?? entity.CreatedById,
                    item.Id,
                    item.BatchNumber,
                    cancellationToken
                );
            }
            else
            {
                await _inventoryTransactionService.GoodsReceiveUpdateInvenTrans(
                    existingTransaction.Id,
                    warehouseId,
                    item.ProductId,
                    item.Quantity,
                    entity.UpdatedById ?? entity.CreatedById,
                    item.Id,
                    item.BatchNumber,
                    cancellationToken
                );
            }
        }
    }

    private async Task EnsureInboundLayersAsync(GoodsReceive entity, CancellationToken cancellationToken)
    {
        var items = await _queryContext
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x =>
                x.PurchaseOrderId == entity.PurchaseOrderId &&
                x.Product != null &&
                x.Product.Physical == true)
            .ToListAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == entity.Id && x.ModuleName == nameof(GoodsReceive))
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            var inventoryTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);
            if (inventoryTransaction == null)
            {
                continue;
            }

            await _inventoryTransactionService.CreateInboundLayerAsync(
                inventoryTransaction,
                item,
                entity.ReceiveDate,
                entity.UpdatedById ?? entity.CreatedById,
                cancellationToken
            );
        }
    }

    private async Task<string?> GetDefaultWarehouseIdAsync(CancellationToken cancellationToken)
    {
        return await _queryContext
            .Set<Warehouse>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SystemWarehouse == false)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);
    }
}
