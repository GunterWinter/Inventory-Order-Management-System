using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Queries;

public record GetMaterialExportListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? CustomerId { get; init; }
    public string? CustomerName { get; init; }
    public DateTime? ExportDate { get; init; }
    public MaterialExportStatus? Status { get; init; }
    public string? StatusName { get; init; }
    public string? Description { get; init; }
    public string? PurchaseOrderName { get; init; }
    public DateTime? CreatedAtUtc { get; init; }
}

public class GetMaterialExportListProfile : Profile
{
    public GetMaterialExportListProfile()
    {
        CreateMap<MaterialExport, GetMaterialExportListDto>()
            .ForMember(
                dest => dest.PurchaseOrderName,
                opt => opt.MapFrom(src => src.PurchaseOrder != null ? src.PurchaseOrder.Number : string.Empty)
            )
            .ForMember(
                dest => dest.CustomerName,
                opt => opt.MapFrom(src => src.Customer != null ? src.Customer.Name : string.Empty)
            )
            .ForMember(
                dest => dest.StatusName,
                opt => opt.MapFrom(src => src.Status.HasValue ? src.Status.Value.ToFriendlyName() : string.Empty)
            );

    }
}

public class GetMaterialExportListResult
{
    public List<GetMaterialExportListDto>? Data { get; init; }
}

public class GetMaterialExportListRequest : IRequest<GetMaterialExportListResult>
{
    public bool IsDeleted { get; init; } = false;
}


public class GetMaterialExportListHandler : IRequestHandler<GetMaterialExportListRequest, GetMaterialExportListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetMaterialExportListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetMaterialExportListResult> Handle(GetMaterialExportListRequest request, CancellationToken cancellationToken)
    {
        var query = _context
            .MaterialExport
            .AsNoTracking()
            .ApplyIsDeletedFilter(request.IsDeleted)
            .Include(x => x.PurchaseOrder)
            .Include(x => x.Customer)
            .AsQueryable();

        var entities = await query.ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetMaterialExportListDto>>(entities);

        return new GetMaterialExportListResult
        {
            Data = dtos
        };
    }
}
