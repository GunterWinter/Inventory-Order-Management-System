using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashAccountManager.Queries;

public record GetCashAccountListDto
{
    public string? Id { get; init; }
    public string? Name { get; init; }
    public string? Number { get; init; }
    public CashAccountType? AccountType { get; init; }
    public string? Description { get; init; }
    public double? InitialBalance { get; init; }
    public double? CashOnHand { get; init; }
    public double? TotalDebit { get; init; }
    public double? TotalCredit { get; init; }
    public double? CurrentBalance { get; init; }
    public double? BankBalance { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetCashAccountListProfile : Profile
{
    public GetCashAccountListProfile()
    {
        CreateMap<CashAccount, GetCashAccountListDto>();
    }
}

public class GetCashAccountListResult
{
    public List<GetCashAccountListDto>? Data { get; init; }
}

public class GetCashAccountListRequest : IRequest<GetCashAccountListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetCashAccountListHandler : IRequestHandler<GetCashAccountListRequest, GetCashAccountListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetCashAccountListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetCashAccountListResult> Handle(GetCashAccountListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .CashAccount
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        var transactionBalances = await _context
            .CashTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status == CashTransactionStatus.Confirmed && x.CashAccountId != null)
            .GroupBy(x => x.CashAccountId)
            .Select(g => new
            {
                CashAccountId = g.Key,
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .ToDictionaryAsync(x => x.CashAccountId ?? string.Empty, cancellationToken);

        var dtos = entities.Select(entity =>
        {
            transactionBalances.TryGetValue(entity.Id, out var balance);
            var initialBalance = entity.InitialBalance ?? 0d;
            var totalDebit = balance?.TotalDebit ?? 0d;
            var totalCredit = balance?.TotalCredit ?? 0d;
            var currentBalance = initialBalance + totalDebit - totalCredit;
            var bankBalance = currentBalance - (entity.CashOnHand ?? 0d);

            return new GetCashAccountListDto
            {
                Id = entity.Id,
                Name = entity.Name,
                Number = entity.Number,
                AccountType = entity.AccountType,
                Description = entity.Description,
                InitialBalance = entity.InitialBalance,
                CashOnHand = entity.CashOnHand,
                TotalDebit = totalDebit,
                TotalCredit = totalCredit,
                CurrentBalance = currentBalance,
                BankBalance = bankBalance,
                CreatedAtUtc = entity.CreatedAtUtc
            };
        }).ToList();

        return new GetCashAccountListResult
        {
            Data = dtos
        };
    }
}
