using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Domain.Enums;

namespace Application.Features.InventoryTransactionManager.Queries;


public record GetInventoryTransactionListDto
{
    public string? Id { get; init; }
    public string? ModuleId { get; init; }
    public string? ModuleName { get; init; }
    public string? ModuleCode { get; init; }
    public string? ModuleNumber { get; init; }
    public DateTime? MovementDate { get; init; }
    public string? StatusName { get; init; }
    public string? Number { get; init; }
    public string? WarehouseName { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductReferenceCode { get; init; }
    public decimal? Movement { get; init; }
    public InventoryTransType? TransType { get; init; }
    public string? TransTypeName { get; init; }
    public decimal? Stock { get; init; }
    public string? WarehouseFromName { get; init; }
    public string? WarehouseToName { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}


public class GetInventoryTransactionListProfile : Profile
{
    public GetInventoryTransactionListProfile()
    {
        CreateMap<InventoryTransaction, GetInventoryTransactionListDto>()
            .ForMember(
                dest => dest.Movement,
                opt => opt.MapFrom(src => Math.Abs(src.Movement ?? 0))
            )
            .ForMember(
                dest => dest.Stock,
                opt => opt.MapFrom(src => Math.Abs(src.Movement ?? 0) * (int)(src.TransType ?? 0))
            )
            .ForMember(
                dest => dest.StatusName,
                opt => opt.MapFrom(src => src.Status.HasValue ? src.Status.Value.ToFriendlyName() : string.Empty)
            )
            .ForMember(
                dest => dest.TransTypeName,
                opt => opt.MapFrom(src => src.TransType.HasValue ? src.TransType.Value.ToFriendlyName() : string.Empty)
            )
            .ForMember(
                dest => dest.WarehouseName,
                opt => opt.MapFrom(src => src.Warehouse != null ? src.Warehouse.Name : string.Empty)
            )
            .ForMember(
                dest => dest.WarehouseToName,
                opt => opt.MapFrom(src => src.WarehouseTo != null ? src.WarehouseTo.Name : string.Empty)
            )
            .ForMember(
                dest => dest.WarehouseFromName,
                opt => opt.MapFrom(src => src.WarehouseFrom != null ? src.WarehouseFrom.Name : string.Empty)
            )
            .ForMember(
                dest => dest.ProductName,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Name : string.Empty)
            )
            .ForMember(
                dest => dest.ProductReferenceCode,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.ReferenceCode : string.Empty)
            );
    }
}

public class GetInventoryTransactionListResult
{
    public List<GetInventoryTransactionListDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetInventoryTransactionListRequest : PagedListRequest, IRequest<GetInventoryTransactionListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetInventoryTransactionListHandler : IRequestHandler<GetInventoryTransactionListRequest, GetInventoryTransactionListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetInventoryTransactionListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetInventoryTransactionListResult> Handle(GetInventoryTransactionListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Warehouse)
            .Include(x => x.Product)
            .Include(x => x.WarehouseFrom)
            .Include(x => x.WarehouseTo)
            .Where(x =>
                x.Product!.Physical == true &&
                x.Warehouse!.SystemWarehouse == false &&
                (x.Status == InventoryTransactionStatus.Confirmed
                    || x.Status == InventoryTransactionStatus.Archived)
            )
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(x => (x.Number != null && x.Number.Contains(search))
                || (x.ModuleNumber != null && x.ModuleNumber.Contains(search))
                || (x.Product != null && x.Product.Name != null && x.Product.Name.Contains(search))
                || (x.Product != null && x.Product.ReferenceCode != null && x.Product.ReferenceCode.Contains(search)));
        }
        query = request.SortField?.ToLowerInvariant() switch
        {
            "number" => request.Descending ? query.OrderByDescending(x => x.Number).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Number).ThenBy(x => x.Id),
            "movement" => request.Descending ? query.OrderByDescending(x => x.Movement).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Movement).ThenBy(x => x.Id),
            _ => request.Descending ? query.OrderByDescending(x => x.MovementDate).ThenByDescending(x => x.Id) : query.OrderBy(x => x.MovementDate).ThenBy(x => x.Id)
        };
        var totalCount = await query.CountAsync(cancellationToken);
        if (request.NormalizedPageSize is int pageSize)
            query = query.Skip((request.NormalizedPage - 1) * pageSize).Take(pageSize);

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetInventoryTransactionListDto>>(entities);

        return new GetInventoryTransactionListResult
        {
            Data = dtos,
            TotalCount = totalCount,
            Page = request.NormalizedPage,
            PageSize = request.NormalizedPageSize ?? totalCount
        };
    }


}



