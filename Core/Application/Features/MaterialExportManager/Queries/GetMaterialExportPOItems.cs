using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Queries;

public record GetMaterialExportPOItemsDto
{
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductReferenceCode { get; init; }
    public int? SerialTrackingMode { get; init; }
    public string? WarehouseId { get; init; }
    public double TotalQuantity { get; init; }
    public double StockQuantity { get; init; }
    public double RemainingQuantity { get; init; }
}

public class GetMaterialExportPOItemsResult
{
    public List<GetMaterialExportPOItemsDto>? Data { get; init; }
}

public class GetMaterialExportPOItemsRequest : IRequest<GetMaterialExportPOItemsResult>
{
    public string? PurchaseOrderId { get; init; }
}

public class GetMaterialExportPOItemsHandler : IRequestHandler<GetMaterialExportPOItemsRequest, GetMaterialExportPOItemsResult>
{
    private readonly IQueryContext _context;

    public GetMaterialExportPOItemsHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetMaterialExportPOItemsResult> Handle(GetMaterialExportPOItemsRequest request, CancellationToken cancellationToken)
    {
        // 1. Get PO items grouped by product
        var poItems = await _context
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x => x.PurchaseOrderId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);

        // 2. Get distinct productId+warehouseId pairs from PO items
        var productWarehousePairs = poItems
            .GroupBy(x => new { x.ProductId, x.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.WarehouseId })
            .ToList();

        var productIds = productWarehousePairs.Select(p => p.ProductId).Distinct().ToList();
        var warehouseIds = productWarehousePairs.Select(p => p.WarehouseId).Distinct().ToList();

        // 3. Get actual inventory stock per product+warehouse from InventoryTransaction
        var stockByProductWarehouse = await _context
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                productIds.Contains(x.ProductId) &&
                warehouseIds.Contains(x.WarehouseId) &&
                x.Status == InventoryTransactionStatus.Confirmed)
            .GroupBy(x => new { x.ProductId, x.WarehouseId })
            .Select(g => new
            {
                g.Key.ProductId,
                g.Key.WarehouseId,
                Stock = g.Sum(x => x.Stock ?? 0)
            })
            .ToListAsync(cancellationToken);

        var stockMap = stockByProductWarehouse
            .ToDictionary(x => $"{x.ProductId}|{x.WarehouseId}", x => x.Stock);

        // 4. Build result grouped by product
        var productGroups = poItems
            .GroupBy(x => x.ProductId)
            .Select(g =>
            {
                var firstItem = g.First();
                var totalQty = g.Sum(x => x.Quantity ?? 0);
                var warehouseId = firstItem.WarehouseId;

                // Get actual stock for this product in this warehouse
                var stockKey = $"{g.Key}|{warehouseId}";
                var actualStock = stockMap.GetValueOrDefault(stockKey, 0);

                return new GetMaterialExportPOItemsDto
                {
                    ProductId = g.Key,
                    ProductName = firstItem.Product?.Name,
                    ProductReferenceCode = firstItem.Product?.ReferenceCode,
                    SerialTrackingMode = firstItem.Product?.SerialTrackingMode != null ? (int)firstItem.Product.SerialTrackingMode : 0,
                    WarehouseId = warehouseId,
                    TotalQuantity = totalQty,
                    StockQuantity = actualStock,
                    RemainingQuantity = actualStock > 0 ? actualStock : 0
                };
            })
            .ToList();

        return new GetMaterialExportPOItemsResult { Data = productGroups };
    }
}
