using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public class VendorDebtReportDto
{
    public string? VendorId { get; set; }
    public string? VendorName { get; set; }
    public double TotalPurchase { get; set; }
    public double TotalPaid { get; set; }
    public double RemainingDebt { get; set; }
}

public class GetVendorDebtReportResult
{
    public List<VendorDebtReportDto>? Data { get; set; }
}

public class GetVendorDebtReportRequest : IRequest<GetVendorDebtReportResult>
{
}

public class GetVendorDebtReportHandler : IRequestHandler<GetVendorDebtReportRequest, GetVendorDebtReportResult>
{
    private readonly IQueryContext _queryContext;

    public GetVendorDebtReportHandler(IQueryContext queryContext)
    {
        _queryContext = queryContext;
    }

    public async Task<GetVendorDebtReportResult> Handle(
        GetVendorDebtReportRequest request,
        CancellationToken cancellationToken = default)
    {
        var purchaseObligations = await _queryContext.Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.VendorId != null && x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .GroupBy(x => x.VendorId)
            .Select(g => new
            {
                VendorId = g.Key!,
                Amount = g.Sum(x => x.AfterTaxAmount ?? 0d)
            })
            .ToListAsync(cancellationToken);

        var purchasePayments = await (
                from transaction in _queryContext.Set<CashTransaction>().AsNoTracking()
                join purchaseOrder in _queryContext.Set<PurchaseOrder>().AsNoTracking()
                    on transaction.SourceModuleId equals purchaseOrder.Id
                where !transaction.IsDeleted
                    && !purchaseOrder.IsDeleted
                    && purchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed
                    && purchaseOrder.VendorId != null
                    && transaction.SourceModule == nameof(PurchaseOrder)
                    && transaction.TransactionType == CashTransactionType.Credit
                group transaction by purchaseOrder.VendorId into vendorTransactions
                select new
                {
                    VendorId = vendorTransactions.Key!,
                    Amount = vendorTransactions.Sum(x => x.PaidAmount ?? 0d)
                })
            .ToListAsync(cancellationToken);

        var vendorIds = purchaseObligations.Select(x => x.VendorId)
            .Distinct()
            .ToList();
        var vendors = await _queryContext.Set<Vendor>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => vendorIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);

        return new GetVendorDebtReportResult
        {
            Data = vendorIds
                .Select(vendorId =>
                {
                    var purchaseAmount = purchaseObligations
                        .Where(x => x.VendorId == vendorId)
                        .Sum(x => x.Amount);
                    var purchasePaid = purchasePayments
                        .Where(x => x.VendorId == vendorId)
                        .Sum(x => x.Amount);
                    return new VendorDebtReportDto
                    {
                        VendorId = vendorId,
                        VendorName = vendors.GetValueOrDefault(vendorId) ?? "N/A",
                        TotalPurchase = purchaseAmount,
                        TotalPaid = purchasePaid,
                        RemainingDebt = Math.Max(0d, purchaseAmount - purchasePaid)
                    };
                })
                .Where(x => x.TotalPurchase != 0d || x.RemainingDebt != 0d)
                .OrderByDescending(x => x.RemainingDebt)
                .ToList()
        };
    }
}
