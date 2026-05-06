using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DeliveryOrderManager.Commands;

public class UpdateDeliveryOrderResult
{
    public DeliveryOrder? Data { get; set; }
}

public class UpdateDeliveryOrderRequest : IRequest<UpdateDeliveryOrderResult>
{
    public string? Id { get; init; }
    public DateTime? DeliveryDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? SalesOrderId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateDeliveryOrderValidator : AbstractValidator<UpdateDeliveryOrderRequest>
{
    public UpdateDeliveryOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DeliveryDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.SalesOrderId).NotEmpty();
    }
}

public class UpdateDeliveryOrderHandler : IRequestHandler<UpdateDeliveryOrderRequest, UpdateDeliveryOrderResult>
{
    private readonly ICommandRepository<DeliveryOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public UpdateDeliveryOrderHandler(
        ICommandRepository<DeliveryOrder> repository,
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

    public async Task<UpdateDeliveryOrderResult> Handle(UpdateDeliveryOrderRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        if (entity.Status != DeliveryOrderStatus.Draft)
        {
            throw new Exception("Only draft delivery order can be updated.");
        }

        entity.UpdatedById = request.UpdatedById;
        entity.DeliveryDate = request.DeliveryDate;
        entity.Status = (DeliveryOrderStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        entity.SalesOrderId = request.SalesOrderId;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        await SynchronizeInventoryTransactionsAsync(entity, cancellationToken);

        await _inventoryTransactionService.PropagateParentUpdate(
            entity.Id,
            nameof(DeliveryOrder),
            entity.DeliveryDate,
            (InventoryTransactionStatus?)entity.Status,
            entity.IsDeleted,
            entity.UpdatedById,
            null,
            cancellationToken
            );

        return new UpdateDeliveryOrderResult
        {
            Data = entity
        };
    }

    private async Task SynchronizeInventoryTransactionsAsync(DeliveryOrder entity, CancellationToken cancellationToken)
    {
        var items = await _queryContext
            .Set<SalesOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x =>
                x.SalesOrderId == entity.SalesOrderId &&
                x.Product != null &&
                x.Product.Physical == true)
            .ToListAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == entity.Id && x.ModuleName == nameof(DeliveryOrder))
            .ToListAsync(cancellationToken);

        var validModuleItemIds = items
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .Select(x => x.Id!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var obsoleteTransaction in inventoryTransactions.Where(x => !validModuleItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            await _inventoryTransactionService.DeliveryOrderDeleteInvenTrans(
                obsoleteTransaction.Id,
                entity.UpdatedById ?? entity.CreatedById,
                cancellationToken
            );
        }

        var defaultWarehouseId = await GetDefaultWarehouseIdAsync(cancellationToken);

        foreach (var item in items)
        {
            var existingTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);
            var warehouseId = item.Product?.DefaultWarehouseId ?? existingTransaction?.WarehouseId ?? defaultWarehouseId;

            if (string.IsNullOrWhiteSpace(warehouseId))
            {
                continue;
            }

            if (existingTransaction == null)
            {
                await _inventoryTransactionService.DeliveryOrderCreateInvenTrans(
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
                await _inventoryTransactionService.DeliveryOrderUpdateInvenTrans(
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

            if (entity.Status == DeliveryOrderStatus.Confirmed)
            {
                await _inventoryTransactionService.UpdateSalesOrderItemBatchCostAsync(
                    item,
                    entity.UpdatedById ?? entity.CreatedById,
                    cancellationToken
                );
            }
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
