using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryCostLayerManager.Queries;

public record GetInventoryCostLayerListDto
{
    public string? Id { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductNumber { get; init; }
    public string? BatchNumber { get; init; }
    public DateTime? ReceivedDate { get; init; }
    public decimal? UnitCost { get; init; }
    public decimal? OriginalQty { get; init; }
    public decimal? RemainingQty { get; init; }
    public int? LayerStatus { get; init; }
    public string? LayerStatusName { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetInventoryCostLayerListProfile : Profile
{
    public GetInventoryCostLayerListProfile()
    {
        CreateMap<InventoryCostLayer, GetInventoryCostLayerListDto>()
            .ForMember(dest => dest.WarehouseName,
                opt => opt.MapFrom(src => src.Warehouse != null ? src.Warehouse.Name : string.Empty))
            .ForMember(dest => dest.ProductName,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Name : string.Empty))
            .ForMember(dest => dest.ProductNumber,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Number : string.Empty))
            .ForMember(dest => dest.LayerStatusName,
                opt => opt.MapFrom(src => src.LayerStatus == 1 ? "Open" : src.LayerStatus == 2 ? "Closed" : "Unknown"));
    }
}

public class GetInventoryCostLayerListResult
{
    public List<GetInventoryCostLayerListDto>? Data { get; init; }
}

public class GetInventoryCostLayerListRequest : IRequest<GetInventoryCostLayerListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetInventoryCostLayerListHandler : IRequestHandler<GetInventoryCostLayerListRequest, GetInventoryCostLayerListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetInventoryCostLayerListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetInventoryCostLayerListResult> Handle(GetInventoryCostLayerListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Set<InventoryCostLayer>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Warehouse)
            .Include(x => x.Product)
            .OrderByDescending(x => x.ReceivedDate)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);
        var dtos = _mapper.Map<List<GetInventoryCostLayerListDto>>(entities);

        return new GetInventoryCostLayerListResult { Data = dtos };
    }
}
