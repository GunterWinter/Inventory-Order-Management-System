using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;

namespace Application.Features.SalesOrderManager.Commands;

public class UpdateSalesOrderResult
{
    public SalesOrder? Data { get; set; }
}

public class UpdateSalesOrderRequest : IRequest<UpdateSalesOrderResult>
{
    public string? Id { get; init; }
    public DateTime? OrderDate { get; init; }
    public string? OrderStatus { get; init; }
    public string? Description { get; init; }
    public string? CustomerId { get; init; }
    public SalesType? SalesType { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateSalesOrderValidator : AbstractValidator<UpdateSalesOrderRequest>
{
    public UpdateSalesOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.OrderDate).NotEmpty();
        RuleFor(x => x.OrderStatus).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();
        RuleFor(x => x.SalesType).NotNull().IsInEnum();
    }
}

public class UpdateSalesOrderHandler : IRequestHandler<UpdateSalesOrderRequest, UpdateSalesOrderResult>
{
    private readonly ICommandRepository<SalesOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;

    public UpdateSalesOrderHandler(
        ICommandRepository<SalesOrder> repository,
        SalesOrderService salesOrderService,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
    }

    public async Task<UpdateSalesOrderResult> Handle(UpdateSalesOrderRequest request, CancellationToken cancellationToken)
    {

        SalesOrder? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException($"Sales order was not found: {request.Id}");
            if (!int.TryParse(request.OrderStatus, out var statusValue)
                || !Enum.IsDefined(typeof(SalesOrderStatus), statusValue))
                throw new InvalidOperationException("Invalid sales order status.");
            var requestedStatus = (SalesOrderStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.OrderDate, requestedStatus == SalesOrderStatus.Confirmed);
            if (entity.OrderStatus == SalesOrderStatus.Draft
                && requestedStatus is SalesOrderStatus.Cancelled or SalesOrderStatus.Archived)
                throw new InvalidOperationException("Đơn bán hàng Nháp phải được xóa hoặc xác nhận; không thể chuyển thẳng sang Hủy/Lưu trữ.");
            if (entity.OrderStatus != SalesOrderStatus.Draft)
            {
                var allowedStatusChange = entity.OrderStatus == SalesOrderStatus.Confirmed
                    && requestedStatus is SalesOrderStatus.Draft or SalesOrderStatus.Cancelled or SalesOrderStatus.Archived;
                var headerChanged = entity.OrderDate != request.OrderDate
                    || entity.CustomerId != request.CustomerId
                    || entity.Description != request.Description
                    || entity.SalesType != (request.SalesType ?? SalesType.Retail);
                if (!allowedStatusChange || headerChanged)
                    throw new InvalidOperationException("Đơn bán hàng đã xác nhận phải chuyển về Nháp trước khi sửa nội dung; cũng có thể Hủy hoặc Lưu trữ theo đúng điều kiện phụ thuộc.");
            }

            entity.UpdatedById = request.UpdatedById;
            entity.OrderDate = request.OrderDate;
            entity.OrderStatus = requestedStatus;
            entity.Description = request.Description;
            entity.CustomerId = request.CustomerId;
            entity.SalesType = request.SalesType ?? SalesType.Retail;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            _salesOrderService.Recalculate(entity.Id);
            await _salesOrderService.SynchronizeInventoryAsync(entity.Id, entity.UpdatedById, ct);
        }, cancellationToken);

        return new UpdateSalesOrderResult
        {
            Data = entity
        };
    }
}

