using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text.Json;

namespace Application.Features.ProductSerialManager;

public class ProductSerialService
{
    public const int InternalSerialLength = 12;
    private const string Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<ProductSerialMovement> _productSerialMovementRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public ProductSerialService(
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<ProductSerialMovement> productSerialMovementRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork)
    {
        _productSerialRepository = productSerialRepository;
        _productSerialMovementRepository = productSerialMovementRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
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
                x.SerialTrackingMode != SerialTrackingMode.None,
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
            var existing = await _productSerialRepository
                .GetQuery()
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

        var existing = await _productSerialRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderItemId == item.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);

        var manufacturerNumbers = new List<string>();
        if (!string.IsNullOrWhiteSpace(item.ManufacturerSerialNumbersJson))
        {
            manufacturerNumbers = JsonSerializer.Deserialize<List<string>>(item.ManufacturerSerialNumbersJson) ?? new();
            manufacturerNumbers = manufacturerNumbers
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        if (product.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial && manufacturerNumbers.Count != quantity)
        {
            throw new Exception("Manufacturer serial number count must match quantity.");
        }
        if (product.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial)
        {
            var duplicateExists = await _productSerialRepository.GetQuery()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .AnyAsync(x => x.PurchaseOrderItemId != item.Id
                    && x.ManufacturerSerialNumber != null
                    && manufacturerNumbers.Contains(x.ManufacturerSerialNumber), cancellationToken);
            if (duplicateExists)
                throw new InvalidOperationException("Manufacturer serial numbers must be unique across all products.");
        }

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
            for (var i = 0; i < codes.Count; i++)
            {
                await _productSerialRepository.CreateAsync(new ProductSerial
                {
                    CreatedById = userId,
                    ProductId = item.ProductId,
                    InternalSerialNumber = codes[i],
                    ManufacturerSerialNumber = manufacturerNumbers.Count == quantity ? manufacturerNumbers[existing.Count + i] : null,
                    Status = ResolveIncomingStatus(transaction),
                    CurrentWarehouseId = transaction?.Status == InventoryTransactionStatus.Confirmed ? item.WarehouseId : null,
                    PurchaseOrderItemId = item.Id,
                    SupplierWarrantyEndDate = supplierWarrantyEndDate,
                    UnitCost = item.UnitPrice ?? 0m
                }, cancellationToken);
            }
            await _unitOfWork.SaveAsync(cancellationToken);
        }

        existing = await _productSerialRepository.GetQuery().ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderItemId == item.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .ToListAsync(cancellationToken);
        for (var i = 0; i < existing.Count; i++)
        {
            existing[i].UnitCost = item.UnitPrice ?? 0m;
            if (product.SerialTrackingMode == SerialTrackingMode.ManufacturerSerial)
            {
                existing[i].ManufacturerSerialNumber = manufacturerNumbers[i];
            }
            existing[i].UpdatedById = userId;
            _productSerialRepository.Update(existing[i]);
        }
        await _unitOfWork.SaveAsync(cancellationToken);

        if (transaction != null)
        {
            var alreadyApplied = await _productSerialMovementRepository
                .GetQuery()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .AnyAsync(x => x.InventoryTransactionId == transaction.Id
                    && x.ReversedAtUtc == null
                    && x.Status == ProductSerialStatus.InStock,
                    cancellationToken);

            // Archiving a confirmed PO must not replay its receipt. Replaying it
            // would incorrectly bring serials that were subsequently sold or
            // exported back into stock.
            if (transaction.Status == InventoryTransactionStatus.Confirmed && alreadyApplied)
            {
                return;
            }

            var serialIds = await _productSerialRepository
                .GetQuery()
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
                ((serial.Status != ProductSerialStatus.InStock && serial.Status != ProductSerialStatus.ReturnedByCustomer) && serial.SalesOrderItemId != item.Id))
            {
                throw new Exception("Selected serial numbers are not valid for the selected product and warehouse.");
            }
        }

        var previous = await _productSerialRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId == item.Id)
            .ToListAsync(cancellationToken);

        var selected = productSerialIds.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var serial in previous.Where(x => !selected.Contains(x.Id)))
        {
            serial.SalesOrderItemId = null;
            serial.Status = ProductSerialStatus.InStock; // Assuming if unreserved it goes back to InStock (or could be ReturnedByCustomer, but we don't know here easily, so we leave it as InStock for now, it's generally fine)
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

        var serials = await _productSerialRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderItemId == salesOrderItemId && x.Status == ProductSerialStatus.Reserved)
            .ToListAsync(cancellationToken);

        string? itemWarehouseId = null;
        if (serials.Any(x => string.IsNullOrWhiteSpace(x.CurrentWarehouseId)))
        {
            itemWarehouseId = await _queryContext.Set<SalesOrderItem>()
                .AsNoTracking()
                .Where(x => x.Id == salesOrderItemId)
                .Select(x => x.WarehouseId)
                .FirstOrDefaultAsync(cancellationToken);
        }

        foreach (var serial in serials)
        {
            serial.SalesOrderItemId = null;
            serial.Status = ProductSerialStatus.InStock;
            if (string.IsNullOrWhiteSpace(serial.CurrentWarehouseId) && !string.IsNullOrWhiteSpace(itemWarehouseId))
            {
                serial.CurrentWarehouseId = itemWarehouseId;
            }
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

        // Release can run inside the command transaction that has just updated this
        // inventory row. Reading it through QueryContext opens a second connection,
        // which blocks on the uncommitted row lock until the SQL command times out.
        var transaction = await _inventoryTransactionRepository
            .GetQuery()
            .SingleOrDefaultAsync(x => x.Id == inventoryTransactionId, cancellationToken);

        var movements = await _productSerialMovementRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == inventoryTransactionId && x.ReversedAtUtc == null)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

        if (movements.Count == 0)
        {
            return;
        }

        var serialIds = movements.Select(x => x.ProductSerialId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var serials = await _productSerialRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => serialIds.Contains(x.Id))
            .ToListAsync(cancellationToken);

        foreach (var serial in serials)
        {
            var movement = movements.Last(x => string.Equals(
                x.ProductSerialId,
                serial.Id,
                StringComparison.OrdinalIgnoreCase));

            if (transaction?.ModuleName != nameof(PurchaseOrder))
            {
                await EnsureMovementIsLatestAsync(movement, transaction, cancellationToken);
            }

            RestoreSerialFromMovement(serial, movement, transaction?.ModuleName);
            serial.UpdatedById = userId;
            _productSerialRepository.Update(serial);
        }

        foreach (var movement in movements)
        {
            movement.ReversedAtUtc = DateTime.UtcNow;
            movement.ReversedById = userId;
            movement.UpdatedById = userId;
            _productSerialMovementRepository.Update(movement);
        }

        await _unitOfWork.SaveAsync(cancellationToken);
    }

    private async Task EnsureMovementIsLatestAsync(
        ProductSerialMovement movement,
        InventoryTransaction? transaction,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(movement.ProductSerialId))
        {
            return;
        }

        var latest = await _productSerialMovementRepository.GetQuery()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ProductSerialId == movement.ProductSerialId && x.ReversedAtUtc == null)
            .OrderByDescending(x => x.CreatedAtUtc ?? x.MovementDate)
            .ThenByDescending(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.InventoryTransactionId,
                x.ModuleName,
                x.ModuleId,
                DocumentNumber = x.InventoryTransaction != null
                    ? x.InventoryTransaction.ModuleNumber ?? x.InventoryTransaction.Number
                    : null
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (latest == null || latest.Id == movement.Id || latest.InventoryTransactionId == transaction?.Id)
        {
            return;
        }

        var serial = await _productSerialRepository.GetQuery()
            .AsNoTracking()
            .Include(x => x.Product)
            .SingleOrDefaultAsync(x => x.Id == movement.ProductSerialId, cancellationToken);
        var serialNumber = serial?.InternalSerialNumber ?? movement.ProductSerialId;
        var productName = serial?.Product?.Name ?? "hàng hóa không xác định";
        var dependency = latest.DocumentNumber ?? latest.ModuleName ?? latest.ModuleId ?? "chứng từ phát sinh sau";
        throw new InvalidOperationException(
            $"Không thể hoàn tác: serial {serialNumber} của {productName} còn được sử dụng tại {dependency}. " +
            "Hãy hủy hoặc hoàn tác chứng từ phát sinh sau trước.");
    }

    private static void RestoreSerialFromMovement(
        ProductSerial serial,
        ProductSerialMovement movement,
        string? moduleName)
    {
        if (moduleName == nameof(PurchaseOrder))
        {
            // A cancelled receipt must never leave an available serial in stock.
            // The serial row and its movement history remain for audit/warranty lookup.
            serial.Status = ProductSerialStatus.Voided;
            serial.CurrentWarehouseId = null;
            serial.CustomerWarrantyEndDate = null;
            serial.CostAllocationId = null;
            return;
        }

        var previousStatus = movement.PreviousStatus ?? ProductSerialStatus.InStock;
        if (moduleName == nameof(SalesOrder) && previousStatus == ProductSerialStatus.Reserved)
        {
            previousStatus = ProductSerialStatus.InStock;
        }

        serial.Status = previousStatus;
        serial.CurrentWarehouseId = movement.PreviousWarehouseId;
        serial.SalesOrderItemId = movement.PreviousSalesOrderItemId;
        serial.CustomerWarrantyEndDate = movement.PreviousCustomerWarrantyEndDate;
        serial.CostAllocationId = movement.PreviousCostAllocationId;
    }

    private async Task<List<string>> ResolveSerialIdsForTransactionAsync(InventoryTransaction transaction, CancellationToken cancellationToken)
    {
        if (transaction.ModuleName == nameof(SalesOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
        {
            return await _queryContext
                .Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderItemId == transaction.ModuleItemId)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);
        }

        if (transaction.ModuleName == nameof(PurchaseOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
        {
            return await _queryContext
                .Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.PurchaseOrderItemId == transaction.ModuleItemId)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);
        }

        return await _queryContext
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == transaction.Id && x.ReversedAtUtc == null)
            .Select(x => x.ProductSerialId!)
            .ToListAsync(cancellationToken);
    }

    private async Task<List<ProductSerial>> GetSerialsByIdsAsync(IReadOnlyCollection<string> serialIds, CancellationToken cancellationToken)
    {
        return await _productSerialRepository
            .GetQuery()
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
        var existingMovements = await _productSerialMovementRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == transaction.Id && x.ReversedAtUtc == null)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

        var previousState = existingMovements
            .Where(x => !string.IsNullOrWhiteSpace(x.ProductSerialId))
            .GroupBy(x => x.ProductSerialId!, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(x => x.Key, x => x.Last(), StringComparer.OrdinalIgnoreCase);

        foreach (var movement in existingMovements)
        {
            movement.UpdatedById = userId;
            _productSerialMovementRepository.Delete(movement);
        }

        foreach (var serial in serials)
        {
            previousState.TryGetValue(serial.Id, out var priorDraftMovement);
            await _productSerialMovementRepository.CreateAsync(new ProductSerialMovement
            {
                CreatedById = userId,
                ProductSerialId = serial.Id,
                InventoryTransactionId = transaction.Id,
                ModuleName = transaction.ModuleName,
                ModuleId = transaction.ModuleId,
                ModuleItemId = transaction.ModuleItemId,
                FromWarehouseId = ResolveFromWarehouse(transaction),
                ToWarehouseId = ResolveInStockWarehouse(transaction),
                MovementDate = transaction.MovementDate,
                Status = ResolveTargetStatus(transaction),
                PreviousStatus = priorDraftMovement?.PreviousStatus ?? serial.Status,
                PreviousWarehouseId = priorDraftMovement?.PreviousWarehouseId ?? serial.CurrentWarehouseId,
                PreviousSalesOrderItemId = priorDraftMovement?.PreviousSalesOrderItemId ?? serial.SalesOrderItemId,
                PreviousCustomerWarrantyEndDate = priorDraftMovement?.PreviousCustomerWarrantyEndDate ?? serial.CustomerWarrantyEndDate,
                PreviousCostAllocationId = priorDraftMovement?.PreviousCostAllocationId ?? serial.CostAllocationId
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
        DateTime? warrantyEndDate = null;
        if (transaction.ModuleName == nameof(SalesOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
        {
            var warranty = await _salesOrderItemRepository
                .GetQuery()
                .AsNoTracking()
                .Where(x => x.Id == transaction.ModuleItemId)
                .Select(x => new { x.SalesOrder!.OrderDate, x.WarrantyMonths })
                .SingleOrDefaultAsync(cancellationToken);
            warrantyEndDate = warranty?.OrderDate?.AddMonths(warranty.WarrantyMonths ?? 0);
        }

        foreach (var serial in serials)
        {
            ValidateSerialForTransaction(transaction, serial);
            serial.Status = targetStatus;
            serial.UpdatedById = userId;

            if (targetStatus == ProductSerialStatus.InStock || targetStatus == ProductSerialStatus.ReturnedByCustomer)
            {
                serial.CurrentWarehouseId = ResolveInStockWarehouse(transaction) ?? transaction.WarehouseId;
            }
            else if (targetStatus is ProductSerialStatus.Sold or ProductSerialStatus.Exported or ProductSerialStatus.ReturnedToSupplier or ProductSerialStatus.Missing or ProductSerialStatus.Scrapped)
            {
                serial.CurrentWarehouseId = null;
            }
            else if (targetStatus == ProductSerialStatus.InTransfer)
            {
                serial.CurrentWarehouseId = ResolveToWarehouse(transaction);
            }

            if (transaction.ModuleName == nameof(SalesOrder) && !string.IsNullOrWhiteSpace(transaction.ModuleItemId))
            {
                serial.SalesOrderItemId = transaction.ModuleItemId;
                serial.CustomerWarrantyEndDate = warrantyEndDate;
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
        var missingSerials = await _productSerialRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.ProductId == transaction.ProductId &&
                x.CurrentWarehouseId == transaction.WarehouseId &&
                (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.ReturnedByCustomer) &&
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

        if (transaction.ModuleName == nameof(PurchaseOrder))
        {
            return;
        }

        var targetStatus = ResolveTargetStatus(transaction);

        if (transaction.ModuleName == nameof(TransferIn))
        {
            if (serial.Status != ProductSerialStatus.InTransfer && serial.Status != ProductSerialStatus.Reserved && serial.Status != targetStatus)
            {
                throw new Exception("Transfer In requires serial numbers currently in transfer.");
            }
            return;
        }

        if (transaction.ModuleName == nameof(SalesReturn))
        {
            if (serial.Status != ProductSerialStatus.Sold && serial.Status != ProductSerialStatus.Reserved && serial.Status != targetStatus)
            {
                throw new Exception("Sales Return requires sold serial numbers.");
            }
            return;
        }

        if (serial.Status != ProductSerialStatus.InStock && serial.Status != ProductSerialStatus.Reserved && serial.Status != ProductSerialStatus.ReturnedByCustomer && serial.Status != targetStatus)
        {
            throw new Exception("Selected serial number is not available in stock.");
        }

        if (!string.IsNullOrWhiteSpace(transaction.WarehouseId) && serial.CurrentWarehouseId != transaction.WarehouseId && serial.Status != targetStatus)
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
            return transaction.ModuleName == nameof(PurchaseOrder)
                ? ProductSerialStatus.Pending
                : ProductSerialStatus.Reserved;
        }

        return transaction.ModuleName switch
        {
            nameof(SalesOrder) => ProductSerialStatus.Sold,
            nameof(PurchaseOrder) => ProductSerialStatus.InStock,
            nameof(SalesReturn) => ProductSerialStatus.ReturnedByCustomer,
            nameof(PurchaseReturn) => ProductSerialStatus.ReturnedToSupplier,
            nameof(TransferOut) => ProductSerialStatus.InTransfer,
            nameof(TransferIn) => ProductSerialStatus.InStock,
            nameof(Scrapping) => ProductSerialStatus.Scrapped,
            nameof(StockCount) => ProductSerialStatus.InStock,
            nameof(MaterialExport) => ProductSerialStatus.Exported,
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

    private static string? ResolveInStockWarehouse(InventoryTransaction transaction)
    {
        if (transaction.ModuleName == nameof(MaterialExport))
        {
            return null;
        }
        return transaction.ModuleName == nameof(StockCount)
            ? (transaction.WarehouseId ?? ResolveToWarehouse(transaction))
            : ResolveToWarehouse(transaction);
    }

    private static int ResolveTransactionQuantity(InventoryTransaction transaction)
    {
        if (transaction.ModuleName == nameof(StockCount))
        {
            return RequireWholeQuantity(transaction.QtySCCount, "Stock count quantity", allowZero: true);
        }

        return RequireWholeQuantity(transaction.Movement, "Movement");
    }

    private static int RequireWholeQuantity(decimal? quantity, string fieldName, bool allowZero = false)
    {
        if (quantity == null ||
            quantity < 0 ||
            (!allowZero && quantity <= 0) ||
            Math.Abs(quantity.Value % 1) > 0.000001m)
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
