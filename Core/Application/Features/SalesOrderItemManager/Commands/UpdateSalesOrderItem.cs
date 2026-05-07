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
    public string? BatchNumber { get; init; }
    public string? TaxId { get; init; }
    public int? WarrantyMonths { get; init; }
    public double? UnitPrice { get; init; }
    public double? Quantity { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateSalesOrderItemValidator : AbstractValidator<UpdateSalesOrderItemRequest>
{
    public UpdateSalesOrderItemValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
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

public class UpdateSalesOrderItemHandler : IRequestHandler<UpdateSalesOrderItemRequest, UpdateSalesOrderItemResult>
{
    private readonly ICommandRepository<SalesOrderItem> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IQueryContext _queryContext;

    public UpdateSalesOrderItemHandler(
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

    public async Task<UpdateSalesOrderItemResult> Handle(UpdateSalesOrderItemRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);
        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        await ValidateConfirmedSalesOrderItemUpdateAsync(entity, request, cancellationToken);

        await ValidateProductNotDuplicatedAsync(request.SalesOrderId, request.ProductId, entity.Id, cancellationToken);

        await ValidateAvailableStockAsync(
            request.ProductId,
            request.WarehouseId,
            request.BatchNumber,
            request.Quantity,
            entity.Id,
            cancellationToken
        );

        entity.UpdatedById = request.UpdatedById;

        entity.SalesOrderId = request.SalesOrderId;
        entity.ProductId = request.ProductId;
        entity.WarehouseId = request.WarehouseId;
        entity.Summary = request.Summary;
        entity.BatchNumber = request.BatchNumber;
        entity.TaxId = request.TaxId;
        entity.WarrantyMonths = request.WarrantyMonths;
        entity.UnitPrice = request.UnitPrice;
        entity.Quantity = request.Quantity;

        entity.Total = (entity.UnitPrice ?? 0d) * (entity.Quantity ?? 0d);
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = (entity.Total ?? 0d) * taxPercentage / 100d;
        entity.AfterTaxAmount = (entity.Total ?? 0d) + (entity.TaxAmount ?? 0d);

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        await _inventoryTransactionService.UpdateSalesOrderItemBatchCostAsync(
            entity,
            entity.UpdatedById,
            cancellationToken
        );

        _salesOrderService.Recalculate(entity.SalesOrderId ?? "");
        await _salesOrderService.SynchronizeDeliveryOrderAsync(
            entity.SalesOrderId ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new UpdateSalesOrderItemResult { Data = entity };
    }

    private async Task ValidateConfirmedSalesOrderItemUpdateAsync(
        SalesOrderItem entity,
        UpdateSalesOrderItemRequest request,
        CancellationToken cancellationToken)
    {
        var isConfirmedSalesOrder = await _queryContext
            .Set<SalesOrder>()
            .AsNoTracking()
            .AnyAsync(x =>
                !x.IsDeleted &&
                x.Id == entity.SalesOrderId &&
                x.OrderStatus == SalesOrderStatus.Confirmed,
                cancellationToken);

        if (!isConfirmedSalesOrder)
        {
            return;
        }

        var immutableFieldsChanged =
            entity.SalesOrderId != request.SalesOrderId ||
            entity.ProductId != request.ProductId ||
            entity.WarehouseId != request.WarehouseId ||
            entity.TaxId != request.TaxId ||
            !string.Equals(entity.Summary ?? string.Empty, request.Summary ?? string.Empty, StringComparison.Ordinal) ||
            (entity.UnitPrice ?? 0d) != (request.UnitPrice ?? 0d);

        if (immutableFieldsChanged)
        {
            throw new Exception("Confirmed sales order items can only update quantity, batch number, and warranty months.");
        }
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
