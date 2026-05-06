using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
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
    public string? BatchNumber { get; init; }
    public double? Stock { get; init; }
    public int? SupplierWarrantyMonths { get; set; }
    public double? SupplierWarrantyRemaining { get; set; }
    public DateTime? CreatedAtUtc { get; init; }
}


public class GetInventoryStockListProfile : Profile
{
    public GetInventoryStockListProfile()
    {
    }
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
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetInventoryStockListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetInventoryStockListResult> Handle(GetInventoryStockListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Warehouse)
            .Include(x => x.Product)
            .Where(x =>
                x.Product!.Physical == true &&
                x.Warehouse!.SystemWarehouse == false &&
                x.Status == Domain.Enums.InventoryTransactionStatus.Confirmed
            )
            .GroupBy(x => new { x.WarehouseId, x.ProductId, x.BatchNumber })
            .Select(group => new GetInventoryStockListDto
            {
                WarehouseId = group.Key.WarehouseId,
                ProductId = group.Key.ProductId,
                BatchNumber = group.Key.BatchNumber,
                WarehouseName = group.Max(x => x.Warehouse!.Name),
                ProductName = group.Max(x => x.Product!.Name),
                ProductNumber = group.Max(x => x.Product!.Number),
                ProductReferenceCode = group.Max(x => x.Product!.ReferenceCode),
                Stock = group.Sum(x => x.Stock),
                StatusName = group.Max(x => x.Status.ToString()),
                CreatedAtUtc = group.Max(x => x.CreatedAtUtc)
            })
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        // Lookup supplier warranty from PurchaseOrderItem (latest PO date wins)
        var warrantyLookup = await _context
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.PurchaseOrder)
            .Where(x =>
                x.SupplierWarrantyMonths != null &&
                x.PurchaseOrder != null &&
                x.PurchaseOrder.OrderDate != null
            )
            .Select(x => new
            {
                x.ProductId,
                x.WarehouseId,
                x.BatchNumber,
                x.SupplierWarrantyMonths,
                OrderDate = x.PurchaseOrder!.OrderDate
            })
            .ToListAsync(cancellationToken);

        var warrantyMap = warrantyLookup
            .GroupBy(x => new { x.ProductId, x.WarehouseId, x.BatchNumber })
            .ToDictionary(
                g => g.Key,
                g => g.OrderByDescending(x => x.OrderDate).First()
            );

        var now = DateTime.UtcNow;

        foreach (var entity in entities)
        {
            var key = new { entity.ProductId, entity.WarehouseId, entity.BatchNumber };
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



