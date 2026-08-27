using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.ProductManager;
using Domain.Common;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public sealed record InventoryCostBackfillLine(
    string TransactionId,
    string ModuleName,
    string? ModuleNumber,
    DateTime? DocumentDate,
    decimal Quantity,
    decimal CurrentTotal,
    decimal ProposedTotal,
    int CostLayers);

public sealed record InventoryCostBackfillResult(
    bool Applied,
    int OpeningDates,
    int Lines,
    int CostLayers,
    decimal CurrentTotal,
    decimal ProposedTotal,
    IReadOnlyList<InventoryCostBackfillLine> Details);

public sealed class InventoryCostBackfillService
{
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactions;
    private readonly ICommandRepository<StockCount> _stockCounts;
    private readonly ICommandRepository<MaterialExportItem> _costAllocations;
    private readonly ICommandRepository<ProductSerial> _productSerials;
    private readonly ICommandRepository<ProductSerialMovement> _serialMovements;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItems;
    private readonly ICommandRepository<CashTransaction> _cashTransactions;
    private readonly InventoryCostResolver _costResolver;
    private readonly InventoryTransactionService _inventoryService;
    private readonly IUnitOfWork _unitOfWork;

    public InventoryCostBackfillService(
        ICommandRepository<InventoryTransaction> inventoryTransactions,
        ICommandRepository<StockCount> stockCounts,
        ICommandRepository<MaterialExportItem> costAllocations,
        ICommandRepository<ProductSerial> productSerials,
        ICommandRepository<ProductSerialMovement> serialMovements,
        ICommandRepository<SalesOrderItem> salesOrderItems,
        ICommandRepository<CashTransaction> cashTransactions,
        InventoryCostResolver costResolver,
        InventoryTransactionService inventoryService,
        IUnitOfWork unitOfWork)
    {
        _inventoryTransactions = inventoryTransactions;
        _stockCounts = stockCounts;
        _costAllocations = costAllocations;
        _productSerials = productSerials;
        _serialMovements = serialMovements;
        _salesOrderItems = salesOrderItems;
        _cashTransactions = cashTransactions;
        _costResolver = costResolver;
        _inventoryService = inventoryService;
        _unitOfWork = unitOfWork;
    }

    public async Task<InventoryCostBackfillResult> RunAsync(
        bool apply,
        CancellationToken cancellationToken = default)
    {
        var openingRows = await _inventoryTransactions.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.ModuleName == nameof(StockCount)
                && x.ModuleCode == ProductOpeningStockService.OpeningStockModuleCode
                && x.MovementDate != null
                && x.MovementDate.Value.Day != 1)
            .Select(x => new { x.Id, x.ModuleId, Date = x.MovementDate!.Value })
            .ToListAsync(cancellationToken);
        var candidates = await _inventoryTransactions.GetQuery()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && (x.Status == InventoryTransactionStatus.Confirmed
                    || x.Status == InventoryTransactionStatus.Archived)
                && (x.ModuleName == nameof(MaterialExport) || x.ModuleName == nameof(SalesOrder))
                && x.Product != null && x.Product.Physical == true
                && (x.Stock ?? 0m) < 0m
                && !_costAllocations.GetQuery().Any(a => !a.IsDeleted && a.InventoryTransactionId == x.Id))
            .OrderBy(x => x.MovementDate ?? x.CreatedAtUtc)
            .ThenBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .Select(x => new
            {
                x.Id,
                x.ModuleName,
                x.ModuleId,
                x.ModuleItemId,
                x.ModuleNumber,
                x.MovementDate,
                x.CreatedAtUtc,
                x.ProductId,
                x.WarehouseId,
                Quantity = -(x.Stock ?? 0m),
                CurrentUnitCost = x.UnitCost ?? 0m,
                SerialTrackingMode = x.Product!.SerialTrackingMode ?? SerialTrackingMode.None
            })
            .ToListAsync(cancellationToken);

        var details = new List<InventoryCostBackfillLine>(candidates.Count);

        async Task ExecuteAsync(CancellationToken ct)
        {
            if (apply)
            {
                foreach (var opening in openingRows)
                {
                    var effectiveDate = new DateTime(opening.Date.Year, opening.Date.Month, 1);
                    var transaction = await _inventoryTransactions.GetAsync(opening.Id, ct)
                        ?? throw new InvalidOperationException($"Không tìm thấy tồn đầu kỳ {opening.Id}.");
                    transaction.MovementDate = effectiveDate;
                    transaction.UpdatedAtUtc = AppDateTime.VietnamNow();
                    transaction.UpdatedById = "inventory-cost-backfill";
                    _inventoryTransactions.Update(transaction);

                    if (opening.ModuleId != null)
                    {
                        var stockCount = await _stockCounts.GetAsync(opening.ModuleId, ct);
                        if (stockCount != null)
                        {
                            stockCount.CountDate = effectiveDate;
                            stockCount.UpdatedAtUtc = AppDateTime.VietnamNow();
                            stockCount.UpdatedById = "inventory-cost-backfill";
                            _stockCounts.Update(stockCount);
                        }
                    }
                }
                await _unitOfWork.SaveAsync(ct);
            }

            foreach (var candidate in candidates)
            {
                var transaction = apply
                    ? await _inventoryTransactions.GetAsync(candidate.Id, ct)
                        ?? throw new InvalidOperationException($"Không tìm thấy giao dịch kho {candidate.Id}.")
                    : null;
                decimal proposedTotal;
                int costLayers;

                if (candidate.SerialTrackingMode == SerialTrackingMode.None)
                {
                    var resolution = await _costResolver.ResolveFifoAsync(
                        candidate.ProductId,
                        candidate.WarehouseId,
                        candidate.Quantity,
                        candidate.MovementDate ?? candidate.CreatedAtUtc,
                        candidate.Id,
                        ct);
                    proposedTotal = resolution.TotalCost;
                    costLayers = resolution.Slices.Count;
                    if (apply)
                    {
                        transaction!.UnitCost = resolution.UnitCost;
                        transaction.UpdatedAtUtc = AppDateTime.VietnamNow();
                        _inventoryTransactions.Update(transaction);
                        await _inventoryService.ReplaceFifoCostAllocationsAsync(
                            transaction, resolution.Slices, "inventory-cost-backfill", candidate.ModuleId, ct);
                    }
                }
                else
                {
                    var serialIds = await _serialMovements.GetQuery()
                        .AsNoTracking()
                        .Where(x => !x.IsDeleted && x.ReversedAtUtc == null
                            && x.InventoryTransactionId == candidate.Id && x.ProductSerialId != null)
                        .OrderBy(x => x.CreatedAtUtc)
                        .ThenBy(x => x.Id)
                        .Select(x => x.ProductSerialId!)
                        .ToListAsync(ct);
                    var serials = await _productSerials.GetQuery()
                        .ApplyIsDeletedFilter(false)
                        .Include(x => x.PurchaseOrderItem)
                        .Include(x => x.Product)
                        .Where(x => serialIds.Contains(x.Id))
                        .ToListAsync(ct);
                    if (serials.Count != decimal.ToInt32(candidate.Quantity))
                        throw new InvalidOperationException($"Dòng {candidate.ModuleNumber ?? candidate.Id} thiếu serial lịch sử để backfill.");

                    proposedTotal = AccountingMath.RoundVnd(serials.Sum(x => _costResolver.ResolveSerial(x).UnitCost));
                    costLayers = serials.Count;
                    if (apply)
                    {
                        transaction!.UnitCost = AccountingMath.RoundVnd(proposedTotal / candidate.Quantity);
                        transaction.UpdatedAtUtc = AppDateTime.VietnamNow();
                        _inventoryTransactions.Update(transaction);
                        await _inventoryService.ReplaceSerialCostAllocationsAsync(
                            transaction, serials, "inventory-cost-backfill", candidate.ModuleId, ct);
                    }
                }

                if (apply && candidate.ModuleName == nameof(SalesOrder))
                {
                    var item = await _salesOrderItems.GetAsync(candidate.ModuleItemId ?? string.Empty, ct)
                        ?? throw new InvalidOperationException($"Dòng bán hàng {candidate.ModuleNumber ?? candidate.Id} không còn tồn tại.");
                    item.CogsAmount = proposedTotal;
                    item.ProfitAmount = AccountingMath.RoundVnd(
                        (item.UnitPrice ?? 0m) * (item.Quantity ?? 0m) - proposedTotal);
                    item.UpdatedAtUtc = AppDateTime.VietnamNow();
                    item.UpdatedById = "inventory-cost-backfill";
                    _salesOrderItems.Update(item);
                }

                details.Add(new InventoryCostBackfillLine(
                    candidate.Id,
                    candidate.ModuleName!,
                    candidate.ModuleNumber,
                    candidate.MovementDate ?? candidate.CreatedAtUtc,
                    candidate.Quantity,
                    AccountingMath.RoundVnd(candidate.Quantity * candidate.CurrentUnitCost),
                    proposedTotal,
                    costLayers));
            }

            if (!apply) return;
            await _unitOfWork.SaveAsync(ct);

            foreach (var materialExportId in candidates
                .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId != null)
                .Select(x => x.ModuleId!)
                .Distinct())
            {
                var documentTotal = await (from allocation in _costAllocations.GetQuery()
                    join inventory in _inventoryTransactions.GetQuery()
                        on allocation.InventoryTransactionId equals inventory.Id
                    where !allocation.IsDeleted && !inventory.IsDeleted
                        && inventory.ModuleName == nameof(MaterialExport)
                        && inventory.ModuleId == materialExportId
                    select allocation.Total ?? 0m).SumAsync(ct);
                var cashRows = await _cashTransactions.GetQuery()
                    .Where(x => !x.IsDeleted && x.SourceModule == nameof(MaterialExport)
                        && x.SourceModuleId == materialExportId)
                    .ToListAsync(ct);
                foreach (var cash in cashRows)
                {
                    cash.Amount = documentTotal;
                    cash.UpdatedAtUtc = AppDateTime.VietnamNow();
                    cash.UpdatedById = "inventory-cost-backfill";
                    _cashTransactions.Update(cash);
                }
            }
            await _unitOfWork.SaveAsync(ct);
        }

        if (apply)
            await _unitOfWork.ExecuteInTransactionAsync(ExecuteAsync, cancellationToken);
        else
            await ExecuteAsync(cancellationToken);

        return new InventoryCostBackfillResult(
            apply,
            openingRows.Count,
            details.Count,
            details.Sum(x => x.CostLayers),
            AccountingMath.RoundVnd(details.Sum(x => x.CurrentTotal)),
            AccountingMath.RoundVnd(details.Sum(x => x.ProposedTotal)),
            details);
    }
}
