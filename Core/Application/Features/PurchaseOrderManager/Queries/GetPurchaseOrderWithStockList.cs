using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Queries;

public record GetPurchaseOrderWithStockListDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
    public string? Name { get; init; }
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

public class GetPurchaseOrderWithStockListProfile : Profile
{
    public GetPurchaseOrderWithStockListProfile()
    {
        CreateMap<PurchaseOrder, GetPurchaseOrderWithStockListDto>()
            .ForMember(
                dest => dest.Name,
                opt => opt.MapFrom(src => 
                    !string.IsNullOrWhiteSpace(src.Vendor != null ? src.Vendor.Name : null)
                        ? $"{src.Number} - {src.Vendor!.Name}"
                        : src.Number)
            )
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

public class GetPurchaseOrderWithStockListResult
{
    public List<GetPurchaseOrderWithStockListDto>? Data { get; init; }
}

public class GetPurchaseOrderWithStockListRequest : IRequest<GetPurchaseOrderWithStockListResult>
{
}

public class GetPurchaseOrderWithStockListHandler : IRequestHandler<GetPurchaseOrderWithStockListRequest, GetPurchaseOrderWithStockListResult>
{
    private readonly IMapper _mapper;
    private readonly IQueryContext _context;

    public GetPurchaseOrderWithStockListHandler(IMapper mapper, IQueryContext context)
    {
        _mapper = mapper;
        _context = context;
    }

    public async Task<GetPurchaseOrderWithStockListResult> Handle(GetPurchaseOrderWithStockListRequest request, CancellationToken cancellationToken)
    {
        var entities = await _context
            .PurchaseOrder
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Vendor)
            .Where(x => x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .ToListAsync(cancellationToken);

        var dtos = _mapper.Map<List<GetPurchaseOrderWithStockListDto>>(entities);

        return new GetPurchaseOrderWithStockListResult
        {
            Data = dtos
        };
    }
}
