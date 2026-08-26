using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.ProductManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public readonly record struct InventoryUnitCostResolution(
    decimal UnitCost,
    string CostSource,
    bool IsFallbackCost,
    bool IncludesOpeningStock = false,
    bool IncludesPurchase = false);

public readonly record struct InventorySerialCostResolution(
    decimal UnitCost,
    string SourceKey,
    string CostSource);

public readonly record struct InventoryCostSlice(
    string SourceInventoryTransactionId,
    string? SourceCostAllocationId,
    string? PurchaseOrderItemId,
    string? SourceModule,
    string? SourceNumber,
    DateTime? SourceDate,
    decimal Quantity,
    decimal UnitCost,
    string CostSource);

public sealed record InventoryFifoCostResolution(
    decimal UnitCost,
    decimal TotalCost,
    string CostSource,
    bool IncludesOpeningStock,
    bool IncludesPurchase,
    IReadOnlyList<InventoryCostSlice> Slices);

public sealed class InventoryCostResolver
{
    private const decimal QuantityTolerance = 0.000001m;

    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<PurchaseOrderCostAllocation> _purchaseOrderCostAllocationRepository;
    private readonly ICommandRepository<PurchaseReturn> _purchaseReturnRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<MaterialExportItem> _costAllocationRepository;
    private readonly ICommandRepository<Product> _productRepository;
    private readonly Dictionary<(string ProductId, string WarehouseId), InventoryUnitCostResolution> _weightedCache = [];

    public InventoryCostResolver(
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<PurchaseOrderCostAllocation> purchaseOrderCostAllocationRepository,
        ICommandRepository<PurchaseReturn> purchaseReturnRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<MaterialExportItem> costAllocationRepository,
        ICommandRepository<Product> productRepository)
    {
        _productSerialRepository = productSerialRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _purchaseOrderCostAllocationRepository = purchaseOrderCostAllocationRepository;
        _purchaseReturnRepository = purchaseReturnRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _costAllocationRepository = costAllocationRepository;
        _productRepository = productRepository;
    }

    public async Task<InventoryUnitCostResolution> ResolveAsync(
        string? productId,
        string? warehouseId,
        string? salesOrderItemId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(productId))
        {
            throw new InvalidOperationException("Không xác định được hàng hóa để tính giá vốn.");
        }

        if (!string.IsNullOrWhiteSpace(salesOrderItemId))
        {
            var serialCosts = await _productSerialRepository.GetQuery()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderItemId == salesOrderItemId)
                .Select(x => new
                {
                    SerialUnitCost = x.UnitCost,
                    PurchaseUnitCost = x.PurchaseOrderItem != null
                        ? x.PurchaseOrderItem.UnitPrice
                        : null,
                    IsOpeningStock = x.PurchaseOrderItemId == null
                })
                .ToListAsync(cancellationToken);
            if (serialCosts.Count > 0)
            {
                var resolvedSerialCosts = serialCosts
                    .Select(x => new
                    {
                        UnitCost = IsValidCost(x.SerialUnitCost)
                            ? x.SerialUnitCost
                            : IsValidCost(x.PurchaseUnitCost)
                                ? x.PurchaseUnitCost
                                : null,
                        x.IsOpeningStock
                    })
                    .ToList();
                var usedFallback = resolvedSerialCosts.Any(x => !x.UnitCost.HasValue);
                var fallbackCost = usedFallback
                    ? RequireFallbackCost(await GetFallbackCostAsync(productId, cancellationToken), productId)
                    : 0m;
                var source = serialCosts.All(x => x.IsOpeningStock)
                    ? "Giá vốn tồn đầu kỳ"
                    : serialCosts.Any(x => x.IsOpeningStock)
                        ? "Giá vốn theo serial (hỗn hợp)"
                        : "PO theo serial";
                if (usedFallback)
                {
                    source += " (có giá vốn hàng hóa dự phòng)";
                }
                return new InventoryUnitCostResolution(
                    resolvedSerialCosts.Average(x => x.UnitCost ?? fallbackCost),
                    source,
                    usedFallback,
                    serialCosts.Any(x => x.IsOpeningStock),
                    serialCosts.Any(x => !x.IsOpeningStock));
            }
        }

        var cacheKey = (productId, warehouseId ?? string.Empty);
        if (_weightedCache.TryGetValue(cacheKey, out var cached))
        {
            return cached;
        }

        var resolved = await ResolveWeightedAsync(productId, warehouseId, cancellationToken);
        _weightedCache[cacheKey] = resolved;
        return resolved;
    }

    public async Task<InventoryUnitCostResolution> ResolveMaterialExportFifoAsync(
        string? productId,
        string? warehouseId,
        decimal quantity,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(productId))
        {
            throw new InvalidOperationException("Không xác định được hàng hóa để tính giá vốn FIFO.");
        }
        if (string.IsNullOrWhiteSpace(warehouseId))
        {
            throw new InvalidOperationException("Không xác định được kho để tính giá vốn FIFO.");
        }
        if (quantity <= QuantityTolerance)
        {
            throw new InvalidOperationException("Số lượng xuất FIFO phải lớn hơn 0.");
        }

        var inventoryRows = await _inventoryTransactionRepository.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && (x.Status == InventoryTransactionStatus.Confirmed
                    || x.Status == InventoryTransactionStatus.Archived)
                && x.ProductId == productId
                && x.WarehouseId == warehouseId
                && (x.Stock ?? 0m) != 0m)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.ModuleName,
                x.ModuleCode,
                x.ModuleId,
                x.ModuleItemId,
                Stock = x.Stock ?? 0m,
                x.UnitCost
            })
            .ToListAsync(cancellationToken);

        var purchaseItemIds = inventoryRows
            .Where(x => x.ModuleName == nameof(PurchaseOrder)
                && !string.IsNullOrWhiteSpace(x.ModuleItemId))
            .Select(x => x.ModuleItemId!)
            .Distinct()
            .ToList();
        var purchaseCosts = await _purchaseOrderItemRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => purchaseItemIds.Contains(x.Id))
            .Select(x => new { x.Id, x.UnitPrice })
            .ToDictionaryAsync(x => x.Id, x => x.UnitPrice, cancellationToken);

        var allocationIds = inventoryRows
            .Where(x => x.ModuleName == "CostAllocation"
                && !string.IsNullOrWhiteSpace(x.ModuleId))
            .Select(x => x.ModuleId!)
            .Distinct()
            .ToList();
        var allocationSources = await _purchaseOrderCostAllocationRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => allocationIds.Contains(x.Id))
            .Select(x => new { x.Id, x.PurchaseOrderItemId })
            .ToDictionaryAsync(x => x.Id, x => x.PurchaseOrderItemId, cancellationToken);

        var salesReturnSourceItemIds = inventoryRows
            .Where(x => x.ModuleName == nameof(SalesReturn)
                && !string.IsNullOrWhiteSpace(x.ModuleItemId))
            .Select(x => x.ModuleItemId!)
            .Distinct()
            .ToList();
        var salesReturnSourceRows = await _salesOrderItemRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => salesReturnSourceItemIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Quantity, x.CogsAmount })
            .ToListAsync(cancellationToken);
        var salesReturnCosts = salesReturnSourceRows.ToDictionary(
            x => x.Id,
            x => (x.Quantity ?? 0m) > QuantityTolerance && x.CogsAmount.HasValue
                ? x.CogsAmount.Value / x.Quantity!.Value
                : (decimal?)null);

        var fallbackCost = await GetFallbackCostAsync(productId, cancellationToken);
        var layers = new List<InventoryFifoLayer>();
        var pendingOutflow = 0m;

        foreach (var row in inventoryRows)
        {
            if (row.Stock > QuantityTolerance)
            {
                var layerQuantity = row.Stock;
                if (pendingOutflow > QuantityTolerance)
                {
                    var offset = Math.Min(layerQuantity, pendingOutflow);
                    layerQuantity -= offset;
                    pendingOutflow -= offset;
                }
                if (layerQuantity <= QuantityTolerance)
                {
                    continue;
                }

                var includesOpeningStock = row.ModuleName == nameof(StockCount)
                    && row.ModuleCode == ProductOpeningStockService.OpeningStockModuleCode;
                var includesPurchase = row.ModuleName == nameof(PurchaseOrder);
                decimal? sourceCost = row.UnitCost;
                string? layerPurchaseItemId = null;

                if (includesPurchase && !string.IsNullOrWhiteSpace(row.ModuleItemId))
                {
                    layerPurchaseItemId = row.ModuleItemId;
                    if (purchaseCosts.TryGetValue(row.ModuleItemId, out var purchaseCost))
                    {
                        sourceCost = purchaseCost;
                    }
                }
                else if (row.ModuleName == nameof(SalesReturn)
                    && !string.IsNullOrWhiteSpace(row.ModuleItemId)
                    && salesReturnCosts.TryGetValue(row.ModuleItemId, out var returnedCost))
                {
                    sourceCost = returnedCost;
                }

                var isFallback = !IsValidCost(sourceCost);
                var unitCost = isFallback
                    ? RequireFallbackCost(fallbackCost, productId)
                    : sourceCost!.Value;
                layers.Add(new InventoryFifoLayer(
                    layerQuantity,
                    unitCost,
                    layerPurchaseItemId,
                    isFallback,
                    includesOpeningStock,
                    includesPurchase));
                continue;
            }

            var outboundQuantity = -row.Stock;
            string? sourcePurchaseItemId = null;
            if (row.ModuleName == nameof(PurchaseReturn))
            {
                sourcePurchaseItemId = row.ModuleItemId;
            }
            else if (row.ModuleName == "CostAllocation"
                && !string.IsNullOrWhiteSpace(row.ModuleId)
                && allocationSources.TryGetValue(row.ModuleId, out var allocatedPurchaseItemId))
            {
                sourcePurchaseItemId = allocatedPurchaseItemId;
            }

            if (!string.IsNullOrWhiteSpace(sourcePurchaseItemId))
            {
                outboundQuantity = ConsumeFifoQuantity(
                    layers,
                    outboundQuantity,
                    layer => layer.PurchaseOrderItemId == sourcePurchaseItemId);
            }
            outboundQuantity = ConsumeFifoQuantity(layers, outboundQuantity, _ => true);
            pendingOutflow += outboundQuantity;
        }

        var remaining = quantity;
        var totalCost = 0m;
        var usedFallback = false;
        var includesOpening = false;
        var includesPurchaseReceipt = false;
        foreach (var layer in layers)
        {
            if (remaining <= QuantityTolerance)
            {
                break;
            }
            if (layer.Quantity <= QuantityTolerance)
            {
                continue;
            }

            var consumed = Math.Min(layer.Quantity, remaining);
            totalCost += consumed * layer.UnitCost;
            remaining -= consumed;
            usedFallback |= layer.IsFallbackCost;
            includesOpening |= layer.IncludesOpeningStock;
            includesPurchaseReceipt |= layer.IncludesPurchase;
        }

        if (remaining > QuantityTolerance)
        {
            var fifoAvailable = quantity - remaining;
            throw new InvalidOperationException(
                $"Không đủ lớp tồn FIFO cho hàng hóa. Cần {quantity}, còn {fifoAvailable}.");
        }

        var source = includesOpening && includesPurchaseReceipt
            ? "FIFO tồn đầu kỳ và PO"
            : includesOpening
                ? "FIFO tồn đầu kỳ"
                : includesPurchaseReceipt
                    ? "FIFO PO"
                    : "FIFO giao dịch nhập kho";
        if (usedFallback)
        {
            source += " (có giá vốn hàng hóa dự phòng)";
        }

        return new InventoryUnitCostResolution(
            totalCost / quantity,
            source,
            usedFallback,
            includesOpening,
            includesPurchaseReceipt);
    }

    public async Task<InventoryFifoCostResolution> ResolveFifoAsync(
        string? productId,
        string? warehouseId,
        decimal quantity,
        DateTime? businessDate,
        string? excludedInventoryTransactionId = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(productId) || string.IsNullOrWhiteSpace(warehouseId))
            throw new InvalidOperationException("Phải xác định hàng hóa và kho để tính giá vốn FIFO.");
        if (quantity <= QuantityTolerance)
            throw new InvalidOperationException("Số lượng xuất FIFO phải lớn hơn 0.");

        var nextBusinessDate = (businessDate ?? AppDateTime.VietnamNow()).Date.AddDays(1);
        var rows = await _inventoryTransactionRepository.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && (x.Status == InventoryTransactionStatus.Confirmed || x.Status == InventoryTransactionStatus.Archived)
                && x.ProductId == productId
                && x.WarehouseId == warehouseId
                && x.Id != excludedInventoryTransactionId
                && (x.MovementDate ?? x.CreatedAtUtc) < nextBusinessDate
                && (x.Stock ?? 0m) != 0m)
            .OrderBy(x => x.MovementDate ?? x.CreatedAtUtc)
            .ThenBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.ModuleName,
                x.ModuleCode,
                x.ModuleId,
                x.ModuleItemId,
                x.ModuleNumber,
                x.MovementDate,
                x.CreatedAtUtc,
                Stock = x.Stock ?? 0m,
                x.UnitCost
            })
            .ToListAsync(cancellationToken);

        var purchaseItemIds = rows
            .Where(x => x.ModuleName == nameof(PurchaseOrder) && x.ModuleItemId != null)
            .Select(x => x.ModuleItemId!)
            .Distinct()
            .ToList();
        var purchaseCosts = await _purchaseOrderItemRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => purchaseItemIds.Contains(x.Id))
            .Select(x => new { x.Id, x.UnitPrice })
            .ToDictionaryAsync(x => x.Id, x => x.UnitPrice, cancellationToken);

        var purchaseAllocationIds = rows
            .Where(x => x.ModuleName == "CostAllocation" && x.ModuleId != null)
            .Select(x => x.ModuleId!)
            .Distinct()
            .ToList();
        var purchaseAllocationSources = await _purchaseOrderCostAllocationRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => purchaseAllocationIds.Contains(x.Id))
            .Select(x => new { x.Id, x.PurchaseOrderItemId })
            .ToDictionaryAsync(x => x.Id, x => x.PurchaseOrderItemId, cancellationToken);

        var salesReturnItemIds = rows
            .Where(x => x.ModuleName == nameof(SalesReturn) && x.ModuleItemId != null)
            .Select(x => x.ModuleItemId!)
            .Distinct()
            .ToList();
        var legacyReturnCosts = await _salesOrderItemRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => salesReturnItemIds.Contains(x.Id))
            .Select(x => new { x.Id, x.Quantity, x.CogsAmount })
            .ToDictionaryAsync(
                x => x.Id,
                x => (x.Quantity ?? 0m) > QuantityTolerance && x.CogsAmount.HasValue
                    ? x.CogsAmount.Value / x.Quantity!.Value
                    : (decimal?)null,
                cancellationToken);

        var rowIds = rows.Select(x => x.Id).ToList();
        var allocations = await _costAllocationRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId != null && rowIds.Contains(x.InventoryTransactionId))
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.InventoryTransactionId,
                x.SourceInventoryTransactionId,
                x.SourceCostAllocationId,
                Quantity = x.Quantity ?? 0m,
                x.UnitPrice,
                x.CostSource
            })
            .ToListAsync(cancellationToken);

        var layers = new List<DocumentFifoLayer>();
        foreach (var row in rows)
        {
            if (row.Stock > QuantityTolerance)
            {
                var returnedAllocations = row.ModuleName == nameof(SalesReturn)
                    ? allocations.Where(x => x.InventoryTransactionId == row.Id).ToList()
                    : [];
                if (returnedAllocations.Count > 0)
                {
                    foreach (var returned in returnedAllocations)
                    {
                        if (returned.Quantity <= QuantityTolerance || !IsValidCost(returned.UnitPrice))
                            throw new InvalidOperationException($"Phiếu trả hàng {row.ModuleNumber ?? row.Id} thiếu lớp giá vốn hợp lệ.");
                        layers.Add(new DocumentFifoLayer(
                            returned.Quantity,
                            returned.UnitPrice!.Value,
                            row.Id,
                            returned.Id,
                            null,
                            row.ModuleName,
                            row.ModuleNumber,
                            row.MovementDate ?? row.CreatedAtUtc,
                            returned.CostSource ?? "Giá vốn trả hàng theo lớp đã bán",
                            false,
                            false));
                    }
                    continue;
                }

                decimal? unitCost = row.UnitCost;
                string? purchaseOrderItemId = null;
                var isOpening = row.ModuleName == nameof(StockCount)
                    && row.ModuleCode == ProductOpeningStockService.OpeningStockModuleCode;
                var isPurchase = row.ModuleName == nameof(PurchaseOrder);
                if (isPurchase && row.ModuleItemId != null)
                {
                    purchaseOrderItemId = row.ModuleItemId;
                    if (purchaseCosts.TryGetValue(row.ModuleItemId, out var purchaseCost)) unitCost = purchaseCost;
                }
                else if (row.ModuleName == nameof(SalesReturn) && row.ModuleItemId != null
                    && legacyReturnCosts.TryGetValue(row.ModuleItemId, out var returnCost))
                {
                    unitCost = returnCost;
                }
                if (!IsValidCost(unitCost))
                    throw new InvalidOperationException($"Chứng từ nguồn {row.ModuleNumber ?? row.Id} chưa có giá vốn hợp lệ.");

                layers.Add(new DocumentFifoLayer(
                    row.Stock,
                    unitCost!.Value,
                    row.Id,
                    null,
                    purchaseOrderItemId,
                    row.ModuleName,
                    row.ModuleNumber,
                    row.MovementDate ?? row.CreatedAtUtc,
                    isOpening ? "Tồn đầu kỳ" : isPurchase ? "Đơn mua hàng" : row.ModuleName ?? "Nhập kho",
                    isOpening,
                    isPurchase));
                continue;
            }

            var outbound = -row.Stock;
            var frozen = allocations
                .Where(x => x.InventoryTransactionId == row.Id && x.SourceInventoryTransactionId != null)
                .ToList();
            foreach (var allocation in frozen)
            {
                var remainder = ConsumeDocumentFifoQuantity(
                    layers,
                    allocation.Quantity,
                    x => x.SourceInventoryTransactionId == allocation.SourceInventoryTransactionId
                        && x.SourceCostAllocationId == allocation.SourceCostAllocationId);
                if (remainder > QuantityTolerance)
                    throw new InvalidOperationException($"Lớp giá vốn đã chốt của {row.ModuleNumber ?? row.Id} không còn khớp lịch sử kho.");
                outbound -= allocation.Quantity;
            }
            if (outbound <= QuantityTolerance) continue;

            string? targetedPurchaseItemId = null;
            if (row.ModuleName == nameof(PurchaseReturn)) targetedPurchaseItemId = row.ModuleItemId;
            else if (row.ModuleName == "CostAllocation" && row.ModuleId != null)
                purchaseAllocationSources.TryGetValue(row.ModuleId, out targetedPurchaseItemId);

            if (targetedPurchaseItemId != null)
                outbound = ConsumeDocumentFifoQuantity(layers, outbound, x => x.PurchaseOrderItemId == targetedPurchaseItemId);
            outbound = ConsumeDocumentFifoQuantity(layers, outbound, _ => true);
            if (outbound > QuantityTolerance)
                throw new InvalidOperationException($"Tồn kho bị âm theo ngày chứng từ tại {row.ModuleNumber ?? row.Id}. Hãy nhập đủ chứng từ nhận hàng trước khi xác nhận.");
        }

        var remaining = quantity;
        var slices = new List<InventoryCostSlice>();
        foreach (var layer in layers)
        {
            if (remaining <= QuantityTolerance) break;
            if (layer.Quantity <= QuantityTolerance) continue;
            var consumed = Math.Min(layer.Quantity, remaining);
            slices.Add(new InventoryCostSlice(
                layer.SourceInventoryTransactionId,
                layer.SourceCostAllocationId,
                layer.PurchaseOrderItemId,
                layer.SourceModule,
                layer.SourceNumber,
                layer.SourceDate,
                consumed,
                layer.UnitCost,
                layer.CostSource));
            remaining -= consumed;
        }
        if (remaining > QuantityTolerance)
            throw new InvalidOperationException($"Không đủ lớp tồn FIFO. Cần {quantity}, còn {quantity - remaining} theo ngày chứng từ.");

        var totalCost = AccountingMath.RoundVnd(slices.Sum(x => x.Quantity * x.UnitCost));
        var includesOpening = slices.Any(x => x.SourceModule == nameof(StockCount));
        var includesPurchase = slices.Any(x => x.SourceModule == nameof(PurchaseOrder));
        var source = includesOpening && includesPurchase
            ? "FIFO tồn đầu kỳ và đơn mua"
            : includesOpening ? "FIFO tồn đầu kỳ" : includesPurchase ? "FIFO đơn mua" : "FIFO nhập kho";
        return new InventoryFifoCostResolution(
            AccountingMath.RoundVnd(totalCost / quantity),
            totalCost,
            source,
            includesOpening,
            includesPurchase,
            slices);
    }

    public InventorySerialCostResolution ResolveSerial(ProductSerial serial)
    {
        var serialUnitCost = IsValidCost(serial.UnitCost) ? serial.UnitCost : null;
        var purchaseUnitCost = IsValidCost(serial.PurchaseOrderItem?.UnitPrice)
            ? serial.PurchaseOrderItem!.UnitPrice
            : null;
        var unitCost = serialUnitCost ?? purchaseUnitCost;
        if (!unitCost.HasValue)
        {
            throw new InvalidOperationException(
                $"Serial {serial.InternalSerialNumber ?? serial.Id} không có giá vốn hợp lệ.");
        }

        if (serialUnitCost is null && purchaseUnitCost is null)
        {
            return new InventorySerialCostResolution(
                unitCost.Value,
                $"FALLBACK:{serial.ProductId}",
                "Giá vốn hàng hóa theo serial (dự phòng)");
        }

        if (!string.IsNullOrWhiteSpace(serial.PurchaseOrderItem?.PurchaseOrderId))
        {
            return new InventorySerialCostResolution(
                unitCost.Value,
                serial.PurchaseOrderItem.PurchaseOrderId,
                "PO theo serial");
        }

        return new InventorySerialCostResolution(
            unitCost.Value,
            $"OPENING:{serial.ProductId}",
            "Giá vốn tồn đầu kỳ");
    }

    private async Task<InventoryUnitCostResolution> ResolveWeightedAsync(
        string productId,
        string? warehouseId,
        CancellationToken cancellationToken)
    {
        var fallbackCost = await GetFallbackCostAsync(productId, cancellationToken);
        var receiptData = await (
            from transaction in _inventoryTransactionRepository.GetQuery().AsNoTracking()
            join purchaseItem in _purchaseOrderItemRepository.GetQuery().AsNoTracking()
                on transaction.ModuleItemId equals purchaseItem.Id
            where !transaction.IsDeleted
                && !purchaseItem.IsDeleted
                && (transaction.Status == InventoryTransactionStatus.Confirmed
                    || transaction.Status == InventoryTransactionStatus.Archived)
                && transaction.ModuleName == nameof(PurchaseOrder)
                && transaction.ProductId == productId
                && (string.IsNullOrWhiteSpace(warehouseId) || transaction.WarehouseId == warehouseId)
                && (transaction.Stock ?? transaction.Movement ?? 0m) > 0m
            select new
            {
                purchaseItem.PurchaseOrderId,
                transaction.WarehouseId,
                Quantity = transaction.Stock ?? transaction.Movement ?? 0m,
                UnitCost = purchaseItem.UnitPrice
            })
            .ToListAsync(cancellationToken);

        var openingData = await _inventoryTransactionRepository.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && (x.Status == InventoryTransactionStatus.Confirmed
                    || x.Status == InventoryTransactionStatus.Archived)
                && x.ModuleName == nameof(StockCount)
                && x.ModuleCode == ProductOpeningStockService.OpeningStockModuleCode
                && x.ProductId == productId
                && (string.IsNullOrWhiteSpace(warehouseId) || x.WarehouseId == warehouseId)
                && (x.Stock ?? 0m) != 0m)
            .Select(x => new
            {
                Quantity = x.Stock ?? 0m,
                x.UnitCost
            })
            .ToListAsync(cancellationToken);

        var returnData = await (
            from transaction in _inventoryTransactionRepository.GetQuery().AsNoTracking()
            join purchaseReturn in _purchaseReturnRepository.GetQuery().AsNoTracking()
                on transaction.ModuleId equals purchaseReturn.Id
            where !transaction.IsDeleted
                && !purchaseReturn.IsDeleted
                && (transaction.Status == InventoryTransactionStatus.Confirmed
                    || transaction.Status == InventoryTransactionStatus.Archived)
                && transaction.ModuleName == nameof(PurchaseReturn)
                && transaction.ProductId == productId
                && (string.IsNullOrWhiteSpace(warehouseId) || transaction.WarehouseId == warehouseId)
                && (transaction.Stock ?? 0m) < 0m
            select new
            {
                purchaseReturn.PurchaseOrderId,
                transaction.WarehouseId,
                Quantity = transaction.Stock ?? 0m
            })
            .ToListAsync(cancellationToken);

        var returnPurchaseOrderIds = returnData
            .Select(x => x.PurchaseOrderId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();
        var returnSourceItems = await _purchaseOrderItemRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ProductId == productId
                && x.PurchaseOrderId != null
                && returnPurchaseOrderIds.Contains(x.PurchaseOrderId))
            .Select(x => new
            {
                x.PurchaseOrderId,
                x.WarehouseId,
                Quantity = x.Quantity ?? 0m,
                UnitCost = x.UnitPrice
            })
            .ToListAsync(cancellationToken);

        var usedFallback = receiptData.Any(x => !IsValidCost(x.UnitCost))
            || openingData.Any(x => !IsValidCost(x.UnitCost));
        var requiredFallbackCost = usedFallback
            ? RequireFallbackCost(fallbackCost, productId)
            : 0m;
        var rows = receiptData
            .Select(x => new CostRow(
                x.Quantity,
                IsValidCost(x.UnitCost) ? x.UnitCost!.Value : requiredFallbackCost))
            .Concat(openingData.Select(x => new CostRow(
                x.Quantity,
                IsValidCost(x.UnitCost) ? x.UnitCost!.Value : requiredFallbackCost)))
            .ToList();

        foreach (var returned in returnData)
        {
            var matchingReceipts = receiptData
                .Where(x => x.PurchaseOrderId == returned.PurchaseOrderId
                    && x.WarehouseId == returned.WarehouseId)
                .ToList();
            if (matchingReceipts.Count == 0)
            {
                matchingReceipts = receiptData
                    .Where(x => x.PurchaseOrderId == returned.PurchaseOrderId)
                    .ToList();
            }

            var matchingSources = returnSourceItems
                .Where(x => x.PurchaseOrderId == returned.PurchaseOrderId
                    && x.WarehouseId == returned.WarehouseId)
                .ToList();
            if (matchingSources.Count == 0)
            {
                matchingSources = returnSourceItems
                    .Where(x => x.PurchaseOrderId == returned.PurchaseOrderId)
                    .ToList();
            }

            var receiptQuantity = matchingReceipts.Sum(x => x.Quantity);
            var sourceQuantity = matchingSources.Sum(x => x.Quantity);
            var returnNeedsFallback = receiptQuantity > QuantityTolerance
                ? matchingReceipts.Any(x => !IsValidCost(x.UnitCost))
                : sourceQuantity > QuantityTolerance
                    ? matchingSources.Any(x => !IsValidCost(x.UnitCost))
                    : true;
            usedFallback |= returnNeedsFallback;
            if (returnNeedsFallback)
            {
                requiredFallbackCost = RequireFallbackCost(fallbackCost, productId);
            }
            var sourceUnitCost = receiptQuantity > QuantityTolerance
                ? matchingReceipts.Sum(x => x.Quantity *
                    (IsValidCost(x.UnitCost) ? x.UnitCost!.Value : requiredFallbackCost)) / receiptQuantity
                : sourceQuantity > QuantityTolerance
                    ? matchingSources.Sum(x => x.Quantity *
                        (IsValidCost(x.UnitCost) ? x.UnitCost!.Value : requiredFallbackCost)) / sourceQuantity
                    : RequireFallbackCost(fallbackCost, productId);
            if (receiptQuantity <= QuantityTolerance && sourceQuantity <= QuantityTolerance)
            {
                usedFallback = true;
            }
            rows.Add(new CostRow(returned.Quantity, sourceUnitCost));
        }

        var totalQuantity = rows.Sum(x => x.Quantity);
        if (totalQuantity > QuantityTolerance)
        {
            var hasOpening = openingData.Count > 0;
            var hasPurchase = receiptData.Count > 0 || returnData.Count > 0;
            var source = hasOpening && hasPurchase
                ? "PO và tồn đầu kỳ bình quân"
                : hasOpening
                    ? "Tồn đầu kỳ bình quân"
                    : "PO thực nhập bình quân";
            if (usedFallback)
            {
                source += " (có giá vốn hàng hóa dự phòng)";
            }
            return new InventoryUnitCostResolution(
                rows.Sum(x => x.Quantity * x.UnitCost) / totalQuantity,
                source,
                usedFallback,
                hasOpening,
                hasPurchase);
        }

        return new InventoryUnitCostResolution(
            RequireFallbackCost(fallbackCost, productId),
            "Giá vốn hàng hóa (dự phòng)",
            true);
    }

    private async Task<decimal?> GetFallbackCostAsync(
        string productId,
        CancellationToken cancellationToken)
    {
        return await _productRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == productId)
            .Select(x => x.CostPrice)
            .SingleOrDefaultAsync(cancellationToken);
    }

    private static bool IsValidCost(decimal? value)
        => value.HasValue && value.Value >= 0m;

    private static decimal RequireFallbackCost(decimal? value, string productId)
    {
        if (!IsValidCost(value))
        {
            throw new InvalidOperationException(
                $"Hàng hóa {productId} không có giá vốn nguồn hoặc giá vốn dự phòng hợp lệ.");
        }

        return value!.Value;
    }

    private static decimal ConsumeFifoQuantity(
        List<InventoryFifoLayer> layers,
        decimal quantity,
        Func<InventoryFifoLayer, bool> predicate)
    {
        var remaining = quantity;
        foreach (var layer in layers)
        {
            if (remaining <= QuantityTolerance)
            {
                break;
            }
            if (layer.Quantity <= QuantityTolerance || !predicate(layer))
            {
                continue;
            }

            var consumed = Math.Min(layer.Quantity, remaining);
            layer.Quantity -= consumed;
            remaining -= consumed;
        }
        return remaining;
    }

    private static decimal ConsumeDocumentFifoQuantity(
        List<DocumentFifoLayer> layers,
        decimal quantity,
        Func<DocumentFifoLayer, bool> predicate)
    {
        var remaining = quantity;
        foreach (var layer in layers)
        {
            if (remaining <= QuantityTolerance) break;
            if (layer.Quantity <= QuantityTolerance || !predicate(layer)) continue;
            var consumed = Math.Min(layer.Quantity, remaining);
            layer.Quantity -= consumed;
            remaining -= consumed;
        }
        return remaining;
    }

    private readonly record struct CostRow(decimal Quantity, decimal UnitCost);

    private sealed class DocumentFifoLayer(
        decimal quantity,
        decimal unitCost,
        string sourceInventoryTransactionId,
        string? sourceCostAllocationId,
        string? purchaseOrderItemId,
        string? sourceModule,
        string? sourceNumber,
        DateTime? sourceDate,
        string costSource,
        bool includesOpeningStock,
        bool includesPurchase)
    {
        public decimal Quantity { get; set; } = quantity;
        public decimal UnitCost { get; } = unitCost;
        public string SourceInventoryTransactionId { get; } = sourceInventoryTransactionId;
        public string? SourceCostAllocationId { get; } = sourceCostAllocationId;
        public string? PurchaseOrderItemId { get; } = purchaseOrderItemId;
        public string? SourceModule { get; } = sourceModule;
        public string? SourceNumber { get; } = sourceNumber;
        public DateTime? SourceDate { get; } = sourceDate;
        public string CostSource { get; } = costSource;
        public bool IncludesOpeningStock { get; } = includesOpeningStock;
        public bool IncludesPurchase { get; } = includesPurchase;
    }

    private sealed class InventoryFifoLayer(
        decimal quantity,
        decimal unitCost,
        string? purchaseOrderItemId,
        bool isFallbackCost,
        bool includesOpeningStock,
        bool includesPurchase)
    {
        public decimal Quantity { get; set; } = quantity;
        public decimal UnitCost { get; } = unitCost;
        public string? PurchaseOrderItemId { get; } = purchaseOrderItemId;
        public bool IsFallbackCost { get; } = isFallbackCost;
        public bool IncludesOpeningStock { get; } = includesOpeningStock;
        public bool IncludesPurchase { get; } = includesPurchase;
    }
}
