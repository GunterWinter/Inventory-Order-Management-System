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
                Description = x.Description
            })
            .ToListAsync(cancellationToken);

        // EF Core can fail translating GroupBy + OrderBy + First for this query shape.
        // Keep the SQL simple, then pick the latest transaction per source in memory.
        var entities = transactions
            .GroupBy(x => x.SourceModuleId)
            .Select(g => g.First())
            .Select(x => new GetPaymentStatusLookupDto
            {
                SourceModuleId = x.SourceModuleId,
                SourceModule = x.SourceModule,
                Status = x.Status,
                CashTransactionId = x.CashTransactionId,
                TransactionDate = x.TransactionDate,
                CashAccountId = x.CashAccountId,
                CashCategoryId = x.CashCategoryId,
                Amount = x.Amount,
                Description = x.Description
            })
            .ToList();

        return new GetPaymentStatusLookupResult
        {
            Data = entities
        };
    }
}
