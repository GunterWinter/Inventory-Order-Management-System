using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.WarehouseManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager;

public class SalesOrderService
{
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryService;
    private readonly ProductSerialService _serialService;
    private readonly WarehouseService _warehouseService;
    private readonly CashBalanceService _cashBalanceService;

    public SalesOrderService(
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<InventoryTransaction> inventoryRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryService,
        ProductSerialService serialService,
        WarehouseService warehouseService,
        CashBalanceService cashBalanceService)
    {
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _inventoryRepository = inventoryRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _paymentRepository = paymentRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryService = inventoryService;
        _serialService = serialService;
        _warehouseService = warehouseService;
        _cashBalanceService = cashBalanceService;
    }

    public void Recalculate(string salesOrderId)
    {
        var order = _salesOrderRepository.GetQuery().ApplyIsDeletedFilter()
            .SingleOrDefault(x => x.Id == salesOrderId);
        if (order == null) return;

        var items = _salesOrderItemRepository.GetQuery().ApplyIsDeletedFilter()
            .Where(x => x.SalesOrderId == salesOrderId).ToList();
        order.BeforeTaxAmount = items.Sum(x => x.Total ?? 0m);
        order.TaxAmount = items.Sum(x => x.TaxAmount ?? 0m);
        order.AfterTaxAmount = items.Sum(x => x.AfterTaxAmount ?? ((x.Total ?? 0m) + (x.TaxAmount ?? 0m)));
        _salesOrderRepository.Update(order);
        _unitOfWork.Save();
    }

    public async Task SynchronizeInventoryAsync(string salesOrderId, string? userId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(salesOrderId)) return;

        var order = await _salesOrderRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Include(x => x.Customer)
            .Include(x => x.SalesOrderItemList.Where(i => !i.IsDeleted)).ThenInclude(x => x.Product)
            .SingleOrDefaultAsync(x => x.Id == salesOrderId, ct);
        if (order == null) return;

        var physicalItems = order.SalesOrderItemList.Where(IsPhysicalInventoryItem).ToList();
        var transactions = await _inventoryRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesOrder) && x.ModuleId == order.Id)
            .ToListAsync(ct);

        if (order.OrderStatus == SalesOrderStatus.Cancelled)
        {
            await ValidateCancellationAsync(order, transactions, ct);
            foreach (var transaction in transactions)
            {
                transaction.Status = InventoryTransactionStatus.Cancelled;
                transaction.UpdatedById = userId;
                _inventoryRepository.Update(transaction);
                await _serialService.ReleaseInventoryTransactionSerialsAsync(transaction.Id, userId, ct);
            }
            await DeleteUnpaidReceivableAsync(order.Id, userId, ct);
            await _unitOfWork.SaveAsync(ct);
            return;
        }

        if (order.OrderStatus == SalesOrderStatus.Draft
            && transactions.Any(x => x.Status == InventoryTransactionStatus.Confirmed))
        {
            await ValidateCancellationAsync(order, transactions, ct);
            foreach (var transaction in transactions.Where(x => x.Status == InventoryTransactionStatus.Confirmed))
            {
                await _serialService.ReleaseInventoryTransactionSerialsAsync(transaction.Id, userId, ct);
            }
            await DeleteUnpaidReceivableAsync(order.Id, userId, ct);
        }

        var validItemIds = physicalItems.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var obsolete in transactions.Where(x => !validItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            if (obsolete.Status == InventoryTransactionStatus.Confirmed)
                throw new InvalidOperationException("Confirmed sales-order inventory lines cannot be removed.");
            await _serialService.ReleaseInventoryTransactionSerialsAsync(obsolete.Id, userId, ct);
            _inventoryRepository.Delete(obsolete);
        }

        foreach (var item in physicalItems)
        {
            var transaction = transactions.FirstOrDefault(x => x.ModuleItemId == item.Id);
            if (transaction == null)
            {
                transaction = new InventoryTransaction
                {
                    CreatedById = userId,
                    Number = _numberSequenceService.GenerateNumber(nameof(InventoryTransaction), string.Empty, "IVT"),
                    ModuleId = order.Id,
                    ModuleName = nameof(SalesOrder),
                    ModuleCode = "SO-",
                    ModuleNumber = order.Number,
                    ModuleItemId = item.Id
                };
                await _inventoryRepository.CreateAsync(transaction, ct);
            }
            else
            {
                transaction.UpdatedById = userId;
                _inventoryRepository.Update(transaction);
            }

            transaction.MovementDate = order.OrderDate;
            transaction.Status = ToInventoryStatus(order.OrderStatus);
            transaction.WarehouseId = item.WarehouseId;
            transaction.ProductId = item.ProductId;
            transaction.Movement = item.Quantity;
            _inventoryService.CalculateInvenTrans(transaction);

            if (order.OrderStatus == SalesOrderStatus.Confirmed)
            {
                await ValidateStockAsync(item, transaction, ct);
            }
        }
        await _unitOfWork.SaveAsync(ct);

        if (order.OrderStatus == SalesOrderStatus.Confirmed)
        {
            // Freeze the latest shared cost resolution when the sale becomes
            // effective. Draft orders may outlive new receipts/opening-stock
            // corrections, so their earlier preview cost can be stale.
            foreach (var item in order.SalesOrderItemList)
            {
                await _inventoryService.UpdateSalesOrderItemCostAsync(item, userId, ct);
            }

            foreach (var transaction in transactions.Concat(await _inventoryRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.ModuleName == nameof(SalesOrder) && x.ModuleId == order.Id)
                .ToListAsync(ct)).GroupBy(x => x.Id).Select(x => x.First()))
            {
                if (transaction.Status == InventoryTransactionStatus.Confirmed)
                    await _serialService.ApplyInventoryTransactionSerialsAsync(transaction, null, userId, ct);
            }
            await EnsureCustomerReceivableAsync(order, userId, ct);
        }
    }

    public async Task DeleteSynchronizedInventoryAsync(string salesOrderId, string? userId, CancellationToken ct = default)
    {
        var transactions = await _inventoryRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(SalesOrder) && x.ModuleId == salesOrderId).ToListAsync(ct);
        if (transactions.Any(x => x.Status == InventoryTransactionStatus.Confirmed))
            throw new InvalidOperationException("A confirmed sales order cannot be deleted.");
        foreach (var transaction in transactions)
        {
            await _serialService.ReleaseInventoryTransactionSerialsAsync(transaction.Id, userId, ct);
            _inventoryRepository.Delete(transaction);
        }
        await DeleteUnpaidReceivableAsync(salesOrderId, userId, ct);
        await _unitOfWork.SaveAsync(ct);
    }

    private async Task EnsureCustomerReceivableAsync(SalesOrder order, string? userId, CancellationToken ct)
    {
        var existing = await _cashTransactionRepository.GetQuery().ApplyIsDeletedFilter(false)
            .SingleOrDefaultAsync(x => x.SourceModule == nameof(SalesOrder)
                && x.SourceModuleId == order.Id && x.TransactionType == CashTransactionType.Debit, ct);
        var isNew = existing == null;
        existing ??= new CashTransaction
        {
            CreatedById = userId,
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
            SourceModule = nameof(SalesOrder),
            SourceModuleId = order.Id,
            TransactionType = CashTransactionType.Debit,
            PaidAmount = 0m
        };
        var amount = order.AfterTaxAmount ?? 0m;
        var paid = existing.PaidAmount ?? 0m;
        if (paid > amount + 0.000001m)
            throw new InvalidOperationException("Sales-order total cannot be lower than the amount already collected.");
        existing.TransactionDate = order.OrderDate;
        existing.Amount = amount;
        existing.Status = PaymentStatus(paid, amount);
        existing.Description = $"{order.Customer?.Name} - {order.Number}".Trim(' ', '-');
        existing.CustomerId = order.CustomerId;
        existing.VendorId = null;
        existing.SourceModuleNumber = order.Number;
        if (isNew) await _cashTransactionRepository.CreateAsync(existing, ct);
        else { existing.UpdatedById = userId; _cashTransactionRepository.Update(existing); }
        await _unitOfWork.SaveAsync(ct);
    }

    private async Task DeleteUnpaidReceivableAsync(string orderId, string? userId, CancellationToken ct)
    {
        var receivables = await _cashTransactionRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(SalesOrder) && x.SourceModuleId == orderId).ToListAsync(ct);
        foreach (var receivable in receivables)
        {
            if ((receivable.PaidAmount ?? 0m) > 0m)
                throw new InvalidOperationException("A sales order with collected payments cannot be cancelled or deleted.");
            receivable.UpdatedById = userId;
            _cashTransactionRepository.Delete(receivable);
        }
    }

    private async Task ValidateCancellationAsync(SalesOrder order, List<InventoryTransaction> transactions, CancellationToken ct)
    {
        if (await _paymentRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.CashTransaction != null
            && !x.CashTransaction.IsDeleted && x.CashTransaction.SourceModule == nameof(SalesOrder)
            && x.CashTransaction.SourceModuleId == order.Id && x.Amount > 0m, ct))
            throw new InvalidOperationException($"Không thể hủy SO {order.Number} vì đã có lịch sử thu tiền. Hãy hoàn tác các lần thanh toán trước.");
        if (await _queryContext.Set<SalesReturn>().AsNoTracking().AnyAsync(x => !x.IsDeleted
            && x.SalesOrderId == order.Id && x.Status != SalesReturnStatus.Cancelled, ct))
            throw new InvalidOperationException($"Không thể hủy SO {order.Number} vì còn phiếu trả hàng bán đang hiệu lực. Hãy hủy phiếu trả hàng trước để tránh cộng tồn hai lần.");

        // ProductSerialService validates the latest active movement for each serial
        // while reversing each inventory line. Earlier PO receipt movements must not
        // be mistaken for downstream dependencies of this SO.
    }

    private async Task ValidateStockAsync(SalesOrderItem item, InventoryTransaction current, CancellationToken ct)
    {
        var stock = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Status == InventoryTransactionStatus.Confirmed
                && x.ProductId == item.ProductId && x.WarehouseId == item.WarehouseId && x.Id != current.Id)
            .SumAsync(x => x.Stock ?? 0m, ct);
        if ((item.Quantity ?? 0m) > stock + 0.000001m)
            throw new InvalidOperationException($"Không đủ tồn trong kho đã chọn. Tồn khả dụng: {stock}.");
    }

    private static bool IsPhysicalInventoryItem(SalesOrderItem item) => item.Product?.Physical == true
        && !string.IsNullOrWhiteSpace(item.ProductId) && !string.IsNullOrWhiteSpace(item.WarehouseId)
        && (item.Quantity ?? 0m) > 0m;
    private static InventoryTransactionStatus ToInventoryStatus(SalesOrderStatus? status) => status switch
    {
        SalesOrderStatus.Confirmed or SalesOrderStatus.Archived => InventoryTransactionStatus.Confirmed,
        SalesOrderStatus.Cancelled => InventoryTransactionStatus.Cancelled,
        _ => InventoryTransactionStatus.Draft
    };
    private static CashTransactionStatus PaymentStatus(decimal paid, decimal amount) => amount <= 0m || paid >= amount
        ? CashTransactionStatus.Paid : paid > 0m ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid;
}
