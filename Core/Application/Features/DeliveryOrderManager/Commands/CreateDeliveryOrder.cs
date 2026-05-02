using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DeliveryOrderManager.Commands;

public class CreateDeliveryOrderResult
{
    public DeliveryOrder? Data { get; set; }
}

public class CreateDeliveryOrderRequest : IRequest<CreateDeliveryOrderResult>
{
    public DateTime? DeliveryDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? SalesOrderId { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateDeliveryOrderValidator : AbstractValidator<CreateDeliveryOrderRequest>
{
    public CreateDeliveryOrderValidator()
    {
        RuleFor(x => x.DeliveryDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.SalesOrderId).NotEmpty();
    }
}

public class CreateDeliveryOrderHandler : IRequestHandler<CreateDeliveryOrderRequest, CreateDeliveryOrderResult>
{
    private readonly ICommandRepository<DeliveryOrder> _deliveryOrderRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public CreateDeliveryOrderHandler(
        ICommandRepository<DeliveryOrder> deliveryOrderRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext
        )
    {
        _deliveryOrderRepository = deliveryOrderRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
    }

    public async Task<CreateDeliveryOrderResult> Handle(CreateDeliveryOrderRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new DeliveryOrder();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO");
        entity.DeliveryDate = request.DeliveryDate;
        entity.Status = (DeliveryOrderStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        entity.SalesOrderId = request.SalesOrderId;

        await _deliveryOrderRepository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        var defaultWarehouseId = await _queryContext
            .Set<Warehouse>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SystemWarehouse == false)
            .Select(x => x.Id)
            .FirstOrDefaultAsync(cancellationToken);

        if (string.IsNullOrWhiteSpace(defaultWarehouseId))
        {
            return new CreateDeliveryOrderResult
            {
                Data = entity
            };
        }

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

        foreach (var item in items)
        {
            await _inventoryTransactionService.DeliveryOrderCreateInvenTrans(
                entity.Id,
                defaultWarehouseId,
                item.ProductId,
                item.Quantity,
                entity.CreatedById,
                item.Id,
                item.BatchNumber,
                cancellationToken
            );

            if (entity.Status == DeliveryOrderStatus.Confirmed)
            {
                await _inventoryTransactionService.UpdateSalesOrderItemBatchCostAsync(
                    item,
                    entity.CreatedById,
                    cancellationToken
                );
            }
        }

        return new CreateDeliveryOrderResult
        {
            Data = entity
        };
    }
}
