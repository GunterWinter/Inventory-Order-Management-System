using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.PurchaseOrderManager.Commands;

public class UpdatePurchaseOrderResult
{
    public PurchaseOrder? Data { get; set; }
}

public class UpdatePurchaseOrderRequest : IRequest<UpdatePurchaseOrderResult>
{
    public string? Id { get; init; }
    public DateTime? OrderDate { get; init; }
    public string? OrderStatus { get; init; }
    public string? Description { get; init; }
    public string? VendorId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdatePurchaseOrderValidator : AbstractValidator<UpdatePurchaseOrderRequest>
{
    public UpdatePurchaseOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.OrderDate).NotEmpty();
        RuleFor(x => x.OrderStatus).NotEmpty();
        RuleFor(x => x.VendorId).NotEmpty();
    }
}

public class UpdatePurchaseOrderHandler : IRequestHandler<UpdatePurchaseOrderRequest, UpdatePurchaseOrderResult>
{
    private readonly ICommandRepository<PurchaseOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly PurchaseOrderService _purchaseOrderService;

    public UpdatePurchaseOrderHandler(
        ICommandRepository<PurchaseOrder> repository,
        IUnitOfWork unitOfWork,
        PurchaseOrderService purchaseOrderService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _purchaseOrderService = purchaseOrderService;
    }

    public async Task<UpdatePurchaseOrderResult> Handle(UpdatePurchaseOrderRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;

        entity.OrderDate = request.OrderDate;
        entity.OrderStatus = (PurchaseOrderStatus)int.Parse(request.OrderStatus!);
        entity.Description = request.Description;
        entity.VendorId = request.VendorId;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.Id);
        await _purchaseOrderService.SynchronizeGoodsReceiveAsync(
            entity.Id,
            entity.UpdatedById,
            cancellationToken
        );

        return new UpdatePurchaseOrderResult
        {
            Data = entity
        };
    }
}

