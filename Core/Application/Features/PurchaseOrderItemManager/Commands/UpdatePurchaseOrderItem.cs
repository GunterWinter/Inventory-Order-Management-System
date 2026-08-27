using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.PurchaseOrderManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
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
    public decimal? UnitPrice { get; init; }
    public decimal? Quantity { get; init; }
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
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        var orderStatus = await _queryContext.Set<PurchaseOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == entity.PurchaseOrderId)
            .Select(x => x.OrderStatus)
            .SingleOrDefaultAsync(cancellationToken);
        if (orderStatus != PurchaseOrderStatus.Draft)
            throw new InvalidOperationException("Only draft purchase orders can be edited.");

        await ValidateProductNotDuplicatedAsync(request.PurchaseOrderId, request.ProductId, entity.Id, cancellationToken);

        entity.UpdatedById = request.UpdatedById;

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
        entity.SupplierWarrantyMonths = tracking.Physical == true ? request.SupplierWarrantyMonths ?? entity.SupplierWarrantyMonths ?? 6 : 0;
        entity.Summary = request.Summary;
        entity.TaxId = request.TaxId;
        entity.UnitPrice = request.UnitPrice;
        if (tracking.Physical == true
            && tracking.SerialTrackingMode != SerialTrackingMode.None
            && Math.Abs((request.Quantity ?? 0m) - Math.Round(request.Quantity ?? 0m)) > 0.000001m)
            throw new InvalidOperationException("Hàng hóa theo dõi serial yêu cầu số lượng là số nguyên.");
        if (tracking.Physical == true && tracking.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial)
        {
            if (request.ManufacturerSerialNumbers == null || request.ManufacturerSerialNumbers.Count == 0)
                throw new InvalidOperationException("Vui lòng nhập mã serial nhà sản xuất.");
            var manufacturerSerials = request.ManufacturerSerialNumbers.Select(x => x.Trim()).ToList();
            if (manufacturerSerials.Any(string.IsNullOrWhiteSpace)
                || manufacturerSerials.Distinct(StringComparer.OrdinalIgnoreCase).Count() != manufacturerSerials.Count)
                throw new InvalidOperationException("Mã serial nhà sản xuất không được để trống hoặc trùng nhau.");
            if (Math.Abs((request.Quantity ?? 0m) - manufacturerSerials.Count) > 0.000001m)
                throw new InvalidOperationException("Số mã serial nhà sản xuất phải bằng số lượng hàng.");
            entity.ManufacturerSerialNumbersJson = JsonSerializer.Serialize(manufacturerSerials);
            entity.Quantity = manufacturerSerials.Count;
        }
        else
        {
            entity.Quantity = request.Quantity;
            entity.ManufacturerSerialNumbersJson = null;
        }

        entity.Total = AccountingMath.RoundMoney((entity.UnitPrice ?? 0m) * (entity.Quantity ?? 0m));
        var taxPercentage = await ResolveTaxPercentageAsync(entity.TaxId, cancellationToken);
        entity.TaxAmount = AccountingMath.RoundMoney((entity.Total ?? 0m) * taxPercentage / 100m);
        entity.AfterTaxAmount = AccountingMath.RoundMoney((entity.Total ?? 0m) + (entity.TaxAmount ?? 0m));

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        _purchaseOrderService.Recalculate(entity.PurchaseOrderId ?? "");
        await _purchaseOrderService.SynchronizeInventoryAsync(
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
