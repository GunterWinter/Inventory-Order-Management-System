using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.ProductSerialManager;
using Application.Features.NumberSequenceManager;
using Application.Features.WarehouseManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public partial class InventoryTransactionService
{
    private readonly NumberSequenceService _numberSequenceService;
    private readonly WarehouseService _warehouseService;
    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<StockCount> _stockCountRepository;
    private readonly ICommandRepository<ProductSerialMovement> _serialMovementRepository;
    private readonly ICommandRepository<MaterialExportItem> _costAllocationRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ProductSerialService _productSerialService;
    private readonly InventoryCostResolver _inventoryCostResolver;

    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<SalesReturn> _salesReturnRepository;

    public InventoryTransactionService(
        NumberSequenceService numberSequenceService,
        WarehouseService warehouseService,
        IQueryContext queryContext,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<StockCount> stockCountRepository,
        ICommandRepository<ProductSerialMovement> serialMovementRepository,
        ICommandRepository<MaterialExportItem> costAllocationRepository,
        IUnitOfWork unitOfWork,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<SalesReturn> salesReturnRepository,
        ProductSerialService productSerialService,
        InventoryCostResolver inventoryCostResolver
        )
    {
        _numberSequenceService = numberSequenceService;
        _warehouseService = warehouseService;
        _queryContext = queryContext;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _stockCountRepository = stockCountRepository;
        _serialMovementRepository = serialMovementRepository;
        _costAllocationRepository = costAllocationRepository;
        _unitOfWork = unitOfWork;
        _salesOrderItemRepository = salesOrderItemRepository;
        _salesReturnRepository = salesReturnRepository;
        _productSerialService = productSerialService;
        _inventoryCostResolver = inventoryCostResolver;
    }

    public decimal GetStock(string? warehouseId, string? productId, string? currentId = null)
    {
        var query = _queryContext
            .Set<InventoryTransaction>()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x =>
                x.Status == InventoryTransactionStatus.Confirmed &&
                x.WarehouseId == warehouseId &&
                x.ProductId == productId &&
                x.Product!.Physical == true);

        if (currentId != null)
        {
            query = query.Where(x => x.Id != currentId);
        }

        return query.Sum(x => x.Stock ?? 0m);
    }

    public async Task PropagateParentUpdate(
        string? moduleId,
        string? moduleName,
        DateTime? movementDate,
        InventoryTransactionStatus? status,
        bool? isDeleted,
        string? updatedId,
        string? warehouseId = null,
        CancellationToken cancellationToken = default
        )
    {
        if (status == InventoryTransactionStatus.Confirmed && IsOutboundStockModule(moduleName))
        {
            await ValidateOutboundStockAsync(moduleId, moduleName, warehouseId, cancellationToken);
        }

        var children = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            // Never resurrect a transaction that was explicitly removed by a
            // line update. Parent synchronization only owns active children.
            .Where(x => !x.IsDeleted && x.ModuleId == moduleId && x.ModuleName == moduleName)
            .Select(x => new { x.Id, x.Status })
            .ToListAsync(cancellationToken);
        var childIds = children.Select(x => x.Id).ToList();
        var alreadyConfirmedIds = children
            .Where(x => x.Status == InventoryTransactionStatus.Confirmed)
            .Select(x => x.Id)
            .ToHashSet();

        foreach (var childId in childIds)
        {
            var item = await _inventoryTransactionRepository.GetAsync(childId ?? string.Empty, cancellationToken);
            if (item == null)
            {
                continue;
            }

            item.MovementDate = movementDate;
            // Archived documents keep the same inventory effect as Confirmed.
            // Archiving is a visibility/workflow state, never an inventory reversal.
            item.Status = status == InventoryTransactionStatus.Archived
                ? InventoryTransactionStatus.Confirmed
                : status;
            item.IsDeleted = isDeleted ?? false;
            item.UpdatedById = updatedId;
            item.UpdatedAtUtc = AppDateTime.VietnamNow();
            if (warehouseId != null)
            {
                item.WarehouseId = warehouseId;
            }
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        foreach (var childId in childIds)
        {
            if (isDeleted == true || status is InventoryTransactionStatus.Cancelled or InventoryTransactionStatus.Draft)
            {
                if (isDeleted == true
                    || status == InventoryTransactionStatus.Cancelled
                    || alreadyConfirmedIds.Contains(childId))
                {
                    await _productSerialService.ReleaseInventoryTransactionSerialsAsync(childId, updatedId, cancellationToken);
                    await DeleteCostAllocationsAsync(childId, updatedId, cancellationToken);
                }
                continue;
            }

            if (status == InventoryTransactionStatus.Archived)
            {
                continue;
            }

            if (status == InventoryTransactionStatus.Confirmed && alreadyConfirmedIds.Contains(childId))
            {
                continue;
            }

            var item = await _inventoryTransactionRepository.GetAsync(childId ?? string.Empty, cancellationToken);
            if (item != null)
            {
                await _productSerialService.ApplyInventoryTransactionSerialsAsync(item, null, updatedId, cancellationToken);
            }
        }
    }

    public async Task ValidateOutboundStockAsync(
        string? moduleId,
        string? moduleName,
        string? warehouseOverrideId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(moduleId) || string.IsNullOrWhiteSpace(moduleName))
        {
            throw new InvalidOperationException("Outbound inventory source is required.");
        }

        var requestedLines = await _queryContext.Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == moduleId
                && x.ModuleName == moduleName
                && x.ProductId != null
                && x.Product != null
                && x.Product.Physical == true
                && (x.Product.SerialTrackingMode == null
                    || x.Product.SerialTrackingMode == SerialTrackingMode.None))
            .Select(x => new
            {
                ProductId = x.ProductId!,
                WarehouseId = warehouseOverrideId ?? x.WarehouseId,
                ProductName = x.Product!.Name,
                Quantity = x.Movement ?? 0m
            })
            .ToListAsync(cancellationToken);

        var requestedGroups = requestedLines
            .Where(x => !string.IsNullOrWhiteSpace(x.WarehouseId) && x.Quantity > 0m)
            .GroupBy(x => new { x.ProductId, x.WarehouseId, x.ProductName })
            .Select(group => new
            {
                group.Key.ProductId,
                WarehouseId = group.Key.WarehouseId!,
                group.Key.ProductName,
                Quantity = group.Sum(x => x.Quantity)
            })
            .ToList();

        foreach (var requested in requestedGroups)
        {
            var availableStock = await _queryContext.Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.Status == InventoryTransactionStatus.Confirmed
                    && x.ProductId == requested.ProductId
                    && x.WarehouseId == requested.WarehouseId
                    && !(x.ModuleId == moduleId && x.ModuleName == moduleName))
                .SumAsync(x => x.Stock ?? 0m, cancellationToken);

            if (requested.Quantity > availableStock + 0.000001m)
            {
                throw new InvalidOperationException(
                    $"Không đủ tồn kho cho {requested.ProductName ?? requested.ProductId}. " +
                    $"Khả dụng: {availableStock}; yêu cầu: {requested.Quantity}.");
            }
        }
    }

    public async Task ValidateSalesReturnReversalAsync(
        string? salesReturnId,
        CancellationToken cancellationToken = default)
    {
        var lines = await _inventoryTransactionRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x => x.ModuleName == nameof(SalesReturn)
                && x.ModuleId == salesReturnId
                && x.Status == InventoryTransactionStatus.Confirmed
                && x.Product != null
                && x.Product.Physical == true
                && (x.Product.SerialTrackingMode == null
                    || x.Product.SerialTrackingMode == SerialTrackingMode.None))
            .Select(x => new
            {
                x.ProductId,
                x.WarehouseId,
                ProductName = x.Product!.Name,
                Quantity = x.Stock ?? 0m
            })
            .ToListAsync(cancellationToken);

        foreach (var group in lines.GroupBy(x => new { x.ProductId, x.WarehouseId, x.ProductName }))
        {
            var currentStock = await _inventoryTransactionRepository.GetQuery()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.Status == InventoryTransactionStatus.Confirmed
                    && x.ProductId == group.Key.ProductId
                    && x.WarehouseId == group.Key.WarehouseId)
                .SumAsync(x => x.Stock ?? 0m, cancellationToken);
            var returnedStock = group.Sum(x => x.Quantity);
            if (currentStock - returnedStock < -0.000001m)
            {
                throw new InvalidOperationException(
                    $"Không thể hoàn tác phiếu trả hàng bán: {group.Key.ProductName ?? "hàng hóa"} " +
                    $"không còn đủ tại kho. Tồn hiện tại: {currentStock}; cần hoàn tác: {returnedStock}. " +
                    "Hãy hoàn tác giao dịch xuất phát sinh sau trước.");
            }
        }
    }

    private static bool IsOutboundStockModule(string? moduleName)
        => moduleName is nameof(PurchaseReturn) or nameof(TransferOut) or nameof(Scrapping);

    private async Task EnsureOutboundParentIsDraftAsync(
        string moduleName,
        string? moduleId,
        CancellationToken cancellationToken)
    {
        var isDraft = moduleName switch
        {
            nameof(PurchaseReturn) => await _queryContext.Set<PurchaseReturn>().AsNoTracking()
                .AnyAsync(x => x.Id == moduleId && !x.IsDeleted && x.Status == PurchaseReturnStatus.Draft, cancellationToken),
            nameof(TransferOut) => await _queryContext.Set<TransferOut>().AsNoTracking()
                .AnyAsync(x => x.Id == moduleId && !x.IsDeleted && x.Status == TransferStatus.Draft, cancellationToken),
            nameof(Scrapping) => await _queryContext.Set<Scrapping>().AsNoTracking()
                .AnyAsync(x => x.Id == moduleId && !x.IsDeleted && x.Status == ScrappingStatus.Draft, cancellationToken),
            _ => false
        };

        if (!isDraft)
        {
            throw new InvalidOperationException("Chỉ được thay đổi dòng hàng khi chứng từ còn ở trạng thái Nháp.");
        }
    }


    public InventoryTransaction CalculateInvenTrans(InventoryTransaction? transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        var moduleName = transaction.ModuleName;

        if (moduleName != nameof(StockCount) && transaction.Movement <= 0m)
        {
            throw new Exception("Số lượng phải lớn hơn 0.");
        }

        if (moduleName == nameof(StockCount)
            && (transaction.QtySCCount == null || transaction.QtySCCount < 0m))
        {
            throw new Exception("Số lượng kiểm kê không được âm.");
        }

        switch (moduleName)
        {
            case nameof(SalesOrder):
                SalesOrderProcessing(transaction);
                break;
            case nameof(PurchaseOrder):
                PurchaseOrderProcessing(transaction);
                break;
            case nameof(SalesReturn):
                SalesReturnProcessing(transaction);
                break;
            case nameof(PurchaseReturn):
                PurchaseReturnProcessing(transaction);
                break;
            case nameof(TransferIn):
                TransferInProcessing(transaction);
                break;
            case nameof(TransferOut):
                TransferOutProcessing(transaction);
                break;
            case nameof(StockCount):
                StockCountProcessing(transaction);
                break;
            case nameof(Scrapping):
                ScrappingProcessing(transaction);
                break;
            case "CostAllocation":
                CostAllocationProcessing(transaction);
                break;
            case nameof(MaterialExport):
                MaterialExportProcessing(transaction);
                break;
            default:
                break;
        }

        return transaction;
    }

    private async Task<List<InventoryTransaction>> EnrichProductSerialsAsync(
        List<InventoryTransaction> transactions,
        CancellationToken cancellationToken = default)
    {
        var transactionIds = transactions.Select(x => x.Id).ToList();
        var serials = await _queryContext
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.ProductSerial)
            .Where(x => transactionIds.Contains(x.InventoryTransactionId!)
                && x.ReversedAtUtc == null
                && (x.ModuleName != nameof(StockCount) || x.Status != ProductSerialStatus.Missing))
            .Select(x => new
            {
                x.InventoryTransactionId,
                ProductSerialId = x.ProductSerialId,
                InternalSerialNumber = x.ProductSerial != null ? x.ProductSerial.InternalSerialNumber : string.Empty
            })
            .ToListAsync(cancellationToken);

        var serialLookup = serials
            .Where(x => !string.IsNullOrWhiteSpace(x.InventoryTransactionId))
            .GroupBy(x => x.InventoryTransactionId!)
            .ToDictionary(x => x.Key, x => x.ToList());

        foreach (var transaction in transactions)
        {
            if (serialLookup.TryGetValue(transaction.Id, out var transactionSerials))
            {
                transaction.ProductSerialIds = transactionSerials
                    .Select(x => x.ProductSerialId)
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Cast<string>()
                    .ToList();
                transaction.ProductSerialNumbers = string.Join(", ", transactionSerials.Select(x => x.InternalSerialNumber));
            }
        }

        return transactions;
    }

    private void CalculateStock(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.Stock = transaction.Movement * (int)(transaction.TransType ?? 0.0);
    }

    private InventoryTransaction SalesOrderProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = _warehouseService.GetCustomerWarehouse()!.Id;

        return transaction;
    }

    private InventoryTransaction PurchaseOrderProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.In;
        CalculateStock(transaction);
        transaction.WarehouseFromId = _warehouseService.GetVendorWarehouse()!.Id;
        transaction.WarehouseToId = transaction.WarehouseId;

        return transaction;
    }

    private InventoryTransaction SalesReturnProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.In;
        CalculateStock(transaction);
        transaction.WarehouseFromId = _warehouseService.GetCustomerWarehouse()!.Id;
        transaction.WarehouseToId = transaction.WarehouseId;

        return transaction;
    }

    private InventoryTransaction PurchaseReturnProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = _warehouseService.GetVendorWarehouse()!.Id;

        return transaction;
    }

    private InventoryTransaction TransferInProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.In;
        CalculateStock(transaction);
        transaction.WarehouseFromId = _warehouseService.GetTransferWarehouse()!.Id;
        transaction.WarehouseToId = transaction.WarehouseId;

        return transaction;
    }

    private InventoryTransaction TransferOutProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = _warehouseService.GetTransferWarehouse()!.Id;

        return transaction;
    }

    private InventoryTransaction StockCountProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.QtySCSys ??= GetStock(transaction.WarehouseId, transaction.ProductId, transaction.Id);
        transaction.QtySCDelta = transaction.QtySCCount - transaction.QtySCSys;
        transaction.Movement = Math.Abs(transaction.QtySCDelta ?? 0m);

        if (transaction.QtySCDelta > 0m)
        {

            transaction.TransType = InventoryTransType.In;
            CalculateStock(transaction);
            transaction.WarehouseFromId = _warehouseService.GetStockCountWarehouse()!.Id;
            transaction.WarehouseToId = transaction.WarehouseId;

        }
        else
        {

            transaction.TransType = InventoryTransType.Out;
            CalculateStock(transaction);
            transaction.WarehouseFromId = transaction.WarehouseId;
            transaction.WarehouseToId = _warehouseService.GetStockCountWarehouse()!.Id;

        }

        return transaction;
    }

    private InventoryTransaction ScrappingProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = _warehouseService.GetScrappingWarehouse()!.Id;

        return transaction;
    }

    private InventoryTransaction CostAllocationProcessing(InventoryTransaction transaction)
    {
        if (transaction == null)
        {
            throw new Exception("Inventory transaction is null");
        }

        transaction.TransType = InventoryTransType.Out;
        CalculateStock(transaction);
        transaction.WarehouseFromId = transaction.WarehouseId;
        transaction.WarehouseToId = _warehouseService.GetCustomerWarehouse()!.Id;

        return transaction;
    }

}
