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
    public IReadOnlyCollection<string>? ManufacturerSerialNumbers { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
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
        RuleFor(x => x.TaxId).NotEmpty();
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
        entity.ManufacturerSerialNumbersJson = request.ManufacturerSerialNumbers == null ? null : JsonSerializer.Serialize(request.ManufacturerSerialNumbers);

        entity.SupplierWarrantyMonths = request.SupplierWarrantyMonths ?? entity.SupplierWarrantyMonths ?? 6;
        entity.Summary = request.Summary;
        entity.TaxId = request.TaxId;
        entity.UnitPrice = request.UnitPrice;
        var tracking = await _queryContext.Set<Product>().AsNoTracking()
            .Where(x => x.Id == request.ProductId)
            .Select(x => new { x.Physical, x.SerialTrackingMode })
            .SingleAsync(cancellationToken);
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

        entity.Total = (entity.UnitPrice ?? 0d) * (entity.Quantity ?? 0d);
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = (entity.Total ?? 0d) * taxPercentage / 100d;
        entity.AfterTaxAmount = (entity.Total ?? 0d) + (entity.TaxAmount ?? 0d);

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

        var physical = await _queryContext.Set<Product>().AsNoTracking().Where(x => x.Id == productId).Select(x => x.Physical).FirstOrDefaultAsync(cancellationToken);
        if (physical != true) return null;
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
