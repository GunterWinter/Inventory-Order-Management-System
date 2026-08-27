using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Queries;

public class PurchaseOrderPaymentDto
{
    public string? Id { get; set; }
    public string? CashAccountId { get; set; }
    public string? CashAccountName { get; set; }
    public DateTime PaymentDate { get; set; }
    public decimal Amount { get; set; }
    public string? Description { get; set; }
    public string? ReversalOfPaymentId { get; set; }
    public bool IsReversal { get; set; }
    public bool CanReverse { get; set; }
}

public class GetPurchaseOrderPaymentHistoryResult
{
    public string? CashTransactionId { get; set; }
    public string? CashAccountId { get; set; }
    public string? CashAccountName { get; set; }
    public decimal Amount { get; set; }
    public decimal PaidAmount { get; set; }
    public decimal RemainingAmount { get; set; }
    public string? Status { get; set; }
    public List<PurchaseOrderPaymentDto> Data { get; set; } = new();
}

public class GetPurchaseOrderPaymentHistoryRequest : IRequest<GetPurchaseOrderPaymentHistoryResult>
{
    public string? PurchaseOrderId { get; init; }
    public string? CashTransactionId { get; init; }
}

public class GetPurchaseOrderPaymentHistoryHandler
    : IRequestHandler<GetPurchaseOrderPaymentHistoryRequest, GetPurchaseOrderPaymentHistoryResult>
{
    private readonly IQueryContext _queryContext;

    public GetPurchaseOrderPaymentHistoryHandler(IQueryContext queryContext)
    {
        _queryContext = queryContext;
    }

    public async Task<GetPurchaseOrderPaymentHistoryResult> Handle(
        GetPurchaseOrderPaymentHistoryRequest request,
        CancellationToken cancellationToken)
    {
        var transaction = await _queryContext.Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && (string.IsNullOrWhiteSpace(request.CashTransactionId)
                    ? (x.SourceModule == nameof(PurchaseOrder)
                        && x.SourceModuleId == request.PurchaseOrderId
                        && x.TransactionType == CashTransactionType.Credit)
                    : x.Id == request.CashTransactionId))
            .Select(x => new
            {
                x.Id,
                x.CashAccountId,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                Amount = x.Amount ?? 0m,
                PaidAmount = x.PaidAmount ?? 0m,
                x.Status
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (transaction == null)
        {
            throw new InvalidOperationException("Cash transaction was not found.");
        }

        var payments = await _queryContext.Set<CashTransactionPayment>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashTransactionId == transaction.Id)
            .OrderBy(x => x.PaymentDate)
            .ThenBy(x => x.CreatedAtUtc)
            .Select(x => new PurchaseOrderPaymentDto
            {
                Id = x.Id,
                CashAccountId = x.CashAccountId,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                PaymentDate = x.PaymentDate,
                Amount = x.Amount,
                Description = x.Description,
                ReversalOfPaymentId = x.ReversalOfPaymentId,
                IsReversal = x.ReversalOfPaymentId != null
            })
            .ToListAsync(cancellationToken);
        var reversedPaymentIds = payments
            .Where(x => x.ReversalOfPaymentId != null)
            .Select(x => x.ReversalOfPaymentId!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var payment in payments)
            payment.CanReverse = payment.Amount > 0m && !reversedPaymentIds.Contains(payment.Id!);

        return new GetPurchaseOrderPaymentHistoryResult
        {
            CashTransactionId = transaction.Id,
            CashAccountId = transaction.CashAccountId,
            CashAccountName = transaction.CashAccountName,
            Amount = transaction.Amount,
            PaidAmount = transaction.PaidAmount,
            RemainingAmount = Math.Max(0m, transaction.Amount - transaction.PaidAmount),
            Status = transaction.Status?.ToString(),
            Data = payments
        };
    }
}
