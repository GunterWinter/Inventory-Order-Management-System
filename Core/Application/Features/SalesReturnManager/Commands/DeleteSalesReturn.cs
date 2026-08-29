using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.SalesReturnManager.Commands;

public class DeleteSalesReturnResult
{
    public SalesReturn? Data { get; set; }
}

public class DeleteSalesReturnRequest : IRequest<DeleteSalesReturnResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteSalesReturnValidator : AbstractValidator<DeleteSalesReturnRequest>
{
    public DeleteSalesReturnValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteSalesReturnHandler : IRequestHandler<DeleteSalesReturnRequest, DeleteSalesReturnResult>
{
    private readonly ICommandRepository<SalesReturn> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public DeleteSalesReturnHandler(
        ICommandRepository<SalesReturn> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<DeleteSalesReturnResult> Handle(DeleteSalesReturnRequest request, CancellationToken cancellationToken)
    {

        SalesReturn? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            if (entity.Status != SalesReturnStatus.Draft)
                throw new InvalidOperationException("Chỉ được xóa phiếu trả hàng bán ở trạng thái Nháp.");
            entity.UpdatedById = request.DeletedById;
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(SalesReturn), entity.ReturnDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, null, ct);
        }, cancellationToken);

        return new DeleteSalesReturnResult
        {
            Data = entity!
        };
    }
}

