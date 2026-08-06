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
    public bool IsSplit { get; init; }
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

        // A source document owns one obligation/payment transaction. Picking the latest row here keeps
        // legacy duplicate data from inflating the order total while the compatibility repair is applied.
        var entities = transactions
            .GroupBy(x => x.SourceModuleId)
            .Select(g =>
            {
                var latest = g.First();
                return new GetPaymentStatusLookupDto
                {
                    SourceModuleId = g.Key,
                    SourceModule = latest.SourceModule,
                    Status = latest.Status,
                    CashTransactionId = latest.CashTransactionId,
                    TransactionDate = latest.TransactionDate,
                    CashAccountId = latest.CashAccountId,
                    CashCategoryId = latest.CashCategoryId,
                    Amount = latest.Amount,
                    PaidAmount = latest.PaidAmount,
                    Description = latest.Description,
                    IsSplit = false
                };
            })
            .ToList();

        return new GetPaymentStatusLookupResult
        {
            Data = entities
        };
    }
}
