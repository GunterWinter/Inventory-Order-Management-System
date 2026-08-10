using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

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
    public IReadOnlyCollection<string>? ManufacturerSerialNumbers { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
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
        RuleFor(x => x.TaxId).NotEmpty();
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
        var orderStatus = await _queryContext.Set<PurchaseOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == request.PurchaseOrderId)
            .Select(x => x.OrderStatus)
            .SingleOrDefaultAsync(cancellationToken);
        if (orderStatus != PurchaseOrderStatus.Draft)
            throw new InvalidOperationException("Only draft purchase orders can be edited.");

        await ValidateProductNotDuplicatedAsync(request.PurchaseOrderId, request.ProductId, null, cancellationToken);

        var entity = new PurchaseOrderItem();
        entity.CreatedById = request.CreatedById;

        entity.PurchaseOrderId = request.PurchaseOrderId;
        entity.ProductId = request.ProductId;
        var tracking = await _queryContext.Set<Product>().AsNoTracking()
            .Where(x => x.Id == request.ProductId)
            .Select(x => new { x.Physical, x.SerialTrackingMode })
            .SingleAsync(cancellationToken);
        entity.WarehouseId = await ResolveWarehouseIdAsync(request.WarehouseId, request.ProductId, cancellationToken);
        if (tracking.Physical == true && string.IsNullOrWhiteSpace(entity.WarehouseId))
            throw new InvalidOperationException("Warehouse is required for physical products.");
        entity.ManufacturerSerialNumbersJson = request.ManufacturerSerialNumbers == null ? null : JsonSerializer.Serialize(request.ManufacturerSerialNumbers);
        entity.SupplierWarrantyMonths = tracking.Physical == true ? request.SupplierWarrantyMonths ?? 6 : 0;
        entity.Summary = request.Summary;
        entity.TaxId = request.TaxId;
        entity.UnitPrice = request.UnitPrice;
        if (tracking.Physical == true
            && tracking.SerialTrackingMode != SerialTrackingMode.None
            && Math.Abs((request.Quantity ?? 0d) - Math.Round(request.Quantity ?? 0d)) > 0.000001d)
            throw new InvalidOperationException("Serial-tracked products require a whole-number quantity.");
        if (tracking.Physical == true && tracking.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial)
        {
            if (request.ManufacturerSerialNumbers == null || request.ManufacturerSerialNumbers.Count == 0)
                throw new InvalidOperationException("Manufacturer serial numbers are required.");
            var manufacturerSerials = request.ManufacturerSerialNumbers.Select(x => x.Trim()).ToList();
            if (manufacturerSerials.Any(string.IsNullOrWhiteSpace)
                || manufacturerSerials.Distinct(StringComparer.OrdinalIgnoreCase).Count() != manufacturerSerials.Count)
                throw new InvalidOperationException("Manufacturer serial numbers must be non-empty and unique.");
            if (Math.Abs((request.Quantity ?? 0d) - manufacturerSerials.Count) > 0.000001d)
                throw new InvalidOperationException("Manufacturer serial number count must match quantity.");
            entity.ManufacturerSerialNumbersJson = JsonSerializer.Serialize(manufacturerSerials);
            entity.Quantity = manufacturerSerials.Count;
        }
        else
        {
            entity.Quantity = request.Quantity;
            entity.ManufacturerSerialNumbersJson = null;
        }

        entity.Total = (entity.Quantity ?? 0d) * (entity.UnitPrice ?? 0d);
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = (entity.Total ?? 0d) * taxPercentage / 100d;
        entity.AfterTaxAmount = (entity.Total ?? 0d) + (entity.TaxAmount ?? 0d);

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.PurchaseOrderId ?? "");
        await _purchaseOrderService.SynchronizeInventoryAsync(
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
        var physical = await _queryContext.Set<Product>().AsNoTracking().Where(x => x.Id == productId).Select(x => x.Physical).FirstOrDefaultAsync(cancellationToken);
        if (physical != true) return null;
        if (!string.IsNullOrWhiteSpace(warehouseId)) return warehouseId;
        return await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .Where(x => x.Id == productId)
            .Select(x => x.DefaultWarehouseId)
            .FirstOrDefaultAsync(cancellationToken);
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
