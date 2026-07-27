using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Application.Features.PurchaseOrderManager.Commands;
using Application.Common.CQS.Queries;

namespace Application.Features.MaterialExportManager.Commands;

public class UpdateMaterialExportResult
{
    public MaterialExport? Data { get; set; }
}

public class UpdateMaterialExportRequest : IRequest<UpdateMaterialExportResult>
{
    public string? Id { get; init; }
    public DateTime? MaterialExportDate { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateMaterialExportValidator : AbstractValidator<UpdateMaterialExportRequest>
{
    public UpdateMaterialExportValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.MaterialExportDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
    }
}

public class UpdateMaterialExportHandler : IRequestHandler<UpdateMaterialExportRequest, UpdateMaterialExportResult>
{
    private readonly ICommandRepository<MaterialExport> _repository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ISender _sender;

    public UpdateMaterialExportHandler(
        ICommandRepository<MaterialExport> repository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        ISender sender
        )
    {
        _repository = repository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _sender = sender;
    }

    public async Task<UpdateMaterialExportResult> Handle(UpdateMaterialExportRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;
        entity.ExportDate = request.MaterialExportDate;
        entity.Status = (MaterialExportStatus)int.Parse(request.Status!);
        entity.Description = request.Description;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Custom logic: If confirmed, we need to update the PO allocations!
        if (entity.Status == MaterialExportStatus.Confirmed)
        {
            // Fetch items
            var items = await _queryContext.Set<MaterialExportItem>()
                .Where(x => x.MaterialExportId == entity.Id)
                .ToListAsync(cancellationToken);

            // Fetch existing allocations
            var existingAllocations = await _queryContext.Set<PurchaseOrderCostAllocation>()
                .Where(x => x.PurchaseOrderId == entity.PurchaseOrderId && !x.IsDeleted)
                .ToListAsync(cancellationToken);

            // Find existing cash account info from old transactions
            var oldCashTransaction = await _queryContext.Set<CashTransaction>()
                .Where(x => !x.IsDeleted && x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == entity.PurchaseOrderId)
                .FirstOrDefaultAsync(cancellationToken);

            var allocateRequest = new AllocatePurchaseOrderCostsRequest
            {
                PurchaseOrderId = entity.PurchaseOrderId!,
                CashAccountId = oldCashTransaction?.CashAccountId,
                CashCategoryId = oldCashTransaction?.CashCategoryId,
                CreatedById = entity.UpdatedById,
                Items = existingAllocations
                    .Where(x => !string.IsNullOrEmpty(x.CustomerId))
                    .Select(x => new AllocatePurchaseOrderCostsItem
                    {
                        PurchaseOrderItemId = x.PurchaseOrderItemId,
                        CustomerId = x.CustomerId,
                        Quantity = x.Quantity ?? 0,
                        UnitPrice = x.UnitPrice ?? 0
                    }).ToList()
            };

            // Fetch PO items for unit price
            var poItems = await _queryContext.Set<PurchaseOrderItem>()
                .Where(x => x.PurchaseOrderId == entity.PurchaseOrderId && !x.IsDeleted)
                .ToDictionaryAsync(x => x.Id!, x => x.UnitPrice ?? 0, cancellationToken);

            foreach (var item in items)
            {
                allocateRequest.Items.Add(new AllocatePurchaseOrderCostsItem
                {
                    PurchaseOrderItemId = item.PurchaseOrderItemId,
                    CustomerId = entity.CustomerId,
                    Quantity = item.Quantity ?? 0,
                    UnitPrice = poItems.GetValueOrDefault(item.PurchaseOrderItemId ?? string.Empty, 0)
                });
            }

            await _sender.Send(allocateRequest, cancellationToken);
        }

        return new UpdateMaterialExportResult
        {
            Data = entity
        };
    }
}

