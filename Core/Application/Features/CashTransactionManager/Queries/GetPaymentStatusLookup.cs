using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public record GetPaymentStatusLookupDto
{
    public string? SourceModuleId { get; init; }
    public string? SourceModule { get; init; }
    public CashTransactionStatus? Status { get; init; }
    public string? CashTransactionId { get; init; }
    public DateTime? TransactionDate { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashCategoryId { get; init; }
    public double? Amount { get; init; }
    public double? PaidAmount { get; init; }
    public string? Description { get; init; }
}

public class GetPaymentStatusLookupResult
{
    public List<GetPaymentStatusLookupDto>? Data { get; init; }
}

public class GetPaymentStatusLookupRequest : IRequest<GetPaymentStatusLookupResult>
{
    public string? SourceModule { get; init; }
}

public class GetPaymentStatusLookupHandler : IRequestHandler<GetPaymentStatusLookupRequest, GetPaymentStatusLookupResult>
{
    private readonly IQueryContext _context;

    public GetPaymentStatusLookupHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetPaymentStatusLookupResult> Handle(GetPaymentStatusLookupRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .CashTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == request.SourceModule && x.SourceModuleId != null)
            .AsQueryable();

        var transactions = await query
            .OrderByDescending(x => x.CreatedAtUtc)
            .ThenByDescending(x => x.Id)
            .Select(x => new
            {
                SourceModuleId = x.SourceModuleId,
                SourceModule = x.SourceModule,
                Status = x.Status,
                CashTransactionId = x.Id,
                TransactionDate = x.TransactionDate,
                CashAccountId = x.CashAccountId,
                CashCategoryId = x.CashCategoryId,
                Amount = x.Amount,
                PaidAmount = x.PaidAmount,
                Description = x.Description
            })
            .ToListAsync(cancellationToken);

        // Keep the SQL simple, then pick the latest transaction per source in memory for most fields,
        // but aggregate the Amount and PaidAmount to reflect the total payment status across all split transactions.
        var entities = transactions
            .GroupBy(x => x.SourceModuleId)
            .Select(g => new GetPaymentStatusLookupDto
            {
                SourceModuleId = g.Key,
                SourceModule = g.First().SourceModule,
                Status = g.All(x => x.Status == CashTransactionStatus.Paid) ? CashTransactionStatus.Paid 
                       : g.All(x => x.Status == CashTransactionStatus.Unpaid) ? CashTransactionStatus.Unpaid 
                       : CashTransactionStatus.PartiallyPaid,
                CashTransactionId = g.First().CashTransactionId,
                TransactionDate = g.First().TransactionDate,
                CashAccountId = g.First().CashAccountId,
                CashCategoryId = g.First().CashCategoryId,
                Amount = g.Sum(x => x.Amount),
                PaidAmount = g.Sum(x => x.PaidAmount),
                Description = g.First().Description
            })
            .ToList();

        return new GetPaymentStatusLookupResult
        {
            Data = entities
        };
    }
}
