using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.TransferOutManager.Commands;

public class UpdateTransferOutResult
{
    public TransferOut? Data { get; set; }
}

public class UpdateTransferOutRequest : IRequest<UpdateTransferOutResult>
{
    public string? Id { get; init; }
    public DateTime? TransferReleaseDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? WarehouseFromId { get; init; }
    public string? WarehouseToId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateTransferOutValidator : AbstractValidator<UpdateTransferOutRequest>
{
    public UpdateTransferOutValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.TransferReleaseDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.WarehouseFromId).NotEmpty();
        RuleFor(x => x.WarehouseToId).NotEmpty();
    }
}

public class UpdateTransferOutHandler : IRequestHandler<UpdateTransferOutRequest, UpdateTransferOutResult>
{
    private readonly ICommandRepository<TransferOut> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public UpdateTransferOutHandler(
        ICommandRepository<TransferOut> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
    }

    public async Task<UpdateTransferOutResult> Handle(UpdateTransferOutRequest request, CancellationToken cancellationToken)
    {
        TransferOut? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu chuyển kho đi cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(TransferStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu chuyển kho không hợp lệ.");
            var requestedStatus = (TransferStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.TransferReleaseDate, requestedStatus == TransferStatus.Confirmed);
            if (entity.Status == TransferStatus.Draft)
            {
                if (requestedStatus is TransferStatus.Cancelled or TransferStatus.Archived)
                    throw new InvalidOperationException("Phiếu chuyển kho Nháp phải được xóa hoặc xác nhận.");
            }
            else
            {
                var headerChanged = entity.TransferReleaseDate != request.TransferReleaseDate
                    || entity.WarehouseFromId != request.WarehouseFromId
                    || entity.WarehouseToId != request.WarehouseToId
                    || entity.Description != request.Description;
                if (entity.Status != TransferStatus.Confirmed
                    || requestedStatus is not (TransferStatus.Cancelled or TransferStatus.Archived)
                    || headerChanged)
                    throw new InvalidOperationException("Phiếu chuyển kho đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");
                if (requestedStatus == TransferStatus.Cancelled)
                {
                    var transferInNumber = await _queryContext.Set<TransferIn>().AsNoTracking()
                        .Where(x => !x.IsDeleted && x.TransferOutId == entity.Id && x.Status != TransferStatus.Cancelled)
                        .Select(x => x.Number)
                        .FirstOrDefaultAsync(ct);
                    if (transferInNumber != null)
                        throw new InvalidOperationException($"Không thể hủy phiếu chuyển kho {entity.Number} vì phiếu nhận kho {transferInNumber} còn hiệu lực. Hãy hủy phiếu nhận kho trước.");
                }
            }
            entity.UpdatedById = request.UpdatedById;
            entity.TransferReleaseDate = request.TransferReleaseDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.WarehouseFromId = request.WarehouseFromId;
            entity.WarehouseToId = request.WarehouseToId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id,
                nameof(TransferOut),
                entity.TransferReleaseDate,
                (InventoryTransactionStatus?)entity.Status,
                entity.IsDeleted,
                entity.UpdatedById,
                entity.WarehouseFromId,
                ct);
        }, cancellationToken);

        return new UpdateTransferOutResult
        {
            Data = entity
        };
    }
}

