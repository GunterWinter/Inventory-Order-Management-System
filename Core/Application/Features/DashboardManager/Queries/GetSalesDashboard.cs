using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DashboardManager.Queries;


public class GetSalesDashboardDto
{
    public List<RecentSalesOrderDashboardDto>? SalesOrderDashboard { get; init; }
    public List<BarSeries>? SalesByCustomerGroupDashboard { get; init; }
    public List<BarSeries>? SalesByCustomerCategoryDashboard { get; init; }
}

public sealed record RecentSalesOrderDashboardDto
{
    public string? DocumentId { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
    public DateTime? OrderDate { get; init; }
    public string? Number { get; init; }
    public string? ProductName { get; init; }
    public decimal Total { get; init; }
}

public class GetSalesDashboardResult
{
    public GetSalesDashboardDto? Data { get; init; }
}

public class GetSalesDashboardRequest : IRequest<GetSalesDashboardResult>
{
}

public class GetSalesDashboardHandler : IRequestHandler<GetSalesDashboardRequest, GetSalesDashboardResult>
{
    private readonly IQueryContext _context;

    public GetSalesDashboardHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetSalesDashboardResult> Handle(GetSalesDashboardRequest request, CancellationToken cancellationToken)
    {

        var salesOrderItemData = await _context.SalesOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrder != null
                && !x.SalesOrder.IsDeleted
                && x.SalesOrder.OrderStatus == SalesOrderStatus.Confirmed)
            .OrderByDescending(x => x.SalesOrder!.CreatedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Take(30)
            .Select(x => new RecentSalesOrderDashboardDto
            {
                DocumentId = x.SalesOrderId,
                CreatedAtUtc = x.SalesOrder!.CreatedAtUtc,
                OrderDate = x.SalesOrder.OrderDate,
                Number = x.SalesOrder.Number,
                ProductName = x.Product != null ? x.Product.Name : null,
                Total = x.Total ?? 0m
            })
            .ToListAsync(cancellationToken);

        var salesByCustomerGroupData = await _context.SalesOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                Status = x.SalesOrder!.OrderStatus,
                CustomerGroupName = x.SalesOrder.Customer != null && x.SalesOrder.Customer.CustomerGroup != null
                    ? x.SalesOrder.Customer.CustomerGroup.Name
                    : null,
                Quantity = x.Quantity ?? 0m
            })
            .GroupBy(x => new { x.Status, x.CustomerGroupName })
            .Select(g => new
            {
                Status = g.Key.Status,
                CustomerGroupName = g.Key.CustomerGroupName,
                Quantity = g.Sum(x => x.Quantity)
            })
            .ToListAsync(cancellationToken);

        var salesByCustomerCategoryData = await _context.SalesOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                Status = x.SalesOrder!.OrderStatus,
                CustomerCategoryName = x.SalesOrder!.Customer != null && x.SalesOrder.Customer.CustomerCategory != null
                    ? x.SalesOrder.Customer.CustomerCategory.Name
                    : null,
                Quantity = x.Quantity ?? 0m
            })
            .GroupBy(x => new { x.Status, x.CustomerCategoryName })
            .Select(g => new
            {
                Status = g.Key.Status,
                CustomerCategoryName = g.Key.CustomerCategoryName,
                Quantity = g.Sum(x => x.Quantity)
            })
            .ToListAsync(cancellationToken);


        var result = new GetSalesDashboardResult
        {
            Data = new GetSalesDashboardDto
            {
                SalesOrderDashboard = salesOrderItemData,
                SalesByCustomerGroupDashboard =
                    Enum.GetValues(typeof(SalesOrderStatus))
                    .Cast<SalesOrderStatus>()
                    .Select(status => new BarSeries
                    {
                        Type = "Column",
                        XName = "x",
                        Width = 2,
                        YName = "y",
                        Name = Enum.GetName(typeof(SalesOrderStatus), status)!,
                        ColumnSpacing = 0.1m,
                        TooltipMappingName = "tooltipMappingName",
                        DataSource = salesByCustomerGroupData
                            .Where(x => x.Status == status)
                            .Select(x => new BarDataItem
                            {
                                X = x.CustomerGroupName ?? "",
                                TooltipMappingName = x.CustomerGroupName ?? "",
                                Y = Convert.ToInt32(x.Quantity)
                            }).ToList()
                    })
                    .ToList(),
                SalesByCustomerCategoryDashboard =
                    Enum.GetValues(typeof(SalesOrderStatus))
                    .Cast<SalesOrderStatus>()
                    .Select(status => new BarSeries
                    {
                        Type = "Bar",
                        XName = "x",
                        Width = 2,
                        YName = "y",
                        Name = Enum.GetName(typeof(SalesOrderStatus), status)!,
                        ColumnSpacing = 0.1m,
                        TooltipMappingName = "tooltipMappingName",
                        DataSource = salesByCustomerCategoryData
                            .Where(x => x.Status == status)
                            .Select(x => new BarDataItem
                            {
                                X = x.CustomerCategoryName ?? "",
                                TooltipMappingName = x.CustomerCategoryName ?? "",
                                Y = Convert.ToInt32(x.Quantity)
                            }).ToList()
                    })
                    .ToList()
            }
        };

        return result;
    }
}
