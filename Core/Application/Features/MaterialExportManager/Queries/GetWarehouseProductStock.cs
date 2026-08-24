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
    public decimal StockQuantity { get; init; }
    public int SerialTrackingMode { get; init; }
}

public class GetWarehouseProductStockResult
{
    public List<GetWarehouseProductStockDto>? Data { get; init; }
}

public class GetWarehouseProductStockRequest : IRequest<GetWarehouseProductStockResult>
{
    public string? WarehouseId { get; init; }
    public string? MaterialExportId { get; init; }
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
        var ownReservedSerialIds = string.IsNullOrWhiteSpace(request.MaterialExportId)
            ? new List<string>()
            : await _context.Set<ProductSerialMovement>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.ModuleName == nameof(MaterialExport)
                    && x.ModuleId == request.MaterialExportId
                    && x.ReversedAtUtc == null
                    && x.ProductSerialId != null)
                .Select(x => x.ProductSerialId!)
                .Distinct()
                .ToListAsync(cancellationToken);

        var nonSerialStock = await _context.Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.WarehouseId == request.WarehouseId
                && x.Status == InventoryTransactionStatus.Confirmed
                && x.Product != null
                && x.Product.Physical == true
                && (x.Product.SerialTrackingMode == null || x.Product.SerialTrackingMode == SerialTrackingMode.None))
            .GroupBy(x => new { x.ProductId, x.Product!.Name, x.Product.ReferenceCode, x.Product.SerialTrackingMode })
            .Select(g => new GetWarehouseProductStockDto
            {
                ProductId = g.Key.ProductId,
                ProductName = g.Key.Name,
                ReferenceCode = g.Key.ReferenceCode,
                StockQuantity = g.Sum(x => x.Stock ?? 0m),
                SerialTrackingMode = (int)(g.Key.SerialTrackingMode ?? SerialTrackingMode.None)
            })
            .Where(x => x.StockQuantity > 0)
            .ToListAsync(cancellationToken);

        var serialStock = await _context.Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.CurrentWarehouseId == request.WarehouseId
                && x.Product != null
                && x.Product.Physical == true
                && x.Product.SerialTrackingMode != SerialTrackingMode.None
                && (x.Status == ProductSerialStatus.InStock
                    || x.Status == ProductSerialStatus.ReturnedByCustomer
                    || (x.Status == ProductSerialStatus.Reserved && ownReservedSerialIds.Contains(x.Id))))
            .GroupBy(x => new { x.ProductId, x.Product!.Name, x.Product.ReferenceCode, x.Product.SerialTrackingMode })
            .Select(g => new GetWarehouseProductStockDto
            {
                ProductId = g.Key.ProductId,
                ProductName = g.Key.Name,
                ReferenceCode = g.Key.ReferenceCode,
                StockQuantity = g.Count(),
                SerialTrackingMode = (int)(g.Key.SerialTrackingMode ?? SerialTrackingMode.None)
            })
            .ToListAsync(cancellationToken);

        var dtos = nonSerialStock
            .Concat(serialStock)
            .Where(x => x.StockQuantity > 0)
            .OrderBy(x => x.ProductName)
            .ToList();

        return new GetWarehouseProductStockResult { Data = dtos };
    }
}
