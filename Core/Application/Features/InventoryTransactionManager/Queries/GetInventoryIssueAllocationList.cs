using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.InventoryIssueAllocationManager.Queries;

public record GetInventoryIssueAllocationListDto
{
    public string? Id { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ProductNumber { get; init; }
    public string? BatchNumber { get; init; }
    public string? SalesOrderItemId { get; init; }
    public string? SalesOrderNumber { get; init; }
    public decimal? QtyIssued { get; init; }
    public decimal? UnitCost { get; init; }
    public decimal? SalesUnitPrice { get; init; }
    public decimal? CostAmount { get; init; }
    public decimal? SalesAmount { get; init; }
    public decimal? ProfitAmount { get; init; }
    public DateTime? AllocationDate { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetInventoryIssueAllocationListProfile : Profile
{
    public GetInventoryIssueAllocationListProfile()
    {
        CreateMap<InventoryIssueAllocation, GetInventoryIssueAllocationListDto>()
            .ForMember(dest => dest.WarehouseName,
                opt => opt.MapFrom(src => src.Warehouse != null ? src.Warehouse.Name : string.Empty))
            .ForMember(dest => dest.ProductName,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Name : string.Empty))
            .ForMember(dest => dest.ProductNumber,
                opt => opt.MapFrom(src => src.Product != null ? src.Product.Number : string.Empty))
            .ForMember(dest => dest.SalesOrderNumber,
                opt => opt.MapFrom(src =>
                    src.SalesOrderItem != null && src.SalesOrderItem.SalesOrder != null
                        ? src.SalesOrderItem.SalesOrder.Number
                        : string.Empty));
    }
}

public class GetInventoryIssueAllocationListResult
{
    public List<GetInventoryIssueAllocationListDto>? Data { get; init; }
}

public class GetInventoryIssueAllocationListRequest : IRequest<GetInventoryIssueAllocationListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetInventoryIssueAllocationListHandler : IRequestHandler<GetInventoryIssueAllocationListRequest, GetInventoryIssueAllocationListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetInventoryIssueAllocationListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetInventoryIssueAllocationListResult> Handle(GetInventoryIssueAllocationListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Set<InventoryIssueAllocation>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Warehouse)
            .Include(x => x.Product)
            .Include(x => x.SalesOrderItem)
                .ThenInclude(x => x!.SalesOrder)
            .OrderByDescending(x => x.AllocationDate)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);
        var dtos = _mapper.Map<List<GetInventoryIssueAllocationListDto>>(entities);

        return new GetInventoryIssueAllocationListResult { Data = dtos };
    }
}
