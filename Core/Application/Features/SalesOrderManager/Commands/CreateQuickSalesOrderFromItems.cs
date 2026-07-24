using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager.Commands;

public class CreateQuickSalesOrderFromItemsResult
{
    public SalesOrder? Data { get; set; }
}

public class QuickExportItemDto
{
    public string? PurchaseOrderItemId { get; set; }
    public double Quantity { get; set; }
    public double UnitPrice { get; set; }
}

public class CreateQuickSalesOrderFromItemsRequest : IRequest<CreateQuickSalesOrderFromItemsResult>
{
    public string? PurchaseOrderId { get; init; }
    public List<QuickExportItemDto>? Items { get; init; }
    public string? CustomerId { get; init; }
    public SalesType? SalesType { get; init; } = Domain.Enums.SalesType.Internal;
    public string? CreatedById { get; init; }
}

public class CreateQuickSalesOrderFromItemsValidator : AbstractValidator<CreateQuickSalesOrderFromItemsRequest>
{
    public CreateQuickSalesOrderFromItemsValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}

public class CreateQuickSalesOrderFromItemsHandler : IRequestHandler<CreateQuickSalesOrderFromItemsRequest, CreateQuickSalesOrderFromItemsResult>
{
    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly SalesOrderService _salesOrderService;
    private readonly ProductSerialService _productSerialService;

    public CreateQuickSalesOrderFromItemsHandler(
        IQueryContext queryContext,
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        SalesOrderService salesOrderService,
        ProductSerialService productSerialService
    )
    {
        _queryContext = queryContext;
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _salesOrderService = salesOrderService;
        _productSerialService = productSerialService;
    }

    public async Task<CreateQuickSalesOrderFromItemsResult> Handle(CreateQuickSalesOrderFromItemsRequest request, CancellationToken cancellationToken = default)
    {
        var purchaseOrder = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId, cancellationToken);

        if (purchaseOrder == null)
        {
            throw new Exception($"Purchase Order not found: {request.PurchaseOrderId}");
        }

        var requestedItemIds = request.Items!.Select(x => x.PurchaseOrderItemId).ToHashSet(StringComparer.OrdinalIgnoreCase);

        // Load the selected PO items (tracked, so we can update them)
        var poItems = await _purchaseOrderItemRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.Tax)
            .Where(x => x.PurchaseOrderId == request.PurchaseOrderId && requestedItemIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        if (poItems.Count == 0)
        {
            throw new Exception("No valid Purchase Order items found for the given IDs.");
        }

        // Validate quantities
        foreach (var reqItem in request.Items!)
        {
            var poItem = poItems.FirstOrDefault(x => x.Id == reqItem.PurchaseOrderItemId);
            if (poItem == null)
            {
                throw new Exception($"Purchase Order item not found: {reqItem.PurchaseOrderItemId}");
            }

            var remaining = (poItem.Quantity ?? 0) - (poItem.QuickSalesExportedQuantity ?? 0);
            if (reqItem.Quantity <= 0)
            {
                throw new Exception($"Số lượng xuất phải lớn hơn 0 cho sản phẩm {poItem.Product?.Name ?? poItem.ProductId}.");
            }
            if (reqItem.Quantity > remaining)
            {
                throw new Exception($"Số lượng xuất ({reqItem.Quantity}) vượt quá số lượng còn lại ({remaining}) cho sản phẩm {poItem.Product?.Name ?? poItem.ProductId}.");
            }
        }

        // Create Sales Order
        var resolvedSalesType = request.SalesType ?? SalesType.Internal;
        var salesOrder = new SalesOrder
        {
            CreatedById = request.CreatedById,
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = DateTime.Today,
            OrderStatus = SalesOrderStatus.Confirmed,
            SalesType = resolvedSalesType,
            CustomerId = request.CustomerId,
            Description = $"Xuất nhanh từ PO {purchaseOrder.Number}"
        };

        await _salesOrderRepository.CreateAsync(salesOrder, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Create SalesOrderItems and update PO item exported quantities
        foreach (var reqItem in request.Items!)
        {
            var poItem = poItems.First(x => x.Id == reqItem.PurchaseOrderItemId);
            var product = poItem.Product;
            double unitPrice = reqItem.UnitPrice;
            double quantity = reqItem.Quantity;
            double total = unitPrice * quantity;
            double taxRate = poItem.Tax?.Percentage ?? 0;
            double taxAmount = total * (taxRate / 100.0);
            double afterTaxAmount = total + taxAmount;

            var soItem = new SalesOrderItem
            {
                CreatedById = request.CreatedById,
                SalesOrderId = salesOrder.Id,
                ProductId = poItem.ProductId,
                WarehouseId = poItem.WarehouseId,
                BatchNumber = poItem.BatchNumber,
                Quantity = quantity,
                UnitPrice = unitPrice,
                Total = total,
                TaxId = poItem.TaxId,
                TaxAmount = taxAmount,
                AfterTaxAmount = afterTaxAmount,
                WarrantyMonths = product?.DefaultWarrantyMonths,
                Summary = poItem.Summary
            };

            await _salesOrderItemRepository.CreateAsync(soItem, cancellationToken);

            // Auto-reserve serials for serial-tracked products
            if (product?.SerialTrackingMode != null && product.SerialTrackingMode != SerialTrackingMode.None)
            {
                var availableSerials = await _queryContext
                    .Set<ProductSerial>()
                    .AsNoTracking()
                    .ApplyIsDeletedFilter(false)
                    .Where(x =>
                        x.ProductId == poItem.ProductId &&
                        x.CurrentWarehouseId == poItem.WarehouseId &&
                        x.BatchNumber == poItem.BatchNumber &&
                        (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.ReturnedByCustomer) &&
                        x.SalesOrderItemId == null)
                    .OrderBy(x => x.CreatedAtUtc)
                    .Take((int)quantity)
                    .Select(x => x.Id)
                    .ToListAsync(cancellationToken);

                if (availableSerials.Count > 0)
                {
                    await _productSerialService.ReserveSalesOrderItemSerialsAsync(
                        soItem,
                        availableSerials,
                        request.CreatedById,
                        cancellationToken
                    );
                }
            }

            // Update PO item's exported quantity (cumulative)
            poItem.QuickSalesExportedQuantity = (poItem.QuickSalesExportedQuantity ?? 0) + quantity;
            poItem.UpdatedById = request.CreatedById;
            _purchaseOrderItemRepository.Update(poItem);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        _salesOrderService.Recalculate(salesOrder.Id);
        await _salesOrderService.SynchronizeDeliveryOrderAsync(salesOrder.Id, request.CreatedById, cancellationToken);

        return new CreateQuickSalesOrderFromItemsResult
        {
            Data = salesOrder
        };
    }
}
