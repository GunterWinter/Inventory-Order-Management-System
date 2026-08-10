using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

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
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public UpdatePurchaseReturnHandler(
        ICommandRepository<PurchaseReturn> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<UpdatePurchaseReturnResult> Handle(UpdatePurchaseReturnRequest request, CancellationToken cancellationToken)
    {
        PurchaseReturn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu trả hàng mua cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(PurchaseReturnStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu trả hàng mua không hợp lệ.");
            var requestedStatus = (PurchaseReturnStatus)statusValue;
            if (entity.Status == PurchaseReturnStatus.Draft)
            {
                if (requestedStatus is PurchaseReturnStatus.Cancelled or PurchaseReturnStatus.Archived)
                    throw new InvalidOperationException("Phiếu trả hàng mua Nháp phải được xóa hoặc xác nhận.");
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


