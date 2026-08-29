using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.TransferInManager.Commands;

public class DeleteTransferInResult
{
    public TransferIn? Data { get; set; }
}

public class DeleteTransferInRequest : IRequest<DeleteTransferInResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteTransferInValidator : AbstractValidator<DeleteTransferInRequest>
{
    public DeleteTransferInValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteTransferInHandler : IRequestHandler<DeleteTransferInRequest, DeleteTransferInResult>
{
    private readonly ICommandRepository<TransferIn> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public DeleteTransferInHandler(
        ICommandRepository<TransferIn> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<DeleteTransferInResult> Handle(DeleteTransferInRequest request, CancellationToken cancellationToken)
    {

        TransferIn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            if (entity.Status != TransferStatus.Draft)
                throw new InvalidOperationException("Chỉ được xóa phiếu nhập chuyển kho ở trạng thái Nháp.");
            entity.UpdatedById = request.DeletedById;
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(TransferIn), entity.TransferReceiveDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, null, ct);
        }, cancellationToken);

        return new DeleteTransferInResult
        {
            Data = entity!
        };
    }
}

