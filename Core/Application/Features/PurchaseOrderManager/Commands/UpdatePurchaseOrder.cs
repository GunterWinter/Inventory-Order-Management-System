using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Application.Common.CQS.Queries;

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

        PurchaseOrder? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException($"Purchase order was not found: {request.Id}");
            if (!int.TryParse(request.OrderStatus, out var statusValue)
                || !Enum.IsDefined(typeof(PurchaseOrderStatus), statusValue))
                throw new InvalidOperationException("Invalid purchase order status.");
            var requestedStatus = (PurchaseOrderStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.OrderDate, requestedStatus == PurchaseOrderStatus.Confirmed);
            if (entity.OrderStatus == PurchaseOrderStatus.Draft
                && requestedStatus is PurchaseOrderStatus.Cancelled or PurchaseOrderStatus.Archived)
                throw new InvalidOperationException("Đơn mua hàng Nháp phải được xóa hoặc xác nhận; không thể chuyển thẳng sang Hủy/Lưu trữ.");
            if (entity.OrderStatus != PurchaseOrderStatus.Draft)
            {
                var allowedStatusChange = entity.OrderStatus == PurchaseOrderStatus.Confirmed
                    && requestedStatus is PurchaseOrderStatus.Cancelled or PurchaseOrderStatus.Archived;
                var headerChanged = entity.OrderDate != request.OrderDate
                    || entity.VendorId != request.VendorId
                    || entity.Description != request.Description;
                if (!allowedStatusChange || headerChanged)
                    throw new InvalidOperationException("Đơn mua hàng đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ theo đúng điều kiện phụ thuộc.");
            }

            entity.UpdatedById = request.UpdatedById;
            entity.OrderDate = request.OrderDate;
            entity.OrderStatus = requestedStatus;
            entity.Description = request.Description;
            entity.VendorId = request.VendorId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            _purchaseOrderService.Recalculate(entity.Id);
            await _purchaseOrderService.SynchronizeInventoryAsync(entity.Id, entity.UpdatedById, ct);
            if (entity.OrderStatus == PurchaseOrderStatus.Confirmed)
                await _purchaseOrderService.EnsureVendorObligationAsync(entity.Id, request.UpdatedById, ct);
        }, cancellationToken);

        return new UpdatePurchaseOrderResult
        {
            Data = entity
        };
    }
}


