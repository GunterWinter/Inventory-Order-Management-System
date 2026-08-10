using Application.Common.Repositories;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.SalesOrderManager.Commands;

public class DeleteSalesOrderResult
{
    public SalesOrder? Data { get; set; }
}

public class DeleteSalesOrderRequest : IRequest<DeleteSalesOrderResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteSalesOrderValidator : AbstractValidator<DeleteSalesOrderRequest>
{
    public DeleteSalesOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteSalesOrderHandler : IRequestHandler<DeleteSalesOrderRequest, DeleteSalesOrderResult>
{
    private readonly ICommandRepository<SalesOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;

    public DeleteSalesOrderHandler(
        ICommandRepository<SalesOrder> repository,
        IUnitOfWork unitOfWork,
        SalesOrderService salesOrderService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
    }

    public async Task<DeleteSalesOrderResult> Handle(DeleteSalesOrderRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Không tìm thấy đơn bán hàng cần xóa.");
        }

        if (entity.OrderStatus != SalesOrderStatus.Draft)
            throw new InvalidOperationException("Chỉ đơn bán hàng Nháp mới được xóa. Đơn đã xác nhận phải dùng chức năng Hủy.");
        entity.UpdatedById = request.DeletedById;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            await _salesOrderService.DeleteSynchronizedInventoryAsync(entity.Id, entity.UpdatedById, ct);
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new DeleteSalesOrderResult
        {
            Data = entity
        };
    }
}

