using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderItemManager.Commands;

public class CreatePurchaseOrderItemResult
{
    public PurchaseOrderItem? Data { get; set; }
}

public class CreatePurchaseOrderItemRequest : IRequest<CreatePurchaseOrderItemResult>
{
    public string? PurchaseOrderId { get; init; }
    public string? ProductId { get; init; }
    public string? WarehouseId { get; init; }
    public string? BatchNumber { get; init; }
    public string? Summary { get; init; }
    public int? SupplierWarrantyMonths { get; init; }
    public double? UnitPrice { get; init; }
    public double? Quantity { get; init; }
    public string? CreatedById { get; init; }
}

public class CreatePurchaseOrderItemValidator : AbstractValidator<CreatePurchaseOrderItemRequest>
{
    public CreatePurchaseOrderItemValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.BatchNumber).NotEmpty();
        RuleFor(x => x.UnitPrice).NotEmpty();
        RuleFor(x => x.Quantity).NotEmpty();
    }
}

public class CreatePurchaseOrderItemHandler : IRequestHandler<CreatePurchaseOrderItemRequest, CreatePurchaseOrderItemResult>
{
    private readonly ICommandRepository<PurchaseOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly PurchaseOrderService _purchaseOrderService;
    private readonly IQueryContext _queryContext;

    public CreatePurchaseOrderItemHandler(
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

    public async Task<CreatePurchaseOrderItemResult> Handle(CreatePurchaseOrderItemRequest request, CancellationToken cancellationToken = default)
    {
        await ValidateProductNotDuplicatedAsync(request.PurchaseOrderId, request.ProductId, null, cancellationToken);

        var entity = new PurchaseOrderItem();
        entity.CreatedById = request.CreatedById;

        entity.PurchaseOrderId = request.PurchaseOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = await ResolveWarehouseIdAsync(request.WarehouseId, request.ProductId, cancellationToken);
        if (string.IsNullOrWhiteSpace(entity.WarehouseId))
        {
            throw new Exception("Warehouse is required.");
        }

        entity.BatchNumber = request.BatchNumber;
        entity.SupplierWarrantyMonths = request.SupplierWarrantyMonths ?? 6;
        entity.Summary = request.Summary;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = request.Quantity;

        entity.Total = entity.Quantity * entity.UnitPrice;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.PurchaseOrderId ?? "");
        await _purchaseOrderService.SynchronizeGoodsReceiveAsync(
            entity.PurchaseOrderId ?? "",
            entity.CreatedById,
            cancellationToken
        );

        return new CreatePurchaseOrderItemResult
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
