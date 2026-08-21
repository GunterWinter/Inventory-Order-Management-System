using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.StockCountManager.Commands;

public class DeleteStockCountResult
{
    public StockCount? Data { get; set; }
}

public class DeleteStockCountRequest : IRequest<DeleteStockCountResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteStockCountValidator : AbstractValidator<DeleteStockCountRequest>
{
    public DeleteStockCountValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteStockCountHandler : IRequestHandler<DeleteStockCountRequest, DeleteStockCountResult>
{
    private readonly ICommandRepository<StockCount> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public DeleteStockCountHandler(
        ICommandRepository<StockCount> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<DeleteStockCountResult> Handle(DeleteStockCountRequest request, CancellationToken cancellationToken)
    {
        StockCount? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct);

            if (entity == null)
            {
                throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            }
            if (entity.Status != StockCountStatus.Draft)
            {
                throw new InvalidOperationException(
                    "Chỉ phiếu kiểm kê Nháp mới được xóa; phiếu đã xác nhận phải được Hủy.");
            }

            entity.UpdatedById = request.DeletedById;
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);

            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id,
                nameof(StockCount),
                entity.CountDate,
                (InventoryTransactionStatus?)entity.Status,
                entity.IsDeleted,
                entity.UpdatedById,
                null,
                ct);
        }, cancellationToken);

        return new DeleteStockCountResult
        {
            Data = entity
        };
    }
}

