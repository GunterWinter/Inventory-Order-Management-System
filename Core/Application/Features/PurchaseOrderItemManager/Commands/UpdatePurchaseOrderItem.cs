using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderItemManager.Commands;

public class UpdatePurchaseOrderItemResult
{
    public PurchaseOrderItem? Data { get; set; }
}

public class UpdatePurchaseOrderItemRequest : IRequest<UpdatePurchaseOrderItemResult>
{
    public string? Id { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? ProductId { get; init; }
    public string? WarehouseId { get; init; }
    public string? BatchNumber { get; init; }
    public string? Summary { get; init; }
    public int? SupplierWarrantyMonths { get; init; }
    public double? UnitPrice { get; init; }
    public double? Quantity { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdatePurchaseOrderItemValidator : AbstractValidator<UpdatePurchaseOrderItemRequest>
{
    public UpdatePurchaseOrderItemValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.BatchNumber).NotEmpty();
        RuleFor(x => x.UnitPrice).NotEmpty();
        RuleFor(x => x.Quantity).NotEmpty();
    }
}

public class UpdatePurchaseOrderItemHandler : IRequestHandler<UpdatePurchaseOrderItemRequest, UpdatePurchaseOrderItemResult>
{
    private readonly ICommandRepository<PurchaseOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly PurchaseOrderService _purchaseOrderService;
    private readonly IQueryContext _queryContext;

    public UpdatePurchaseOrderItemHandler(
        ICommandRepository<PurchaseOrderItem> repository,
        IUnitOfWork unitOfWork,
        PurchaseOrderService purchaseOrderService,
        IQueryContext queryContext
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _purchaseOrderService = purchaseOrderService;
        _queryContext = queryContext;
    }

    public async Task<UpdatePurchaseOrderItemResult> Handle(UpdatePurchaseOrderItemRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        await ValidateProductNotDuplicatedAsync(request.PurchaseOrderId, request.ProductId, entity.Id, cancellationToken);

        entity.UpdatedById = request.UpdatedById;

        entity.PurchaseOrderId = request.PurchaseOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = await ResolveWarehouseIdAsync(request.WarehouseId, request.ProductId, cancellationToken);
        if (string.IsNullOrWhiteSpace(entity.WarehouseId))
        {
            throw new Exception("Warehouse is required.");
        }

        entity.BatchNumber = request.BatchNumber;
        entity.SupplierWarrantyMonths = request.SupplierWarrantyMonths ?? entity.SupplierWarrantyMonths ?? 6;
        entity.Summary = request.Summary;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = request.Quantity;

        entity.Total = entity.UnitPrice * entity.Quantity;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.PurchaseOrderId ?? "");
        await _purchaseOrderService.SynchronizeGoodsReceiveAsync(
            entity.PurchaseOrderId ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new UpdatePurchaseOrderItemResult
        {
            Data = entity
        };
    }

    private async Task<string?> ResolveWarehouseIdAsync(string? warehouseId, string? productId, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(warehouseId))
        {
            return warehouseId;
        }

        return await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .Where(x => x.Id == productId)
            .Select(x => x.DefaultWarehouseId)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task ValidateProductNotDuplicatedAsync(
        string? purchaseOrderId,
        string? productId,
        string? currentItemId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(purchaseOrderId) || string.IsNullOrWhiteSpace(productId))
        {
            return;
        }

        var exists = await _queryContext
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .Where(x =>
                !x.IsDeleted &&
                x.PurchaseOrderId == purchaseOrderId &&
                x.ProductId == productId &&
                (currentItemId == null || x.Id != currentItemId))
            .AnyAsync(cancellationToken);

        if (exists)
        {
            throw new Exception("This product already exists in this purchase order.");
        }
    }
}
