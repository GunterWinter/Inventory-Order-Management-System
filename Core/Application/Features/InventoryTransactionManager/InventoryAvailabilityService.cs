using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager;

public class InventoryAvailabilityService
{
    private readonly IQueryContext _context;

    public InventoryAvailabilityService(IQueryContext context)
    {
        _context = context;
    }

    public async Task<double> GetAvailableStockAsync(
        string productId,
        string warehouseId,
        string? currentSalesOrderItemId,
        CancellationToken cancellationToken)
    {
        var trackingMode = await _context.Set<Product>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.Id == productId)
            .Select(x => x.SerialTrackingMode)
            .SingleOrDefaultAsync(cancellationToken);

        if (trackingMode != null && trackingMode != SerialTrackingMode.None)
        {
            return await _context.Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x =>
                    x.ProductId == productId &&
                    x.CurrentWarehouseId == warehouseId &&
                    (x.Status == ProductSerialStatus.InStock ||
                     x.Status == ProductSerialStatus.ReturnedByCustomer ||
                     (!string.IsNullOrEmpty(currentSalesOrderItemId) &&
                      x.Status == ProductSerialStatus.Reserved &&
                      x.SalesOrderItemId == currentSalesOrderItemId)))
                .CountAsync(cancellationToken);
        }

        var availableStock = await _context.Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.Status == InventoryTransactionStatus.Confirmed &&
                x.ProductId == productId &&
                x.WarehouseId == warehouseId)
            .SumAsync(x => x.Stock ?? 0d, cancellationToken);

        if (!string.IsNullOrWhiteSpace(currentSalesOrderItemId))
        {
            var currentIssuedStock = await _context.Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x =>
                    x.Status == InventoryTransactionStatus.Confirmed &&
                    x.ModuleName == nameof(SalesOrder) &&
                    x.ModuleItemId == currentSalesOrderItemId &&
                    x.ProductId == productId &&
                    x.WarehouseId == warehouseId)
                .SumAsync(x => x.Stock ?? 0d, cancellationToken);

            availableStock -= currentIssuedStock;
        }

        return availableStock;
    }
}
