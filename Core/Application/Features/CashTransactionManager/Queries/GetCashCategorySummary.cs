using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public sealed record CashCategorySummaryItemDto
{
    public string? CashCategoryId { get; init; }
    public string CashCategoryName { get; init; } = "Uncategorized";
    public decimal ReceiptAmount { get; init; }
    public decimal ExpenseAmount { get; init; }
    public decimal NetCashFlow => ReceiptAmount - ExpenseAmount;
}

public sealed class GetCashCategorySummaryResult
{
    public List<CashCategorySummaryItemDto> Data { get; init; } = [];
    public decimal TotalReceipt { get; init; }
    public decimal TotalExpense { get; init; }
    public decimal NetCashFlow => TotalReceipt - TotalExpense;
}

public sealed class GetCashCategorySummaryRequest : IRequest<GetCashCategorySummaryResult>
{
    public DateTime? FromDate { get; init; }
    public DateTime? ToDate { get; init; }
    public string? CashAccountId { get; init; }
}

public sealed class GetCashCategorySummaryValidator : AbstractValidator<GetCashCategorySummaryRequest>
{
    public GetCashCategorySummaryValidator()
    {
        RuleFor(x => x.ToDate)
            .GreaterThanOrEqualTo(x => x.FromDate)
            .When(x => x.FromDate.HasValue && x.ToDate.HasValue)
            .WithMessage("Đến ngày phải lớn hơn hoặc bằng từ ngày.");
    }
}

public sealed class GetCashCategorySummaryHandler
    : IRequestHandler<GetCashCategorySummaryRequest, GetCashCategorySummaryResult>
{
    private sealed class CashActivity
    {
        public string? CashCategoryId { get; init; }
        public string CashCategoryName { get; init; } = "Uncategorized";
        public CashTransactionType? TransactionType { get; init; }
        public decimal Amount { get; init; }
    }

    private readonly IQueryContext _queryContext;

    public GetCashCategorySummaryHandler(IQueryContext queryContext) => _queryContext = queryContext;

    public async Task<GetCashCategorySummaryResult> Handle(
        GetCashCategorySummaryRequest request,
        CancellationToken cancellationToken)
    {
        var paymentQuery = _queryContext.Set<CashTransactionPayment>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CashTransaction != null
                && !x.CashTransaction.IsDeleted
                && x.CashTransaction.SourceModule != "CashTransfer");

        if (request.FromDate.HasValue)
            paymentQuery = paymentQuery.Where(x => x.PaymentDate >= request.FromDate.Value.Date);
        if (request.ToDate.HasValue)
            paymentQuery = paymentQuery.Where(x => x.PaymentDate < request.ToDate.Value.Date.AddDays(1));
        if (!string.IsNullOrWhiteSpace(request.CashAccountId))
            paymentQuery = paymentQuery.Where(x => x.CashAccountId == request.CashAccountId);

        var paymentActivities = await paymentQuery
            .Select(x => new CashActivity
            {
                CashCategoryId = x.CashTransaction!.CashCategoryId,
                CashCategoryName = x.CashTransaction.CashCategory != null
                    ? x.CashTransaction.CashCategory.Name ?? "Uncategorized"
                    : "Uncategorized",
                TransactionType = x.CashTransaction.TransactionType,
                Amount = x.Amount
            })
            .ToListAsync(cancellationToken);

        // Older and transfer-like records may store PaidAmount directly without payment
        // rows. Use that amount only when no active payment history exists to avoid
        // counting the same cash movement twice.
        var legacyQuery = _queryContext.Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule != "CashTransfer"
                && (x.PaidAmount ?? 0m) != 0m
                && !x.PaymentList.Any(payment => !payment.IsDeleted));

        if (request.FromDate.HasValue)
            legacyQuery = legacyQuery.Where(x => x.TransactionDate >= request.FromDate.Value.Date);
        if (request.ToDate.HasValue)
            legacyQuery = legacyQuery.Where(x => x.TransactionDate < request.ToDate.Value.Date.AddDays(1));
        if (!string.IsNullOrWhiteSpace(request.CashAccountId))
            legacyQuery = legacyQuery.Where(x => x.CashAccountId == request.CashAccountId);

        var legacyActivities = await legacyQuery
            .Select(x => new CashActivity
            {
                CashCategoryId = x.CashCategoryId,
                CashCategoryName = x.CashCategory != null ? x.CashCategory.Name ?? "Uncategorized" : "Uncategorized",
                TransactionType = x.TransactionType,
                Amount = x.PaidAmount ?? 0m
            })
            .ToListAsync(cancellationToken);

        var rows = paymentActivities
            .Concat(legacyActivities)
            .Where(x => x.TransactionType is CashTransactionType.Debit or CashTransactionType.Credit)
            .GroupBy(x => new { x.CashCategoryId, x.CashCategoryName })
            .Select(group => new CashCategorySummaryItemDto
            {
                CashCategoryId = group.Key.CashCategoryId,
                CashCategoryName = group.Key.CashCategoryName,
                ReceiptAmount = group.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount),
                ExpenseAmount = group.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount)
            })
            .OrderBy(x => x.CashCategoryId == null ? 1 : 0)
            .ThenBy(x => x.CashCategoryName)
            .ToList();

        var totalReceipt = rows.Sum(x => x.ReceiptAmount);
        var totalExpense = rows.Sum(x => x.ExpenseAmount);
        return new GetCashCategorySummaryResult
        {
            Data = rows,
            TotalReceipt = totalReceipt,
            TotalExpense = totalExpense
        };
    }
}
