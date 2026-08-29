using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager.Queries;

public record GetSalesOrderListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public DateTime? OrderDate { get; init; }
    public SalesOrderStatus? OrderStatus { get; init; }
    public string? OrderStatusName { get; init; }
    public string? Description { get; init; }
    public string? CustomerId { get; init; }
    public string? CustomerName { get; init; }
    public SalesType? SalesType { get; init; }
    public string? SalesTypeName { get; init; }
    public decimal? BeforeTaxAmount { get; init; }
    public decimal? TaxAmount { get; init; }
    public decimal? AfterTaxAmount { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetSalesOrderListProfile : Profile
{
    public GetSalesOrderListProfile()
    {
        CreateMap<SalesOrder, GetSalesOrderListDto>()
            .ForMember(
                dest => dest.CustomerName,
                opt => opt.MapFrom(src => src.Customer != null ? src.Customer.Name : string.Empty)
            )
            .ForMember(
                dest => dest.OrderStatusName,
                opt => opt.MapFrom(src => src.OrderStatus.HasValue ? src.OrderStatus.Value.ToFriendlyName() : string.Empty)
            )
            .ForMember(
                dest => dest.SalesTypeName,
                opt => opt.MapFrom(src => src.SalesType == SalesType.Retail ? "Xuất bán lẻ" : (src.SalesType == SalesType.Internal ? "Xuất nội bộ" : string.Empty))
            );

    }
}

public class GetSalesOrderListResult
{
    public List<GetSalesOrderListDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetSalesOrderListRequest : PagedListRequest, IRequest<GetSalesOrderListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetSalesOrderListHandler : IRequestHandler<GetSalesOrderListRequest, GetSalesOrderListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetSalesOrderListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetSalesOrderListResult> Handle(GetSalesOrderListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .SalesOrder
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Customer)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(x => (x.Number != null && x.Number.Contains(search))
                || (x.Customer != null && x.Customer.Name != null && x.Customer.Name.Contains(search))
                || (x.Description != null && x.Description.Contains(search)));
        }
        query = request.SortField?.ToLowerInvariant() switch
        {
            "number" => request.Descending ? query.OrderByDescending(x => x.Number).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Number).ThenBy(x => x.Id),
            "aftertaxamount" => request.Descending ? query.OrderByDescending(x => x.AfterTaxAmount).ThenByDescending(x => x.Id) : query.OrderBy(x => x.AfterTaxAmount).ThenBy(x => x.Id),
            _ => request.Descending ? query.OrderByDescending(x => x.OrderDate).ThenByDescending(x => x.Id) : query.OrderBy(x => x.OrderDate).ThenBy(x => x.Id)
        };
        var totalCount = await query.CountAsync(cancellationToken);
        if (request.NormalizedPageSize is int pageSize)
            query = query.Skip((request.NormalizedPage - 1) * pageSize).Take(pageSize);

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetSalesOrderListDto>>(entities);

        return new GetSalesOrderListResult
        {
            Data = dtos,
            TotalCount = totalCount,
            Page = request.NormalizedPage,
            PageSize = request.NormalizedPageSize ?? totalCount
        };
    }


}



