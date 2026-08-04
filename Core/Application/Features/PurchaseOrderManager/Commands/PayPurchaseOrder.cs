using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Commands;

public class PayPurchaseOrderResult
{
    public bool Success { get; set; }
}

public class PayPurchaseOrderRequest : IRequest<PayPurchaseOrderResult>
{
    public string? PurchaseOrderId { get; init; }
    public double? PaymentAmount { get; init; }
    public string? CashAccountId { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class PayPurchaseOrderValidator : AbstractValidator<PayPurchaseOrderRequest>
{
    public PayPurchaseOrderValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.PaymentAmount).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.CashAccountId).NotEmpty();
    }
}

public class PayPurchaseOrderHandler : IRequestHandler<PayPurchaseOrderRequest, PayPurchaseOrderResult>
{
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public PayPurchaseOrderHandler(
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork)
    {
        _cashTransactionRepository = cashTransactionRepository;
        _cashAccountRepository = cashAccountRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<PayPurchaseOrderResult> Handle(PayPurchaseOrderRequest request, CancellationToken cancellationToken)
    {
        var transactions = await _queryContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);

        if (!transactions.Any())
        {
            return new PayPurchaseOrderResult { Success = true };
        }

        // Sort: Customer first (CustomerId != null), then Kho (CustomerId == null)
        var sortedTransactions = transactions
            .OrderBy(x => x.CustomerId == null ? 1 : 0)
            .ThenBy(x => x.CreatedAtUtc)
            .ToList();

        double remainingPayment = request.PaymentAmount ?? 0;
        var previousAccountIds = new HashSet<string>();

        foreach (var tx in sortedTransactions)
        {
            if (tx.CashAccountId != null && tx.CashAccountId != request.CashAccountId)
            {
                previousAccountIds.Add(tx.CashAccountId);
            }

            double txAmount = tx.Amount ?? 0;
            double payForTx = Math.Min(remainingPayment, txAmount);

            tx.PaidAmount = payForTx;
            tx.Status = (payForTx == txAmount && txAmount > 0) ? CashTransactionStatus.Paid : (payForTx > 0 ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid);
            
            if (payForTx > 0 && !string.IsNullOrWhiteSpace(request.CashAccountId))
            {
                tx.CashAccountId = request.CashAccountId;
            }
            
            if (!string.IsNullOrWhiteSpace(request.Description))
            {
                tx.Description = request.Description;
            }

            tx.UpdatedById = request.UpdatedById;
            _cashTransactionRepository.Update(tx);

            remainingPayment -= payForTx;
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        var accountsToRecalculate = previousAccountIds.ToList();
        if (!string.IsNullOrWhiteSpace(request.CashAccountId) && !accountsToRecalculate.Contains(request.CashAccountId))
        {
            accountsToRecalculate.Add(request.CashAccountId);
        }

        foreach (var accId in accountsToRecalculate)
        {
            await RecalculateAccountBalance(accId, cancellationToken);
        }

        return new PayPurchaseOrderResult { Success = true };
    }

    private async Task RecalculateAccountBalance(string cashAccountId, CancellationToken cancellationToken)
    {
        var account = await _queryContext.Set<CashAccount>().FirstOrDefaultAsync(x => x.Id == cashAccountId, cancellationToken);
        if (account == null) return;

        var balances = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId)
            .GroupBy(x => 1)
            .Select(g => new
            {
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var initialBalance = account.InitialBalance ?? 0d;
        var totalDebit = balances?.TotalDebit ?? 0d;
        var totalCredit = balances?.TotalCredit ?? 0d;

        account.CurrentBalance = initialBalance + totalCredit - totalDebit;
        
        _cashAccountRepository.Update(account);
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
