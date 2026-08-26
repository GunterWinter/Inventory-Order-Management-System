using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderItemManager.Queries;

public record GetSalesOrderItemListDto
{
    public string? Id { get; init; }
    public string? SalesOrderId { get; init; }
    public string? SalesOrderNumber { get; init; }
    public string? CustomerName { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductNumber { get; init; }
    public string? ProductReferenceCode { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public string? Summary { get; init; }
    public string? TaxId { get; init; }
    public string? TaxName { get; init; }
    public int? WarrantyMonths { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? Quantity { get; init; }
    public decimal? Total { get; init; }
    public decimal? TaxAmount { get; init; }
    public decimal? AfterTaxAmount { get; init; }
    public decimal? CogsAmount { get; init; }
    public decimal? ProfitAmount { get; init; }
    public List<string>? ProductSerialIds { get; set; }
    public string? ProductSerialNumbers { get; set; }
    public List<MaterialExportItem> CostAllocations { get; set; } = [];
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetSalesOrderItemListProfile : Profile
{
    public GetSalesOrderItemListProfile()
    {
        CreateMap<SalesOrderItem, GetSalesOrderItemListDto>()
            .ForMember(
                dest => dest.SalesOrderNumber,
                opt => opt.MapFrom(src => src.SalesOrder != null ? src.SalesOrder.Number : string.Empty)
            )
            .ForMember(
                dest => dest.CustomerName,
                opt => opt.MapFrom(src => src.SalesOrder!.Customer != null ? src.SalesOrder.Customer.Name : string.Empty)
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
                dest => dest.WarehouseName,
                opt => opt.MapFrom(src => src.Warehouse != null ? src.Warehouse.Name : string.Empty)
            )
            .ForMember(
                dest => dest.TaxName,
                opt => opt.MapFrom(src => src.Tax != null ? src.Tax.Name : string.Empty)
            );

    }
}

public class GetSalesOrderItemListResult
{
    public List<GetSalesOrderItemListDto>? Data { get; init; }
}

public class GetSalesOrderItemListRequest : IRequest<GetSalesOrderItemListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetSalesOrderItemListHandler : IRequestHandler<GetSalesOrderItemListRequest, GetSalesOrderItemListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetSalesOrderItemListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetSalesOrderItemListResult> Handle(GetSalesOrderItemListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Set<SalesOrderItem>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.SalesOrder)
                .ThenInclude(x => x!.Customer)
            .Include(x => x.Product)
            .Include(x => x.Warehouse)
            .Include(x => x.Tax)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetSalesOrderItemListDto>>(entities);

        var itemIds = dtos.Select(x => x.Id).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
        var serials = await _context
            .Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => itemIds.Contains(x.SalesOrderItemId))
            .Select(x => new { x.Id, x.SalesOrderItemId, x.InternalSerialNumber })
            .ToListAsync(cancellationToken);

        var serialLookup = serials
            .Where(x => !string.IsNullOrWhiteSpace(x.SalesOrderItemId))
            .GroupBy(x => x.SalesOrderItemId!)
            .ToDictionary(x => x.Key, x => x.ToList());

        var costRows = await (from inventory in _context.Set<InventoryTransaction>().AsNoTracking()
            join allocation in _context.Set<MaterialExportItem>().AsNoTracking()
                on inventory.Id equals allocation.InventoryTransactionId
            join source in _context.Set<InventoryTransaction>().AsNoTracking()
                on allocation.SourceInventoryTransactionId equals source.Id
            join serial in _context.Set<ProductSerial>().AsNoTracking()
                on allocation.ProductSerialId equals serial.Id into serialsByAllocation
            from serial in serialsByAllocation.DefaultIfEmpty()
            where !inventory.IsDeleted && !allocation.IsDeleted
                && inventory.ModuleName == nameof(SalesOrder)
                && inventory.ModuleItemId != null && itemIds.Contains(inventory.ModuleItemId)
            orderby source.MovementDate, source.CreatedAtUtc, source.Id, allocation.Id
            select new
            {
                inventory.ModuleItemId,
                Allocation = new MaterialExportItem
                {
                    Id = allocation.Id,
                    InventoryTransactionId = allocation.InventoryTransactionId,
                    SourceInventoryTransactionId = allocation.SourceInventoryTransactionId,
                    SourceCostAllocationId = allocation.SourceCostAllocationId,
                    PurchaseOrderItemId = allocation.PurchaseOrderItemId,
                    ProductSerialId = allocation.ProductSerialId,
                    Quantity = allocation.Quantity,
                    UnitPrice = allocation.UnitPrice,
                    Total = allocation.Total,
                    CostSource = allocation.CostSource,
                    SourceModule = source.ModuleName,
                    SourceNumber = source.ModuleNumber ?? source.Number,
                    SourceDate = source.MovementDate,
                    ProductSerialNumber = serial != null
                        ? serial.ManufacturerSerialNumber ?? serial.InternalSerialNumber
                        : null
                }
            }).ToListAsync(cancellationToken);
        var costLookup = costRows.GroupBy(x => x.ModuleItemId!)
            .ToDictionary(x => x.Key, x => x.Select(y => y.Allocation).ToList());

        foreach (var dto in dtos)
        {
            if (!string.IsNullOrWhiteSpace(dto.Id)
                && serialLookup.TryGetValue(dto.Id, out var itemSerials))
            {
                dto.ProductSerialIds = itemSerials.Select(x => x.Id).ToList();
                dto.ProductSerialNumbers = string.Join(", ", itemSerials.Select(x => x.InternalSerialNumber));
            }
            if (!string.IsNullOrWhiteSpace(dto.Id) && costLookup.TryGetValue(dto.Id, out var itemCosts))
                dto.CostAllocations = itemCosts;
        }

        return new GetSalesOrderItemListResult
        {
            Data = dtos
        };
    }


}



