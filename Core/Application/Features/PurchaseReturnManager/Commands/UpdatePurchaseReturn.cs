using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseReturnManager.Commands;

public class UpdatePurchaseReturnResult
{
    public PurchaseReturn? Data { get; set; }
}

public class UpdatePurchaseReturnRequest : IRequest<UpdatePurchaseReturnResult>
{
    public string? Id { get; init; }
    public DateTime? ReturnDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdatePurchaseReturnValidator : AbstractValidator<UpdatePurchaseReturnRequest>
{
    public UpdatePurchaseReturnValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ReturnDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class UpdatePurchaseReturnHandler : IRequestHandler<UpdatePurchaseReturnRequest, UpdatePurchaseReturnResult>
{
    private readonly ICommandRepository<PurchaseReturn> _repository;
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public UpdatePurchaseReturnHandler(
        ICommandRepository<PurchaseReturn> repository,
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _purchaseOrderRepository = purchaseOrderRepository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<UpdatePurchaseReturnResult> Handle(UpdatePurchaseReturnRequest request, CancellationToken cancellationToken)
    {
        PurchaseReturn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var hasConfirmedSource = await _purchaseOrderRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .AnyAsync(x => x.Id == request.PurchaseOrderId
                    && x.OrderStatus == PurchaseOrderStatus.Confirmed, ct);
            if (!hasConfirmedSource)
                throw new InvalidOperationException("Chỉ được dùng đơn mua hàng đã xác nhận làm nguồn trả hàng.");

            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu trả hàng mua cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(PurchaseReturnStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu trả hàng mua không hợp lệ.");
            var requestedStatus = (PurchaseReturnStatus)statusValue;
            if (entity.PurchaseOrderId != request.PurchaseOrderId)
                throw new InvalidOperationException("Không được thay đổi đơn mua hàng nguồn sau khi tạo phiếu trả.");
            await _unitOfWork.AcquireTransactionLockAsync($"PurchaseReturn:{entity.PurchaseOrderId}", ct);
            DocumentDateGuard.EnsureCanPost(request.ReturnDate, requestedStatus == PurchaseReturnStatus.Confirmed);
            if (entity.Status == PurchaseReturnStatus.Draft)
            {
                if (requestedStatus is PurchaseReturnStatus.Cancelled or PurchaseReturnStatus.Archived)
                    throw new InvalidOperationException("Phiếu trả hàng mua Nháp phải được xóa hoặc xác nhận.");
                if (requestedStatus == PurchaseReturnStatus.Confirmed)
                {
                    var lines = await _inventoryTransactionService.PurchaseReturnGetSourceLineList(entity.PurchaseOrderId, entity.Id, ct);
                    if (!lines.Any(x => x.CurrentReturnQuantity > 0m))
                        throw new InvalidOperationException("Phiếu trả hàng mua phải có ít nhất một dòng có số lượng trả lớn hơn 0.");
                    if (lines.Any(x => x.CurrentReturnQuantity > x.AvailableReturnQuantity + 0.000001m))
                        throw new InvalidOperationException("Số lượng trả đã vượt quá số còn có thể trả. Vui lòng tải lại phiếu.");
                }
            }
            else if (entity.Status == PurchaseReturnStatus.Archived)
            {
                var headerChanged = entity.ReturnDate != request.ReturnDate || entity.Description != request.Description;
                if (requestedStatus != PurchaseReturnStatus.Confirmed || headerChanged)
                    throw new InvalidOperationException("Phiếu trả hàng mua đã lưu trữ chỉ có thể khôi phục về Đã xác nhận mà không thay đổi nội dung.");
            }
            else
            {
                var headerChanged = entity.ReturnDate != request.ReturnDate
                    || entity.PurchaseOrderId != request.PurchaseOrderId
                    || entity.Description != request.Description;
                if (entity.Status != PurchaseReturnStatus.Confirmed
                    || requestedStatus is not (PurchaseReturnStatus.Cancelled or PurchaseReturnStatus.Archived)
                    || headerChanged)
                    throw new InvalidOperationException("Phiếu trả hàng mua đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");
            }
            entity.UpdatedById = request.UpdatedById;
            entity.ReturnDate = request.ReturnDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.PurchaseOrderId = request.PurchaseOrderId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id,
                nameof(PurchaseReturn),
                entity.ReturnDate,
                (InventoryTransactionStatus?)entity.Status,
                entity.IsDeleted,
                entity.UpdatedById,
                null,
                ct);
        }, cancellationToken);

        return new UpdatePurchaseReturnResult
        {
            Data = entity
        };
    }
}


