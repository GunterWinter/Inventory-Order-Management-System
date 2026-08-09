using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Commands;

public class PayPurchaseOrderResult
{
    public bool Success { get; set; }
    public string? CashTransactionId { get; set; }
    public string? PaymentId { get; set; }
    public string? CashAccountId { get; set; }
    public string? CashAccountName { get; set; }
    public double Amount { get; set; }
    public double PaidAmount { get; set; }
    public double RemainingAmount { get; set; }
    public string? Status { get; set; }
}

public class PayPurchaseOrderRequest : IRequest<PayPurchaseOrderResult>
{
    public string? PurchaseOrderId { get; init; }
    public double? PaymentAmount { get; init; }
    public string? CashAccountId { get; init; }
    public DateTime? PaymentDate { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class PayPurchaseOrderValidator : AbstractValidator<PayPurchaseOrderRequest>
{
    public PayPurchaseOrderValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.PaymentAmount).NotNull().GreaterThan(0);
        RuleFor(x => x.CashAccountId).NotEmpty();
    }
}

public class PayPurchaseOrderHandler : IRequestHandler<PayPurchaseOrderRequest, PayPurchaseOrderResult>
{
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public PayPurchaseOrderHandler(
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService)
    {
        _cashTransactionRepository = cashTransactionRepository;
        _purchaseOrderRepository = purchaseOrderRepository;
        _paymentRepository = paymentRepository;
        _cashAccountRepository = cashAccountRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<PayPurchaseOrderResult> Handle(
        PayPurchaseOrderRequest request,
        CancellationToken cancellationToken)
    {
        var paymentAmount = request.PaymentAmount ?? 0d;
        var paymentDate = request.PaymentDate ?? DateTime.UtcNow;
        CashTransaction? transaction = null;
        CashTransactionPayment? payment = null;
        CashAccount? selectedAccount = null;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            transaction = await _cashTransactionRepository.GetQuery()
                .Where(x => !x.IsDeleted
                    && x.SourceModule == nameof(PurchaseOrder)
                    && x.SourceModuleId == request.PurchaseOrderId
                    && x.TransactionType == CashTransactionType.Credit)
                .SingleOrDefaultAsync(ct);

            if (transaction == null)
            {
                var purchaseOrder = await _purchaseOrderRepository.GetQuery()
                    .Include(x => x.Vendor)
                    .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
                    .SingleOrDefaultAsync(x => !x.IsDeleted && x.Id == request.PurchaseOrderId, ct);
                if (purchaseOrder == null)
                {
                    throw new InvalidOperationException("Purchase order was not found.");
                }
                if (purchaseOrder.OrderStatus is not (PurchaseOrderStatus.Confirmed or PurchaseOrderStatus.Archived))
                {
                    throw new InvalidOperationException("Only a confirmed purchase order can be paid.");
                }

                var orderAmount = purchaseOrder.AfterTaxAmount
                    ?? purchaseOrder.PurchaseOrderItemList.Sum(item => item.AfterTaxAmount ?? 0d);
                transaction = new CashTransaction
                {
                    Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
                    TransactionDate = purchaseOrder.OrderDate ?? DateTime.Today,
                    TransactionType = CashTransactionType.Credit,
                    Status = CashTransactionStatus.Unpaid,
                    Amount = orderAmount,
                    PaidAmount = 0d,
                    Description = $"{purchaseOrder.Vendor?.Name} - {purchaseOrder.Number}".Trim(' ', '-'),
                    VendorId = purchaseOrder.VendorId,
                    SourceModule = nameof(PurchaseOrder),
                    SourceModuleId = purchaseOrder.Id,
                    SourceModuleNumber = purchaseOrder.Number,
                    CreatedById = request.UpdatedById
                };
                await _cashTransactionRepository.CreateAsync(transaction, ct);
                await _unitOfWork.SaveAsync(ct);
            }

            var cashAccount = await _cashAccountRepository.GetAsync(request.CashAccountId!, ct);
            if (cashAccount == null)
            {
                throw new InvalidOperationException("Cash account was not found.");
            }
            selectedAccount = cashAccount;

            if (!string.IsNullOrWhiteSpace(transaction.CashAccountId)
                && !string.Equals(transaction.CashAccountId, request.CashAccountId, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("All payments for a cash transaction must use the same cash account.");
            }

            var recordedPaidAmount = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == transaction.Id)
                .SumAsync(x => x.Amount, ct);

            var amount = transaction.Amount ?? 0d;
            var remainingAmount = amount - recordedPaidAmount;
            if (paymentAmount > remainingAmount + 0.000001d)
            {
                throw new InvalidOperationException($"Payment amount cannot exceed the remaining amount ({remainingAmount:N2}).");
            }

            payment = new CashTransactionPayment
            {
                CashTransactionId = transaction.Id,
                CashAccountId = request.CashAccountId!,
                PaymentDate = paymentDate,
                Amount = paymentAmount,
                Description = request.Description,
                CreatedById = request.UpdatedById
            };

            await _paymentRepository.CreateAsync(payment, ct);

            var newPaidAmount = recordedPaidAmount + paymentAmount;
            transaction.PaidAmount = newPaidAmount;
            transaction.Status = ComputePaymentStatus(newPaidAmount, amount);
            transaction.CashAccountId = request.CashAccountId;
            transaction.UpdatedById = request.UpdatedById;
            _cashTransactionRepository.Update(transaction);

            await _unitOfWork.SaveAsync(ct);
            await RecalculateAccountBalanceAsync(cashAccount, ct);
        }, cancellationToken);

        var finalAmount = transaction!.Amount ?? 0d;
        var finalPaidAmount = transaction.PaidAmount ?? 0d;
        return new PayPurchaseOrderResult
        {
            Success = true,
            CashTransactionId = transaction.Id,
            PaymentId = payment!.Id,
            CashAccountId = transaction.CashAccountId,
            CashAccountName = selectedAccount?.Name,
            Amount = finalAmount,
            PaidAmount = finalPaidAmount,
            RemainingAmount = Math.Max(0d, finalAmount - finalPaidAmount),
            Status = transaction.Status?.ToString()
        };
    }

    private static CashTransactionStatus ComputePaymentStatus(double paidAmount, double amount)
    {
        if (amount <= 0 || paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
    }

    private async Task RecalculateAccountBalanceAsync(
        CashAccount account,
        CancellationToken cancellationToken)
    {
        var directBalance = await _cashTransactionRepository.GetQuery()
            .Where(x => !x.IsDeleted
                && x.CashAccountId == account.Id
                && !x.PaymentList.Any(payment => !payment.IsDeleted))
            .SumAsync(x => x.TransactionType == CashTransactionType.Debit
                ? (x.PaidAmount ?? 0d)
                : -(x.PaidAmount ?? 0d), cancellationToken);

        var paymentBalance = await _paymentRepository.GetQuery()
            .Where(x => !x.IsDeleted
                && x.CashAccountId == account.Id
                && x.CashTransaction != null
                && !x.CashTransaction.IsDeleted)
            .SumAsync(x => x.CashTransaction!.TransactionType == CashTransactionType.Debit
                ? x.Amount
                : -x.Amount, cancellationToken);

        account.CurrentBalance = (account.InitialBalance ?? 0d) + directBalance + paymentBalance;
        _cashAccountRepository.Update(account);
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
