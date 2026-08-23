using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Features.InventoryTransactionManager;
using Application.Features.ProductSerialManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderItemManager.Commands;

public class CreateSalesOrderItemResult
{
    public SalesOrderItem? Data { get; set; }
}

public class CreateSalesOrderItemRequest : IRequest<CreateSalesOrderItemResult>
{
    public string? SalesOrderId { get; init; }
    public string? ProductId { get; init; }
    public string? WarehouseId { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
    public int? WarrantyMonths { get; init; } = 0;
    public decimal? UnitPrice { get; init; }
    public decimal? Quantity { get; init; } = 1;
    public List<string>? ProductSerialIds { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateSalesOrderItemValidator : AbstractValidator<CreateSalesOrderItemRequest>
{
    public CreateSalesOrderItemValidator()
    {
        RuleFor(x => x.SalesOrderId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        // Warehouse is required only for physical products; non-physical lines do not
        // participate in inventory and may omit it.
        RuleFor(x => x.TaxId).NotEmpty();
        RuleFor(x => x.WarrantyMonths).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.UnitPrice).NotEmpty();
        RuleFor(x => x.Quantity).NotNull().GreaterThan(0)
            .When(x => x.ProductSerialIds == null || x.ProductSerialIds.Count == 0);
    }
}

public class CreateSalesOrderItemHandler : IRequestHandler<CreateSalesOrderItemRequest, CreateSalesOrderItemResult>
{
    private readonly ICommandRepository<SalesOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;
    private readonly ProductSerialService _productSerialService;
    private readonly InventoryAvailabilityService _inventoryAvailabilityService;

    public CreateSalesOrderItemHandler(
        ICommandRepository<SalesOrderItem> repository,
        IUnitOfWork unitOfWork,
        SalesOrderService salesOrderService,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext,
        ProductSerialService productSerialService,
        InventoryAvailabilityService inventoryAvailabilityService
    )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
        _productSerialService = productSerialService;
        _inventoryAvailabilityService = inventoryAvailabilityService;
    }

    public async Task<CreateSalesOrderItemResult> Handle(CreateSalesOrderItemRequest request, CancellationToken cancellationToken = default)
    {
        var orderStatus = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == request.SalesOrderId)
            .Select(x => x.OrderStatus)
            .SingleOrDefaultAsync(cancellationToken);
        if (orderStatus != SalesOrderStatus.Draft)
            throw new InvalidOperationException("Only draft sales orders can be edited.");

        await ValidateProductNotDuplicatedAsync(request.SalesOrderId, request.ProductId, null, cancellationToken);

        var isPhysical = await _queryContext.Set<Product>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == request.ProductId)
            .Select(x => x.Physical == true).SingleOrDefaultAsync(cancellationToken);
        if (isPhysical && string.IsNullOrWhiteSpace(request.WarehouseId))
            throw new Exception("Warehouse is required for physical products.");

        var quantity = request.Quantity;
        var isSerialTracked = await _productSerialService.IsProductSerialTrackedAsync(request.ProductId, cancellationToken);
        if (isSerialTracked)
        {
            if (request.ProductSerialIds == null || request.ProductSerialIds.Count == 0)
            {
                throw new Exception("Serial-tracked products require selected serial numbers.");
            }
            quantity = request.ProductSerialIds.Count;
        }
        else if (quantity == null || quantity <= 0m)
        {
            throw new Exception("Quantity must be greater than zero.");
        }

        await ValidateAvailableStockAsync(
            request.ProductId,
            request.WarehouseId,
            quantity,
            null,
            cancellationToken
        );

        var entity = new SalesOrderItem();
        entity.CreatedById = request.CreatedById;

        entity.SalesOrderId = request.SalesOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = isPhysical ? request.WarehouseId : null;
        entity.Summary = request.Summary;
        entity.TaxId = request.TaxId;
        entity.WarrantyMonths = isPhysical ? request.WarrantyMonths : 0;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = quantity;

        entity.Total = AccountingMath.RoundVnd((entity.Quantity ?? 0m) * (entity.UnitPrice ?? 0m));
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = AccountingMath.RoundVnd((entity.Total ?? 0m) * taxPercentage / 100m);
        entity.AfterTaxAmount = (entity.Total ?? 0m) + (entity.TaxAmount ?? 0m);
        entity.CogsAmount = 0m;
        entity.ProfitAmount = 0m;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReserveSalesOrderItemSerialsAsync(entity, request.ProductSerialIds, entity.CreatedById, cancellationToken);

        await _inventoryTransactionService.UpdateSalesOrderItemCostAsync(
            entity,
            entity.CreatedById,
            cancellationToken
        );

        _salesOrderService.Recalculate(entity.SalesOrderId ?? "");
        await _salesOrderService.SynchronizeInventoryAsync(
            entity.SalesOrderId ?? "",
            entity.CreatedById,
            cancellationToken
        );

        return new CreateSalesOrderItemResult { Data = entity };
    }

    private async Task ValidateAvailableStockAsync(
        string? productId,
        string? warehouseId,
        decimal? quantity,
        string? currentSalesOrderItemId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(productId) ||
            string.IsNullOrWhiteSpace(warehouseId) ||
            quantity == null)
        {
            return;
        }

        var availableStock = await _inventoryAvailabilityService.GetAvailableStockAsync(
            productId,
            warehouseId,
            currentSalesOrderItemId,
            cancellationToken);

        if (availableStock <= 0m || quantity > availableStock)
        {
            throw new Exception($"Not enough stock for the selected warehouse. Available: {availableStock}.");
        }
    }

    private async Task<decimal> ResolveTaxPercentageAsync(string? taxId, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(taxId))
        {
            throw new Exception("Tax is required.");
        }

        var percentage = await _queryContext
            .Set<Tax>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == taxId)
            .Select(x => x.Percentage)
            .SingleOrDefaultAsync(cancellationToken);

        if (percentage == null)
        {
            throw new Exception("Tax is invalid.");
        }

        return percentage.Value;
    }

    private async Task ValidateProductNotDuplicatedAsync(
        string? salesOrderId,
        string? productId,
        string? currentItemId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(salesOrderId) || string.IsNullOrWhiteSpace(productId))
        {
            return;
        }

        var exists = await _queryContext
            .Set<SalesOrderItem>()
            .AsNoTracking()
            .Where(x =>
                !x.IsDeleted &&
                x.SalesOrderId == salesOrderId &&
                x.ProductId == productId &&
                (currentItemId == null || x.Id != currentItemId))
            .AnyAsync(cancellationToken);

        if (exists)
        {
            throw new Exception("This product already exists in this sales order.");
        }
    }
}
