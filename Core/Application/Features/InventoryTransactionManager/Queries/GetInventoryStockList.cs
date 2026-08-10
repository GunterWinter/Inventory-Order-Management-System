using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryTransactionManager.Queries;


public record GetInventoryStockListDto
{
    public string? StatusName { get; init; }
    public string? WarehouseId { get; set; }
    public string? WarehouseName { get; init; }
    public string? ProductId { get; set; }
    public string? ProductName { get; init; }
    public string? ProductNumber { get; init; }
    public string? ProductReferenceCode { get; init; }

    public double? Stock { get; init; }
    public int? SupplierWarrantyMonths { get; set; }
    public double? SupplierWarrantyRemaining { get; set; }
    public DateTime? CreatedAtUtc { get; init; }
}


public class GetInventoryStockListResult
{
    public List<GetInventoryStockListDto>? Data { get; init; }
}

public class GetInventoryStockListRequest : IRequest<GetInventoryStockListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetInventoryStockListHandler : IRequestHandler<GetInventoryStockListRequest, GetInventoryStockListResult>
{
    private readonly IQueryContext _context;

    public GetInventoryStockListHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetInventoryStockListResult> Handle(GetInventoryStockListRequest request, CancellationToken cancellationToken)
    {
        var transactionStockQuery = _context
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Warehouse)
            .Include(x => x.Product)
            .Where(x =>
                x.Product!.Physical == true &&
                (x.Product.SerialTrackingMode == null || x.Product.SerialTrackingMode == SerialTrackingMode.None) &&
                x.Warehouse!.SystemWarehouse == false &&
                x.Status == Domain.Enums.InventoryTransactionStatus.Confirmed
            )
            .GroupBy(x => new
            {
                x.WarehouseId,
                WarehouseName = x.Warehouse!.Name,
                x.ProductId,
                ProductName = x.Product!.Name,
                ProductNumber = x.Product.Number,
                ProductReferenceCode = x.Product.ReferenceCode
            })
            .Select(group => new GetInventoryStockListDto
            {
                WarehouseId = group.Key.WarehouseId,
                ProductId = group.Key.ProductId,
                WarehouseName = group.Key.WarehouseName,
                ProductName = group.Key.ProductName,
                ProductNumber = group.Key.ProductNumber,
                ProductReferenceCode = group.Key.ProductReferenceCode,
                Stock = group.Sum(x => x.Stock),
                StatusName = nameof(InventoryTransactionStatus.Confirmed),
                CreatedAtUtc = group.Max(x => x.CreatedAtUtc)
            })
            .AsQueryable();

        var entities = await transactionStockQuery.ToListAsync(cancellationToken);

        var serialStock = await _context.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Where(x =>
                x.Product != null &&
                x.Product.Physical == true &&
                x.Product.SerialTrackingMode != SerialTrackingMode.None &&
                x.CurrentWarehouse != null &&
                x.CurrentWarehouse.SystemWarehouse == false &&
                (x.Status == ProductSerialStatus.InStock || x.Status == ProductSerialStatus.ReturnedByCustomer))
            .GroupBy(x => new
            {
                x.CurrentWarehouseId,
                WarehouseName = x.CurrentWarehouse!.Name,
                x.ProductId,
                ProductName = x.Product!.Name,
                ProductNumber = x.Product.Number,
                ProductReferenceCode = x.Product.ReferenceCode
            })
            .Select(group => new GetInventoryStockListDto
            {
                WarehouseId = group.Key.CurrentWarehouseId,
                ProductId = group.Key.ProductId,
                WarehouseName = group.Key.WarehouseName,
                ProductName = group.Key.ProductName,
                ProductNumber = group.Key.ProductNumber,
                ProductReferenceCode = group.Key.ProductReferenceCode,
                Stock = group.Count(),
                StatusName = nameof(InventoryTransactionStatus.Confirmed),
                CreatedAtUtc = group.Max(x => x.CreatedAtUtc)
            })
            .ToListAsync(cancellationToken);

        entities = entities
            .Concat(serialStock)
            .GroupBy(x => new { x.WarehouseId, x.ProductId })
            .Select(group =>
            {
                var first = group.First();
                return new GetInventoryStockListDto
                {
                    WarehouseId = group.Key.WarehouseId,
                    WarehouseName = first.WarehouseName,
                    ProductId = group.Key.ProductId,
                    ProductName = first.ProductName,
                    ProductNumber = first.ProductNumber,
                    ProductReferenceCode = first.ProductReferenceCode,
                    Stock = group.Sum(x => x.Stock ?? 0d),
                    StatusName = nameof(InventoryTransactionStatus.Confirmed),
                    CreatedAtUtc = group.Max(x => x.CreatedAtUtc)
                };
            })
            .ToList();

        // Lookup supplier warranty from PurchaseOrderItem (latest PO date wins)
        var productIds = entities.Select(x => x.ProductId).Where(x => x != null).Distinct().ToList();
        var warehouseIds = entities.Select(x => x.WarehouseId).Where(x => x != null).Distinct().ToList();

        var warrantyLookup = await _context
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.PurchaseOrder)
            .Where(x =>
                x.SupplierWarrantyMonths != null &&
                x.PurchaseOrder != null &&
                x.PurchaseOrder.OrderDate != null &&
                productIds.Contains(x.ProductId) &&
                warehouseIds.Contains(x.WarehouseId)
            )
            .Select(x => new
            {
                x.ProductId,
                x.WarehouseId,
                x.SupplierWarrantyMonths,
                OrderDate = x.PurchaseOrder!.OrderDate
            })
            .ToListAsync(cancellationToken);

        var warrantyMap = warrantyLookup
            .GroupBy(x => new { x.ProductId, x.WarehouseId })
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.OrderDate).First()
            );

        var now = DateTime.UtcNow;

        foreach (var entity in entities)
        {
            var key = new { entity.ProductId, entity.WarehouseId };
            if (warrantyMap.TryGetValue(key, out var warranty))
            {
                entity.SupplierWarrantyMonths = warranty.SupplierWarrantyMonths;
                var orderDate = warranty.OrderDate!.Value;
                var monthsElapsed = ((now.Year - orderDate.Year) * 12) + (now.Month - orderDate.Month);
                if (now.Day < orderDate.Day) monthsElapsed--;
                var remaining = (warranty.SupplierWarrantyMonths ?? 0) - monthsElapsed;
                entity.SupplierWarrantyRemaining = Math.Max(0, remaining);
            }
        }

        return new GetInventoryStockListResult
        {
            Data = entities
        };
    }


}



