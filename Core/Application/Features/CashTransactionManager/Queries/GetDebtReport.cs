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
        public DocumentSource(string id, string partyId, string? number, DateTime? date, decimal amount, string sourceType, int sign = 1)
        {
            Id = id;
            PartyId = partyId;
            Number = number;
            Date = date;
            Amount = amount;
            SourceType = sourceType;
            Sign = sign;
        }
        public string Id { get; private set; } = string.Empty;
        public string PartyId { get; private set; } = string.Empty;
        public string? Number { get; private set; }
        public DateTime? Date { get; private set; }
        public decimal Amount { get; private set; }
        public string SourceType { get; private set; } = string.Empty;
        public int Sign { get; private set; } = 1;
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
                .Select(x => new DocumentSource(x.Id, x.VendorId!, x.Number, x.OrderDate,
                    x.AfterTaxAmount ?? 0m, nameof(PurchaseOrder), 1))
                .ToListAsync(cancellationToken);
            sources.AddRange(await (from item in _queryContext.Set<PurchaseReturn>().AsNoTracking().ApplyIsDeletedFilter(false)
                join order in _queryContext.Set<PurchaseOrder>().AsNoTracking().ApplyIsDeletedFilter(false)
                    on item.PurchaseOrderId equals order.Id
                where (item.Status == PurchaseReturnStatus.Confirmed || item.Status == PurchaseReturnStatus.Archived)
                    && order.VendorId != null
                select new DocumentSource(item.Id, order.VendorId!, item.Number, item.ReturnDate,
                    0m, nameof(PurchaseReturn), -1)).ToListAsync(cancellationToken));
            partyNames = await _queryContext.Set<Vendor>().AsNoTracking().ApplyIsDeletedFilter(false)
                .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);
        }
        else
        {
            sources = await _queryContext.Set<SalesOrder>().AsNoTracking().ApplyIsDeletedFilter(false)
                .Where(x => x.OrderStatus == SalesOrderStatus.Confirmed && x.CustomerId != null)
                .Select(x => new DocumentSource(x.Id, x.CustomerId!, x.Number, x.OrderDate,
                    x.AfterTaxAmount ?? 0m, nameof(SalesOrder), 1))
                .ToListAsync(cancellationToken);
            sources.AddRange(await (from item in _queryContext.Set<SalesReturn>().AsNoTracking().ApplyIsDeletedFilter(false)
                join order in _queryContext.Set<SalesOrder>().AsNoTracking().ApplyIsDeletedFilter(false)
                    on item.SalesOrderId equals order.Id
                where (item.Status == SalesReturnStatus.Confirmed || item.Status == SalesReturnStatus.Archived)
                    && order.CustomerId != null
                select new DocumentSource(item.Id, order.CustomerId!, item.Number, item.ReturnDate,
                    0m, nameof(SalesReturn), -1)).ToListAsync(cancellationToken));
            partyNames = await _queryContext.Set<Customer>().AsNoTracking().ApplyIsDeletedFilter(false)
                .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);
        }

        var sourceTypes = isVendor
            ? new[] { nameof(PurchaseOrder), nameof(PurchaseReturn) }
            : new[] { nameof(SalesOrder), nameof(SalesReturn) };
        var documentIds = sources.Select(x => x.Id).ToList();
        var transactions = await _queryContext.Set<CashTransaction>().AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule != null && sourceTypes.Contains(x.SourceModule)
                && x.SourceModuleId != null && documentIds.Contains(x.SourceModuleId))
            .Include(x => x.PaymentList.Where(payment => !payment.IsDeleted))
                .ThenInclude(x => x.CashAccount)
            .ToListAsync(cancellationToken);
        var transactionMap = transactions
            .GroupBy(x => $"{x.SourceModule}|{x.SourceModuleId}")
            .ToDictionary(x => x.Key, x => x.OrderByDescending(item => item.CreatedAtUtc).First());

        var data = sources.GroupBy(x => x.PartyId).Select(group =>
        {
            var documents = group.Select(source =>
            {
                transactionMap.TryGetValue($"{source.SourceType}|{source.Id}", out var transaction);
                var payments = transaction?.PaymentList
                    .OrderByDescending(x => x.PaymentDate)
                    .Select(x => new DebtPaymentDto
                    {
                        Id = x.Id,
                        PaymentDate = x.PaymentDate,
                        Amount = source.Sign * x.Amount,
                        CashAccountName = x.CashAccount != null ? x.CashAccount.Name : null,
                        Description = x.Description
                    }).ToList() ?? [];
                var unsignedAmount = transaction?.Amount ?? source.Amount;
                var unsignedPaid = transaction?.PaidAmount ?? transaction?.PaymentList.Sum(x => x.Amount) ?? 0m;
                unsignedPaid = Math.Min(unsignedAmount, Math.Max(0m, unsignedPaid));
                var total = source.Sign * unsignedAmount;
                var paid = source.Sign * unsignedPaid;
                return new DebtDocumentDto
                {
                    Id = source.Id,
                    Number = source.Number,
                    DocumentDate = source.Date,
                    SourceType = source.SourceType,
                    TotalAmount = total,
                    PaidAmount = paid,
                    Remaining = total - paid,
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
