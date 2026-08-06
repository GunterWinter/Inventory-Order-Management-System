using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager;

public class CashBalanceService
{
    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CashBalanceService(
        IQueryContext queryContext,
        ICommandRepository<CashAccount> cashAccountRepository,
        IUnitOfWork unitOfWork)
    {
        _queryContext = queryContext;
        _cashAccountRepository = cashAccountRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task RecalculateAsync(string? cashAccountId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(cashAccountId))
        {
            return;
        }

        var account = await _cashAccountRepository.GetAsync(cashAccountId, cancellationToken);
        if (account == null)
        {
            return;
        }

        var directBalance = await _queryContext.Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.CashAccountId == cashAccountId
                && !x.PaymentList.Any(payment => !payment.IsDeleted))
            .SumAsync(x => x.TransactionType == CashTransactionType.Debit
                ? (x.PaidAmount ?? 0d)
                : -(x.PaidAmount ?? 0d), cancellationToken);

        var paymentBalance = await _queryContext.Set<CashTransactionPayment>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.CashAccountId == cashAccountId
                && x.CashTransaction != null
                && !x.CashTransaction.IsDeleted)
            .SumAsync(x => x.CashTransaction!.TransactionType == CashTransactionType.Debit
                ? x.Amount
                : -x.Amount, cancellationToken);

        account.CurrentBalance = (account.InitialBalance ?? 0d) + directBalance + paymentBalance;
        _cashAccountRepository.Update(account);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task RecalculateManyAsync(
        IEnumerable<string?> cashAccountIds,
        CancellationToken cancellationToken = default)
    {
        foreach (var cashAccountId in cashAccountIds
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase))
        {
            await RecalculateAsync(cashAccountId, cancellationToken);
        }
    }
}
