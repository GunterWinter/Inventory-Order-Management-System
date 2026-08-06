using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DashboardManager.Queries;


public class GetInventoryDashboardDto
{
    public List<RecentInventoryTransactionDashboardDto>? InventoryTransactionDashboard { get; init; }
    public List<BarSeries>? InventoryStockDashboard { get; init; }
}

public sealed record RecentInventoryTransactionDashboardDto
{
    public string? Id { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
    public string? Number { get; init; }
    public string? WarehouseName { get; init; }
    public string? ProductName { get; init; }
    public double Stock { get; init; }
    public string? ModuleName { get; init; }
}

public class GetInventoryDashboardResult
{
    public GetInventoryDashboardDto? Data { get; init; }
}

public class GetInventoryDashboardRequest : IRequest<GetInventoryDashboardResult>
{
}

public class GetInventoryDashboardHandler : IRequestHandler<GetInventoryDashboardRequest, GetInventoryDashboardResult>
{
    private readonly IQueryContext _context;

    public GetInventoryDashboardHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetInventoryDashboardResult> Handle(GetInventoryDashboardRequest request, CancellationToken cancellationToken)
    {

        var inventoryTransactionData = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.Product != null && x.Product.Physical == true &&
                x.Warehouse != null && x.Warehouse.SystemWarehouse == false &&
                x.Status == InventoryTransactionStatus.Confirmed
            )
            .OrderByDescending(x => x.CreatedAtUtc)
            .Take(50)
            .Select(x => new RecentInventoryTransactionDashboardDto
            {
                Id = x.Id,
                CreatedAtUtc = x.CreatedAtUtc,
                Number = x.Number,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                ProductName = x.Product != null ? x.Product.Name : null,
                Stock = x.Stock ?? 0d,
                ModuleName = x.ModuleName
            })
            .ToListAsync(cancellationToken);


        var inventoryStockData = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.Status == InventoryTransactionStatus.Confirmed &&
                x.Warehouse != null && x.Warehouse.SystemWarehouse == false &&
                x.Product != null && x.Product.Physical == true
            )
            .GroupBy(x => new { x.WarehouseId, x.ProductId })
            .Select(group => new
            {
                WarehouseId = group.Key.WarehouseId,
                ProductId = group.Key.ProductId,
                Warehouse = group.Max(x => x.Warehouse!.Name),
                Product = group.Max(x => x.Product!.Name),
                ProductReferenceCode = group.Max(x => x.Product!.ReferenceCode),
                Stock = group.Sum(x => x.Stock),
                Id = group.Max(x => x.Id),
                CreatedAtUtc = group.Max(x => x.CreatedAtUtc)
            })
            .ToListAsync(cancellationToken);

        var warehouseData = await _context.Warehouse
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SystemWarehouse == false)
            .Select(x => x.Name)
            .ToListAsync(cancellationToken);


        var result = new GetInventoryDashboardResult
        {
            Data = new GetInventoryDashboardDto
            {
                InventoryTransactionDashboard = inventoryTransactionData,
                InventoryStockDashboard =
                    warehouseData
                    .Select(wh => new BarSeries
                    {
                        Type = "Column",
                        XName = "x",
                        Width = 2,
                        YName = "y",
                        Name = wh ?? "",
                        ColumnSpacing = 0.1,
                        TooltipMappingName = "tooltipMappingName",
                        DataSource = inventoryStockData
                            .Where(x => x.Warehouse == wh)
                            .Select(x => new BarDataItem
                            {
                                X = string.IsNullOrWhiteSpace(x.ProductReferenceCode)
                                    ? x.Product ?? string.Empty
                                    : $"{x.ProductReferenceCode} - {x.Product}",
                                TooltipMappingName = string.IsNullOrWhiteSpace(x.ProductReferenceCode)
                                    ? x.Product ?? string.Empty
                                    : $"{x.ProductReferenceCode} - {x.Product}",
                                Y = (int)(x.Stock ?? 0.0)
                            }).ToList()
                    })
                    .ToList()
            }
        };

        return result;
    }
}
