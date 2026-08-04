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
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public PayPurchaseOrderHandler(
        ICommandRepository<CashTransaction> cashTransactionRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork)
    {
        _cashTransactionRepository = cashTransactionRepository;
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

        foreach (var tx in sortedTransactions)
        {
            double txAmount = tx.Amount ?? 0;
            double payForTx = Math.Min(remainingPayment, txAmount);

            tx.PaidAmount = payForTx;
            tx.Status = (payForTx == txAmount && txAmount > 0) ? CashTransactionStatus.Paid : (payForTx > 0 ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid);
            tx.CashAccountId = request.CashAccountId;
            
            if (!string.IsNullOrWhiteSpace(request.Description))
            {
                tx.Description = request.Description;
            }

            tx.UpdatedById = request.UpdatedById;
            _cashTransactionRepository.Update(tx);

            remainingPayment -= payForTx;
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        return new PayPurchaseOrderResult { Success = true };
    }
}
