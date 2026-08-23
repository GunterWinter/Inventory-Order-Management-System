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

public class UpdateSalesOrderItemResult
{
    public SalesOrderItem? Data { get; set; }
}

public class UpdateSalesOrderItemRequest : IRequest<UpdateSalesOrderItemResult>
{
    public string? Id { get; init; }
    public string? SalesOrderId { get; init; }
    public string? ProductId { get; init; }
    public string? WarehouseId { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
    public int? WarrantyMonths { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? Quantity { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateSalesOrderItemValidator : AbstractValidator<UpdateSalesOrderItemRequest>
{
    public UpdateSalesOrderItemValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.SalesOrderId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        // Warehouse is required only for physical products.
        RuleFor(x => x.TaxId).NotEmpty();
        RuleFor(x => x.WarrantyMonths).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.UnitPrice).NotEmpty();
        RuleFor(x => x.Quantity).NotNull().GreaterThan(0)
            .When(x => x.ProductSerialIds == null || x.ProductSerialIds.Count == 0);
    }
}

public class UpdateSalesOrderItemHandler : IRequestHandler<UpdateSalesOrderItemRequest, UpdateSalesOrderItemResult>
{
    private readonly ICommandRepository<SalesOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;
    private readonly ProductSerialService _productSerialService;
    private readonly InventoryAvailabilityService _inventoryAvailabilityService;

    public UpdateSalesOrderItemHandler(
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

    public async Task<UpdateSalesOrderItemResult> Handle(UpdateSalesOrderItemRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);
        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        var orderStatus = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == entity.SalesOrderId)
            .Select(x => x.OrderStatus)
            .SingleOrDefaultAsync(cancellationToken);
        if (orderStatus != SalesOrderStatus.Draft)
            throw new InvalidOperationException("Only draft sales orders can be edited.");

        await ValidateProductNotDuplicatedAsync(request.SalesOrderId, request.ProductId, entity.Id, cancellationToken);

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
            entity.Id,
            cancellationToken
        );

        entity.UpdatedById = request.UpdatedById;

        entity.SalesOrderId = request.SalesOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = isPhysical ? request.WarehouseId : null;
        entity.Summary = request.Summary;
        entity.TaxId = request.TaxId;
        entity.WarrantyMonths = isPhysical ? request.WarrantyMonths : 0;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = quantity;

        entity.Total = AccountingMath.RoundVnd((entity.UnitPrice ?? 0m) * (entity.Quantity ?? 0m));
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = AccountingMath.RoundVnd((entity.Total ?? 0m) * taxPercentage / 100m);
        entity.AfterTaxAmount = (entity.Total ?? 0m) + (entity.TaxAmount ?? 0m);

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _productSerialService.ReserveSalesOrderItemSerialsAsync(entity, request.ProductSerialIds, entity.UpdatedById, cancellationToken);

        await _inventoryTransactionService.UpdateSalesOrderItemCostAsync(
            entity,
            entity.UpdatedById,
            cancellationToken
        );

        _salesOrderService.Recalculate(entity.SalesOrderId ?? "");
        await _salesOrderService.SynchronizeInventoryAsync(
            entity.SalesOrderId ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new UpdateSalesOrderItemResult { Data = entity };
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
