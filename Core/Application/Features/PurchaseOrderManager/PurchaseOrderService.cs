using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.CashTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager;

public class PurchaseOrderService
{
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<GoodsReceive> _goodsReceiveRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly ProductSerialService _productSerialService;
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashTransactionPayment> _cashTransactionPaymentRepository;
    private readonly ICommandRepository<CashTransactionCostAllocation> _cashTransactionCostAllocationRepository;
    private readonly CashBalanceService _cashBalanceService;

    public PurchaseOrderService(
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<GoodsReceive> goodsReceiveRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService,
        ProductSerialService productSerialService,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> cashTransactionPaymentRepository,
        ICommandRepository<CashTransactionCostAllocation> cashTransactionCostAllocationRepository,
        CashBalanceService cashBalanceService
        )
    {
        _purchaseOrderRepository = purchaseOrderRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _goodsReceiveRepository = goodsReceiveRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
        _productSerialService = productSerialService;
        _productSerialRepository = productSerialRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _cashTransactionPaymentRepository = cashTransactionPaymentRepository;
        _cashTransactionCostAllocationRepository = cashTransactionCostAllocationRepository;
        _cashBalanceService = cashBalanceService;
    }

    public void Recalculate(string purchaseOrderId)
    {
        var purchaseOrder = _purchaseOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.Id == purchaseOrderId)
            .SingleOrDefault();

        if (purchaseOrder == null)
            return;

        var purchaseOrderItems = _purchaseOrderItemRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.PurchaseOrderId == purchaseOrderId)
            .ToList();

        purchaseOrder.BeforeTaxAmount = purchaseOrderItems.Sum(x => x.Total ?? 0);
        purchaseOrder.TaxAmount = purchaseOrderItems.Sum(x => x.TaxAmount ?? 0);
        purchaseOrder.AfterTaxAmount = purchaseOrderItems.Sum(x => x.AfterTaxAmount ?? ((x.Total ?? 0) + (x.TaxAmount ?? 0)));

        _purchaseOrderRepository.Update(purchaseOrder);
        _unitOfWork.Save();
    }

    public async Task<CashTransaction> EnsureVendorObligationAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        var purchaseOrder = await _purchaseOrderRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Vendor)
            .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
            .SingleOrDefaultAsync(x => x.Id == purchaseOrderId, cancellationToken)
            ?? throw new InvalidOperationException("Purchase order was not found.");

        var obligations = await _cashTransactionRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(PurchaseOrder)
                && x.SourceModuleId == purchaseOrder.Id
                && x.TransactionType == CashTransactionType.Credit)
            .ToListAsync(cancellationToken);
        if (obligations.Count > 1)
        {
            throw new InvalidOperationException("More than one vendor obligation exists for this purchase order.");
        }

        var obligation = obligations.SingleOrDefault();
        var isNew = obligation == null;
        obligation ??= new CashTransaction
        {
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
            CreatedById = userId,
            SourceModule = nameof(PurchaseOrder),
            SourceModuleId = purchaseOrder.Id
        };

        var amount = purchaseOrder.AfterTaxAmount
            ?? purchaseOrder.PurchaseOrderItemList.Sum(item => item.AfterTaxAmount ?? 0d);
        var paidAmount = obligation.PaidAmount ?? 0d;
        obligation.TransactionDate = purchaseOrder.OrderDate ?? DateTime.Today;
        obligation.TransactionType = CashTransactionType.Credit;
        obligation.Amount = amount;
        obligation.PaidAmount = paidAmount;
        obligation.Status = paidAmount >= amount && amount > 0d
            ? CashTransactionStatus.Paid
            : paidAmount > 0d
                ? CashTransactionStatus.PartiallyPaid
                : CashTransactionStatus.Unpaid;
        obligation.Description = $"{purchaseOrder.Vendor?.Name} - {purchaseOrder.Number}".Trim(' ', '-');
        obligation.VendorId = purchaseOrder.VendorId;
        obligation.CustomerId = null;
        obligation.SourceModuleNumber = purchaseOrder.Number;

        if (isNew)
        {
            await _cashTransactionRepository.CreateAsync(obligation, cancellationToken);
        }
        else
        {
            obligation.UpdatedById = userId;
            _cashTransactionRepository.Update(obligation);
        }
        await _unitOfWork.SaveAsync(cancellationToken);
        return obligation;
    }

    public async Task SynchronizeGoodsReceiveAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(purchaseOrderId))
        {
            return;
        }

        var purchaseOrder = await _purchaseOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == purchaseOrderId)
            .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
                .ThenInclude(x => x.Product)
            .SingleOrDefaultAsync(cancellationToken);

        if (purchaseOrder == null)
        {
            return;
        }

        var receivableItems = purchaseOrder.PurchaseOrderItemList
            .Where(x =>
                x.Product?.Physical == true &&
                !string.IsNullOrWhiteSpace(x.WarehouseId) &&
                !string.IsNullOrWhiteSpace(x.ProductId) &&
                (x.Quantity ?? 0) > 0)
            .ToList();

        var goodsReceive = await _goodsReceiveRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderId == purchaseOrder.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (goodsReceive == null && receivableItems.Count == 0)
        {
            return;
        }

        var isNewGoodsReceive = goodsReceive == null;

        if (isNewGoodsReceive)
        {
            goodsReceive = new GoodsReceive
            {
                CreatedById = userId,
                Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR"),
                PurchaseOrderId = purchaseOrder.Id
            };
        }
        else
        {
            goodsReceive.UpdatedById = userId;
        }

        goodsReceive.ReceiveDate = purchaseOrder.OrderDate;
        goodsReceive.Status = ToGoodsReceiveStatus(purchaseOrder.OrderStatus);
        goodsReceive.Description = purchaseOrder.Description;

        if (goodsReceive.Id == null)
        {
            throw new Exception("Goods receive id not generated.");
        }

        if (isNewGoodsReceive)
        {
            await _goodsReceiveRepository.CreateAsync(goodsReceive, cancellationToken);
        }
        else
        {
            _goodsReceiveRepository.Update(goodsReceive);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == goodsReceive.Id && x.ModuleName == nameof(GoodsReceive))
            .ToListAsync(cancellationToken);

        var validModuleItemIds = receivableItems
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .Select(x => x.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var obsoleteTransaction in inventoryTransactions.Where(x => !validModuleItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            await _inventoryTransactionService.GoodsReceiveDeleteInvenTrans(
                obsoleteTransaction.Id,
                userId,
                cancellationToken
            );
        }

        foreach (var item in receivableItems)
        {
            // Every physical PO item is received into its warehouse in full. Cost
            // allocation is a later outbound movement for the customer portion;
            // it must never reduce or remove the original goods receipt.
            var receivableQuantity = item.Quantity ?? 0d;
            var existingTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);

            if (existingTransaction == null)
            {
                var transaction = await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
                    goodsReceive.Id,
                    item.WarehouseId,
                    item.ProductId,
                    receivableQuantity,
                    userId,
                    item.Id,
                    cancellationToken
                );
                item.PurchaseOrder = purchaseOrder;
                if (purchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed)
                {
                    await _productSerialService.SyncPurchaseOrderItemSerialsAsync(item, transaction, userId, cancellationToken);
                }
            }
            else
            {
                var transaction = await _inventoryTransactionService.GoodsReceiveUpdateInvenTrans(
                    existingTransaction.Id,
                    item.WarehouseId,
                    item.ProductId,
                    receivableQuantity,
                    userId,
                    item.Id,
                    cancellationToken
                );
                item.PurchaseOrder = purchaseOrder;
                if (purchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed)
                {
                    await _productSerialService.SyncPurchaseOrderItemSerialsAsync(item, transaction, userId, cancellationToken);
                }
            }
        }

        await _inventoryTransactionService.PropagateParentUpdate(
            goodsReceive.Id,
            nameof(GoodsReceive),
            goodsReceive.ReceiveDate,
            (InventoryTransactionStatus?)goodsReceive.Status,
            goodsReceive.IsDeleted,
            userId,
            null,
            cancellationToken
        );

        if (purchaseOrder.OrderStatus == PurchaseOrderStatus.Cancelled)
        {
            var itemIds = purchaseOrder.PurchaseOrderItemList.Select(x => x.Id).ToList();
            var serials = await _productSerialRepository.GetQuery().ApplyIsDeletedFilter(false)
                .Where(x => x.PurchaseOrderItemId != null && itemIds.Contains(x.PurchaseOrderItemId))
                .ToListAsync(cancellationToken);
            foreach (var serial in serials)
            {
                serial.UpdatedById = userId;
                _productSerialRepository.Delete(serial);
            }
            if (serials.Count > 0) await _unitOfWork.SaveAsync(cancellationToken);
            await RollbackCashTransactionsAsync(purchaseOrder.Id, userId, cancellationToken);
        }
    }

    public async Task DeleteSynchronizedGoodsReceivesAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        var goodsReceives = await _goodsReceiveRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderId == purchaseOrderId)
            .ToListAsync(cancellationToken);

        foreach (var goodsReceive in goodsReceives)
        {
            goodsReceive.UpdatedById = userId;
            _goodsReceiveRepository.Delete(goodsReceive);
        }

        var itemIds = await _queryContext.Set<PurchaseOrderItem>().AsNoTracking()
            .Where(x => x.PurchaseOrderId == purchaseOrderId).Select(x => x.Id).ToListAsync(cancellationToken);
        var serials = await _productSerialRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderItemId != null && itemIds.Contains(x.PurchaseOrderItemId))
            .ToListAsync(cancellationToken);
        foreach (var serial in serials)
        {
            serial.UpdatedById = userId;
            _productSerialRepository.Delete(serial);
        }
        if (serials.Count > 0) await _unitOfWork.SaveAsync(cancellationToken);

        await RollbackCashTransactionsAsync(purchaseOrderId, userId, cancellationToken);

        await _unitOfWork.SaveAsync(cancellationToken);

        foreach (var goodsReceive in goodsReceives)
        {
            await _inventoryTransactionService.PropagateParentUpdate(
                goodsReceive.Id,
                nameof(GoodsReceive),
                goodsReceive.ReceiveDate,
                (InventoryTransactionStatus?)goodsReceive.Status,
                true,
                userId,
                null,
                cancellationToken
            );
        }
    }

    private async Task RollbackCashTransactionsAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken)
    {
        var transactions = await _cashTransactionRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == purchaseOrderId)
            .ToListAsync(cancellationToken);
        if (transactions.Count == 0)
        {
            return;
        }

        var transactionIds = transactions.Select(x => x.Id).ToList();
        var payments = await _cashTransactionPaymentRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CashTransactionId != null && transactionIds.Contains(x.CashTransactionId))
            .ToListAsync(cancellationToken);
        var allocations = await _cashTransactionCostAllocationRepository.GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CashTransactionId != null && transactionIds.Contains(x.CashTransactionId))
            .ToListAsync(cancellationToken);
        var cashAccountIds = transactions.Select(x => x.CashAccountId)
            .Concat(payments.Select(x => x.CashAccountId))
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();

        foreach (var payment in payments)
        {
            payment.UpdatedById = userId;
            _cashTransactionPaymentRepository.Delete(payment);
        }
        foreach (var allocation in allocations)
        {
            allocation.UpdatedById = userId;
            _cashTransactionCostAllocationRepository.Delete(allocation);
        }
        foreach (var transaction in transactions)
        {
            transaction.UpdatedById = userId;
            _cashTransactionRepository.Delete(transaction);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
        await _cashBalanceService.RecalculateManyAsync(cashAccountIds, cancellationToken);
    }

    private static GoodsReceiveStatus ToGoodsReceiveStatus(PurchaseOrderStatus? status)
    {
        return status switch
        {
            PurchaseOrderStatus.Cancelled => GoodsReceiveStatus.Cancelled,
            PurchaseOrderStatus.Confirmed => GoodsReceiveStatus.Confirmed,
            PurchaseOrderStatus.Archived => GoodsReceiveStatus.Archived,
            _ => GoodsReceiveStatus.Draft
        };
    }
}
