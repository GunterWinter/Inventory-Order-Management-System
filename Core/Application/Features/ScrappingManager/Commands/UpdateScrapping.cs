using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;

namespace Application.Features.ScrappingManager.Commands;

public class UpdateScrappingResult
{
    public Scrapping? Data { get; set; }
}

public class UpdateScrappingRequest : IRequest<UpdateScrappingResult>
{
    public string? Id { get; init; }
    public DateTime? ScrappingDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? WarehouseId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateScrappingValidator : AbstractValidator<UpdateScrappingRequest>
{
    public UpdateScrappingValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ScrappingDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
    }
}

public class UpdateScrappingHandler : IRequestHandler<UpdateScrappingRequest, UpdateScrappingResult>
{
    private readonly ICommandRepository<Scrapping> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public UpdateScrappingHandler(
        ICommandRepository<Scrapping> repository,
        IUnitOfWork unitOfWork,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<UpdateScrappingResult> Handle(UpdateScrappingRequest request, CancellationToken cancellationToken)
    {
        Scrapping? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu hủy hàng cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(ScrappingStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu hủy hàng không hợp lệ.");
            var requestedStatus = (ScrappingStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.ScrappingDate, requestedStatus == ScrappingStatus.Confirmed);
            if (entity.Status == ScrappingStatus.Draft)
            {
                if (requestedStatus is ScrappingStatus.Cancelled or ScrappingStatus.Archived)
                    throw new InvalidOperationException("Phiếu hủy hàng Nháp phải được xóa hoặc xác nhận.");
            }
            else
            {
                var headerChanged = entity.ScrappingDate != request.ScrappingDate
                    || entity.WarehouseId != request.WarehouseId
                    || entity.Description != request.Description;
                if (entity.Status != ScrappingStatus.Confirmed
                    || requestedStatus is not (ScrappingStatus.Cancelled or ScrappingStatus.Archived)
                    || headerChanged)
                    throw new InvalidOperationException("Phiếu hủy hàng đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");
            }
            entity.UpdatedById = request.UpdatedById;
            entity.ScrappingDate = request.ScrappingDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.WarehouseId = request.WarehouseId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id,
                nameof(Scrapping),
                entity.ScrappingDate,
                (InventoryTransactionStatus?)entity.Status,
                entity.IsDeleted,
                entity.UpdatedById,
                entity.WarehouseId,
                ct);
        }, cancellationToken);

        return new UpdateScrappingResult
        {
            Data = entity
        };
    }
}

