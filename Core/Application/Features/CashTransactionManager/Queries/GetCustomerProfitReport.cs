using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public sealed record CustomerProfitReportItemDto
{
    public string? Id { get; init; }
    public string? CustomerId { get; init; }
    public string? CustomerName { get; init; }
    public string? Number { get; init; }
    public DateTime? TransactionDate { get; init; }
    public string? Description { get; init; }
    public string? SourceType { get; init; }
    public string? SourceModuleId { get; init; }
    public decimal Revenue { get; init; }
    public decimal ProjectCost { get; init; }
    public decimal Profit => Revenue - ProjectCost;
}

public sealed class GetCustomerProfitReportResult
{
    public List<CustomerProfitReportItemDto> Data { get; init; } = [];
    public decimal Revenue { get; init; }
    public decimal ProjectCost { get; init; }
    public decimal Profit { get; init; }
}

public sealed class GetCustomerProfitReportRequest : IRequest<GetCustomerProfitReportResult>
{
    public string? CustomerId { get; init; }
    public DateTime? FromDate { get; init; }
    public DateTime? ToDate { get; init; }
}

public sealed class GetCustomerProfitReportHandler
    : IRequestHandler<GetCustomerProfitReportRequest, GetCustomerProfitReportResult>
{
    private readonly IQueryContext _queryContext;

    public GetCustomerProfitReportHandler(IQueryContext queryContext) => _queryContext = queryContext;

    public async Task<GetCustomerProfitReportResult> Handle(
        GetCustomerProfitReportRequest request,
        CancellationToken cancellationToken)
    {
        var rows = new List<CustomerProfitReportItemDto>();
        var customerId = string.IsNullOrWhiteSpace(request.CustomerId) ? null : request.CustomerId;
        var fromDate = request.FromDate?.Date;
        var toDateExclusive = request.ToDate?.Date.AddDays(1);

        var sales = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => (x.OrderStatus == SalesOrderStatus.Confirmed || x.OrderStatus == SalesOrderStatus.Archived)
                && x.CustomerId != null
                && (customerId == null || x.CustomerId == customerId)
                && (!fromDate.HasValue || x.OrderDate >= fromDate.Value)
                && (!toDateExclusive.HasValue || x.OrderDate < toDateExclusive.Value))
            .Select(x => new CustomerProfitReportItemDto
            {
                Id = x.Id,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                Number = x.Number,
                TransactionDate = x.OrderDate,
                Description = x.Description,
                SourceType = nameof(SalesOrder),
                SourceModuleId = x.Id,
                Revenue = x.BeforeTaxAmount ?? 0m
            })
            .ToListAsync(cancellationToken);
        rows.AddRange(sales);

        var salesReturnSources = await _queryContext.Set<SalesReturn>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrder != null
                && x.SalesOrder.CustomerId != null
                && (x.Status == SalesReturnStatus.Confirmed || x.Status == SalesReturnStatus.Archived)
                && (customerId == null || x.SalesOrder.CustomerId == customerId)
                && (!fromDate.HasValue || (x.ReturnDate ?? x.CreatedAtUtc) >= fromDate.Value)
                && (!toDateExclusive.HasValue || (x.ReturnDate ?? x.CreatedAtUtc) < toDateExclusive.Value))
            .Select(x => new
            {
                x.Id,
                x.Number,
                x.ReturnDate,
                x.Description,
                CustomerId = x.SalesOrder!.CustomerId!,
                CustomerName = x.SalesOrder.Customer != null ? x.SalesOrder.Customer.Name : null,
                Items = x.SalesOrder.SalesOrderItemList
                    .Where(item => !item.IsDeleted && item.ProductId != null)
                    .Select(item => new { item.ProductId, UnitPrice = item.UnitPrice ?? 0m })
                    .ToList()
            })
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        var salesReturnIds = salesReturnSources.Keys.ToList();
        var salesReturnLines = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesReturn)
                && x.ModuleId != null
                && salesReturnIds.Contains(x.ModuleId)
                && x.ProductId != null
                && (x.Status == InventoryTransactionStatus.Confirmed
                    || x.Status == InventoryTransactionStatus.Archived))
            .Select(x => new
            {
                x.Id,
                ReturnId = x.ModuleId!,
                ProductId = x.ProductId!,
                x.ModuleNumber,
                x.MovementDate,
                Quantity = x.Movement ?? 0m
            })
            .ToListAsync(cancellationToken);
        foreach (var line in salesReturnLines)
        {
            if (!salesReturnSources.TryGetValue(line.ReturnId, out var salesReturn))
                continue;
            var unitPrice = salesReturn.Items.FirstOrDefault(x => x.ProductId == line.ProductId)?.UnitPrice ?? 0m;
            rows.Add(new CustomerProfitReportItemDto
            {
                Id = line.Id,
                CustomerId = salesReturn.CustomerId,
                CustomerName = salesReturn.CustomerName,
                Number = salesReturn.Number ?? line.ModuleNumber,
                TransactionDate = salesReturn.ReturnDate ?? line.MovementDate,
                Description = salesReturn.Description,
                SourceType = nameof(SalesReturn),
                SourceModuleId = salesReturn.Id,
                Revenue = -Math.Abs(line.Quantity * unitPrice)
            });
        }

        var purchaseAllocations = await _queryContext.Set<PurchaseOrderCostAllocation>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CustomerId != null
                && x.PurchaseOrder != null
                && (x.PurchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed
                    || x.PurchaseOrder.OrderStatus == PurchaseOrderStatus.Archived)
                && (customerId == null || x.CustomerId == customerId)
                && (!fromDate.HasValue || x.PurchaseOrder.OrderDate >= fromDate.Value)
                && (!toDateExclusive.HasValue || x.PurchaseOrder.OrderDate < toDateExclusive.Value))
            .Select(x => new CustomerProfitReportItemDto
            {
                Id = x.Id,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                Number = x.PurchaseOrder != null ? x.PurchaseOrder.Number : null,
                TransactionDate = x.PurchaseOrder != null ? x.PurchaseOrder.OrderDate : null,
                Description = x.PurchaseOrderItem != null ? x.PurchaseOrderItem.Summary : null,
                SourceType = "PurchaseOrderAllocation",
                SourceModuleId = x.PurchaseOrderId,
                ProjectCost = (x.Quantity ?? 0m) * (x.PurchaseOrderItem != null
                    ? x.PurchaseOrderItem.UnitPrice ?? 0m
                    : x.UnitPrice ?? 0m)
            })
            .ToListAsync(cancellationToken);
        rows.AddRange(purchaseAllocations);

        var materialCostLines = await _queryContext.Set<MaterialExportItem>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.MaterialExport != null
                && x.MaterialExport.CustomerId != null
                && (x.MaterialExport.Status == MaterialExportStatus.Confirmed
                    || x.MaterialExport.Status == MaterialExportStatus.Archived)
                && (customerId == null || x.MaterialExport.CustomerId == customerId)
                && (!fromDate.HasValue || x.MaterialExport.ExportDate >= fromDate.Value)
                && (!toDateExclusive.HasValue || x.MaterialExport.ExportDate < toDateExclusive.Value))
            .Select(x => new
            {
                Id = x.Id,
                MaterialExportId = x.MaterialExportId!,
                CustomerId = x.MaterialExport!.CustomerId,
                CustomerName = x.MaterialExport.Customer != null ? x.MaterialExport.Customer.Name : null,
                x.MaterialExport.Number,
                TransactionDate = x.MaterialExport.ExportDate,
                x.MaterialExport.Description,
                ProjectCost = x.Total ?? 0m
            })
            .ToListAsync(cancellationToken);
        var materialCosts = materialCostLines
            .GroupBy(x => x.MaterialExportId)
            .Select(group =>
            {
                var first = group.First();
                return new CustomerProfitReportItemDto
                {
                    Id = first.MaterialExportId,
                    CustomerId = first.CustomerId,
                    CustomerName = first.CustomerName,
                    Number = first.Number,
                    TransactionDate = first.TransactionDate,
                    Description = first.Description,
                    SourceType = nameof(MaterialExport),
                    SourceModuleId = first.MaterialExportId,
                    ProjectCost = group.Sum(x => x.ProjectCost)
                };
            });
        rows.AddRange(materialCosts);

        // A manual cost transaction with allocation rows is represented only by those
        // rows, never by both the parent and children.
        var manualAllocations = await _queryContext.Set<CashTransactionCostAllocation>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CustomerId != null
                && x.CashTransaction != null
                && !x.CashTransaction.IsDeleted
                && x.CashTransaction.TransactionType == CashTransactionType.Credit
                && x.CashTransaction.SourceModule != nameof(PurchaseOrder)
                && (customerId == null || x.CustomerId == customerId)
                && (!fromDate.HasValue || x.CashTransaction.TransactionDate >= fromDate.Value)
                && (!toDateExclusive.HasValue || x.CashTransaction.TransactionDate < toDateExclusive.Value))
            .Select(x => new CustomerProfitReportItemDto
            {
                Id = x.Id,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                Number = x.CashTransaction != null ? x.CashTransaction.Number : null,
                TransactionDate = x.CashTransaction != null ? x.CashTransaction.TransactionDate : null,
                Description = x.Description ?? (x.CashTransaction != null ? x.CashTransaction.Description : null),
                SourceType = "CashCostAllocation",
                SourceModuleId = x.CashTransactionId,
                ProjectCost = x.Amount
            })
            .ToListAsync(cancellationToken);
        rows.AddRange(manualAllocations);

        rows = rows.OrderByDescending(x => x.TransactionDate).ThenByDescending(x => x.Id).ToList();
        var revenue = rows.Sum(x => x.Revenue);
        var projectCost = rows.Sum(x => x.ProjectCost);
        return new GetCustomerProfitReportResult
        {
            Data = rows,
            Revenue = revenue,
            ProjectCost = projectCost,
            Profit = revenue - projectCost
        };
    }
}
