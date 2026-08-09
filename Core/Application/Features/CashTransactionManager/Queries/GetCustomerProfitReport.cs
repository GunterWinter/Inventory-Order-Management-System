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
    public DateTime? CreatedAtUtc { get; init; }
    public CashTransactionType? TransactionType { get; init; }
    public string? CashAccountName { get; init; }
    public string? CashCategoryName { get; init; }
    public string? Description { get; init; }
    public string? SourceModuleNumber { get; init; }
    public double ActualReceived { get; init; }
    public double ProjectCost { get; init; }
    public double Profit { get; init; }
}

public sealed class GetCustomerProfitReportResult
{
    public List<CustomerProfitReportItemDto> Data { get; init; } = [];
    public double ActualReceived { get; init; }
    public double ProjectCost { get; init; }
    public double Profit { get; init; }
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

    public GetCustomerProfitReportHandler(IQueryContext queryContext)
    {
        _queryContext = queryContext;
    }

    public async Task<GetCustomerProfitReportResult> Handle(
        GetCustomerProfitReportRequest request,
        CancellationToken cancellationToken)
    {
        var query = _queryContext.Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CustomerId != null || x.CostAllocations.Any(a => a.CustomerId != null));

        if (!string.IsNullOrWhiteSpace(request.CustomerId))
        {
            query = query.Where(x => x.CustomerId == request.CustomerId);
        }

        if (request.FromDate.HasValue)
        {
            var fromDate = request.FromDate.Value.Date;
            query = query.Where(x => x.TransactionDate >= fromDate);
        }

        if (request.ToDate.HasValue)
        {
            var exclusiveToDate = request.ToDate.Value.Date.AddDays(1);
            query = query.Where(x => x.TransactionDate < exclusiveToDate);
        }

        var data = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .ThenByDescending(x => x.Id)
            .Select(x => new CustomerProfitReportItemDto
            {
                Id = x.Id,
                CustomerId = x.CustomerId,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                Number = x.Number,
                TransactionDate = x.TransactionDate,
                CreatedAtUtc = x.CreatedAtUtc,
                TransactionType = x.TransactionType,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                CashCategoryName = x.CashCategory != null ? x.CashCategory.Name : null,
                Description = x.Description,
                SourceModuleNumber = x.SourceModuleNumber,
                ActualReceived = x.TransactionType == CashTransactionType.Debit
                    ? x.PaidAmount ?? 0d
                    : 0d,
                ProjectCost = x.TransactionType == CashTransactionType.Credit
                    ? x.PaidAmount ?? 0d
                    : 0d,
                Profit = x.TransactionType == CashTransactionType.Debit
                    ? x.PaidAmount ?? 0d
                    : x.TransactionType == CashTransactionType.Credit
                        ? -(x.PaidAmount ?? 0d)
                        : 0d
            })
            .ToListAsync(cancellationToken);

        // Include customer allocations from manually classified transactions.
        var txIds = data.Select(x => x.Id).ToList();
        var allocations = await _queryContext.Set<CashTransactionCostAllocation>().AsNoTracking()
            .Where(a => !a.IsDeleted && txIds.Contains(a.CashTransactionId!) && a.CustomerId != null)
            .Include(a => a.Customer).ToListAsync(cancellationToken);
        foreach (var allocation in allocations)
        {
            var source = data.FirstOrDefault(x => x.Id == allocation.CashTransactionId);
            if (source == null) continue;
            var amount = allocation.Amount;
            var item = source with { CustomerId = allocation.CustomerId, CustomerName = allocation.Customer?.Name,
                ActualReceived = source.TransactionType == CashTransactionType.Debit ? amount : 0d,
                ProjectCost = source.TransactionType == CashTransactionType.Credit ? amount : 0d,
                Profit = source.TransactionType == CashTransactionType.Debit ? amount : source.TransactionType == CashTransactionType.Credit ? -amount : 0d };
            data.Add(item);
        }

        var actualReceived = data.Sum(x => x.ActualReceived);
        var projectCost = data.Sum(x => x.ProjectCost);

        return new GetCustomerProfitReportResult
        {
            Data = data,
            ActualReceived = actualReceived,
            ProjectCost = projectCost,
            Profit = actualReceived - projectCost
        };
    }
}
