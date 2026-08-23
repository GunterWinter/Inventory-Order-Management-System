using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.DashboardManager.Queries;


public class GetCardsDashboardDto
{
    public CardsItem? CardsDashboard { get; init; }
}

public class GetCardsDashboardResult
{
    public GetCardsDashboardDto? Data { get; init; }
}

public class GetCardsDashboardRequest : IRequest<GetCardsDashboardResult>
{
}

public class GetCardsDashboardHandler : IRequestHandler<GetCardsDashboardRequest, GetCardsDashboardResult>
{
    private readonly IQueryContext _context;

    public GetCardsDashboardHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetCardsDashboardResult> Handle(GetCardsDashboardRequest request, CancellationToken cancellationToken)
    {
        var salesTotal = await _context.SalesOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .SumAsync(x => (decimal?)x.Quantity, cancellationToken);

        var salesReturnTotal = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesReturn) && x.Status == InventoryTransactionStatus.Confirmed && x.Warehouse!.SystemWarehouse == false)
            .SumAsync(x => (decimal?)x.Movement, cancellationToken);

        var purchaseTotal = await _context.PurchaseOrderItem
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .SumAsync(x => (decimal?)x.Quantity, cancellationToken);

        var purchaseReturnTotal = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(PurchaseReturn) && x.Status == InventoryTransactionStatus.Confirmed && x.Warehouse!.SystemWarehouse == false)
            .SumAsync(x => (decimal?)x.Movement, cancellationToken);

        var transferOutTotal = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(TransferOut) && x.Status == InventoryTransactionStatus.Confirmed && x.Warehouse!.SystemWarehouse == false)
            .SumAsync(x => (decimal?)x.Movement, cancellationToken);

        var transferInTotal = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(TransferIn) && x.Status == InventoryTransactionStatus.Confirmed && x.Warehouse!.SystemWarehouse == false)
            .SumAsync(x => (decimal?)x.Movement, cancellationToken);

        var confirmedSalesAmount = await _context.Set<SalesOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.OrderStatus == SalesOrderStatus.Confirmed)
            .SumAsync(x => x.BeforeTaxAmount ?? 0m, cancellationToken);

        var customerObligationAmount = await _context.Set<SalesOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.OrderStatus == SalesOrderStatus.Confirmed)
            .SumAsync(x => x.AfterTaxAmount ?? 0m, cancellationToken);

        var confirmedPurchaseAmount = await _context.Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .SumAsync(x => x.BeforeTaxAmount ?? 0m, cancellationToken);

        var vendorObligationAmount = await _context.Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .SumAsync(x => x.AfterTaxAmount ?? 0m, cancellationToken);

        var salesPaidAmount = await _context.Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(SalesOrder)
                && x.TransactionType == CashTransactionType.Debit
                && _context.Set<SalesOrder>().Any(order =>
                    order.Id == x.SourceModuleId
                    && !order.IsDeleted
                    && order.OrderStatus == SalesOrderStatus.Confirmed))
            .SumAsync(x => x.PaidAmount ?? 0m, cancellationToken);

        var purchasePaidAmount = await _context.Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(PurchaseOrder)
                && x.TransactionType == CashTransactionType.Credit
                && _context.Set<PurchaseOrder>().Any(order =>
                    order.Id == x.SourceModuleId
                    && !order.IsDeleted
                    && order.OrderStatus == PurchaseOrderStatus.Confirmed))
            .SumAsync(x => x.PaidAmount ?? 0m, cancellationToken);

        var cashBalance = await _context.Set<CashAccount>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .SumAsync(x => x.CurrentBalance ?? 0m, cancellationToken);

        var inventoryQuantity = await _context.InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status == InventoryTransactionStatus.Confirmed
                && x.Product!.Physical == true
                && x.Warehouse!.SystemWarehouse == false)
            .SumAsync(x => x.Stock ?? 0m, cancellationToken);

        var materialExportCount = await _context.Set<MaterialExport>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .CountAsync(x => x.Status == MaterialExportStatus.Confirmed, cancellationToken);

        var cardsDashboardData = new CardsItem
        {
            SalesTotal = salesTotal,
            SalesReturnTotal = salesReturnTotal,
            PurchaseTotal = purchaseTotal,
            PurchaseReturnTotal = purchaseReturnTotal,
            TransferOutTotal = transferOutTotal,
            TransferInTotal = transferInTotal,
            ConfirmedSalesAmount = confirmedSalesAmount,
            ConfirmedPurchaseAmount = confirmedPurchaseAmount,
            CashBalance = cashBalance,
            CustomerReceivable = Math.Max(0m, customerObligationAmount - salesPaidAmount),
            VendorDebt = Math.Max(0m, vendorObligationAmount - purchasePaidAmount),
            InventoryQuantity = inventoryQuantity,
            MaterialExportCount = materialExportCount
        };



        var result = new GetCardsDashboardResult
        {
            Data = new GetCardsDashboardDto
            {
                CardsDashboard = cardsDashboardData
            }
        };

        return result;
    }
}
