using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public record GetCashTransactionListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public DateTime? TransactionDate { get; init; }
    public CashTransactionType? TransactionType { get; init; }
    public CashTransactionStatus? Status { get; init; }
    public double? Amount { get; init; }
    public string? Description { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashAccountName { get; init; }
    public string? CashCategoryId { get; init; }
    public string? CashCategoryName { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceModuleId { get; init; }
    public string? SourceModuleNumber { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetCashTransactionListResult
{
    public List<GetCashTransactionListDto>? Data { get; init; }
}

public class GetCashTransactionListRequest : IRequest<GetCashTransactionListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetCashTransactionListHandler : IRequestHandler<GetCashTransactionListRequest, GetCashTransactionListResult>
{
    private readonly IQueryContext _context;

    public GetCashTransactionListHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetCashTransactionListResult> Handle(GetCashTransactionListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .CashTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.CashAccount)
            .Include(x => x.CashCategory)
            .AsQueryable();

        var entities = await query
            .Select(x => new GetCashTransactionListDto
            {
                Id = x.Id,
                Number = x.Number,
                TransactionDate = x.TransactionDate,
                TransactionType = x.TransactionType,
                Status = x.Status,
                Amount = x.Amount,
                Description = x.Description,
                CashAccountId = x.CashAccountId,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                CashCategoryId = x.CashCategoryId,
                CashCategoryName = x.CashCategory != null ? x.CashCategory.Name : null,
                SourceModule = x.SourceModule,
                SourceModuleId = x.SourceModuleId,
                SourceModuleNumber = x.SourceModuleNumber,
                CreatedAtUtc = x.CreatedAtUtc
            })
            .ToListAsync(cancellationToken);

        return new GetCashTransactionListResult
        {
            Data = entities
        };
    }
}
