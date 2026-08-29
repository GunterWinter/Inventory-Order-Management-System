using Application.Common.Extensions;
using Application.Common.Repositories;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager;

public sealed class PaymentReversalResult
{
    public string CashTransactionId { get; init; } = string.Empty;
    public string PaymentId { get; init; } = string.Empty;
    public string? CashAccountId { get; init; }
    public decimal Amount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal RemainingAmount { get; init; }
    public string? Status { get; init; }
}

public sealed class PaymentReversalService
{
    private static readonly HashSet<string> SupportedModules =
    [
        nameof(PurchaseOrder), nameof(SalesOrder), nameof(PurchaseReturn), nameof(SalesReturn)
    ];

    private readonly ICommandRepository<CashTransactionPayment> _payments;
    private readonly ICommandRepository<CashTransaction> _transactions;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalance;

    public PaymentReversalService(
        ICommandRepository<CashTransactionPayment> payments,
        ICommandRepository<CashTransaction> transactions,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalance)
    {
        _payments = payments;
        _transactions = transactions;
        _unitOfWork = unitOfWork;
        _cashBalance = cashBalance;
    }

    public async Task<PaymentReversalResult> ReverseAsync(
        string paymentId, DateTime? reversalDate, string? description, string? userId,
        string? requiredSourceModule, CancellationToken cancellationToken)
    {
        CashTransaction? transaction = null;
        CashTransactionPayment? reversal = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var transactionId = await _payments.GetQuery().AsNoTracking()
                .Where(x => !x.IsDeleted && x.Id == paymentId)
                .Select(x => x.CashTransactionId)
                .SingleOrDefaultAsync(ct)
                ?? throw new InvalidOperationException("Không tìm thấy lần thanh toán cần hoàn.");
            await _unitOfWork.AcquireTransactionLockAsync($"CashPayment:{transactionId}", ct);

            var original = await _payments.GetQuery()
                .Include(x => x.CashTransaction)
                .SingleAsync(x => !x.IsDeleted && x.Id == paymentId, ct);
            transaction = original.CashTransaction;
            if (transaction == null || transaction.IsDeleted || original.Amount <= 0m
                || original.ReversalOfPaymentId != null
                || string.IsNullOrWhiteSpace(transaction.SourceModule)
                || !SupportedModules.Contains(transaction.SourceModule)
                || requiredSourceModule != null && transaction.SourceModule != requiredSourceModule)
                throw new InvalidOperationException("Lần thanh toán không hợp lệ để hoàn.");
            if (await _payments.GetQuery().AnyAsync(
                x => !x.IsDeleted && x.ReversalOfPaymentId == original.Id, ct))
                throw new InvalidOperationException("Lần thanh toán này đã được hoàn.");

            reversal = new CashTransactionPayment
            {
                CashTransactionId = transaction.Id,
                CashAccountId = original.CashAccountId,
                PaymentDate = reversalDate ?? AppDateTime.VietnamNow(),
                Amount = -original.Amount,
                Description = description ?? $"Hoàn thanh toán {original.Id}",
                ReversalOfPaymentId = original.Id,
                CreatedById = userId
            };
            await _payments.CreateAsync(reversal, ct);
            var paid = await _payments.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == transaction.Id)
                .SumAsync(x => x.Amount, ct) - original.Amount;
            paid = Math.Max(0m, paid);
            var amount = transaction.Amount ?? 0m;
            transaction.PaidAmount = paid;
            transaction.Status = PaymentStatus(paid, amount);
            transaction.UpdatedById = userId;
            _transactions.Update(transaction);
            await _unitOfWork.SaveAsync(ct);
            await _cashBalance.RecalculateAsync(original.CashAccountId, ct);
        }, cancellationToken);

        return new PaymentReversalResult
        {
            CashTransactionId = transaction!.Id,
            PaymentId = reversal!.Id,
            CashAccountId = reversal.CashAccountId,
            Amount = transaction.Amount ?? 0m,
            PaidAmount = transaction.PaidAmount ?? 0m,
            RemainingAmount = Math.Max(0m, (transaction.Amount ?? 0m) - (transaction.PaidAmount ?? 0m)),
            Status = transaction.Status?.ToString()
        };
    }

    private static CashTransactionStatus PaymentStatus(decimal paid, decimal amount)
        => amount <= 0m || paid >= amount - 0.000001m
            ? CashTransactionStatus.Paid
            : paid > 0m ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid;
}
