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
        // Find the SINGLE CashTransaction for this PO
        var transaction = await _queryContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted
                      && x.SourceModule == nameof(PurchaseOrder)
                      && x.SourceModuleId == request.PurchaseOrderId
                      && x.TransactionType == CashTransactionType.Credit)
            .FirstOrDefaultAsync(cancellationToken);

        if (transaction == null)
        {
            return new PayPurchaseOrderResult { Success = true };
        }

        var previousAccountId = transaction.CashAccountId;

        // Update payment
        double paymentAmount = request.PaymentAmount ?? 0;
        double txAmount = transaction.Amount ?? 0;
        double currentPaid = transaction.PaidAmount ?? 0;
        double newPaid = currentPaid + paymentAmount;

        transaction.PaidAmount = newPaid;
        transaction.Status = ComputePaymentStatus(newPaid, txAmount);

        if (paymentAmount > 0 && !string.IsNullOrWhiteSpace(request.CashAccountId))
        {
            transaction.CashAccountId = request.CashAccountId;
        }

        if (!string.IsNullOrWhiteSpace(request.Description))
        {
            transaction.Description = request.Description;
        }

        transaction.UpdatedById = request.UpdatedById;
        _cashTransactionRepository.Update(transaction);

        await _unitOfWork.SaveAsync(cancellationToken);

        // Recalculate balance for the payment account
        var accountsToRecalculate = new HashSet<string>();
        if (!string.IsNullOrWhiteSpace(request.CashAccountId))
        {
            accountsToRecalculate.Add(request.CashAccountId);
        }
        if (!string.IsNullOrEmpty(previousAccountId) && previousAccountId != request.CashAccountId)
        {
            accountsToRecalculate.Add(previousAccountId);
        }

        foreach (var accId in accountsToRecalculate)
        {
            await RecalculateAccountBalance(accId, cancellationToken);
        }

        return new PayPurchaseOrderResult { Success = true };
    }

    private static CashTransactionStatus ComputePaymentStatus(double paidAmount, double amount)
    {
        if (amount <= 0) return CashTransactionStatus.Paid;
        if (paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
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
