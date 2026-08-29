using Domain.Common;
using FluentValidation;
using MediatR;

namespace Application.Features.CashTransactionManager.Commands;

public sealed class ReverseCashTransactionPaymentRequest : IRequest<PaymentReversalResult>
{
    public string? PaymentId { get; init; }
    public DateTime? ReversalDate { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public sealed class ReverseCashTransactionPaymentValidator : AbstractValidator<ReverseCashTransactionPaymentRequest>
{
    public ReverseCashTransactionPaymentValidator()
    {
        RuleFor(x => x.PaymentId).NotEmpty();
        RuleFor(x => x.ReversalDate)
            .Must(x => !x.HasValue || x.Value.Date <= AppDateTime.VietnamNow().Date)
            .WithMessage("Ngày hoàn thanh toán không được lớn hơn ngày hiện tại.");
    }
}

public sealed class ReverseCashTransactionPaymentHandler
    : IRequestHandler<ReverseCashTransactionPaymentRequest, PaymentReversalResult>
{
    private readonly PaymentReversalService _service;
    public ReverseCashTransactionPaymentHandler(PaymentReversalService service) => _service = service;

    public Task<PaymentReversalResult> Handle(
        ReverseCashTransactionPaymentRequest request, CancellationToken cancellationToken)
        => _service.ReverseAsync(request.PaymentId!, request.ReversalDate, request.Description,
            request.UpdatedById, null, cancellationToken);
}
