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

    public GetInventoryProfitReportHandler(IQueryContext context) => _context = context;

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
                Physical = x.Product != null && x.Product.Physical == true,
                SerialTrackingMode = x.Product != null && x.Product.Physical == true
                    ? x.Product.SerialTrackingMode ?? SerialTrackingMode.None
                    : SerialTrackingMode.None,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                SalesOrderNumber = x.SalesOrder!.Number,
                SoldDate = x.SalesOrder.OrderDate ?? x.CreatedAtUtc,
                Quantity = x.Quantity ?? 0m,
                SalesUnitPrice = x.UnitPrice ?? 0m,
                x.CogsAmount,
                x.ProfitAmount
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

        var costSources = await (from inventory in _context.Set<InventoryTransaction>().AsNoTracking()
            join allocation in _context.Set<MaterialExportItem>().AsNoTracking()
                on inventory.Id equals allocation.InventoryTransactionId
            where !inventory.IsDeleted && !allocation.IsDeleted
                && inventory.ModuleName == nameof(SalesOrder)
                && inventory.ModuleItemId != null && salesItemIds.Contains(inventory.ModuleItemId)
            select new { inventory.ModuleItemId, allocation.CostSource })
            .ToListAsync(cancellationToken);
        var costSourceLookup = costSources
            .GroupBy(x => x.ModuleItemId!)
            .ToDictionary(
                group => group.Key,
                group => string.Join(", ", group.Select(x => x.CostSource).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct()));

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

            if (item.Physical && (!item.CogsAmount.HasValue || !item.ProfitAmount.HasValue))
                throw new InvalidOperationException($"Dòng bán {item.SalesOrderNumber} của {item.ProductName} chưa có giá vốn đã chốt. Hãy backfill trước khi xem báo cáo.");
            var totalCost = item.CogsAmount ?? 0m;
            var profit = item.ProfitAmount ?? 0m;
            var totalSales = totalCost + profit;
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
                UnitCost = item.Quantity > 0m ? totalCost / item.Quantity : 0m,
                SalesUnitPrice = item.SalesUnitPrice,
                TotalCost = totalCost,
                TotalSales = totalSales,
                Profit = profit,
                CostSource = costSourceLookup.GetValueOrDefault(item.Id, "FrozenSalesOrderItem"),
                IsFallbackCost = false,
                SoldDate = item.SoldDate
            });
        }

        return new GetInventoryProfitReportResult { Data = data };
    }
}
