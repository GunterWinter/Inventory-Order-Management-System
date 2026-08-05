using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Queries;

public record GetWarehouseProductStockDto
{
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? ReferenceCode { get; init; }
    public int StockQuantity { get; init; }
    public int SerialTrackingMode { get; init; }
}

public class GetWarehouseProductStockResult
{
    public List<GetWarehouseProductStockDto>? Data { get; init; }
}

public class GetWarehouseProductStockRequest : IRequest<GetWarehouseProductStockResult>
{
    public string? WarehouseId { get; init; }
}

public class GetWarehouseProductStockValidator : AbstractValidator<GetWarehouseProductStockRequest>
{
    public GetWarehouseProductStockValidator()
    {
        RuleFor(x => x.WarehouseId).NotEmpty();
    }
}

public class GetWarehouseProductStockHandler : IRequestHandler<GetWarehouseProductStockRequest, GetWarehouseProductStockResult>
{
    private readonly IQueryContext _context;

    public GetWarehouseProductStockHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetWarehouseProductStockResult> Handle(GetWarehouseProductStockRequest request, CancellationToken cancellationToken)
    {
        // Group ProductSerial by ProductId where InStock in this warehouse
        var stockData = await _context.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CurrentWarehouseId == request.WarehouseId
                     && x.Status == ProductSerialStatus.InStock)
            .GroupBy(x => x.ProductId)
            .Select(g => new
            {
                ProductId = g.Key,
                StockQuantity = g.Count()
            })
            .ToListAsync(cancellationToken);

        if (!stockData.Any())
        {
            return new GetWarehouseProductStockResult { Data = new List<GetWarehouseProductStockDto>() };
        }

        var productIds = stockData.Select(x => x.ProductId).ToList();

        var products = await _context.Set<Product>()
            .AsNoTracking()
            .Where(x => productIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id!, cancellationToken);

        var dtos = stockData
            .Where(s => products.ContainsKey(s.ProductId!))
            .Select(s =>
            {
                var product = products[s.ProductId!];
                return new GetWarehouseProductStockDto
                {
                    ProductId = s.ProductId,
                    ProductName = product.Name,
                    ReferenceCode = product.ReferenceCode,
                    StockQuantity = s.StockQuantity,
                    SerialTrackingMode = (int)(product.SerialTrackingMode ?? Domain.Enums.SerialTrackingMode.None)
                };
            })
            .OrderBy(x => x.ProductName)
            .ToList();

        return new GetWarehouseProductStockResult { Data = dtos };
    }
}
