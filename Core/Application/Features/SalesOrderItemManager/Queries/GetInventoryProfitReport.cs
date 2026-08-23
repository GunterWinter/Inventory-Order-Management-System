using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Features.InventoryTransactionManager;
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
    public decimal Quantity { get; init; }
    public decimal UnitCost { get; init; }
    public decimal SalesUnitPrice { get; init; }
    public decimal TotalCost { get; init; }
    public decimal TotalSales { get; init; }
    public decimal Profit { get; init; }
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
    private readonly InventoryCostResolver _costResolver;

    public GetInventoryProfitReportHandler(
        IQueryContext context,
        InventoryCostResolver costResolver)
    {
        _context = context;
        _costResolver = costResolver;
    }

    public async Task<GetInventoryProfitReportResult> Handle(
        GetInventoryProfitReportRequest request,
        CancellationToken cancellationToken)
    {
        var salesItems = await _context.Set<SalesOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrder != null
                && (x.SalesOrder.OrderStatus == SalesOrderStatus.Confirmed
                    || x.SalesOrder.OrderStatus == SalesOrderStatus.Archived))
            .Select(x => new
            {
                x.Id,
                x.ProductId,
                x.WarehouseId,
                ProductNumber = x.Product != null ? x.Product.Number : null,
                ProductReferenceCode = x.Product != null ? x.Product.ReferenceCode : null,
                ProductName = x.Product != null ? x.Product.Name : null,
                SerialTrackingMode = x.Product != null && x.Product.Physical == true
                    ? x.Product.SerialTrackingMode ?? SerialTrackingMode.None
                    : SerialTrackingMode.None,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                SalesOrderNumber = x.SalesOrder!.Number,
                SoldDate = x.SalesOrder.OrderDate ?? x.CreatedAtUtc,
                Quantity = x.Quantity ?? 0m,
                SalesUnitPrice = x.UnitPrice ?? 0m
            })
            .ToListAsync(cancellationToken);

        var salesItemIds = salesItems.Select(x => x.Id).ToList();
        var serialCounts = await _context.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId != null && salesItemIds.Contains(x.SalesOrderItemId))
            .GroupBy(x => x.SalesOrderItemId!)
            .Select(group => new { SalesOrderItemId = group.Key, Count = group.Count() })
            .ToDictionaryAsync(x => x.SalesOrderItemId, x => x.Count, cancellationToken);

        var data = new List<InventoryProfitReportItemDto>(salesItems.Count);
        foreach (var item in salesItems)
        {
            if (item.SerialTrackingMode != SerialTrackingMode.None)
            {
                var expectedSerialCount = item.Quantity;
                var actualSerialCount = serialCounts.GetValueOrDefault(item.Id);
                if (Math.Abs(expectedSerialCount - Math.Round(expectedSerialCount)) > 0.000001m
                    || actualSerialCount != Convert.ToInt32(Math.Round(expectedSerialCount)))
                {
                    throw new InvalidOperationException(
                        $"Dòng bán {item.SalesOrderNumber} của {item.ProductName} có số serial không khớp số lượng.");
                }
            }

            var resolution = await _costResolver.ResolveAsync(
                item.ProductId,
                item.WarehouseId,
                item.Id,
                cancellationToken);
            var totalCost = Math.Round(resolution.UnitCost * item.Quantity, 0, MidpointRounding.AwayFromZero);
            var totalSales = Math.Round(item.SalesUnitPrice * item.Quantity, 0, MidpointRounding.AwayFromZero);
            data.Add(new InventoryProfitReportItemDto
            {
                SalesOrderItemId = item.Id,
                SalesOrderNumber = item.SalesOrderNumber,
                ProductId = item.ProductId,
                ProductNumber = item.ProductNumber,
                ProductReferenceCode = item.ProductReferenceCode,
                ProductName = item.ProductName,
                WarehouseName = item.WarehouseName,
                Quantity = item.Quantity,
                UnitCost = resolution.UnitCost,
                SalesUnitPrice = item.SalesUnitPrice,
                TotalCost = totalCost,
                TotalSales = totalSales,
                Profit = totalSales - totalCost,
                CostSource = resolution.CostSource,
                IsFallbackCost = resolution.IsFallbackCost,
                SoldDate = item.SoldDate
            });
        }

        return new GetInventoryProfitReportResult { Data = data };
    }
}
