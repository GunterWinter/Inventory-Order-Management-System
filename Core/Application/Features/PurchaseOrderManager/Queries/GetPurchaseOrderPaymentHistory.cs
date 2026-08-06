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
    public double Amount { get; set; }
    public string? Description { get; set; }
}

public class GetPurchaseOrderPaymentHistoryResult
{
    public string? CashTransactionId { get; set; }
    public string? CashAccountId { get; set; }
    public string? CashAccountName { get; set; }
    public double Amount { get; set; }
    public double PaidAmount { get; set; }
    public double RemainingAmount { get; set; }
    public string? Status { get; set; }
    public List<PurchaseOrderPaymentDto> Data { get; set; } = new();
}

public class GetPurchaseOrderPaymentHistoryRequest : IRequest<GetPurchaseOrderPaymentHistoryResult>
{
    public string? PurchaseOrderId { get; init; }
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
                && x.SourceModule == nameof(PurchaseOrder)
                && x.SourceModuleId == request.PurchaseOrderId
                && x.TransactionType == CashTransactionType.Credit)
            .Select(x => new
            {
                x.Id,
                x.CashAccountId,
                CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                Amount = x.Amount ?? 0d,
                PaidAmount = x.PaidAmount ?? 0d,
                x.Status
            })
            .SingleOrDefaultAsync(cancellationToken);

        if (transaction == null)
        {
            throw new InvalidOperationException("Purchase order cash transaction was not found.");
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
                Description = x.Description
            })
            .ToListAsync(cancellationToken);

        return new GetPurchaseOrderPaymentHistoryResult
        {
            CashTransactionId = transaction.Id,
            CashAccountId = transaction.CashAccountId,
            CashAccountName = transaction.CashAccountName,
            Amount = transaction.Amount,
            PaidAmount = transaction.PaidAmount,
            RemainingAmount = Math.Max(0d, transaction.Amount - transaction.PaidAmount),
            Status = transaction.Status?.ToString(),
            Data = payments
        };
    }
}
