using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Queries;

public record GetPurchaseOrderListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public DateTime? OrderDate { get; init; }
    public PurchaseOrderStatus? OrderStatus { get; init; }
    public string? OrderStatusName { get; init; }
    public string? Description { get; init; }
    public string? VendorId { get; init; }
    public string? VendorName { get; init; }
    public decimal? BeforeTaxAmount { get; init; }
    public decimal? TaxAmount { get; init; }
    public decimal? AfterTaxAmount { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetPurchaseOrderListProfile : Profile
{
    public GetPurchaseOrderListProfile()
    {
        CreateMap<PurchaseOrder, GetPurchaseOrderListDto>()
            .ForMember(
                dest => dest.VendorName,
                opt => opt.MapFrom(src => src.Vendor != null ? src.Vendor.Name : string.Empty)
            )
            .ForMember(
                dest => dest.OrderStatusName,
                opt => opt.MapFrom(src => src.OrderStatus.HasValue ? src.OrderStatus.Value.ToFriendlyName() : string.Empty)
            );

    }
}

public class GetPurchaseOrderListResult
{
    public List<GetPurchaseOrderListDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetPurchaseOrderListRequest : PagedListRequest, IRequest<GetPurchaseOrderListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetPurchaseOrderListHandler : IRequestHandler<GetPurchaseOrderListRequest, GetPurchaseOrderListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetPurchaseOrderListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetPurchaseOrderListResult> Handle(GetPurchaseOrderListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .PurchaseOrder
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.Vendor)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(x => (x.Number != null && x.Number.Contains(search))
                || (x.Vendor != null && x.Vendor.Name != null && x.Vendor.Name.Contains(search))
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

        var dtos = _mapper.Map<List<GetPurchaseOrderListDto>>(entities);

        return new GetPurchaseOrderListResult
        {
            Data = dtos,
            TotalCount = totalCount,
            Page = request.NormalizedPage,
            PageSize = request.NormalizedPageSize ?? totalCount
        };
    }


}



