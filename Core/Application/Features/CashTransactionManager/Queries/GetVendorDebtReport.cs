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

    public async Task<GetVendorDebtReportResult> Handle(GetVendorDebtReportRequest request, CancellationToken cancellationToken = default)
    {
        // 1. Get total purchase amount per vendor from Confirmed POs
        var purchaseByVendor = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.OrderStatus == PurchaseOrderStatus.Confirmed && x.VendorId != null)
            .GroupBy(x => x.VendorId)
            .Select(g => new
            {
                VendorId = g.Key,
                TotalPurchase = g.Sum(x => x.AfterTaxAmount ?? 0d)
            })
            .ToListAsync(cancellationToken);

        // 2. Get total paid amount per vendor from Confirmed Credit CashTransactions
        // This includes both:
        //   a) CashTransactions directly linked via VendorId
        //   b) CashTransactions linked via SourceModule=PurchaseOrder (join to PO.VendorId)
        
        // Direct vendor link
        var directPayments = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status == CashTransactionStatus.Confirmed
                     && x.TransactionType == CashTransactionType.Credit
                     && x.VendorId != null)
            .GroupBy(x => x.VendorId)
            .Select(g => new
            {
                VendorId = g.Key,
                TotalPaid = g.Sum(x => x.Amount ?? 0d)
            })
            .ToListAsync(cancellationToken);

        // PO-linked payments (without VendorId set directly)
        var poLinkedPayments = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status == CashTransactionStatus.Confirmed
                     && x.TransactionType == CashTransactionType.Credit
                     && x.SourceModule == nameof(PurchaseOrder)
                     && x.SourceModuleId != null
                     && x.VendorId == null)
            .Join(
                _queryContext.Set<PurchaseOrder>().AsNoTracking().ApplyIsDeletedFilter(false),
                ct => ct.SourceModuleId,
                po => po.Id,
                (ct, po) => new { ct.Amount, po.VendorId }
            )
            .Where(x => x.VendorId != null)
            .GroupBy(x => x.VendorId)
            .Select(g => new
            {
                VendorId = g.Key,
                TotalPaid = g.Sum(x => x.Amount ?? 0d)
            })
            .ToListAsync(cancellationToken);

        // 3. Get vendor names
        var allVendorIds = purchaseByVendor.Select(x => x.VendorId)
            .Union(directPayments.Select(x => x.VendorId))
            .Union(poLinkedPayments.Select(x => x.VendorId))
            .Where(x => x != null)
            .Distinct()
            .ToList();

        var vendors = await _queryContext
            .Set<Vendor>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => allVendorIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);

        // 4. Merge data
        var result = new List<VendorDebtReportDto>();

        foreach (var vendorId in allVendorIds)
        {
            var totalPurchase = purchaseByVendor
                .Where(x => x.VendorId == vendorId)
                .Sum(x => x.TotalPurchase);

            var totalPaid = directPayments
                .Where(x => x.VendorId == vendorId)
                .Sum(x => x.TotalPaid)
                + poLinkedPayments
                .Where(x => x.VendorId == vendorId)
                .Sum(x => x.TotalPaid);

            result.Add(new VendorDebtReportDto
            {
                VendorId = vendorId,
                VendorName = vendors.GetValueOrDefault(vendorId!) ?? "N/A",
                TotalPurchase = totalPurchase,
                TotalPaid = totalPaid,
                RemainingDebt = totalPurchase - totalPaid
            });
        }

        // Only return vendors with non-zero purchase or debt
        result = result
            .Where(x => x.TotalPurchase != 0 || x.RemainingDebt != 0)
            .OrderByDescending(x => x.RemainingDebt)
            .ToList();

        return new GetVendorDebtReportResult
        {
            Data = result
        };
    }
}
