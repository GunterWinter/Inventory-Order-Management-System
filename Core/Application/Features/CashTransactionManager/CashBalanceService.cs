using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager;

public class CashBalanceService
{
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly IUnitOfWork _unitOfWork;

    public CashBalanceService(
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        IUnitOfWork unitOfWork)
    {
        _cashTransactionRepository = cashTransactionRepository;
        _paymentRepository = paymentRepository;
        _cashAccountRepository = cashAccountRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task RecalculateAsync(string? cashAccountId, CancellationToken cancellationToken = default)
    {
        await RecalculateManyAsync(new[] { cashAccountId }, cancellationToken);
    }

    public async Task RecalculateManyAsync(
        IEnumerable<string?> cashAccountIds,
        CancellationToken cancellationToken = default)
    {
        var accountIds = cashAccountIds
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        if (accountIds.Count == 0) return;

        var accounts = await _cashAccountRepository.GetQuery()
            .Where(x => accountIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
        var directBalances = await _cashTransactionRepository.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.CashAccountId != null
                && accountIds.Contains(x.CashAccountId)
                && !x.PaymentList.Any(payment => !payment.IsDeleted))
            .GroupBy(x => x.CashAccountId!)
            .Select(group => new
            {
                CashAccountId = group.Key,
                Balance = group.Sum(x => x.TransactionType == CashTransactionType.Debit
                    ? (x.PaidAmount ?? 0m)
                    : -(x.PaidAmount ?? 0m))
            })
            .ToDictionaryAsync(x => x.CashAccountId, x => x.Balance, cancellationToken);
        var paymentBalances = await _paymentRepository.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.CashAccountId != null
                && accountIds.Contains(x.CashAccountId)
                && x.CashTransaction != null
                && !x.CashTransaction.IsDeleted)
            .GroupBy(x => x.CashAccountId!)
            .Select(group => new
            {
                CashAccountId = group.Key,
                Balance = group.Sum(x => x.CashTransaction!.TransactionType == CashTransactionType.Debit
                    ? x.Amount
                    : -x.Amount)
            })
            .ToDictionaryAsync(x => x.CashAccountId, x => x.Balance, cancellationToken);

        foreach (var account in accounts)
        {
            directBalances.TryGetValue(account.Id, out var directBalance);
            paymentBalances.TryGetValue(account.Id, out var paymentBalance);
            account.CurrentBalance = (account.InitialBalance ?? 0m) + directBalance + paymentBalance;
            _cashAccountRepository.Update(account);
        }
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
