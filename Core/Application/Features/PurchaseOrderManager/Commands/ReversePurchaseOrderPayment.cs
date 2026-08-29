using Application.Features.CashTransactionManager;
using Domain.Common;
using FluentValidation;
using MediatR;

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
    private readonly PaymentReversalService _service;

    public ReversePurchaseOrderPaymentHandler(PaymentReversalService service) => _service = service;

    public async Task<PayPurchaseOrderResult> Handle(
        ReversePurchaseOrderPaymentRequest request,
        CancellationToken cancellationToken)
    {
        var result = await _service.ReverseAsync(
            request.PaymentId!, request.ReversalDate, request.Description,
            request.UpdatedById, nameof(Domain.Entities.PurchaseOrder), cancellationToken);
        return new PayPurchaseOrderResult
        {
            Success = true,
            CashTransactionId = result.CashTransactionId,
            PaymentId = result.PaymentId,
            CashAccountId = result.CashAccountId,
            Amount = result.Amount,
            PaidAmount = result.PaidAmount,
            RemainingAmount = result.RemainingAmount,
            Status = result.Status
        };
    }
}
