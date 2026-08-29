using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.VendorManager.Queries;

public record GetVendorListDto
{
    public string? Id { get; init; }
    public string? Name { get; set; }
    public string? Number { get; set; }
    public string? Description { get; set; }
    public string? Street { get; set; }
    public string? City { get; set; }
    public string? State { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
    public string? PhoneNumber { get; set; }
    public string? FaxNumber { get; set; }
    public string? EmailAddress { get; set; }
    public string? Website { get; set; }
    public string? WhatsApp { get; set; }
    public string? LinkedIn { get; set; }
    public string? Facebook { get; set; }
    public string? Instagram { get; set; }
    public string? TwitterX { get; set; }
    public string? TikTok { get; set; }
    public string? VendorGroupId { get; set; }
    public string? VendorGroupName { get; set; }
    public string? VendorCategoryId { get; set; }
    public string? VendorCategoryName { get; set; }
    public string? CreatedById { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetVendorListProfile : Profile
{
    public GetVendorListProfile()
    {
        CreateMap<Vendor, GetVendorListDto>()
            .ForMember(
                dest => dest.VendorGroupName,
                opt => opt.MapFrom(src => src.VendorGroup != null ? src.VendorGroup.Name : string.Empty)
            )
            .ForMember(
                dest => dest.VendorCategoryName,
                opt => opt.MapFrom(src => src.VendorCategory != null ? src.VendorCategory.Name : string.Empty)
            );

    }
}

public class GetVendorListResult
{
    public List<GetVendorListDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetVendorListRequest : PagedListRequest, IRequest<GetVendorListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetVendorListHandler : IRequestHandler<GetVendorListRequest, GetVendorListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetVendorListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetVendorListResult> Handle(GetVendorListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .Vendor
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.VendorGroup)
            .Include(x => x.VendorCategory)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim();
            query = query.Where(x => (x.Name != null && x.Name.Contains(search))
                || (x.Number != null && x.Number.Contains(search))
                || (x.PhoneNumber != null && x.PhoneNumber.Contains(search)));
        }
        query = request.SortField?.ToLowerInvariant() switch
        {
            "number" => request.Descending ? query.OrderByDescending(x => x.Number).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Number).ThenBy(x => x.Id),
            "createdatutc" => request.Descending ? query.OrderByDescending(x => x.CreatedAtUtc).ThenByDescending(x => x.Id) : query.OrderBy(x => x.CreatedAtUtc).ThenBy(x => x.Id),
            _ => request.Descending ? query.OrderByDescending(x => x.Name).ThenByDescending(x => x.Id) : query.OrderBy(x => x.Name).ThenBy(x => x.Id)
        };
        var totalCount = await query.CountAsync(cancellationToken);
        if (request.NormalizedPageSize is int pageSize)
            query = query.Skip((request.NormalizedPage - 1) * pageSize).Take(pageSize);

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetVendorListDto>>(entities);

        return new GetVendorListResult
        {
            Data = dtos,
            TotalCount = totalCount,
            Page = request.NormalizedPage,
            PageSize = request.NormalizedPageSize ?? totalCount
        };
    }


}



