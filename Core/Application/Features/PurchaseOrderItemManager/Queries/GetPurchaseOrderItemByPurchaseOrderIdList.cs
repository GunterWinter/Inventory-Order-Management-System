using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace Application.Features.PurchaseOrderItemManager.Queries;

public record GetPurchaseOrderItemByPurchaseOrderIdListDto
{
    public string? Id { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? PurchaseOrderNumber { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductNumber { get; init; }
    public string? ProductReferenceCode { get; init; }
    public bool? Physical { get; init; }
    public int? SerialTrackingMode { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
    public string? TaxName { get; init; }
    public int? SupplierWarrantyMonths { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? Quantity { get; init; }
    public decimal? Total { get; init; }
    public decimal? TaxAmount { get; init; }
    public decimal? AfterTaxAmount { get; init; }
    public decimal? AllocatedQuantity { get; init; }
    public List<string> ManufacturerSerialNumbers { get; set; } = [];
    public decimal? StockQuantity { get; set; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetPurchaseOrderItemByPurchaseOrderIdListProfile : Profile
{
    public GetPurchaseOrderItemByPurchaseOrderIdListProfile()
    {
        CreateMap<PurchaseOrderItem, GetPurchaseOrderItemByPurchaseOrderIdListDto>()
            .ForMember(
                dest => dest.PurchaseOrderNumber,
                opt => opt.MapFrom(src => src.PurchaseOrder != null ? src.PurchaseOrder.Number : string.Empty)
            )
            .ForMember(
                dest => dest.ProductName,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Name : string.Empty)
            )
            .ForMember(
                dest => dest.ProductNumber,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Number : string.Empty)
            )
            .ForMember(
                dest => dest.ProductReferenceCode,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.ReferenceCode : string.Empty)
            )
            .ForMember(
                dest => dest.Physical,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Physical : null)
            )
            .ForMember(
                dest => dest.SerialTrackingMode,
                opt => opt.MapFrom(src => src.Product != null ? (int?)src.Product.SerialTrackingMode : null)
            )
            .ForMember(
                dest => dest.WarehouseName,
                opt => opt.MapFrom(src => src.Warehouse != null ? src.Warehouse.Name : string.Empty)
            )
            .ForMember(
                dest => dest.TaxName,
                opt => opt.MapFrom(src => src.Tax != null ? src.Tax.Name : string.Empty)
            )
            .ForMember(dest => dest.ManufacturerSerialNumbers, opt => opt.Ignore())
            ;

    }
}

public class GetPurchaseOrderItemByPurchaseOrderIdListResult
{
    public List<GetPurchaseOrderItemByPurchaseOrderIdListDto>? Data { get; init; }
}

public class GetPurchaseOrderItemByPurchaseOrderIdListRequest : IRequest<GetPurchaseOrderItemByPurchaseOrderIdListResult>
{
    public string? PurchaseOrderId { get; init; }
}


public class GetPurchaseOrderItemByPurchaseOrderIdListHandler : IRequestHandler<GetPurchaseOrderItemByPurchaseOrderIdListRequest, GetPurchaseOrderItemByPurchaseOrderIdListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetPurchaseOrderItemByPurchaseOrderIdListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetPurchaseOrderItemByPurchaseOrderIdListResult> Handle(GetPurchaseOrderItemByPurchaseOrderIdListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Set<PurchaseOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.PurchaseOrder)
            .Include(x => x.Product)
            .Include(x => x.Warehouse)
            .Include(x => x.Tax)

            .Where(x => x.PurchaseOrderId == request.PurchaseOrderId)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetPurchaseOrderItemByPurchaseOrderIdListDto>>(entities);

        for (var index = 0; index < entities.Count; index++)
        {
            var json = entities[index].ManufacturerSerialNumbersJson;
            if (!string.IsNullOrWhiteSpace(json))
            {
                dtos[index].ManufacturerSerialNumbers = JsonSerializer.Deserialize<List<string>>(json) ?? [];
            }
        }

        // Get stock quantity for each product+warehouse from InventoryTransaction
        var productWarehousePairs = entities
            .GroupBy(x => new { x.ProductId, x.WarehouseId })
            .Select(g => new { g.Key.ProductId, g.Key.WarehouseId })
            .ToList();

        var productIds = productWarehousePairs.Select(p => p.ProductId).Where(id => id != null).Distinct().ToList();
        var warehouseIds = productWarehousePairs.Select(p => p.WarehouseId).Where(id => id != null).Distinct().ToList();

        if (productIds.Any() && warehouseIds.Any())
        {
            var stockByProductWarehouse = await _context
                .Set<InventoryTransaction>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x =>
                    productIds.Contains(x.ProductId) &&
                    warehouseIds.Contains(x.WarehouseId) &&
                    x.Status == Domain.Enums.InventoryTransactionStatus.Confirmed)
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

            foreach (var dto in dtos)
            {
                var stockKey = $"{dto.ProductId}|{dto.WarehouseId}";
                dto.StockQuantity = stockMap.GetValueOrDefault(stockKey, 0);
            }
        }

        return new GetPurchaseOrderItemByPurchaseOrderIdListResult
        {
            Data = dtos
        };
    }


}



