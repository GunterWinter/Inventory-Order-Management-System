using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.ProductSerialManager.Queries;

public record ProductSerialPickerDto
{
    public string? Id { get; init; }
    public string? InternalSerialNumber { get; init; }
    public string? ProductId { get; init; }
    public string? ProductName { get; init; }
    public string? WarehouseId { get; init; }
    public string? WarehouseName { get; init; }
    public ProductSerialStatus? Status { get; init; }
    public string? StatusName { get; init; }
    public DateTime? SupplierWarrantyEndDate { get; init; }
    public DateTime? CustomerWarrantyEndDate { get; init; }
}

public class GetProductSerialPickerListResult
{
    public List<ProductSerialPickerDto>? Data { get; init; }
}

public class GetProductSerialPickerListRequest : IRequest<GetProductSerialPickerListResult>
{
    public string? ProductId { get; init; }
    public string? WarehouseId { get; init; }
    public string? ModuleName { get; init; }
    public string? ModuleId { get; init; }
    public string? ModuleItemId { get; init; }
    public string? SourceItemId { get; init; }
}

public class GetProductSerialPickerListHandler : IRequestHandler<GetProductSerialPickerListRequest, GetProductSerialPickerListResult>
{
    private readonly IQueryContext _context;

    public GetProductSerialPickerListHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetProductSerialPickerListResult> Handle(GetProductSerialPickerListRequest request, CancellationToken cancellationToken)
    {
        var allowedStatuses = ResolveAllowedStatuses(request.ModuleName);
        var currentSerialIds = await ResolveCurrentSerialIdsAsync(request, cancellationToken);
        var query = _context
            .Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.CurrentWarehouse)
            .Where(x =>
                allowedStatuses.Contains(x.Status ?? ProductSerialStatus.Pending) ||
                currentSerialIds.Contains(x.Id));

        if (!string.IsNullOrWhiteSpace(request.ProductId))
        {
            query = query.Where(x => x.ProductId == request.ProductId);
        }

        if (!string.IsNullOrWhiteSpace(request.WarehouseId))
        {
            query = query.Where(x => currentSerialIds.Contains(x.Id)
                || x.CurrentWarehouseId == request.WarehouseId
                || x.Status == ProductSerialStatus.Sold
                || x.Status == ProductSerialStatus.InTransfer);
        }

        if (request.ModuleName == nameof(TransferIn) && !string.IsNullOrWhiteSpace(request.ModuleId))
        {
            var transferOutSerialIds = await _context
                .Set<ProductSerialMovement>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.ModuleName == nameof(TransferOut) && x.ModuleId == request.ModuleId)
                .Select(x => x.ProductSerialId!)
                .ToListAsync(cancellationToken);

            query = query.Where(x => transferOutSerialIds.Contains(x.Id));
        }

        if (request.ModuleName == nameof(SalesReturn) && !string.IsNullOrWhiteSpace(request.ModuleId))
        {
            var salesOrderItemIds = await _context
                .Set<SalesOrderItem>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderId == request.ModuleId
                    && x.SalesOrder != null
                    && x.SalesOrder.OrderStatus == SalesOrderStatus.Confirmed)
                .Select(x => x.Id!)
                .ToListAsync(cancellationToken);

            query = query.Where(x => salesOrderItemIds.Contains(x.SalesOrderItemId!));
            if (!string.IsNullOrWhiteSpace(request.SourceItemId))
                query = query.Where(x => x.SalesOrderItemId == request.SourceItemId);
        }

        if (request.ModuleName == nameof(PurchaseReturn) && !string.IsNullOrWhiteSpace(request.ModuleId))
        {
            var purchaseOrderItemIds = await _context
                .Set<PurchaseOrderItem>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.PurchaseOrderId == request.ModuleId
                    && x.PurchaseOrder != null
                    && x.PurchaseOrder.OrderStatus == PurchaseOrderStatus.Confirmed)
                .Select(x => x.Id!)
                .ToListAsync(cancellationToken);

            query = query.Where(x => purchaseOrderItemIds.Contains(x.PurchaseOrderItemId!));
            if (!string.IsNullOrWhiteSpace(request.SourceItemId))
                query = query.Where(x => x.PurchaseOrderItemId == request.SourceItemId);
        }

        var data = await query
            .OrderBy(x => x.InternalSerialNumber)
            .Select(x => new ProductSerialPickerDto
            {
                Id = x.Id,
                InternalSerialNumber = x.InternalSerialNumber,
                ProductId = x.ProductId,
                ProductName = x.Product != null ? x.Product.Name : string.Empty,
                WarehouseId = x.CurrentWarehouseId,
                WarehouseName = x.CurrentWarehouse != null ? x.CurrentWarehouse.Name : string.Empty,
                Status = x.Status,
                StatusName = x.Status.ToString(),
                SupplierWarrantyEndDate = x.SupplierWarrantyEndDate,
                CustomerWarrantyEndDate = x.CustomerWarrantyEndDate
            })
            .ToListAsync(cancellationToken);

        return new GetProductSerialPickerListResult { Data = data };
    }

    private static ProductSerialStatus[] ResolveAllowedStatuses(string? moduleName)
    {
        return moduleName switch
        {
            nameof(SalesReturn) => new[] { ProductSerialStatus.Sold },
            nameof(TransferIn) => new[] { ProductSerialStatus.InTransfer },
            _ => new[] { ProductSerialStatus.InStock, ProductSerialStatus.ReturnedByCustomer }
        };
    }

    private async Task<List<string>> ResolveCurrentSerialIdsAsync(GetProductSerialPickerListRequest request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.ModuleItemId))
        {
            return new List<string>();
        }

        if (request.ModuleName == nameof(SalesOrder))
        {
            return await _context
                .Set<ProductSerial>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.SalesOrderItemId == request.ModuleItemId)
                .Select(x => x.Id)
                .ToListAsync(cancellationToken);
        }

        var activeIds = await _context
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == request.ModuleItemId && x.ReversedAtUtc == null)
            .Select(x => x.ProductSerialId!)
            .ToListAsync(cancellationToken);
        if (activeIds.Count > 0 || request.ModuleName != nameof(StockCount)) return activeIds;

        return await _context.Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.InventoryTransactionId == request.ModuleItemId)
            .Select(x => x.ProductSerialId!)
            .Distinct()
            .ToListAsync(cancellationToken);
    }
}
