using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesReturnManager.Commands;

public class UpdateSalesReturnResult
{
    public SalesReturn? Data { get; set; }
}

public class UpdateSalesReturnRequest : IRequest<UpdateSalesReturnResult>
{
    public string? Id { get; init; }
    public DateTime? ReturnDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? SalesOrderId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateSalesReturnValidator : AbstractValidator<UpdateSalesReturnRequest>
{
    public UpdateSalesReturnValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ReturnDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.SalesOrderId).NotEmpty();
    }
}

public class UpdateSalesReturnHandler : IRequestHandler<UpdateSalesReturnRequest, UpdateSalesReturnResult>
{
    private readonly ICommandRepository<SalesReturn> _repository;
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public UpdateSalesReturnHandler(
        ICommandRepository<SalesReturn> repository,
        ICommandRepository<SalesOrder> salesOrderRepository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _salesOrderRepository = salesOrderRepository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<UpdateSalesReturnResult> Handle(UpdateSalesReturnRequest request, CancellationToken cancellationToken)
    {
        SalesReturn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var hasConfirmedSource = await _salesOrderRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .AnyAsync(x => x.Id == request.SalesOrderId
                    && x.OrderStatus == SalesOrderStatus.Confirmed, ct);
            if (!hasConfirmedSource)
                throw new InvalidOperationException("Chỉ được dùng đơn bán hàng đã xác nhận làm nguồn trả hàng.");

            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu trả hàng bán cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(SalesReturnStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu trả hàng bán không hợp lệ.");
            var requestedStatus = (SalesReturnStatus)statusValue;
            if (entity.SalesOrderId != request.SalesOrderId)
                throw new InvalidOperationException("Không được thay đổi đơn bán hàng nguồn sau khi tạo phiếu trả.");
            await _unitOfWork.AcquireTransactionLockAsync($"SalesReturn:{entity.SalesOrderId}", ct);
            DocumentDateGuard.EnsureCanPost(request.ReturnDate, requestedStatus == SalesReturnStatus.Confirmed);
            if (entity.Status == SalesReturnStatus.Draft && requestedStatus == SalesReturnStatus.Confirmed)
            {
                var lines = await _inventoryTransactionService.SalesReturnGetSourceLineList(entity.SalesOrderId, entity.Id, ct);
                if (!lines.Any(x => x.CurrentReturnQuantity > 0m))
                    throw new InvalidOperationException("Phiếu trả hàng bán phải có ít nhất một dòng có số lượng trả lớn hơn 0.");
                if (lines.Any(x => x.CurrentReturnQuantity > x.AvailableReturnQuantity + 0.000001m))
                    throw new InvalidOperationException("Số lượng trả đã vượt quá số còn có thể trả. Vui lòng tải lại phiếu.");
            }
            ValidateTransition(entity, requestedStatus, request);

            entity.UpdatedById = request.UpdatedById;
            entity.ReturnDate = request.ReturnDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.SalesOrderId = request.SalesOrderId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);

            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(SalesReturn), entity.ReturnDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, null, ct);
        }, cancellationToken);

        return new UpdateSalesReturnResult
        {
            Data = entity
        };
    }

    private static void ValidateTransition(SalesReturn entity, SalesReturnStatus requested, UpdateSalesReturnRequest request)
    {
        if (entity.Status == SalesReturnStatus.Draft)
        {
            if (requested is SalesReturnStatus.Cancelled or SalesReturnStatus.Archived)
                throw new InvalidOperationException("Phiếu trả hàng bán Nháp phải được xóa hoặc xác nhận.");
            return;
        }
        if (entity.Status == SalesReturnStatus.Archived)
        {
            var archivedHeaderChanged = entity.ReturnDate != request.ReturnDate || entity.Description != request.Description;
            if (requested != SalesReturnStatus.Confirmed || archivedHeaderChanged)
                throw new InvalidOperationException("Phiếu trả hàng bán đã lưu trữ chỉ có thể khôi phục về Đã xác nhận mà không thay đổi nội dung.");
            return;
        }
        var headerChanged = entity.ReturnDate != request.ReturnDate
            || entity.SalesOrderId != request.SalesOrderId
            || entity.Description != request.Description;
        if (entity.Status != SalesReturnStatus.Confirmed
            || requested is not (SalesReturnStatus.Cancelled or SalesReturnStatus.Archived)
            || headerChanged)
            throw new InvalidOperationException("Phiếu trả hàng bán đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");
    }
}


