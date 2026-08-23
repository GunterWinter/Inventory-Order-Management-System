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

        var sales = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => (x.OrderStatus == SalesOrderStatus.Confirmed || x.OrderStatus == SalesOrderStatus.Archived)
                && x.CustomerId != null)
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

        var salesReturnLines = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesReturn)
                && x.ModuleId != null
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
        var salesReturnIds = salesReturnLines.Select(x => x.ReturnId).Distinct().ToList();
        var salesReturnSources = await _queryContext.Set<SalesReturn>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.SalesOrder).ThenInclude(x => x!.Customer)
            .Include(x => x.SalesOrder).ThenInclude(x => x!.SalesOrderItemList)
            .Where(x => salesReturnIds.Contains(x.Id)
                && (x.Status == SalesReturnStatus.Confirmed || x.Status == SalesReturnStatus.Archived))
            .ToDictionaryAsync(x => x.Id, cancellationToken);
        foreach (var line in salesReturnLines)
        {
            if (!salesReturnSources.TryGetValue(line.ReturnId, out var salesReturn)
                || salesReturn.SalesOrder?.CustomerId == null)
                continue;
            var unitPrice = salesReturn.SalesOrder.SalesOrderItemList
                .FirstOrDefault(x => !x.IsDeleted && x.ProductId == line.ProductId)?.UnitPrice ?? 0m;
            rows.Add(new CustomerProfitReportItemDto
            {
                Id = line.Id,
                CustomerId = salesReturn.SalesOrder.CustomerId,
                CustomerName = salesReturn.SalesOrder.Customer?.Name,
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
                    || x.PurchaseOrder.OrderStatus == PurchaseOrderStatus.Archived))
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

        // Material exports are accounting cost records. Their full amount is recognized
        // on confirmation, independently from PaidAmount.
        var materialCosts = await _queryContext.Set<CashTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.TransactionType == CashTransactionType.Credit
                && x.SourceModule == nameof(MaterialExport)
                && x.CustomerId != null)
            .Select(x => new CustomerProfitReportItemDto
            {
                Id = x.Id,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                Number = x.SourceModuleNumber ?? x.Number,
                TransactionDate = x.TransactionDate,
                Description = x.Description,
                SourceType = nameof(MaterialExport),
                SourceModuleId = x.SourceModuleId,
                ProjectCost = x.Amount ?? 0m
            })
            .ToListAsync(cancellationToken);
        rows.AddRange(materialCosts);

        // A manual cost transaction with allocation rows is represented only by those
        // rows, never by both the parent and children.
        var manualAllocations = await _queryContext.Set<CashTransactionCostAllocation>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CustomerId != null
                && x.CashTransaction != null
                && !x.CashTransaction.IsDeleted
                && x.CashTransaction.TransactionType == CashTransactionType.Credit
                && x.CashTransaction.SourceModule != nameof(MaterialExport)
                && x.CashTransaction.SourceModule != nameof(PurchaseOrder))
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

        if (!string.IsNullOrWhiteSpace(request.CustomerId))
            rows = rows.Where(x => x.CustomerId == request.CustomerId).ToList();
        if (request.FromDate.HasValue)
            rows = rows.Where(x => x.TransactionDate >= request.FromDate.Value.Date).ToList();
        if (request.ToDate.HasValue)
            rows = rows.Where(x => x.TransactionDate < request.ToDate.Value.Date.AddDays(1)).ToList();

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
