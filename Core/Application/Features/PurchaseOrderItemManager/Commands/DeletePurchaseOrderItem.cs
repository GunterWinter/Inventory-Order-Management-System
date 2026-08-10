using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderItemManager.Commands;

public class DeletePurchaseOrderItemResult
{
    public PurchaseOrderItem? Data { get; set; }
}

public class DeletePurchaseOrderItemRequest : IRequest<DeletePurchaseOrderItemResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeletePurchaseOrderItemValidator : AbstractValidator<DeletePurchaseOrderItemRequest>
{
    public DeletePurchaseOrderItemValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeletePurchaseOrderItemHandler : IRequestHandler<DeletePurchaseOrderItemRequest, DeletePurchaseOrderItemResult>
{
    private readonly ICommandRepository<PurchaseOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly PurchaseOrderService _purchaseOrderService;
    private readonly IQueryContext _queryContext;

    public DeletePurchaseOrderItemHandler(
        ICommandRepository<PurchaseOrderItem> repository,
        IUnitOfWork unitOfWork,
        PurchaseOrderService purchaseOrderService,
        IQueryContext queryContext
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _purchaseOrderService = purchaseOrderService;
        _queryContext = queryContext;
    }

    public async Task<DeletePurchaseOrderItemResult> Handle(DeletePurchaseOrderItemRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Không tìm thấy dòng hàng hóa cần xóa. Dòng tạm chưa lưu phải được xóa trực tiếp trên màn hình.");
        }

        var orderStatus = await _queryContext.Set<PurchaseOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == entity.PurchaseOrderId)
            .Select(x => x.OrderStatus)
            .SingleOrDefaultAsync(cancellationToken);
        if (orderStatus != PurchaseOrderStatus.Draft)
            throw new InvalidOperationException("Chỉ đơn mua hàng ở trạng thái Nháp mới được xóa dòng hàng hóa.");

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.PurchaseOrderId ?? "");
        await _purchaseOrderService.SynchronizeInventoryAsync(
            entity.PurchaseOrderId ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new DeletePurchaseOrderItemResult
        {
            Data = entity
        };
    }
}

