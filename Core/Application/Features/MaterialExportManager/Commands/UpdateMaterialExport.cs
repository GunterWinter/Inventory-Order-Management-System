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
    public string? PurchaseOrderId { get; init; }
    public string? CustomerId { get; init; }
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
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();
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
        entity.PurchaseOrderId = request.PurchaseOrderId;
        entity.CustomerId = request.CustomerId;
        entity.Status = (MaterialExportStatus)int.Parse(request.Status!);
        entity.Description = request.Description;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Custom logic: If confirmed, we need to update the PO allocations!
        if (entity.Status == MaterialExportStatus.Confirmed)
        {
            // Fetch items (Frontend uses InventoryTransaction directly for Material Export)
            var items = await _queryContext.Set<InventoryTransaction>()
                .Where(x => x.ModuleId == entity.Id && x.ModuleName == "MaterialExport" && !x.IsDeleted)
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

            foreach (var item in items)
            {
                var poItem = await _queryContext.Set<PurchaseOrderItem>()
                    .Where(x => x.PurchaseOrderId == entity.PurchaseOrderId && x.ProductId == item.ProductId && !x.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken);

                if (poItem != null)
                {
                    allocateRequest.Items.Add(new AllocatePurchaseOrderCostsItem
                    {
                        PurchaseOrderItemId = poItem.Id,
                        CustomerId = entity.CustomerId,
                        Quantity = item.Movement ?? 0,
                        UnitPrice = (poItem.AfterTaxAmount ?? 0) / (poItem.Quantity > 0 ? poItem.Quantity.Value : 1)
                    });
                }
            }

            // Execute the Cost Allocation, which will deduct stock and automatically pick serials!
            await _sender.Send(allocateRequest, cancellationToken);
        }

        return new UpdateMaterialExportResult
        {
            Data = entity
        };
    }
}

