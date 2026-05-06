using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.PurchaseOrderManager.Commands;

public class DeletePurchaseOrderResult
{
    public PurchaseOrder? Data { get; set; }
}

public class DeletePurchaseOrderRequest : IRequest<DeletePurchaseOrderResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeletePurchaseOrderValidator : AbstractValidator<DeletePurchaseOrderRequest>
{
    public DeletePurchaseOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeletePurchaseOrderHandler : IRequestHandler<DeletePurchaseOrderRequest, DeletePurchaseOrderResult>
{
    private readonly ICommandRepository<PurchaseOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly PurchaseOrderService _purchaseOrderService;

    public DeletePurchaseOrderHandler(
        ICommandRepository<PurchaseOrder> repository,
        IUnitOfWork unitOfWork,
        PurchaseOrderService purchaseOrderService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _purchaseOrderService = purchaseOrderService;
    }

    public async Task<DeletePurchaseOrderResult> Handle(DeletePurchaseOrderRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _purchaseOrderService.DeleteSynchronizedGoodsReceivesAsync(
            entity.Id,
            entity.UpdatedById,
            cancellationToken
        );

        return new DeletePurchaseOrderResult
        {
            Data = entity
        };
    }
}

