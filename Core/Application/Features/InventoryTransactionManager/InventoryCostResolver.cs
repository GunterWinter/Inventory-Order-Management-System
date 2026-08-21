using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.ProductManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public readonly record struct InventoryUnitCostResolution(
    double UnitCost,
    string CostSource,
    bool IsFallbackCost,
    bool IncludesOpeningStock = false,
    bool IncludesPurchase = false);

public readonly record struct InventorySerialCostResolution(
    double UnitCost,
    string SourceKey,
    string CostSource);

public sealed class InventoryCostResolver
{
    private const double QuantityTolerance = 0.000001d;

    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<PurchaseReturn> _purchaseReturnRepository;
    private readonly ICommandRepository<Product> _productRepository;
    private readonly Dictionary<(string ProductId, string WarehouseId), InventoryUnitCostResolution> _weightedCache = [];

    public InventoryCostResolver(
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<PurchaseReturn> purchaseReturnRepository,
        ICommandRepository<Product> productRepository)
    {
        _productSerialRepository = productSerialRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _purchaseReturnRepository = purchaseReturnRepository;
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
                    : 0d;
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

    public InventorySerialCostResolution ResolveSerial(ProductSerial serial)
    {
        var serialUnitCost = IsValidCost(serial.UnitCost) ? serial.UnitCost : null;
        var purchaseUnitCost = IsValidCost(serial.PurchaseOrderItem?.UnitPrice)
            ? serial.PurchaseOrderItem!.UnitPrice
            : null;
        var productUnitCost = IsValidCost(serial.Product?.CostPrice)
            ? serial.Product!.CostPrice
            : null;
        var hasSerialOrPurchaseCost = serialUnitCost.HasValue || purchaseUnitCost.HasValue;
        var unitCost = serialUnitCost ?? purchaseUnitCost ?? productUnitCost;
        if (!unitCost.HasValue)
        {
            throw new InvalidOperationException(
                $"Serial {serial.InternalSerialNumber ?? serial.Id} không có giá vốn hợp lệ.");
        }

        if (!hasSerialOrPurchaseCost)
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
                && (transaction.Stock ?? transaction.Movement ?? 0d) > 0d
            select new
            {
                purchaseItem.PurchaseOrderId,
                transaction.WarehouseId,
                Quantity = transaction.Stock ?? transaction.Movement ?? 0d,
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
                && (x.Stock ?? 0d) != 0d)
            .Select(x => new
            {
                Quantity = x.Stock ?? 0d,
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
                && (transaction.Stock ?? 0d) < 0d
            select new
            {
                purchaseReturn.PurchaseOrderId,
                transaction.WarehouseId,
                Quantity = transaction.Stock ?? 0d
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
                Quantity = x.Quantity ?? 0d,
                UnitCost = x.UnitPrice
            })
            .ToListAsync(cancellationToken);

        var usedFallback = receiptData.Any(x => !IsValidCost(x.UnitCost))
            || openingData.Any(x => !IsValidCost(x.UnitCost));
        var requiredFallbackCost = usedFallback
            ? RequireFallbackCost(fallbackCost, productId)
            : 0d;
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

    private async Task<double?> GetFallbackCostAsync(
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

    private static bool IsValidCost(double? value)
        => value.HasValue && double.IsFinite(value.Value) && value.Value >= 0d;

    private static double RequireFallbackCost(double? value, string productId)
    {
        if (!IsValidCost(value))
        {
            throw new InvalidOperationException(
                $"Hàng hóa {productId} không có giá vốn nguồn hoặc giá vốn dự phòng hợp lệ.");
        }

        return value!.Value;
    }

    private readonly record struct CostRow(double Quantity, double UnitCost);
}
