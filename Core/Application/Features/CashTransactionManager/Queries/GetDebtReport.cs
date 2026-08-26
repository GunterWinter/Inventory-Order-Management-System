using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public sealed class DebtPaymentDto
{
    public string? Id { get; init; }
    public DateTime? PaymentDate { get; init; }
    public decimal Amount { get; init; }
    public string? CashAccountName { get; init; }
    public string? Description { get; init; }
}

public sealed class DebtDocumentDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public DateTime? DocumentDate { get; init; }
    public string? SourceType { get; init; }
    public decimal TotalAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal Remaining { get; init; }
    public List<DebtPaymentDto> Payments { get; init; } = [];
}

public sealed class DebtPartyDto
{
    public string? PartyId { get; init; }
    public string? PartyName { get; init; }
    public decimal TotalAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal Remaining { get; init; }
    public List<DebtDocumentDto> Documents { get; init; } = [];
}

public sealed class GetDebtReportResult
{
    public string PartyType { get; init; } = "Customer";
    public decimal TotalAmount { get; init; }
    public decimal PaidAmount { get; init; }
    public decimal Remaining { get; init; }
    public List<DebtPartyDto> Data { get; init; } = [];
}

public sealed class GetDebtReportRequest : IRequest<GetDebtReportResult>
{
    public string? PartyType { get; init; }
}

public sealed class GetDebtReportHandler : IRequestHandler<GetDebtReportRequest, GetDebtReportResult>
{
    private sealed class DocumentSource
    {
        public DocumentSource() { }
        public DocumentSource(string id, string partyId, string? number, DateTime? date, decimal amount)
        {
            Id = id;
            PartyId = partyId;
            Number = number;
            Date = date;
            Amount = amount;
        }
        public string Id { get; private set; } = string.Empty;
        public string PartyId { get; private set; } = string.Empty;
        public string? Number { get; private set; }
        public DateTime? Date { get; private set; }
        public decimal Amount { get; private set; }
    }
    private readonly IQueryContext _queryContext;
    public GetDebtReportHandler(IQueryContext queryContext) => _queryContext = queryContext;

    public async Task<GetDebtReportResult> Handle(GetDebtReportRequest request, CancellationToken cancellationToken)
    {
        var isVendor = string.Equals(request.PartyType, "Vendor", StringComparison.OrdinalIgnoreCase);
        List<DocumentSource> sources;
        Dictionary<string, string> partyNames;
        if (isVendor)
        {
            sources = await _queryContext.Set<PurchaseOrder>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.OrderStatus == PurchaseOrderStatus.Confirmed && x.VendorId != null)
                .Select(x => new DocumentSource(x.Id, x.VendorId!, x.Number, x.OrderDate, x.AfterTaxAmount ?? 0m))
                .ToListAsync(cancellationToken);
            partyNames = await _queryContext.Set<Vendor>().AsNoTracking().ApplyIsDeletedFilter(false)
                .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);
        }
        else
        {
            sources = await _queryContext.Set<SalesOrder>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.OrderStatus == SalesOrderStatus.Confirmed && x.CustomerId != null)
                .Select(x => new DocumentSource(x.Id, x.CustomerId!, x.Number, x.OrderDate, x.AfterTaxAmount ?? 0m))
                .ToListAsync(cancellationToken);
            partyNames = await _queryContext.Set<Customer>().AsNoTracking().ApplyIsDeletedFilter(false)
                .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);
        }

        var sourceType = isVendor ? nameof(PurchaseOrder) : nameof(SalesOrder);
        var documentIds = sources.Select(x => x.Id).ToList();
        var transactions = await _queryContext.Set<CashTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == sourceType && x.SourceModuleId != null && documentIds.Contains(x.SourceModuleId))
            .Include(x => x.PaymentList.Where(payment => !payment.IsDeleted))
                .ThenInclude(x => x.CashAccount)
            .ToListAsync(cancellationToken);
        var transactionMap = transactions
            .GroupBy(x => x.SourceModuleId!)
            .ToDictionary(x => x.Key, x => x.OrderByDescending(item => item.CreatedAtUtc).First());

        var data = sources.GroupBy(x => x.PartyId).Select(group =>
        {
            var documents = group.Select(source =>
            {
                transactionMap.TryGetValue(source.Id, out var transaction);
                var payments = transaction?.PaymentList
                    .OrderByDescending(x => x.PaymentDate)
                    .Select(x => new DebtPaymentDto
                    {
                        Id = x.Id,
                        PaymentDate = x.PaymentDate,
                        Amount = x.Amount,
                        CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                        Description = x.Description
                    }).ToList() ?? [];
                var paid = transaction?.PaidAmount ?? payments.Sum(x => x.Amount);
                paid = Math.Min(source.Amount, Math.Max(0m, paid));
                return new DebtDocumentDto
                {
                    Id = source.Id,
                    Number = source.Number,
                    DocumentDate = source.Date,
                    SourceType = sourceType,
                    TotalAmount = source.Amount,
                    PaidAmount = paid,
                    Remaining = Math.Max(0m, source.Amount - paid),
                    Payments = payments
                };
            }).OrderByDescending(x => x.DocumentDate).ToList();
            return new DebtPartyDto
            {
                PartyId = group.Key,
                PartyName = partyNames.GetValueOrDefault(group.Key) ?? "N/A",
                TotalAmount = documents.Sum(x => x.TotalAmount),
                PaidAmount = documents.Sum(x => x.PaidAmount),
                Remaining = documents.Sum(x => x.Remaining),
                Documents = documents
            };
        }).OrderByDescending(x => x.Remaining).ToList();

        return new GetDebtReportResult
        {
            PartyType = isVendor ? "Vendor" : "Customer",
            TotalAmount = data.Sum(x => x.TotalAmount),
            PaidAmount = data.Sum(x => x.PaidAmount),
            Remaining = data.Sum(x => x.Remaining),
            Data = data
        };
    }
}
