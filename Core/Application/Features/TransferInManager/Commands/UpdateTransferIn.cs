using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;

namespace Application.Features.TransferInManager.Commands;

public class UpdateTransferInResult
{
    public TransferIn? Data { get; set; }
}

public class UpdateTransferInRequest : IRequest<UpdateTransferInResult>
{
    public string? Id { get; init; }
    public DateTime? TransferReceiveDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? TransferOutId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateTransferInValidator : AbstractValidator<UpdateTransferInRequest>
{
    public UpdateTransferInValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.TransferReceiveDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.TransferOutId).NotEmpty();
    }
}

public class UpdateTransferInHandler : IRequestHandler<UpdateTransferInRequest, UpdateTransferInResult>
{
    private readonly ICommandRepository<TransferIn> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly ICommandRepository<TransferOut> _transferOutRepository;

    public UpdateTransferInHandler(
        ICommandRepository<TransferIn> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        ICommandRepository<TransferOut> transferOutRepository
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _transferOutRepository = transferOutRepository;
    }

    public async Task<UpdateTransferInResult> Handle(UpdateTransferInRequest request, CancellationToken cancellationToken)
    {
        TransferIn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu nhận chuyển kho cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(TransferStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu nhận chuyển kho không hợp lệ.");
            var requestedStatus = (TransferStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.TransferReceiveDate, requestedStatus == TransferStatus.Confirmed);
            if (entity.Status == TransferStatus.Draft)
            {
                if (requestedStatus is TransferStatus.Cancelled or TransferStatus.Archived)
                    throw new InvalidOperationException("Phiếu nhận chuyển kho Nháp phải được xóa hoặc xác nhận.");
            }
            else
            {
                var headerChanged = entity.TransferReceiveDate != request.TransferReceiveDate
                    || entity.TransferOutId != request.TransferOutId
                    || entity.Description != request.Description;
                if (entity.Status != TransferStatus.Confirmed
                    || requestedStatus is not (TransferStatus.Draft or TransferStatus.Cancelled or TransferStatus.Archived)
                    || headerChanged)
                    throw new InvalidOperationException("Phiếu nhận chuyển kho đã xác nhận phải chuyển về Nháp trước khi sửa nội dung; cũng có thể Hủy hoặc Lưu trữ.");
            }

            var transferOut = await _transferOutRepository.GetAsync(request.TransferOutId ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu chuyển kho đi nguồn.");
            if (requestedStatus == TransferStatus.Confirmed
                && transferOut.Status is not (TransferStatus.Confirmed or TransferStatus.Archived))
                throw new InvalidOperationException($"Chỉ được nhận kho từ phiếu chuyển đi {transferOut.Number} đã xác nhận.");

            entity.UpdatedById = request.UpdatedById;
            entity.TransferReceiveDate = request.TransferReceiveDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.TransferOutId = request.TransferOutId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);

            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(TransferIn), entity.TransferReceiveDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, transferOut.WarehouseToId, ct);
        }, cancellationToken);

        return new UpdateTransferInResult
        {
            Data = entity
        };
    }
}

