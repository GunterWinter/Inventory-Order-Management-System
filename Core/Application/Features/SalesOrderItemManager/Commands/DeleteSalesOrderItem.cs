using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderItemManager.Commands;

public class DeleteSalesOrderItemResult
{
    public SalesOrderItem? Data { get; set; }
}

public class DeleteSalesOrderItemRequest : IRequest<DeleteSalesOrderItemResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteSalesOrderItemValidator : AbstractValidator<DeleteSalesOrderItemRequest>
{
    public DeleteSalesOrderItemValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteSalesOrderItemHandler : IRequestHandler<DeleteSalesOrderItemRequest, DeleteSalesOrderItemResult>
{
    private readonly ICommandRepository<SalesOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly IQueryContext _queryContext;

    public DeleteSalesOrderItemHandler(
        ICommandRepository<SalesOrderItem> repository,
        IUnitOfWork unitOfWork,
        SalesOrderService salesOrderService,
        IQueryContext queryContext
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
        _queryContext = queryContext;
    }

    public async Task<DeleteSalesOrderItemResult> Handle(DeleteSalesOrderItemRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var isConfirmedSalesOrder = await _queryContext
            .Set<SalesOrder>()
            .AsNoTracking()
            .AnyAsync(x =>
                !x.IsDeleted &&
                x.Id == entity.SalesOrderId &&
                x.OrderStatus == SalesOrderStatus.Confirmed,
                cancellationToken);

        if (isConfirmedSalesOrder)
        {
            throw new Exception("Cannot delete items from a confirmed sales order. You can adjust quantity, batch number, warranty months, or add a new item.");
        }

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        _salesOrderService.Recalculate(entity.SalesOrderId ?? "");
        await _salesOrderService.SynchronizeDeliveryOrderAsync(
            entity.SalesOrderId ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new DeleteSalesOrderItemResult
        {
            Data = entity
        };
    }
}
