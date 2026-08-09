using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager.Commands;

public class UpsertSalesOrderPaymentResult
{
    public string? CashTransactionId { get; init; }
    public string? CashAccountId { get; init; }
    public double Amount { get; init; }
    public double PaidAmount { get; init; }
    public double RemainingAmount { get; init; }
    public string? Status { get; init; }
}

public class UpsertSalesOrderPaymentRequest : IRequest<UpsertSalesOrderPaymentResult>
{
    public string? SalesOrderId { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashCategoryId { get; init; }
    public double? PaidAmount { get; init; }
    public double? PaymentAmount { get; init; }
    public string? Description { get; init; }
    public DateTime? PaymentDate { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpsertSalesOrderPaymentValidator : AbstractValidator<UpsertSalesOrderPaymentRequest>
{
    public UpsertSalesOrderPaymentValidator()
    {
        RuleFor(x => x.SalesOrderId).NotEmpty();
        RuleFor(x => x.CashAccountId).NotEmpty();
        RuleFor(x => x)
            .Must(x => x.PaymentAmount.HasValue || x.PaidAmount.HasValue)
            .WithMessage("Payment amount is required.");
        RuleFor(x => x.PaymentAmount).GreaterThan(0).When(x => x.PaymentAmount.HasValue);
        RuleFor(x => x.PaidAmount).GreaterThanOrEqualTo(0).When(x => x.PaidAmount.HasValue);
    }
}

public class UpsertSalesOrderPaymentHandler : IRequestHandler<UpsertSalesOrderPaymentRequest, UpsertSalesOrderPaymentResult>
{
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly CashBalanceService _cashBalanceService;

    public UpsertSalesOrderPaymentHandler(
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        CashBalanceService cashBalanceService)
    {
        _salesOrderRepository = salesOrderRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _paymentRepository = paymentRepository;
        _cashAccountRepository = cashAccountRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _cashBalanceService = cashBalanceService;
    }

    public async Task<UpsertSalesOrderPaymentResult> Handle(
        UpsertSalesOrderPaymentRequest request,
        CancellationToken cancellationToken)
    {
        CashTransaction? transaction = null;
        string? previousAccountId = null;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var salesOrder = await _salesOrderRepository.GetQuery()
                .SingleOrDefaultAsync(x => !x.IsDeleted && x.Id == request.SalesOrderId, ct);

            if (salesOrder == null)
            {
                throw new InvalidOperationException("Sales order was not found.");
            }

            if (salesOrder.OrderStatus != SalesOrderStatus.Confirmed)
            {
                throw new InvalidOperationException("Only a confirmed sales order can be paid.");
            }

            var account = await _cashAccountRepository.GetAsync(request.CashAccountId!, ct);
            if (account == null)
            {
                throw new InvalidOperationException("Cash account was not found.");
            }

            var amount = salesOrder.AfterTaxAmount ?? 0d;

            transaction = await _cashTransactionRepository.GetQuery()
                .SingleOrDefaultAsync(x => !x.IsDeleted
                    && x.SourceModule == nameof(SalesOrder)
                    && x.SourceModuleId == salesOrder.Id
                    && x.TransactionType == CashTransactionType.Debit, ct);

            if (transaction == null)
            {
                transaction = new CashTransaction
                {
                    Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
                    CreatedById = request.UpdatedById,
                    SourceModule = nameof(SalesOrder),
                    SourceModuleId = salesOrder.Id,
                    SourceModuleNumber = salesOrder.Number,
                    TransactionType = CashTransactionType.Debit,
                    CustomerId = salesOrder.CustomerId
                };
                await _cashTransactionRepository.CreateAsync(transaction, ct);
            }
            else
            {
                previousAccountId = transaction.CashAccountId;
                transaction.UpdatedById = request.UpdatedById;
                _cashTransactionRepository.Update(transaction);
            }

            var previousPaidAmount = transaction.PaidAmount ?? 0d;
            var paidAmount = request.PaymentAmount.HasValue
                ? previousPaidAmount + request.PaymentAmount.Value
                : request.PaidAmount ?? previousPaidAmount;
            if (paidAmount < previousPaidAmount - 0.000001d)
            {
                throw new InvalidOperationException("Paid amount cannot be less than the amount already paid.");
            }
            if (paidAmount > amount + 0.000001d)
            {
                throw new InvalidOperationException($"Payment amount cannot exceed the remaining amount ({Math.Max(0d, amount - previousPaidAmount):N2}).");
            }

            var recordedPaidAmount = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == transaction.Id)
                .SumAsync(x => x.Amount, ct);

            // Backfill payment history created by the legacy Sales Order flow before
            // recording the new installment. This keeps PaidAmount and the history in sync.
            var missingHistoryAmount = previousPaidAmount - recordedPaidAmount;
            if (missingHistoryAmount > 0.000001d)
            {
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = transaction.Id,
                    CashAccountId = previousAccountId ?? request.CashAccountId,
                    PaymentDate = transaction.TransactionDate ?? request.PaymentDate ?? DateTime.UtcNow,
                    Amount = missingHistoryAmount,
                    Description = transaction.Description,
                    CreatedById = request.UpdatedById
                }, ct);
            }

            var installmentAmount = paidAmount - previousPaidAmount;
            if (installmentAmount > 0.000001d)
            {
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = transaction.Id,
                    CashAccountId = request.CashAccountId,
                    PaymentDate = request.PaymentDate ?? DateTime.UtcNow,
                    Amount = installmentAmount,
                    Description = request.Description,
                    CreatedById = request.UpdatedById
                }, ct);
            }

            transaction.TransactionDate = request.PaymentDate ?? transaction.TransactionDate ?? DateTime.UtcNow;
            transaction.Amount = amount;
            transaction.PaidAmount = paidAmount;
            transaction.Status = ComputePaymentStatus(paidAmount, amount);
            transaction.Description = request.Description;
            transaction.CashAccountId = request.CashAccountId;
            transaction.CashCategoryId = request.CashCategoryId;
            transaction.CustomerId = salesOrder.CustomerId;

            await _unitOfWork.SaveAsync(ct);
            await _cashBalanceService.RecalculateManyAsync(
                new[] { previousAccountId, request.CashAccountId }
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x!),
                ct);
        }, cancellationToken);

        var finalAmount = transaction!.Amount ?? 0d;
        var finalPaidAmount = transaction.PaidAmount ?? 0d;
        return new UpsertSalesOrderPaymentResult
        {
            CashTransactionId = transaction.Id,
            CashAccountId = transaction.CashAccountId,
            Amount = finalAmount,
            PaidAmount = finalPaidAmount,
            RemainingAmount = Math.Max(0d, finalAmount - finalPaidAmount),
            Status = transaction.Status?.ToString()
        };
    }

    private static CashTransactionStatus ComputePaymentStatus(double paidAmount, double amount)
    {
        if (amount <= 0d || paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0d) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
    }
}
