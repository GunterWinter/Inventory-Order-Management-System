using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.ScrappingManager.Commands;

public class DeleteScrappingResult
{
    public Scrapping? Data { get; set; }
}

public class DeleteScrappingRequest : IRequest<DeleteScrappingResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteScrappingValidator : AbstractValidator<DeleteScrappingRequest>
{
    public DeleteScrappingValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteScrappingHandler : IRequestHandler<DeleteScrappingRequest, DeleteScrappingResult>
{
    private readonly ICommandRepository<Scrapping> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public DeleteScrappingHandler(
        ICommandRepository<Scrapping> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<DeleteScrappingResult> Handle(DeleteScrappingRequest request, CancellationToken cancellationToken)
    {

        Scrapping? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            if (entity.Status != ScrappingStatus.Draft)
                throw new InvalidOperationException("Chỉ được xóa phiếu hủy hàng ở trạng thái Nháp.");
            entity.UpdatedById = request.DeletedById;
            _repository.Delete(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(Scrapping), entity.ScrappingDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, null, ct);
        }, cancellationToken);

        return new DeleteScrappingResult
        {
            Data = entity!
        };
    }
}

