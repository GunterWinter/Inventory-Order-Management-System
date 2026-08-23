using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Features.ProductManager;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.ProductManager.Queries;

public record GetProductListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public string? Name { get; init; }
    public string? ReferenceCode { get; set; }
    public string? Description { get; init; }
    public decimal? UnitPrice { get; init; }
    public decimal? CostPrice { get; init; }
    public string? ImageUrl { get; init; }
    public bool? Physical { get; init; }
    public SerialTrackingMode? SerialTrackingMode { get; init; }
    public string? InternalSerialFixedCode { get; init; }
    public string? DefaultWarehouseId { get; init; }
    public string? DefaultWarehouseName { get; init; }
    public int? DefaultWarrantyMonths { get; init; }
    public string? UnitMeasureName { get; init; }
    public string? ProductGroupId { get; init; }
    public string? ProductGroupName { get; init; }
    public decimal OpeningStockQuantity { get; set; }
    public string? OpeningStockWarehouseId { get; set; }
    public string? OpeningStockWarehouseName { get; set; }
    public bool HasOpeningStockHistory { get; set; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetProductListProfile : Profile
{
    public GetProductListProfile()
    {
        CreateMap<Product, GetProductListDto>()
            .ForMember(
                dest => dest.ProductGroupName,
                opt => opt.MapFrom(src => src.ProductGroup != null ? src.ProductGroup.Name : string.Empty)
            )
            .ForMember(
                dest => dest.DefaultWarehouseName,
                opt => opt.MapFrom(src => src.DefaultWarehouse != null ? src.DefaultWarehouse.Name : string.Empty)
            )
            .ForMember(dest => dest.OpeningStockQuantity, opt => opt.Ignore())
            .ForMember(dest => dest.OpeningStockWarehouseId, opt => opt.Ignore())
            .ForMember(dest => dest.OpeningStockWarehouseName, opt => opt.Ignore())
            .ForMember(dest => dest.HasOpeningStockHistory, opt => opt.Ignore());

    }
}

public class GetProductListResult
{
    public List<GetProductListDto>? Data { get; init; }
}

public class GetProductListRequest : IRequest<GetProductListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetProductListHandler : IRequestHandler<GetProductListRequest, GetProductListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetProductListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetProductListResult> Handle(GetProductListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Product
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.ProductGroup)
            .Include(x => x.DefaultWarehouse)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetProductListDto>>(entities);

        var productIds = entities.Select(x => x.Id).ToList();
        var openingRows = await _context.Set<InventoryTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted
                && x.ProductId != null
                && productIds.Contains(x.ProductId)
                && x.ModuleName == nameof(StockCount)
                && x.ModuleCode == ProductOpeningStockService.OpeningStockModuleCode)
            .Select(x => new
            {
                ProductId = x.ProductId!,
                x.Stock,
                x.Status,
                x.WarehouseId,
                WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                x.CreatedAtUtc,
                x.Id
            })
            .ToListAsync(cancellationToken);

        var openingLookup = openingRows
            .GroupBy(x => x.ProductId)
            .ToDictionary(x => x.Key, x => x
                .OrderBy(row => row.CreatedAtUtc)
                .ThenBy(row => row.Id)
                .ToList());

        foreach (var dto in dtos)
        {
            if (dto.Id == null || !openingLookup.TryGetValue(dto.Id, out var history))
            {
                continue;
            }

            var first = history[0];
            dto.HasOpeningStockHistory = true;
            dto.OpeningStockQuantity = history
                .Where(x => x.Status == InventoryTransactionStatus.Confirmed)
                .Sum(x => x.Stock ?? 0m);
            dto.OpeningStockWarehouseId = first.WarehouseId;
            dto.OpeningStockWarehouseName = first.WarehouseName;
        }

        return new GetProductListResult
        {
            Data = dtos
        };
    }


}



