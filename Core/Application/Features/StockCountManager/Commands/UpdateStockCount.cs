using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.StockCountManager.Commands;

public class UpdateStockCountResult
{
    public StockCount? Data { get; set; }
}

public class UpdateStockCountRequest : IRequest<UpdateStockCountResult>
{
    public string? Id { get; init; }
    public DateTime? CountDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? WarehouseId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateStockCountValidator : AbstractValidator<UpdateStockCountRequest>
{
    public UpdateStockCountValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CountDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
    }
}

public class UpdateStockCountHandler : IRequestHandler<UpdateStockCountRequest, UpdateStockCountResult>
{
    private readonly ICommandRepository<StockCount> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public UpdateStockCountHandler(
        ICommandRepository<StockCount> repository,
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

    public async Task<UpdateStockCountResult> Handle(UpdateStockCountRequest request, CancellationToken cancellationToken)
    {

        StockCount? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct)
                ?? throw new InvalidOperationException("Không tìm thấy phiếu kiểm kê cần cập nhật.");
            if (!int.TryParse(request.Status, out var statusValue)
                || !Enum.IsDefined(typeof(StockCountStatus), statusValue))
                throw new InvalidOperationException("Trạng thái phiếu kiểm kê không hợp lệ.");
            var requestedStatus = (StockCountStatus)statusValue;
            DocumentDateGuard.EnsureCanPost(request.CountDate, requestedStatus == StockCountStatus.Confirmed);
            if (entity.Status == StockCountStatus.Draft)
            {
                if (requestedStatus is StockCountStatus.Cancelled or StockCountStatus.Archived)
                    throw new InvalidOperationException("Phiếu kiểm kê Nháp phải được xóa hoặc xác nhận.");
            }
            else if (entity.Status == StockCountStatus.Archived)
            {
                var headerChanged = entity.CountDate != request.CountDate
                    || entity.WarehouseId != request.WarehouseId
                    || entity.Description != request.Description;
                if (requestedStatus != StockCountStatus.Confirmed || headerChanged)
                    throw new InvalidOperationException("Phiếu kiểm kê đã lưu trữ chỉ có thể được khôi phục về Đã xác nhận mà không thay đổi nội dung.");
            }
            else
            {
                var headerChanged = entity.CountDate != request.CountDate
                    || entity.WarehouseId != request.WarehouseId
                    || entity.Description != request.Description;
                if (entity.Status != StockCountStatus.Confirmed
                    || requestedStatus is not (StockCountStatus.Cancelled or StockCountStatus.Archived)
                    || headerChanged)
                    throw new InvalidOperationException("Phiếu kiểm kê đã xác nhận không được sửa nội dung; chỉ có thể Hủy hoặc Lưu trữ.");
                if (requestedStatus == StockCountStatus.Cancelled)
                {
                    var lines = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
                        .Where(x => !x.IsDeleted && x.ModuleName == nameof(StockCount) && x.ModuleId == entity.Id)
                        .Select(x => new { x.ProductId, x.WarehouseId, x.MovementDate, x.CreatedAtUtc })
                        .ToListAsync(ct);
                    foreach (var line in lines)
                    {
                        var newerDocument = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
                            .Where(x => !x.IsDeleted && x.Status == InventoryTransactionStatus.Confirmed
                                && x.ProductId == line.ProductId && x.WarehouseId == line.WarehouseId
                                && !(x.ModuleName == nameof(StockCount) && x.ModuleId == entity.Id)
                                && ((line.CreatedAtUtc != null && x.CreatedAtUtc > line.CreatedAtUtc)
                                    || (line.CreatedAtUtc == null && x.MovementDate > line.MovementDate)))
                            .OrderBy(x => x.CreatedAtUtc ?? x.MovementDate)
                            .ThenBy(x => x.Id)
                            .Select(x => x.ModuleNumber ?? x.Number)
                            .FirstOrDefaultAsync(ct);
                        if (newerDocument != null)
                            throw new InvalidOperationException($"Không thể hủy phiếu kiểm kê {entity.Number}: hàng hóa đã có giao dịch phát sinh sau tại {newerDocument}. Hãy hoàn tác giao dịch mới hơn trước.");
                    }
                }
            }

            entity.UpdatedById = request.UpdatedById;
            entity.CountDate = request.CountDate;
            entity.Status = requestedStatus;
            entity.Description = request.Description;
            entity.WarehouseId = request.WarehouseId;
            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            await _inventoryTransactionService.PropagateParentUpdate(
                entity.Id, nameof(StockCount), entity.CountDate,
                (InventoryTransactionStatus?)entity.Status, entity.IsDeleted,
                entity.UpdatedById, entity.WarehouseId, ct);
        }, cancellationToken);

        return new UpdateStockCountResult
        {
            Data = entity
        };
    }
}

