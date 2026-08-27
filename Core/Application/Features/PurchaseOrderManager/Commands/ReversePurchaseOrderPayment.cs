using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Commands;

public class ReversePurchaseOrderPaymentRequest : IRequest<PayPurchaseOrderResult>
{
    public string? PaymentId { get; init; }
    public DateTime? ReversalDate { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class ReversePurchaseOrderPaymentValidator : AbstractValidator<ReversePurchaseOrderPaymentRequest>
{
    public ReversePurchaseOrderPaymentValidator()
    {
        RuleFor(x => x.PaymentId).NotEmpty();
        RuleFor(x => x.ReversalDate)
            .Must(value => !value.HasValue || value.Value.Date <= AppDateTime.VietnamNow().Date)
            .WithMessage("Ngày hoàn thanh toán không được lớn hơn ngày hiện tại.");
    }
}

public class ReversePurchaseOrderPaymentHandler
    : IRequestHandler<ReversePurchaseOrderPaymentRequest, PayPurchaseOrderResult>
{
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalanceService;

    public ReversePurchaseOrderPaymentHandler(
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService)
    {
        _paymentRepository = paymentRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _unitOfWork = unitOfWork;
        _cashBalanceService = cashBalanceService;
    }

    public async Task<PayPurchaseOrderResult> Handle(
        ReversePurchaseOrderPaymentRequest request,
        CancellationToken cancellationToken)
    {
        CashTransaction? transaction = null;
        CashTransactionPayment? reversal = null;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var original = await _paymentRepository.GetQuery()
                .Include(x => x.CashTransaction)
                .SingleOrDefaultAsync(x => !x.IsDeleted && x.Id == request.PaymentId, ct);
            if (original?.CashTransaction == null
                || original.Amount <= 0m
                || original.ReversalOfPaymentId != null
                || original.CashTransaction.IsDeleted
                || original.CashTransaction.SourceModule != nameof(PurchaseOrder)
                || original.CashTransaction.TransactionType != CashTransactionType.Credit)
            {
                throw new InvalidOperationException("Lần thanh toán PO không hợp lệ để hoàn.");
            }
            if (await _paymentRepository.GetQuery().AnyAsync(
                x => !x.IsDeleted && x.ReversalOfPaymentId == original.Id, ct))
            {
                throw new InvalidOperationException("Lần thanh toán này đã được hoàn.");
            }

            transaction = original.CashTransaction;
            var recordedPaidAmount = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == transaction.Id)
                .SumAsync(x => x.Amount, ct);
            var newPaidAmount = Math.Max(0m, recordedPaidAmount - original.Amount);
            reversal = new CashTransactionPayment
            {
                CashTransactionId = transaction.Id,
                CashAccountId = original.CashAccountId,
                PaymentDate = request.ReversalDate ?? AppDateTime.VietnamNow(),
                Amount = -original.Amount,
                Description = request.Description ?? $"Hoàn thanh toán {original.Id}",
                ReversalOfPaymentId = original.Id,
                CreatedById = request.UpdatedById
            };
            await _paymentRepository.CreateAsync(reversal, ct);

            var amount = transaction.Amount ?? 0m;
            transaction.PaidAmount = newPaidAmount;
            transaction.Status = newPaidAmount >= amount && amount > 0m
                ? CashTransactionStatus.Paid
                : newPaidAmount > 0m
                    ? CashTransactionStatus.PartiallyPaid
                    : CashTransactionStatus.Unpaid;
            transaction.UpdatedById = request.UpdatedById;
            _cashTransactionRepository.Update(transaction);
            await _unitOfWork.SaveAsync(ct);
            await _cashBalanceService.RecalculateAsync(original.CashAccountId, ct);
        }, cancellationToken);

        var finalAmount = transaction!.Amount ?? 0m;
        var finalPaidAmount = transaction.PaidAmount ?? 0m;
        return new PayPurchaseOrderResult
        {
            Success = true,
            CashTransactionId = transaction.Id,
            PaymentId = reversal!.Id,
            CashAccountId = transaction.CashAccountId,
            Amount = finalAmount,
            PaidAmount = finalPaidAmount,
            RemainingAmount = Math.Max(0m, finalAmount - finalPaidAmount),
            Status = transaction.Status?.ToString()
        };
    }
}
