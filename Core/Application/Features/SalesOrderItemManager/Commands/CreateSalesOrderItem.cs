using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Features.InventoryTransactionManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
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
    public string? BatchNumber { get; init; }
    public string? TaxId { get; init; }
    public int? WarrantyMonths { get; init; }
    public double? UnitPrice { get; init; }
    public double? Quantity { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateSalesOrderItemValidator : AbstractValidator<CreateSalesOrderItemRequest>
{
    public CreateSalesOrderItemValidator()
    {
        RuleFor(x => x.SalesOrderId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.WarehouseId).NotEmpty();
        RuleFor(x => x.BatchNumber).NotEmpty();
        RuleFor(x => x.TaxId).NotEmpty();
        RuleFor(x => x.WarrantyMonths).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.UnitPrice).NotEmpty();
        RuleFor(x => x.Quantity).NotEmpty();
    }
}

public class CreateSalesOrderItemHandler : IRequestHandler<CreateSalesOrderItemRequest, CreateSalesOrderItemResult>
{
    private readonly ICommandRepository<SalesOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public CreateSalesOrderItemHandler(
        ICommandRepository<SalesOrderItem> repository,
        IUnitOfWork unitOfWork,
        SalesOrderService salesOrderService,
        InventoryTransactionService inventoryTransactionService,
        IQueryContext queryContext
    )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
        _inventoryTransactionService = inventoryTransactionService;
        _queryContext = queryContext;
    }

    public async Task<CreateSalesOrderItemResult> Handle(CreateSalesOrderItemRequest request, CancellationToken cancellationToken = default)
    {
        await ValidateProductNotDuplicatedAsync(request.SalesOrderId, request.ProductId, null, cancellationToken);

        await ValidateAvailableStockAsync(
            request.ProductId,
            request.WarehouseId,
            request.BatchNumber,
            request.Quantity,
            null,
            cancellationToken
        );

        var entity = new SalesOrderItem();
        entity.CreatedById = request.CreatedById;

        entity.SalesOrderId = request.SalesOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = request.WarehouseId;
        entity.Summary = request.Summary;
        entity.BatchNumber = request.BatchNumber;
        entity.TaxId = request.TaxId;
        entity.WarrantyMonths = request.WarrantyMonths;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = request.Quantity;

        entity.Total = (entity.Quantity ?? 0d) * (entity.UnitPrice ?? 0d);
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = (entity.Total ?? 0d) * taxPercentage / 100d;
        entity.AfterTaxAmount = (entity.Total ?? 0d) + (entity.TaxAmount ?? 0d);
        entity.CogsAmount = 0d;
        entity.ProfitAmount = 0d;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        await _inventoryTransactionService.UpdateSalesOrderItemBatchCostAsync(
            entity,
            entity.CreatedById,
            cancellationToken
        );

        _salesOrderService.Recalculate(entity.SalesOrderId ?? "");
        await _salesOrderService.SynchronizeDeliveryOrderAsync(
            entity.SalesOrderId ?? "",
            entity.CreatedById,
            cancellationToken
        );

        return new CreateSalesOrderItemResult { Data = entity };
    }

    private async Task ValidateAvailableStockAsync(
        string? productId,
        string? warehouseId,
        string? batchNumber,
        double? quantity,
        string? currentSalesOrderItemId,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(productId) ||
            string.IsNullOrWhiteSpace(warehouseId) ||
            string.IsNullOrWhiteSpace(batchNumber) ||
            quantity == null)
        {
            return;
        }

        var availableStock = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.Status == InventoryTransactionStatus.Confirmed &&
                x.ProductId == productId &&
                x.WarehouseId == warehouseId &&
                x.BatchNumber == batchNumber)
            .SumAsync(x => x.Stock ?? 0d, cancellationToken);

        if (!string.IsNullOrWhiteSpace(currentSalesOrderItemId))
        {
            var currentIssuedStock = await _queryContext
                .Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x =>
                    x.Status == InventoryTransactionStatus.Confirmed &&
                    x.ModuleName == nameof(DeliveryOrder) &&
                    x.ModuleItemId == currentSalesOrderItemId &&
                    x.ProductId == productId &&
                    x.WarehouseId == warehouseId &&
                    x.BatchNumber == batchNumber)
                .SumAsync(x => x.Stock ?? 0d, cancellationToken);

            availableStock -= currentIssuedStock;
        }

        if (availableStock <= 0d || quantity > availableStock)
        {
            throw new Exception($"Not enough stock for the selected warehouse and batch. Available: {availableStock}.");
        }
    }

    private async Task<double> ResolveTaxPercentageAsync(string? taxId, CancellationToken cancellationToken)
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
