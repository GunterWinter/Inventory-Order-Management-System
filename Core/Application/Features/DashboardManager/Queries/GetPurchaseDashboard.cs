using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DashboardManager.Queries;


public class GetPurchaseDashboardDto
{
    public List<RecentPurchaseOrderDashboardDto>? PurchaseOrderDashboard { get; init; }
    public List<BarSeries>? PurchaseByVendorGroupDashboard { get; init; }
    public List<BarSeries>? PurchaseByVendorCategoryDashboard { get; init; }
}

public sealed record RecentPurchaseOrderDashboardDto
{
    public string? DocumentId { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
    public DateTime? OrderDate { get; init; }
    public string? Number { get; init; }
    public string? ProductName { get; init; }
    public decimal Total { get; init; }
}

public class GetPurchaseDashboardResult
{
    public GetPurchaseDashboardDto? Data { get; init; }
}

public class GetPurchaseDashboardRequest : IRequest<GetPurchaseDashboardResult>
{
}

public class GetPurchaseDashboardHandler : IRequestHandler<GetPurchaseDashboardRequest, GetPurchaseDashboardResult>
{
    private readonly IQueryContext _context;

    public GetPurchaseDashboardHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetPurchaseDashboardResult> Handle(GetPurchaseDashboardRequest request, CancellationToken cancellationToken)
    {

        var purchaseOrderItemData = await _context.PurchaseOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrder != null
                && !x.PurchaseOrder.IsDeleted
                && x.PurchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed)
            .OrderByDescending(x => x.PurchaseOrder!.CreatedAtUtc)
            .ThenByDescending(x => x.CreatedAtUtc)
            .Take(30)
            .Select(x => new RecentPurchaseOrderDashboardDto
            {
                DocumentId = x.PurchaseOrderId,
                CreatedAtUtc = x.PurchaseOrder!.CreatedAtUtc,
                OrderDate = x.PurchaseOrder.OrderDate,
                Number = x.PurchaseOrder.Number,
                ProductName = x.Product != null ? x.Product.Name : null,
                Total = x.Total ?? 0m
            })
            .ToListAsync(cancellationToken);

        var purchaseByVendorGroupData = await _context.PurchaseOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                Status = x.PurchaseOrder!.OrderStatus,
                VendorGroupName = x.PurchaseOrder!.Vendor != null && x.PurchaseOrder.Vendor.VendorGroup != null
                    ? x.PurchaseOrder.Vendor.VendorGroup.Name
                    : null,
                Quantity = x.Quantity ?? 0m
            })
            .GroupBy(x => new { x.Status, x.VendorGroupName })
            .Select(g => new
            {
                Status = g.Key.Status,
                VendorGroupName = g.Key.VendorGroupName,
                Quantity = g.Sum(x => x.Quantity)
            })
            .ToListAsync(cancellationToken);

        var purchaseByVendorCategoryDate = await _context.PurchaseOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Product != null && x.Product.Physical == true)
            .Select(x => new
            {
                Status = x.PurchaseOrder!.OrderStatus,
                VendorCategoryName = x.PurchaseOrder!.Vendor != null && x.PurchaseOrder.Vendor.VendorCategory != null
                    ? x.PurchaseOrder.Vendor.VendorCategory.Name
                    : null,
                Quantity = x.Quantity ?? 0m
            })
            .GroupBy(x => new { x.Status, x.VendorCategoryName })
            .Select(g => new
            {
                Status = g.Key.Status,
                VendorCategoryName = g.Key.VendorCategoryName,
                Quantity = g.Sum(x => x.Quantity)
            })
            .ToListAsync(cancellationToken);


        var result = new GetPurchaseDashboardResult
        {
            Data = new GetPurchaseDashboardDto
            {
                PurchaseOrderDashboard = purchaseOrderItemData,
                PurchaseByVendorGroupDashboard =
                    Enum.GetValues(typeof(PurchaseOrderStatus))
                    .Cast<PurchaseOrderStatus>()
                    .Select(status => new BarSeries
                    {
                        Type = "Bar",
                        XName = "x",
                        Width = 2,
                        YName = "y",
                        Name = Enum.GetName(typeof(PurchaseOrderStatus), status)!,
                        ColumnSpacing = 0.1m,
                        TooltipMappingName = "tooltipMappingName",
                        DataSource = purchaseByVendorGroupData
                            .Where(x => x.Status == status)
                            .Select(x => new BarDataItem
                            {
                                X = x.VendorGroupName ?? "",
                                TooltipMappingName = x.VendorGroupName ?? "",
                                Y = Convert.ToInt32(x.Quantity)
                            }).ToList()
                    })
                    .ToList(),
                PurchaseByVendorCategoryDashboard =
                    Enum.GetValues(typeof(PurchaseOrderStatus))
                    .Cast<PurchaseOrderStatus>()
                    .Select(status => new BarSeries
                    {
                        Type = "Column",
                        XName = "x",
                        Width = 2,
                        YName = "y",
                        Name = Enum.GetName(typeof(PurchaseOrderStatus), status)!,
                        ColumnSpacing = 0.1m,
                        TooltipMappingName = "tooltipMappingName",
                        DataSource = purchaseByVendorCategoryDate
                            .Where(x => x.Status == status)
                            .Select(x => new BarDataItem
                            {
                                X = x.VendorCategoryName ?? "",
                                TooltipMappingName = x.VendorCategoryName ?? "",
                                Y = Convert.ToInt32(x.Quantity)
                            }).ToList()
                    })
                    .ToList(),
            }
        };

        return result;
    }
}
