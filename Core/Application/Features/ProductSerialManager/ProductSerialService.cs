using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace Application.Features.ProductSerialManager;

public class ProductSerialService
{
    public const int InternalSerialLength = 12;
    private const string Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<ProductSerialMovement> _productSerialMovementRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public ProductSerialService(
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<ProductSerialMovement> productSerialMovementRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork)
    {
        _productSerialRepository = productSerialRepository;
        _productSerialMovementRepository = productSerialMovementRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> IsProductSerialTrackedAsync(string? productId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(productId))
        {
            return false;
        }

        return await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .AnyAsync(x =>
                !x.IsDeleted &&
                x.Id == productId &&
                x.Physical == true &&
                x.SerialTrackingMode == SerialTrackingMode.InternalAuto,
                cancellationToken);
    }

    public async Task<List<string>> GenerateInternalSerialNumbersAsync(
        string fixedCode,
        int count,
        CancellationToken cancellationToken = default)
    {
        fixedCode = NormalizeFixedCode(fixedCode);
        if (fixedCode.Length is < 2 or > 4)
        {
            throw new Exception("Internal serial fixed code must be 2 to 4 characters.");
        }

        if (count <= 0)
        {
            return new List<string>();
        }

        var randomLength = InternalSerialLength - fixedCode.Length;
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        while (result.Count < count)
        {
            var remaining = count - result.Count;
            var candidateCount = Math.Max(remaining + 20, remaining * 2);
            var candidates = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            while (candidates.Count < candidateCount)
            {
                candidates.Add(GenerateRandomPart(randomLength) + fixedCode);
            }

            var candidateList = candidates.ToList();
            var existing = await _queryContext
                .Set<ProductSerial>()
                .AsNoTracking()
                .Where(x => candidateList.Contains(x.InternalSerialNumber!))
                .Select(x => x.InternalSerialNumber!)
                .ToListAsync(cancellationToken);

            var existingSet = existing.ToHashSet(StringComparer.OrdinalIgnoreCase);
            foreach (var candidate in candidateList)
            {
                if (!existingSet.Contains(candidate))
                {
                    result.Add(candidate);
                    if (result.Count == count)
                    {
                        break;
                    }
                }
            }
        }

        return result.ToList();
    }

    public async Task SyncPurchaseOrderItemSerialsAsync(
        PurchaseOrderItem item,
        InventoryTransaction? transaction,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (!await IsProductSerialTrackedAsync(item.ProductId, cancellationToken))
        {
            return;
        }

        var quantity = RequireWholeQuantity(item.Quantity, "Quantity");
        var product = await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .SingleAsync(x => x.Id == item.ProductId, cancellationToken);

        var existing = await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderItemId == item.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        if (existing.Count > quantity)
        {
            var removable = existing
                .Where(x => x.Status == ProductSerialStatus.Pending || x.Status == ProductSerialStatus.InStock)
                .OrderByDescending(x => x.CreatedAtUtc)
                .Take(existing.Count - quantity)
                .ToList();

            if (removable.Count != existing.Count - quantity)
            {
                throw new Exception("Cannot reduce quantity because one or more generated serial numbers have already been used.");
            }

            foreach (var serial in removable)
            {
                serial.UpdatedById = userId;
                _productSerialRepository.Delete(serial);
            }
            await _unitOfWork.SaveAsync(cancellationToken);
            existing = existing.Except(removable).ToList();
        }

        if (existing.Count < quantity)
        {
            var codes = await GenerateInternalSerialNumbersAsync(product.InternalSerialFixedCode ?? "SN", quantity - existing.Count, cancellationToken);
            var supplierWarrantyEndDate = item.PurchaseOrder?.OrderDate?.AddMonths(item.SupplierWarrantyMonths ?? 0);
            foreach (var code in codes)
            {
                await _productSerialRepository.CreateAsync(new ProductSerial
                {
                    CreatedById = userId,
                    ProductId = item.ProductId,
                    InternalSerialNumber = code,
                    Status = ResolveIncomingStatus(transaction),
                    CurrentWarehouseId = transaction?.Status == InventoryTransactionStatus.Confirmed ? item.WarehouseId : null,
                    BatchNumber = item.BatchNumber,
                    PurchaseOrderItemId = item.Id,
                    SupplierWarrantyEndDate = supplierWarrantyEndDate
                }, cancellationToken);
            }
            await _unitOfWork.SaveAsync(cancellationToken);
        }

        if (transaction != null)
        {
            var serialIds = await _queryContext
                .Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.PurchaseOrderItemId == item.Id)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);

            await ApplyInventoryTransactionSerialsAsync(transaction, serialIds, userId, cancellationToken);
        }
    }

    public async Task ReserveSalesOrderItemSerialsAsync(
        SalesOrderItem item,
        IReadOnlyCollection<string>? productSerialIds,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (!await IsProductSerialTrackedAsync(item.ProductId, cancellationToken))
        {
            return;
        }

        if (productSerialIds == null || productSerialIds.Count == 0)
        {
            throw new Exception("Serial-tracked products require selected serial numbers.");
        }

        var serials = await GetSerialsByIdsAsync(productSerialIds, cancellationToken);
        ValidateSerialCount(productSerialIds, serials);

        foreach (var serial in serials)
        {
            if (serial.ProductId != item.ProductId ||
                serial.CurrentWarehouseId != item.WarehouseId ||
                serial.BatchNumber != item.BatchNumber ||
                (serial.Status != ProductSerialStatus.InStock && serial.SalesOrderItemId != item.Id))
            {
                throw new Exception("Selected serial numbers are not valid for the selected product, warehouse, and batch.");
            }
        }

        var previous = await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId == item.Id)
            .ToListAsync(cancellationToken);

        var selected = productSerialIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var serial in previous.Where(x => !selected.Contains(x.Id)))
        {
            serial.SalesOrderItemId = null;
            serial.Status = ProductSerialStatus.InStock;
            serial.UpdatedById = userId;
            _productSerialRepository.Update(serial);
        }

        foreach (var serial in serials)
        {
            serial.SalesOrderItemId = item.Id;
            serial.Status = ProductSerialStatus.Reserved;
            serial.UpdatedById = userId;
            _productSerialRepository.Update(serial);
        }

        item.Quantity = productSerialIds.Count;
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task ReleaseSalesOrderItemSerialsAsync(
        string? salesOrderItemId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(salesOrderItemId))
        {
            return;
        }

        var serials = await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId == salesOrderItemId && x.Status == ProductSerialStatus.Reserved)
            .ToListAsync(cancellationToken);

        foreach (var serial in serials)
        {
            serial.SalesOrderItemId = null;
            serial.Status = ProductSerialStatus.InStock;
            serial.UpdatedById = userId;
            _productSerialRepository.Update(serial);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task ApplyInventoryTransactionSerialsAsync(
        InventoryTransaction transaction,
        IReadOnlyCollection<string>? productSerialIds,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (!await IsProductSerialTrackedAsync(transaction.ProductId, cancellationToken))
        {
            return;
        }

        var serialIds = productSerialIds?.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase).ToList()
            ?? await ResolveSerialIdsForTransactionAsync(transaction, cancellationToken);

        if (serialIds.Count == 0 && transaction.ModuleName == nameof(PositiveAdjustment))
        {
            serialIds = await GeneratePositiveAdjustmentSerialsAsync(transaction, userId, cancellationToken);
        }

        var quantity = ResolveTransactionQuantity(transaction);
        if (serialIds.Count == 0)
        {
            if (transaction.ModuleName == nameof(StockCount) && quantity == 0)
            {
                await ApplyStockCountMissingSerialsAsync(transaction, serialIds, userId, cancellationToken);
                await _unitOfWork.SaveAsync(cancellationToken);
                return;
            }

            throw new Exception("Serial-tracked products require selected serial numbers.");
        }

        var serials = await GetSerialsByIdsAsync(serialIds, cancellationToken);
        ValidateSerialCount(serialIds, serials);

        if (quantity != serials.Count)
        {
            throw new Exception("Transaction quantity must match selected serial count.");
        }

        await ReplaceMovementsAsync(transaction, serials, userId, cancellationToken);
        await ApplyStatusAsync(transaction, serials, userId, cancellationToken);
        await ApplyStockCountMissingSerialsAsync(transaction, serialIds, userId, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);
    }

    public async Task ReleaseInventoryTransactionSerialsAsync(
        string? inventoryTransactionId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(inventoryTransactionId))
        {
            return;
        }

        var movementData = await _queryContext
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == inventoryTransactionId)
            .Select(x => new { x.Id, x.ProductSerialId })
            .ToListAsync(cancellationToken);

        var serialIds = movementData.Select(x => x.ProductSerialId).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var serials = await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x => serialIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        foreach (var serial in serials)
        {
            if (serial.Status == ProductSerialStatus.Reserved ||
                serial.Status == ProductSerialStatus.Pending ||
                serial.Status == ProductSerialStatus.InTransfer)
            {
                serial.Status = ProductSerialStatus.InStock;
                serial.UpdatedById = userId;
                _productSerialRepository.Update(serial);
            }
        }

        foreach (var md in movementData)
        {
            var movement = await _productSerialMovementRepository.GetAsync(md.Id ?? string.Empty, cancellationToken);
            if (movement != null)
            {
                movement.UpdatedById = userId;
                _productSerialMovementRepository.Delete(movement);
            }
        }

        await _unitOfWork.SaveAsync(cancellationToken);
    }

    private async Task<List<string>> ResolveSerialIdsForTransactionAsync(InventoryTransaction transaction, CancellationToken cancellationToken)
    {
        if (transaction.ModuleName == nameof(DeliveryOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
        {
            return await _queryContext
                .Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderItemId == transaction.ModuleItemId)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);
        }

        return await _queryContext
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == transaction.Id)
            .Select(x => x.ProductSerialId!)
            .ToListAsync(cancellationToken);
    }

    private async Task<List<string>> GeneratePositiveAdjustmentSerialsAsync(
        InventoryTransaction transaction,
        string? userId,
        CancellationToken cancellationToken)
    {
        var quantity = ResolveTransactionQuantity(transaction);
        var product = await _queryContext
            .Set<Product>()
            .AsNoTracking()
            .SingleAsync(x => x.Id == transaction.ProductId, cancellationToken);
        var codes = await GenerateInternalSerialNumbersAsync(product.InternalSerialFixedCode ?? "SN", quantity, cancellationToken);
        var serialIds = new List<string>();

        foreach (var code in codes)
        {
            var serial = new ProductSerial
            {
                CreatedById = userId,
                ProductId = transaction.ProductId,
                InternalSerialNumber = code,
                Status = ResolveIncomingStatus(transaction),
                CurrentWarehouseId = transaction.Status == InventoryTransactionStatus.Confirmed ? transaction.WarehouseId : null,
                BatchNumber = transaction.BatchNumber
            };

            serialIds.Add(serial.Id);
            await _productSerialRepository.CreateAsync(serial, cancellationToken);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
        return serialIds;
    }

    private async Task<List<ProductSerial>> GetSerialsByIdsAsync(IReadOnlyCollection<string> serialIds, CancellationToken cancellationToken)
    {
        return await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x => serialIds.Contains(x.Id))
            .ToListAsync(cancellationToken);
    }

    private static void ValidateSerialCount(IReadOnlyCollection<string> requestedIds, IReadOnlyCollection<ProductSerial> serials)
    {
        if (requestedIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() != serials.Count)
        {
            throw new Exception("One or more selected serial numbers are invalid.");
        }
    }

    private async Task ReplaceMovementsAsync(
        InventoryTransaction transaction,
        List<ProductSerial> serials,
        string? userId,
        CancellationToken cancellationToken)
    {
        var existingMovementIds = await _queryContext
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == transaction.Id)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);

        foreach (var movementId in existingMovementIds)
        {
            var movement = await _productSerialMovementRepository.GetAsync(movementId ?? string.Empty, cancellationToken);
            if (movement != null)
            {
                movement.UpdatedById = userId;
                _productSerialMovementRepository.Delete(movement);
            }
        }

        foreach (var serial in serials)
        {
            await _productSerialMovementRepository.CreateAsync(new ProductSerialMovement
            {
                CreatedById = userId,
                ProductSerialId = serial.Id,
                InventoryTransactionId = transaction.Id,
                ModuleName = transaction.ModuleName,
                ModuleId = transaction.ModuleId,
                ModuleItemId = transaction.ModuleItemId,
                FromWarehouseId = ResolveFromWarehouse(transaction),
                ToWarehouseId = ResolveToWarehouse(transaction),
                MovementDate = transaction.MovementDate,
                Status = ResolveTargetStatus(transaction)
            }, cancellationToken);
        }
    }

    private async Task ApplyStatusAsync(
        InventoryTransaction transaction,
        List<ProductSerial> serials,
        string? userId,
        CancellationToken cancellationToken)
    {
        var targetStatus = ResolveTargetStatus(transaction);
        foreach (var serial in serials)
        {
            ValidateSerialForTransaction(transaction, serial);
            serial.Status = targetStatus;
            serial.UpdatedById = userId;

            if (targetStatus == ProductSerialStatus.InStock)
            {
                serial.CurrentWarehouseId = ResolveToWarehouse(transaction) ?? transaction.WarehouseId;
                serial.BatchNumber = transaction.BatchNumber ?? serial.BatchNumber;
            }
            else if (targetStatus is ProductSerialStatus.Sold or ProductSerialStatus.ReturnedToSupplier or ProductSerialStatus.Missing or ProductSerialStatus.Scrapped)
            {
                serial.CurrentWarehouseId = null;
            }
            else if (targetStatus == ProductSerialStatus.InTransfer)
            {
                serial.CurrentWarehouseId = ResolveToWarehouse(transaction);
            }

            if (transaction.ModuleName == nameof(DeliveryOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
            {
                serial.SalesOrderItemId = transaction.ModuleItemId;
                var salesOrderItem = await _queryContext
                    .Set<SalesOrderItem>()
                    .AsNoTracking()
                    .Include(x => x.SalesOrder)
                    .SingleOrDefaultAsync(x => x.Id == transaction.ModuleItemId, cancellationToken);
                serial.CustomerWarrantyEndDate = salesOrderItem?.SalesOrder?.OrderDate?.AddMonths(salesOrderItem.WarrantyMonths ?? 0);
            }

            _productSerialRepository.Update(serial);
        }
    }

    private async Task ApplyStockCountMissingSerialsAsync(
        InventoryTransaction transaction,
        IReadOnlyCollection<string> countedSerialIds,
        string? userId,
        CancellationToken cancellationToken)
    {
        if (transaction.ModuleName != nameof(StockCount) ||
            transaction.Status != InventoryTransactionStatus.Confirmed ||
            string.IsNullOrWhiteSpace(transaction.ProductId) ||
            string.IsNullOrWhiteSpace(transaction.WarehouseId))
        {
            return;
        }

        var counted = countedSerialIds.ToList();
        var missingSerials = await _queryContext
            .Set<ProductSerial>()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.ProductId == transaction.ProductId &&
                x.CurrentWarehouseId == transaction.WarehouseId &&
                x.Status == ProductSerialStatus.InStock &&
                !counted.Contains(x.Id))
            .ToListAsync(cancellationToken);

        foreach (var serial in missingSerials)
        {
            serial.Status = ProductSerialStatus.Missing;
            serial.CurrentWarehouseId = null;
            serial.UpdatedById = userId;
            _productSerialRepository.Update(serial);
        }
    }

    private static void ValidateSerialForTransaction(InventoryTransaction transaction, ProductSerial serial)
    {
        if (serial.ProductId != transaction.ProductId)
        {
            throw new Exception("Selected serial number does not match transaction product.");
        }

        if (transaction.ModuleName is nameof(GoodsReceive) or nameof(PositiveAdjustment))
        {
            return;
        }

        if (transaction.ModuleName == nameof(TransferIn))
        {
            if (serial.Status != ProductSerialStatus.InTransfer && serial.Status != ProductSerialStatus.Reserved)
            {
                throw new Exception("Transfer In requires serial numbers currently in transfer.");
            }
            return;
        }

        if (transaction.ModuleName == nameof(SalesReturn))
        {
            if (serial.Status != ProductSerialStatus.Sold && serial.Status != ProductSerialStatus.Reserved)
            {
                throw new Exception("Sales Return requires sold serial numbers.");
            }
            return;
        }

        if (serial.Status != ProductSerialStatus.InStock && serial.Status != ProductSerialStatus.Reserved)
        {
            throw new Exception("Selected serial number is not available in stock.");
        }

        if (!string.IsNullOrWhiteSpace(transaction.WarehouseId) && serial.CurrentWarehouseId != transaction.WarehouseId)
        {
            throw new Exception("Selected serial number is not in the selected warehouse.");
        }
    }

    private static ProductSerialStatus ResolveIncomingStatus(InventoryTransaction? transaction)
    {
        return transaction?.Status == InventoryTransactionStatus.Confirmed
            ? ProductSerialStatus.InStock
            : ProductSerialStatus.Pending;
    }

    private static ProductSerialStatus ResolveTargetStatus(InventoryTransaction transaction)
    {
        if (transaction.Status != InventoryTransactionStatus.Confirmed)
        {
            return transaction.ModuleName is nameof(GoodsReceive) or nameof(PositiveAdjustment)
                ? ProductSerialStatus.Pending
                : ProductSerialStatus.Reserved;
        }

        return transaction.ModuleName switch
        {
            nameof(DeliveryOrder) => ProductSerialStatus.Sold,
            nameof(GoodsReceive) => ProductSerialStatus.InStock,
            nameof(SalesReturn) => ProductSerialStatus.InStock,
            nameof(PurchaseReturn) => ProductSerialStatus.ReturnedToSupplier,
            nameof(TransferOut) => ProductSerialStatus.InTransfer,
            nameof(TransferIn) => ProductSerialStatus.InStock,
            nameof(PositiveAdjustment) => ProductSerialStatus.InStock,
            nameof(NegativeAdjustment) => ProductSerialStatus.Missing,
            nameof(Scrapping) => ProductSerialStatus.Scrapped,
            nameof(StockCount) => ProductSerialStatus.InStock,
            _ => ProductSerialStatus.Reserved
        };
    }

    private static string? ResolveFromWarehouse(InventoryTransaction transaction)
    {
        return transaction.WarehouseFromId ?? transaction.WarehouseId;
    }

    private static string? ResolveToWarehouse(InventoryTransaction transaction)
    {
        return transaction.WarehouseToId ?? transaction.WarehouseId;
    }

    private static int ResolveTransactionQuantity(InventoryTransaction transaction)
    {
        if (transaction.ModuleName == nameof(StockCount))
        {
            return RequireWholeQuantity(transaction.QtySCCount, "Stock count quantity", allowZero: true);
        }

        return RequireWholeQuantity(transaction.Movement, "Movement");
    }

    private static int RequireWholeQuantity(double? quantity, string fieldName, bool allowZero = false)
    {
        if (quantity == null ||
            quantity < 0 ||
            (!allowZero && quantity <= 0) ||
            Math.Abs(quantity.Value % 1) > 0.000001)
        {
            var requirement = allowZero ? "a non-negative whole number" : "a positive whole number";
            throw new Exception($"{fieldName} for serial-tracked products must be {requirement}.");
        }

        return Convert.ToInt32(quantity.Value);
    }

    private static string NormalizeFixedCode(string value)
    {
        return value.Trim().ToUpperInvariant();
    }

    private static string GenerateRandomPart(int length)
    {
        return RandomNumberGenerator.GetString(Alphabet, length);
    }
}
