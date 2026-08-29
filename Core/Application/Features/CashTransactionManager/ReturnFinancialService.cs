using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager;

public sealed class ReturnFinancialService
{
    private readonly ICommandRepository<PurchaseReturn> _purchaseReturns;
    private readonly ICommandRepository<SalesReturn> _salesReturns;
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrders;
    private readonly ICommandRepository<SalesOrder> _salesOrders;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseItems;
    private readonly ICommandRepository<SalesOrderItem> _salesItems;
    private readonly ICommandRepository<InventoryTransaction> _inventory;
    private readonly ICommandRepository<CashTransaction> _cash;
    private readonly ICommandRepository<CashTransactionPayment> _payments;
    private readonly NumberSequenceService _numberSequence;
    private readonly IUnitOfWork _unitOfWork;

    public ReturnFinancialService(
        ICommandRepository<PurchaseReturn> purchaseReturns,
        ICommandRepository<SalesReturn> salesReturns,
        ICommandRepository<PurchaseOrder> purchaseOrders,
        ICommandRepository<SalesOrder> salesOrders,
        ICommandRepository<PurchaseOrderItem> purchaseItems,
        ICommandRepository<SalesOrderItem> salesItems,
        ICommandRepository<InventoryTransaction> inventory,
        ICommandRepository<CashTransaction> cash,
        ICommandRepository<CashTransactionPayment> payments,
        NumberSequenceService numberSequence,
        IUnitOfWork unitOfWork)
    {
        _purchaseReturns = purchaseReturns;
        _salesReturns = salesReturns;
        _purchaseOrders = purchaseOrders;
        _salesOrders = salesOrders;
        _purchaseItems = purchaseItems;
        _salesItems = salesItems;
        _inventory = inventory;
        _cash = cash;
        _payments = payments;
        _numberSequence = numberSequence;
        _unitOfWork = unitOfWork;
    }

    public async Task EnsureCanDeactivateAsync(string sourceModule, string returnId, CancellationToken ct)
    {
        var transactionIds = await _cash.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == sourceModule && x.SourceModuleId == returnId)
            .Select(x => x.Id)
            .ToListAsync(ct);
        if (transactionIds.Count == 0) return;

        var netPaid = await _payments.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => transactionIds.Contains(x.CashTransactionId))
            .SumAsync(x => x.Amount, ct);
        if (Math.Abs(netPaid) > 0.000001m)
            throw new InvalidOperationException(
                "Không thể đưa phiếu trả hàng về Nháp hoặc Hủy vì còn khoản hoàn tiền chưa được hoàn tác.");
    }

    public async Task SynchronizePurchaseReturnsAsync(string purchaseOrderId, string? userId, CancellationToken ct)
    {
        var order = await _purchaseOrders.GetQuery().ApplyIsDeletedFilter(false)
            .Include(x => x.Vendor)
            .SingleAsync(x => x.Id == purchaseOrderId, ct);
        var returns = await _purchaseReturns.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderId == purchaseOrderId
                && (x.Status == PurchaseReturnStatus.Confirmed || x.Status == PurchaseReturnStatus.Archived))
            .OrderBy(x => x.ReturnDate).ThenBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .ToListAsync(ct);
        var amounts = await CalculateAmountsAsync<PurchaseOrderItem>(
            nameof(PurchaseReturn), returns.Select(x => x.Id).ToList(), _purchaseItems,
            x => x.Quantity ?? 0m, x => x.AfterTaxAmount ?? 0m, ct);

        foreach (var item in returns)
            await UpsertAsync(nameof(PurchaseReturn), item.Id, purchaseOrderId, item.Number,
                item.ReturnDate, order.VendorId, null, CashTransactionType.Debit,
                amounts.GetValueOrDefault(item.Id), $"Hoàn trả mua hàng {item.Number} - {order.Vendor?.Name}", userId, ct);

        await DeleteInactiveAsync(nameof(PurchaseReturn), purchaseOrderId, returns.Select(x => x.Id), userId, ct);
    }

    public async Task SynchronizeSalesReturnsAsync(string salesOrderId, string? userId, CancellationToken ct)
    {
        var order = await _salesOrders.GetQuery().ApplyIsDeletedFilter(false)
            .Include(x => x.Customer)
            .SingleAsync(x => x.Id == salesOrderId, ct);
        var returns = await _salesReturns.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderId == salesOrderId
                && (x.Status == SalesReturnStatus.Confirmed || x.Status == SalesReturnStatus.Archived))
            .OrderBy(x => x.ReturnDate).ThenBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .ToListAsync(ct);
        var amounts = await CalculateAmountsAsync<SalesOrderItem>(
            nameof(SalesReturn), returns.Select(x => x.Id).ToList(), _salesItems,
            x => x.Quantity ?? 0m, x => x.AfterTaxAmount ?? 0m, ct);

        foreach (var item in returns)
            await UpsertAsync(nameof(SalesReturn), item.Id, salesOrderId, item.Number,
                item.ReturnDate, null, order.CustomerId, CashTransactionType.Credit,
                amounts.GetValueOrDefault(item.Id), $"Hoàn trả bán hàng {item.Number} - {order.Customer?.Name}", userId, ct);

        await DeleteInactiveAsync(nameof(SalesReturn), salesOrderId, returns.Select(x => x.Id), userId, ct);
    }

    private async Task<Dictionary<string, decimal>> CalculateAmountsAsync<TItem>(
        string moduleName,
        List<string> returnIds,
        ICommandRepository<TItem> itemRepository,
        Func<TItem, decimal> quantity,
        Func<TItem, decimal> afterTax,
        CancellationToken ct) where TItem : BaseEntity
    {
        var lines = await _inventory.GetQuery().AsNoTracking().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == moduleName && returnIds.Contains(x.ModuleId!)
                && x.Status == InventoryTransactionStatus.Confirmed && x.ModuleItemId != null)
            .OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id)
            .Select(x => new { ReturnId = x.ModuleId!, ItemId = x.ModuleItemId!, Quantity = x.Movement ?? 0m })
            .ToListAsync(ct);
        var itemIds = lines.Select(x => x.ItemId).Distinct().ToList();
        var items = await itemRepository.GetQuery().AsNoTracking().ApplyIsDeletedFilter(false)
            .Where(x => itemIds.Contains(x.Id)).ToListAsync(ct);
        var itemMap = items.ToDictionary(x => x.Id);
        var running = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);
        var result = returnIds.ToDictionary(x => x, _ => 0m, StringComparer.OrdinalIgnoreCase);

        foreach (var returnId in returnIds)
        {
            foreach (var line in lines.Where(x => x.ReturnId == returnId))
            {
                if (!itemMap.TryGetValue(line.ItemId, out var source) || quantity(source) <= 0m)
                    throw new InvalidOperationException("Không tìm thấy dòng chứng từ nguồn hợp lệ để tính công nợ trả hàng.");
                var previousQuantity = running.GetValueOrDefault(line.ItemId);
                var sourceQuantity = quantity(source);
                var nextQuantity = previousQuantity + line.Quantity;
                if (nextQuantity > sourceQuantity + 0.000001m)
                    throw new InvalidOperationException("Tổng số lượng trả hàng vượt số lượng của dòng chứng từ nguồn.");
                var previousAmount = AccountingMath.RoundMoney(afterTax(source) * previousQuantity / sourceQuantity);
                var nextAmount = AccountingMath.RoundMoney(afterTax(source) * nextQuantity / sourceQuantity);
                result[returnId] += nextAmount - previousAmount;
                running[line.ItemId] = nextQuantity;
            }
            result[returnId] = AccountingMath.RoundMoney(result[returnId]);
        }
        return result;
    }

    private async Task UpsertAsync(
        string moduleName, string returnId, string sourceOrderId, string? number, DateTime? date,
        string? vendorId, string? customerId, CashTransactionType type, decimal amount,
        string description, string? userId, CancellationToken ct)
    {
        var transaction = await _cash.GetQuery().ApplyIsDeletedFilter(false)
            .SingleOrDefaultAsync(x => x.SourceModule == moduleName && x.SourceModuleId == returnId, ct);
        var isNew = transaction == null;
        transaction ??= new CashTransaction
        {
            CreatedById = userId,
            Number = _numberSequence.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
            SourceModule = moduleName,
            SourceModuleId = returnId,
            PaidAmount = 0m
        };
        var paid = await _payments.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.CashTransactionId == transaction.Id)
            .SumAsync(x => x.Amount, ct);
        if (paid < -0.000001m || paid > amount + 0.000001m)
            throw new InvalidOperationException("Số tiền đã hoàn không hợp lệ so với giá trị phiếu trả hàng.");

        transaction.TransactionDate = date;
        transaction.TransactionType = type;
        transaction.Amount = amount;
        transaction.PaidAmount = paid;
        transaction.Status = PaymentStatus(paid, amount);
        transaction.Description = description.Trim(' ', '-');
        transaction.VendorId = vendorId;
        transaction.CustomerId = customerId;
        transaction.SourceDetailId = sourceOrderId;
        transaction.SourceModuleNumber = number;
        if (isNew) await _cash.CreateAsync(transaction, ct);
        else { transaction.UpdatedById = userId; _cash.Update(transaction); }
        await _unitOfWork.SaveAsync(ct);
    }

    private async Task DeleteInactiveAsync(
        string moduleName, string sourceOrderId, IEnumerable<string> activeReturnIds,
        string? userId, CancellationToken ct)
    {
        var active = activeReturnIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        var stale = await _cash.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == moduleName && x.SourceDetailId == sourceOrderId)
            .ToListAsync(ct);
        foreach (var transaction in stale.Where(x => x.SourceModuleId == null || !active.Contains(x.SourceModuleId)))
        {
            var netPaid = await _payments.GetQuery().ApplyIsDeletedFilter(false)
                .Where(x => x.CashTransactionId == transaction.Id).SumAsync(x => x.Amount, ct);
            if (Math.Abs(netPaid) > 0.000001m)
                throw new InvalidOperationException("Cần hoàn tác khoản hoàn tiền trước khi hủy phiếu trả hàng.");
            transaction.UpdatedById = userId;
            _cash.Delete(transaction);
        }
        await _unitOfWork.SaveAsync(ct);
    }

    private static CashTransactionStatus PaymentStatus(decimal paid, decimal amount)
        => amount <= 0m || paid >= amount - 0.000001m
            ? CashTransactionStatus.Paid
            : paid > 0m ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid;
}
