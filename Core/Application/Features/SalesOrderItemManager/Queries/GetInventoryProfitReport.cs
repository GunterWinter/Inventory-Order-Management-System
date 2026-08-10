using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderItemManager.Queries;

public sealed record InventoryProfitReportItemDto
{
    public string? SalesOrderItemId { get; init; }
    public string? SalesOrderNumber { get; init; }
    public string? ProductId { get; init; }
    public string? ProductNumber { get; init; }
    public string? ProductReferenceCode { get; init; }
    public string? ProductName { get; init; }
    public string? WarehouseName { get; init; }
    public double Quantity { get; init; }
    public double UnitCost { get; init; }
    public double SalesUnitPrice { get; init; }
    public double TotalCost { get; init; }
    public double TotalSales { get; init; }
    public double Profit { get; init; }
    public string CostSource { get; init; } = string.Empty;
    public bool IsFallbackCost { get; init; }
    public DateTime? SoldDate { get; init; }
}

public sealed class GetInventoryProfitReportResult
{
    public List<InventoryProfitReportItemDto> Data { get; init; } = [];
}

public sealed record GetInventoryProfitReportRequest : IRequest<GetInventoryProfitReportResult>;

public sealed class GetInventoryProfitReportHandler
    : IRequestHandler<GetInventoryProfitReportRequest, GetInventoryProfitReportResult>
{
    private readonly IQueryContext _context;

    public GetInventoryProfitReportHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetInventoryProfitReportResult> Handle(
        GetInventoryProfitReportRequest request,
        CancellationToken cancellationToken)
    {
        var salesItems = await _context.Set<SalesOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrder != null && x.SalesOrder.OrderStatus == SalesOrderStatus.Confirmed)
            .Select(x => new
            {
                x.Id,
                x.ProductId,
                x.WarehouseId,
                ProductNumber = x.Product != null ? x.Product.Number : null,
                ProductReferenceCode = x.Product != null ? x.Product.ReferenceCode : null,
                ProductName = x.Product != null ? x.Product.Name : null,
                ProductCostPrice = x.Product != null ? x.Product.CostPrice ?? 0d : 0d,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                SalesOrderNumber = x.SalesOrder!.Number,
                SoldDate = x.SalesOrder.OrderDate ?? x.CreatedAtUtc,
                Quantity = x.Quantity ?? 0d,
                SalesUnitPrice = x.UnitPrice ?? 0d
            })
            .ToListAsync(cancellationToken);

        var itemIds = salesItems.Select(x => x.Id).ToList();
        var productIds = salesItems.Select(x => x.ProductId).Where(x => x != null).Distinct().ToList();
        var warehouseIds = salesItems.Select(x => x.WarehouseId).Where(x => x != null).Distinct().ToList();

        var serialCosts = await _context.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId != null
                && itemIds.Contains(x.SalesOrderItemId)
                && x.PurchaseOrderItem != null)
            .Select(x => new
            {
                x.SalesOrderItemId,
                UnitCost = x.PurchaseOrderItem!.UnitPrice ?? 0d
            })
            .ToListAsync(cancellationToken);
        var serialCostMap = serialCosts
            .Where(x => x.SalesOrderItemId != null)
            .GroupBy(x => x.SalesOrderItemId!)
            .ToDictionary(x => x.Key, x => x.ToList());

        var receiptCosts = await (
            from transaction in _context.Set<InventoryTransaction>().AsNoTracking()
            join purchaseItem in _context.Set<PurchaseOrderItem>().AsNoTracking()
                on transaction.ModuleItemId equals purchaseItem.Id
            where !transaction.IsDeleted
                && !purchaseItem.IsDeleted
                && transaction.Status == InventoryTransactionStatus.Confirmed
                && transaction.ModuleName == nameof(PurchaseOrder)
                && productIds.Contains(transaction.ProductId)
                && warehouseIds.Contains(transaction.WarehouseId)
                && (transaction.Stock ?? transaction.Movement ?? 0d) > 0d
            select new
            {
                transaction.ProductId,
                transaction.WarehouseId,
                Quantity = transaction.Stock ?? transaction.Movement ?? 0d,
                UnitCost = purchaseItem.UnitPrice ?? 0d
            })
            .ToListAsync(cancellationToken);
        var receiptCostMap = receiptCosts
            .GroupBy(x => (ProductId: x.ProductId ?? string.Empty, WarehouseId: x.WarehouseId ?? string.Empty))
            .ToDictionary(
                x => x.Key,
                x => x.Sum(row => row.Quantity * row.UnitCost) / x.Sum(row => row.Quantity));

        var data = salesItems.Select(item =>
        {
            double unitCost;
            string costSource;
            var isFallback = false;

            if (serialCostMap.TryGetValue(item.Id, out var itemSerialCosts) && itemSerialCosts.Count > 0)
            {
                unitCost = itemSerialCosts.Average(x => x.UnitCost);
                costSource = "PO theo serial";
            }
            else if (receiptCostMap.TryGetValue(
                (item.ProductId ?? string.Empty, item.WarehouseId ?? string.Empty),
                out var receivedUnitCost))
            {
                unitCost = receivedUnitCost;
                costSource = "PO thực nhập bình quân";
            }
            else
            {
                unitCost = item.ProductCostPrice;
                costSource = "Giá vốn hàng hóa (dự phòng)";
                isFallback = true;
            }

            var totalCost = Math.Round(unitCost * item.Quantity, 0, MidpointRounding.AwayFromZero);
            var totalSales = Math.Round(item.SalesUnitPrice * item.Quantity, 0, MidpointRounding.AwayFromZero);
            return new InventoryProfitReportItemDto
            {
                SalesOrderItemId = item.Id,
                SalesOrderNumber = item.SalesOrderNumber,
                ProductId = item.ProductId,
                ProductNumber = item.ProductNumber,
                ProductReferenceCode = item.ProductReferenceCode,
                ProductName = item.ProductName,
                WarehouseName = item.WarehouseName,
                Quantity = item.Quantity,
                UnitCost = unitCost,
                SalesUnitPrice = item.SalesUnitPrice,
                TotalCost = totalCost,
                TotalSales = totalSales,
                Profit = totalSales - totalCost,
                CostSource = costSource,
                IsFallbackCost = isFallback,
                SoldDate = item.SoldDate
            };
        }).ToList();

        return new GetInventoryProfitReportResult { Data = data };
    }
}
