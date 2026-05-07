using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashCategoryManager.Queries;

public record GetCashCategoryListDto
{
    public string? Id { get; init; }
    public string? Name { get; init; }
    public string? Description { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetCashCategoryListProfile : Profile
{
    public GetCashCategoryListProfile()
    {
        CreateMap<CashCategory, GetCashCategoryListDto>();
    }
}

public class GetCashCategoryListResult
{
    public List<GetCashCategoryListDto>? Data { get; init; }
}

public class GetCashCategoryListRequest : IRequest<GetCashCategoryListResult>
{
    public bool IsDeleted { get; init; } = false;
}

public class GetCashCategoryListHandler : IRequestHandler<GetCashCategoryListRequest, GetCashCategoryListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetCashCategoryListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetCashCategoryListResult> Handle(GetCashCategoryListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .CashCategory
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);
        var dtos = _mapper.Map<List<GetCashCategoryListDto>>(entities);

        return new GetCashCategoryListResult
        {
            Data = dtos
        };
    }
}
