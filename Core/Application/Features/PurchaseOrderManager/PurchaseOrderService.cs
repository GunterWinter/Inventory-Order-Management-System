using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager;

public class PurchaseOrderService
{
    private readonly ICommandRepository<PurchaseOrder> _orderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _itemRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryRepository;
    private readonly ICommandRepository<ProductSerial> _serialRepository;
    private readonly ICommandRepository<PurchaseOrderCostAllocation> _costAllocationRepository;
    private readonly ICommandRepository<CashTransaction> _cashRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequence;
    private readonly InventoryTransactionService _inventoryService;
    private readonly ProductSerialService _serialService;
    private readonly CashBalanceService _cashBalanceService;

    public PurchaseOrderService(
        ICommandRepository<PurchaseOrder> orderRepository,
        ICommandRepository<PurchaseOrderItem> itemRepository,
        ICommandRepository<InventoryTransaction> inventoryRepository,
        ICommandRepository<ProductSerial> serialRepository,
        ICommandRepository<PurchaseOrderCostAllocation> costAllocationRepository,
        ICommandRepository<CashTransaction> cashRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequence,
        InventoryTransactionService inventoryService,
        ProductSerialService serialService,
        CashBalanceService cashBalanceService)
    {
        _orderRepository = orderRepository;
        _itemRepository = itemRepository;
        _inventoryRepository = inventoryRepository;
        _serialRepository = serialRepository;
        _costAllocationRepository = costAllocationRepository;
        _cashRepository = cashRepository;
        _paymentRepository = paymentRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequence = numberSequence;
        _inventoryService = inventoryService;
        _serialService = serialService;
        _cashBalanceService = cashBalanceService;
    }

    public void Recalculate(string orderId)
    {
        var order = _orderRepository.GetQuery().ApplyIsDeletedFilter().SingleOrDefault(x => x.Id == orderId);
        if (order == null) return;
        var items = _itemRepository.GetQuery().ApplyIsDeletedFilter().Where(x => x.PurchaseOrderId == orderId).ToList();
        order.BeforeTaxAmount = items.Sum(x => x.Total ?? 0m);
        order.TaxAmount = items.Sum(x => x.TaxAmount ?? 0m);
        order.AfterTaxAmount = items.Sum(x => x.AfterTaxAmount ?? ((x.Total ?? 0m) + (x.TaxAmount ?? 0m)));
        _orderRepository.Update(order);
        _unitOfWork.Save();
    }

    public async Task<CashTransaction> EnsureVendorObligationAsync(string orderId, string? userId, CancellationToken ct = default)
    {
        var order = await _orderRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Include(x => x.Vendor).Include(x => x.PurchaseOrderItemList.Where(i => !i.IsDeleted))
            .SingleAsync(x => x.Id == orderId, ct);
        var obligation = await _cashRepository.GetQuery().ApplyIsDeletedFilter(false)
            .SingleOrDefaultAsync(x => x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == order.Id
                && x.TransactionType == CashTransactionType.Credit, ct);
        var isNew = obligation == null;
        obligation ??= new CashTransaction
        {
            CreatedById = userId,
            Number = _numberSequence.GenerateNumber(nameof(CashTransaction), string.Empty, "CT"),
            SourceModule = nameof(PurchaseOrder), SourceModuleId = order.Id,
            TransactionType = CashTransactionType.Credit, PaidAmount = 0m
        };
        var amount = order.AfterTaxAmount ?? order.PurchaseOrderItemList.Sum(x => x.AfterTaxAmount ?? 0m);
        var paid = obligation.PaidAmount ?? 0m;
        if (paid > amount + 0.000001m)
            throw new InvalidOperationException("Purchase-order total cannot be lower than the amount already paid.");
        obligation.TransactionDate = order.OrderDate;
        obligation.Amount = amount;
        obligation.Status = PaymentStatus(paid, amount);
        obligation.Description = $"{order.Vendor?.Name} - {order.Number}".Trim(' ', '-');
        obligation.CustomerId = null;
        obligation.VendorId = order.VendorId;
        obligation.SourceModuleNumber = order.Number;
        if (isNew) await _cashRepository.CreateAsync(obligation, ct);
        else { obligation.UpdatedById = userId; _cashRepository.Update(obligation); }
        await _unitOfWork.SaveAsync(ct);
        return obligation;
    }

    public async Task SynchronizeInventoryAsync(string orderId, string? userId, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(orderId)) return;
        var order = await _orderRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Include(x => x.PurchaseOrderItemList.Where(i => !i.IsDeleted)).ThenInclude(x => x.Product)
            .SingleOrDefaultAsync(x => x.Id == orderId, ct);
        if (order == null) return;

        var physicalItems = order.PurchaseOrderItemList.Where(IsPhysicalInventoryItem).ToList();
        var transactions = await _inventoryRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(PurchaseOrder) && x.ModuleId == order.Id).ToListAsync(ct);

        if (order.OrderStatus == PurchaseOrderStatus.Cancelled)
        {
            await ValidateCancellationAsync(order, transactions, ct);
            foreach (var transaction in transactions)
            {
                transaction.Status = InventoryTransactionStatus.Cancelled;
                transaction.UpdatedById = userId;
                _inventoryRepository.Update(transaction);
                await _serialService.ReleaseInventoryTransactionSerialsAsync(transaction.Id, userId, ct);
            }
            await DeleteUnpaidObligationAsync(order.Id, userId, ct);
            await _unitOfWork.SaveAsync(ct);
            return;
        }

        var validIds = physicalItems.Select(x => x.Id).ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var obsolete in transactions.Where(x => !validIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            if (obsolete.Status == InventoryTransactionStatus.Confirmed)
                throw new InvalidOperationException("Confirmed purchase-order inventory lines cannot be removed.");
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
                    Number = _numberSequence.GenerateNumber(nameof(InventoryTransaction), string.Empty, "IVT"),
                    ModuleId = order.Id, ModuleName = nameof(PurchaseOrder), ModuleCode = "PO-",
                    ModuleNumber = order.Number, ModuleItemId = item.Id
                };
                await _inventoryRepository.CreateAsync(transaction, ct);
            }
            else { transaction.UpdatedById = userId; _inventoryRepository.Update(transaction); }
            transaction.MovementDate = order.OrderDate;
            transaction.Status = ToInventoryStatus(order.OrderStatus);
            transaction.WarehouseId = item.WarehouseId;
            transaction.ProductId = item.ProductId;
            transaction.Movement = item.Quantity;
            _inventoryService.CalculateInvenTrans(transaction);
        }
        await _unitOfWork.SaveAsync(ct);

        foreach (var item in physicalItems)
        {
            var transaction = await _inventoryRepository.GetQuery().ApplyIsDeletedFilter(false)
                .SingleAsync(x => x.ModuleName == nameof(PurchaseOrder) && x.ModuleId == order.Id && x.ModuleItemId == item.Id, ct);
            item.PurchaseOrder = order;
            await _serialService.SyncPurchaseOrderItemSerialsAsync(item, transaction, userId, ct);
        }
    }

    public async Task DeleteSynchronizedInventoryAsync(string orderId, string? userId, CancellationToken ct = default)
    {
        var transactions = await _inventoryRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleName == nameof(PurchaseOrder) && x.ModuleId == orderId).ToListAsync(ct);
        if (transactions.Any(x => x.Status == InventoryTransactionStatus.Confirmed))
            throw new InvalidOperationException("A confirmed purchase order cannot be deleted.");
        foreach (var transaction in transactions)
        {
            await _serialService.ReleaseInventoryTransactionSerialsAsync(transaction.Id, userId, ct);
            _inventoryRepository.Delete(transaction);
        }
        var itemIds = await _queryContext.Set<PurchaseOrderItem>().Where(x => x.PurchaseOrderId == orderId).Select(x => x.Id).ToListAsync(ct);
        var serials = await _serialRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderItemId != null && itemIds.Contains(x.PurchaseOrderItemId)).ToListAsync(ct);
        foreach (var serial in serials) _serialRepository.Delete(serial);
        await DeleteUnpaidObligationAsync(orderId, userId, ct);
        await _unitOfWork.SaveAsync(ct);
    }

    private async Task ValidateCancellationAsync(PurchaseOrder order, List<InventoryTransaction> transactions, CancellationToken ct)
    {
        if (await _paymentRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.CashTransaction != null
            && !x.CashTransaction.IsDeleted && x.CashTransaction.SourceModule == nameof(PurchaseOrder)
            && x.CashTransaction.SourceModuleId == order.Id && x.Amount > 0m, ct))
            throw new InvalidOperationException($"Không thể hủy PO {order.Number} vì đã có lịch sử thanh toán. Hãy hoàn tác các lần thanh toán trước.");
        if (await _queryContext.Set<PurchaseReturn>().AnyAsync(x => !x.IsDeleted && x.PurchaseOrderId == order.Id
            && x.Status != PurchaseReturnStatus.Cancelled, ct))
            throw new InvalidOperationException($"Không thể hủy PO {order.Number} vì còn phiếu trả hàng mua đang hiệu lực. Hãy hủy phiếu trả hàng trước.");
        if (await _costAllocationRepository.GetQuery().AnyAsync(x => !x.IsDeleted && x.PurchaseOrderId == order.Id
            && x.CustomerId != null && (x.Quantity ?? 0m) > 0m, ct))
            throw new InvalidOperationException($"Không thể hủy PO {order.Number} vì vật tư đã được phân bổ cho công trình. Hãy hoàn tác phân bổ trước.");

        var itemIds = order.PurchaseOrderItemList.Select(x => x.Id).ToList();
        var serials = await _serialRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.CurrentWarehouse)
            .Include(x => x.PurchaseOrderItem).ThenInclude(x => x!.Warehouse)
            .Include(x => x.SalesOrderItem).ThenInclude(x => x!.SalesOrder)
            .Where(x => x.PurchaseOrderItemId != null && itemIds.Contains(x.PurchaseOrderItemId))
            .ToListAsync(ct);

        foreach (var serial in serials)
        {
            var originalWarehouseId = serial.PurchaseOrderItem?.WarehouseId;
            var originalWarehouseName = serial.PurchaseOrderItem?.Warehouse?.Name ?? "kho nhập ban đầu";
            var serialNumber = serial.ManufacturerSerialNumber ?? serial.InternalSerialNumber ?? serial.Id;
            var productName = serial.Product?.Name ?? "hàng hóa";
            var isBackInStock = serial.Status is ProductSerialStatus.InStock or ProductSerialStatus.ReturnedByCustomer;
            var isAtOriginalWarehouse = string.Equals(
                serial.CurrentWarehouseId,
                originalWarehouseId,
                StringComparison.OrdinalIgnoreCase);
            if (isBackInStock && isAtOriginalWarehouse)
            {
                continue;
            }

            var dependentDocument = serial.Status == ProductSerialStatus.Sold
                ? $"SO {serial.SalesOrderItem?.SalesOrder?.Number ?? "không xác định"}"
                : await _queryContext.Set<ProductSerialMovement>()
                    .AsNoTracking()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.ProductSerialId == serial.Id && x.ReversedAtUtc == null)
                    .OrderByDescending(x => x.MovementDate)
                    .ThenByDescending(x => x.CreatedAtUtc)
                    .Select(x => x.InventoryTransaction != null
                        ? (x.InventoryTransaction.ModuleNumber ?? x.InventoryTransaction.Number)
                        : (x.ModuleName ?? x.ModuleId))
                    .FirstOrDefaultAsync(ct) ?? "chứng từ phát sinh sau";

            var currentLocation = serial.CurrentWarehouse?.Name ?? "ngoài kho";
            throw new InvalidOperationException(
                $"Không thể hủy PO {order.Number}: serial {serialNumber} của {productName} " +
                $"đang ở trạng thái {serial.Status} tại {currentLocation}, liên quan {dependentDocument}. " +
                $"Cần trả serial về đúng {originalWarehouseName} trước khi hủy.");
        }

        foreach (var transaction in transactions.Where(x => x.Status == InventoryTransactionStatus.Confirmed))
        {
            var balanceWithoutReceipt = await _queryContext.Set<InventoryTransaction>().AsNoTracking()
                .Where(x => !x.IsDeleted && x.Status == InventoryTransactionStatus.Confirmed
                    && x.ProductId == transaction.ProductId && x.WarehouseId == transaction.WarehouseId && x.Id != transaction.Id)
                .SumAsync(x => x.Stock ?? 0m, ct);
            if (balanceWithoutReceipt < -0.000001m)
            {
                var product = order.PurchaseOrderItemList.FirstOrDefault(x => x.Id == transaction.ModuleItemId)?.Product;
                var warehouse = order.PurchaseOrderItemList.FirstOrDefault(x => x.Id == transaction.ModuleItemId)?.Warehouse;
                throw new InvalidOperationException(
                    $"Không thể hủy PO {order.Number}: tồn của {product?.Name ?? "hàng hóa"} tại " +
                    $"{warehouse?.Name ?? "kho nhập"} không đủ để hoàn tác số lượng {transaction.Movement ?? 0m}. " +
                    "Hàng đã được xuất dùng hoặc chuyển đi; cần hoàn tác chứng từ phụ thuộc trước.");
            }
        }
    }

    private async Task DeleteUnpaidObligationAsync(string orderId, string? userId, CancellationToken ct)
    {
        var transactions = await _cashRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == orderId).ToListAsync(ct);
        var accounts = transactions.Select(x => x.CashAccountId).ToList();
        foreach (var transaction in transactions)
        {
            if ((transaction.PaidAmount ?? 0m) > 0m)
                throw new InvalidOperationException("Không thể hủy đơn mua hàng đã phát sinh thanh toán. Hãy hoàn tác thanh toán trước.");
            transaction.UpdatedById = userId;
            _cashRepository.Delete(transaction);
        }
        await _unitOfWork.SaveAsync(ct);
        await _cashBalanceService.RecalculateManyAsync(accounts, ct);
    }

    private static bool IsPhysicalInventoryItem(PurchaseOrderItem item) => item.Product?.Physical == true
        && !string.IsNullOrWhiteSpace(item.ProductId) && !string.IsNullOrWhiteSpace(item.WarehouseId)
        && (item.Quantity ?? 0m) > 0m;
    private static InventoryTransactionStatus ToInventoryStatus(PurchaseOrderStatus? status) => status switch
    {
        PurchaseOrderStatus.Confirmed or PurchaseOrderStatus.Archived => InventoryTransactionStatus.Confirmed,
        PurchaseOrderStatus.Cancelled => InventoryTransactionStatus.Cancelled,
        _ => InventoryTransactionStatus.Draft
    };
    private static CashTransactionStatus PaymentStatus(decimal paid, decimal amount) => amount <= 0m || paid >= amount
        ? CashTransactionStatus.Paid : paid > 0m ? CashTransactionStatus.PartiallyPaid : CashTransactionStatus.Unpaid;
}
