using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager.Commands;

public class CreateSalesOrderFromPurchaseOrderResult
{
    public SalesOrder? Data { get; set; }
}

public class CreateSalesOrderFromPurchaseOrderRequest : IRequest<CreateSalesOrderFromPurchaseOrderResult>
{
    public string? PurchaseOrderId { get; init; }
    public SalesType? SalesType { get; init; } = Domain.Enums.SalesType.Internal;
    public string? CreatedById { get; init; }
}

public class CreateSalesOrderFromPurchaseOrderValidator : AbstractValidator<CreateSalesOrderFromPurchaseOrderRequest>
{
    public CreateSalesOrderFromPurchaseOrderValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class CreateSalesOrderFromPurchaseOrderHandler : IRequestHandler<CreateSalesOrderFromPurchaseOrderRequest, CreateSalesOrderFromPurchaseOrderResult>
{
    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly SalesOrderService _salesOrderService;
    private readonly ProductSerialService _productSerialService;

    public CreateSalesOrderFromPurchaseOrderHandler(
        IQueryContext queryContext,
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        SalesOrderService salesOrderService,
        ProductSerialService productSerialService
    )
    {
        _queryContext = queryContext;
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _salesOrderService = salesOrderService;
        _productSerialService = productSerialService;
    }

    public async Task<CreateSalesOrderFromPurchaseOrderResult> Handle(CreateSalesOrderFromPurchaseOrderRequest request, CancellationToken cancellationToken = default)
    {
        var purchaseOrder = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
                .ThenInclude(x => x.Product)
            .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
                .ThenInclude(x => x.Tax)
            .FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId, cancellationToken);

        if (purchaseOrder == null)
        {
            throw new Exception($"Purchase Order not found: {request.PurchaseOrderId}");
        }

        var salesType = request.SalesType ?? SalesType.Internal;

        var salesOrder = new SalesOrder
        {
            CreatedById = request.CreatedById,
            Number = _numberSequenceService.GenerateNumber(nameof(SalesOrder), "", "SO"),
            OrderDate = DateTime.Today,
            OrderStatus = SalesOrderStatus.Draft,
            SalesType = salesType,
            Description = $"Quick export to project from PO {purchaseOrder.Number}"
        };

        await _salesOrderRepository.CreateAsync(salesOrder, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        foreach (var poItem in purchaseOrder.PurchaseOrderItemList)
        {
            var product = poItem.Product;
            double unitPrice = salesType == SalesType.Internal
                ? (product?.CostPrice ?? poItem.UnitPrice ?? 0)
                : (product?.UnitPrice ?? poItem.UnitPrice ?? 0);

            double quantity = poItem.Quantity ?? 1;
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
            await _unitOfWork.SaveAsync(cancellationToken);

            // If product is serial tracked, automatically reserve the serial numbers generated/received for this PO item
            if (await _productSerialService.IsProductSerialTrackedAsync(poItem.ProductId, cancellationToken))
            {
                var serials = await _queryContext
                    .Set<ProductSerial>()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.PurchaseOrderItemId == poItem.Id &&
                                (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.Pending))
                    .ToListAsync(cancellationToken);

                if (serials.Count == 0 && !string.IsNullOrEmpty(poItem.ProductId))
                {
                    serials = await _queryContext
                        .Set<ProductSerial>()
                        .ApplyIsDeletedFilter(false)
                        .Where(x => x.ProductId == poItem.ProductId &&
                                    x.CurrentWarehouseId == poItem.WarehouseId &&
                                    x.Status == ProductSerialStatus.InStock)
                        .Take((int)quantity)
                        .ToListAsync(cancellationToken);
                }

                if (serials.Count > 0)
                {
                    var serialIds = serials.Select(x => x.Id).ToList();
                    await _productSerialService.ReserveSalesOrderItemSerialsAsync(soItem, serialIds, request.CreatedById, cancellationToken);
                }
            }
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        _salesOrderService.Recalculate(salesOrder.Id);
        await _salesOrderService.SynchronizeInventoryAsync(salesOrder.Id, request.CreatedById, cancellationToken);

        return new CreateSalesOrderFromPurchaseOrderResult
        {
            Data = salesOrder
        };
    }
}
