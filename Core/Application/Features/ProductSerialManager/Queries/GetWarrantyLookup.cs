using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.ProductSerialManager.Queries;

public record WarrantyLookupMovementDto
{
    public string? ModuleName { get; init; }
    public string? ModuleId { get; init; }
    public string? ModuleItemId { get; init; }
    public string? ViewModuleName { get; init; }
    public string? ViewModuleId { get; init; }
    public string? FromWarehouseName { get; init; }
    public string? ToWarehouseName { get; init; }
    public DateTime? MovementDate { get; init; }
    public string? StatusName { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? PurchaseOrderNumber { get; init; }
    public string? AllocationCustomerName { get; init; }
    public string? AllocationProductName { get; init; }
    public string? AllocationWarehouseName { get; init; }
    public decimal? AllocationQuantity { get; init; }
    public decimal? AllocationUnitPrice { get; init; }
    public decimal? AllocationTotal { get; init; }
}

public record WarrantyLookupDto
{
    public string? ProductSerialId { get; init; }
    public string? InternalSerialNumber { get; init; }
    public string? ManufacturerSerialNumber { get; init; }
    public string? ProductName { get; init; }
    public string? StatusName { get; init; }
    public string? WarehouseName { get; init; }
    public string? SalesOrderNumber { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceDocumentNumber { get; init; }
    public DateTime? IssueDate { get; init; }
    public string? CustomerName { get; init; }
    public string? CustomerPhoneNumber { get; init; }
    public DateTime? SalesOrderDate { get; init; }
    public DateTime? CustomerWarrantyEndDate { get; init; }
    public bool IsCustomerWarrantyValid { get; init; }
    public DateTime? SupplierWarrantyEndDate { get; init; }
    public List<WarrantyLookupMovementDto>? Movements { get; init; }
}

public class GetWarrantyLookupResult
{
    public List<WarrantyLookupDto>? Data { get; init; }
    public int TotalCount { get; init; }
    public int Page { get; init; }
    public int PageSize { get; init; }
}

public class GetWarrantyLookupRequest : IRequest<GetWarrantyLookupResult>
{
    public string? Search { get; init; }
    public int Page { get; init; } = 1;
    public int PageSize { get; init; } = 20;
}

public class GetWarrantyLookupHandler : IRequestHandler<GetWarrantyLookupRequest, GetWarrantyLookupResult>
{
    private readonly IQueryContext _context;

    public GetWarrantyLookupHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetWarrantyLookupResult> Handle(GetWarrantyLookupRequest request, CancellationToken cancellationToken)
    {
        var search = request.Search?.Trim() ?? string.Empty;
        var page = Math.Max(1, request.Page);
        var pageSize = Math.Clamp(request.PageSize, 1, 200);

        IQueryable<ProductSerial> serialQuery = _context
            .Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Status != ProductSerialStatus.Voided)
            .Include(x => x.Product)
            .Include(x => x.CurrentWarehouse)
            .Include(x => x.SalesOrderItem)
                .ThenInclude(x => x!.SalesOrder)
                    .ThenInclude(x => x!.Customer);

        if (!string.IsNullOrWhiteSpace(search))
        {
            serialQuery = serialQuery.Where(x =>
                (x.InternalSerialNumber != null && x.InternalSerialNumber.Contains(search)) ||
                (x.ManufacturerSerialNumber != null && x.ManufacturerSerialNumber.Contains(search)) ||
                (x.SalesOrderItem != null && x.SalesOrderItem.SalesOrder != null && x.SalesOrderItem.SalesOrder.Number != null && x.SalesOrderItem.SalesOrder.Number.Contains(search)) ||
                (x.SalesOrderItem != null && x.SalesOrderItem.SalesOrder != null && x.SalesOrderItem.SalesOrder.Customer != null && x.SalesOrderItem.SalesOrder.Customer.Name != null && x.SalesOrderItem.SalesOrder.Customer.Name.Contains(search)) ||
                (x.SalesOrderItem != null && x.SalesOrderItem.SalesOrder != null && x.SalesOrderItem.SalesOrder.Customer != null && x.SalesOrderItem.SalesOrder.Customer.PhoneNumber != null && x.SalesOrderItem.SalesOrder.Customer.PhoneNumber.Contains(search))
            );
        }

        var totalCount = await serialQuery.CountAsync(cancellationToken);
        var serials = await serialQuery
            .OrderBy(x => x.InternalSerialNumber)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var serialIds = serials.Select(x => x.Id).ToList();
        var rawMovements = await _context
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.FromWarehouse)
            .Include(x => x.ToWarehouse)
            .Where(x => serialIds.Contains(x.ProductSerialId!))
            .OrderByDescending(x => x.MovementDate)
            .Select(x => new
            {
                x.ProductSerialId,
                x.ModuleName,
                x.ModuleId,
                x.ModuleItemId,
                FromWarehouseName = x.FromWarehouse != null ? x.FromWarehouse.Name : null,
                ToWarehouseName = x.ToWarehouse != null ? x.ToWarehouse.Name : null,
                x.MovementDate,
                x.CreatedAtUtc,
                x.ReversedAtUtc,
                StatusName = x.Status.ToString()
            })
            .ToListAsync(cancellationToken);

        var materialExportIds = rawMovements
            .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId != null && x.ReversedAtUtc == null)
            .Select(x => x.ModuleId!)
            .Distinct()
            .ToList();
        var materialExports = await _context.Set<MaterialExport>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => materialExportIds.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.Number,
                x.ExportDate,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                CustomerPhoneNumber = x.Customer != null ? x.Customer.PhoneNumber : null
            })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var activeMaterialExportBySerial = rawMovements
            .Where(x => x.ModuleName == nameof(MaterialExport) && x.ModuleId != null
                && x.ReversedAtUtc == null && !string.IsNullOrWhiteSpace(x.ProductSerialId))
            .GroupBy(x => x.ProductSerialId!)
            .ToDictionary(
                x => x.Key,
                x => x.OrderByDescending(y => y.MovementDate)
                    .ThenByDescending(y => y.CreatedAtUtc)
                    .Select(y => materialExports.GetValueOrDefault(y.ModuleId!))
                    .FirstOrDefault(y => y != null));

        var allocationIds = rawMovements
            .Where(x => x.ModuleName == "CostAllocation" && x.ModuleId != null)
            .Select(x => x.ModuleId!)
            .Distinct()
            .ToList();
        var allocationDetails = await _context.Set<PurchaseOrderCostAllocation>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => allocationIds.Contains(x.Id))
            .Select(x => new
            {
                x.Id,
                x.PurchaseOrderId,
                PurchaseOrderNumber = x.PurchaseOrder != null ? x.PurchaseOrder.Number : null,
                CustomerName = x.Customer != null ? x.Customer.Name : null,
                ProductName = x.PurchaseOrderItem != null && x.PurchaseOrderItem.Product != null
                    ? x.PurchaseOrderItem.Product.Name : null,
                WarehouseName = x.Warehouse != null
                    ? x.Warehouse.Name
                    : x.PurchaseOrderItem != null && x.PurchaseOrderItem.Warehouse != null
                        ? x.PurchaseOrderItem.Warehouse.Name : null,
                x.Quantity,
                x.UnitPrice,
                Total = x.Amount ?? (x.Quantity ?? 0m) * (x.UnitPrice ?? 0m)
            })
            .ToDictionaryAsync(x => x.Id, cancellationToken);

        var movements = rawMovements.Select(x =>
        {
            var isAllocation = x.ModuleName == "CostAllocation";
            var allocation = isAllocation && x.ModuleId != null
                ? allocationDetails.GetValueOrDefault(x.ModuleId)
                : null;
            return new
            {
                x.ProductSerialId,
                Movement = new WarrantyLookupMovementDto
                {
                    ModuleName = x.ModuleName,
                    ModuleId = x.ModuleId,
                    ModuleItemId = x.ModuleItemId,
                    ViewModuleName = x.ModuleName,
                    ViewModuleId = x.ModuleId,
                    FromWarehouseName = x.FromWarehouseName,
                    ToWarehouseName = x.ToWarehouseName,
                    MovementDate = x.MovementDate,
                    StatusName = x.StatusName,
                    PurchaseOrderId = allocation?.PurchaseOrderId,
                    PurchaseOrderNumber = allocation?.PurchaseOrderNumber,
                    AllocationCustomerName = allocation?.CustomerName,
                    AllocationProductName = allocation?.ProductName,
                    AllocationWarehouseName = allocation?.WarehouseName,
                    AllocationQuantity = allocation?.Quantity,
                    AllocationUnitPrice = allocation?.UnitPrice,
                    AllocationTotal = allocation?.Total
                }
            };
        }).ToList();

        var movementLookup = movements
            .Where(x => !string.IsNullOrWhiteSpace(x.ProductSerialId))
            .GroupBy(x => x.ProductSerialId!)
            .ToDictionary(x => x.Key, x => x.Select(y => y.Movement).ToList());

        var today = DateTime.UtcNow.Date;
        var data = serials.Select(x =>
        {
            var salesOrder = x.SalesOrderItem?.SalesOrder;
            activeMaterialExportBySerial.TryGetValue(x.Id, out var materialExport);
            return new WarrantyLookupDto
            {
                ProductSerialId = x.Id,
                InternalSerialNumber = x.InternalSerialNumber,
                ManufacturerSerialNumber = x.ManufacturerSerialNumber,
                ProductName = x.Product?.Name,
                StatusName = x.Status.ToString(),
                WarehouseName = x.CurrentWarehouse?.Name,
                SalesOrderNumber = salesOrder?.Number,
                SourceModule = salesOrder != null ? nameof(SalesOrder) : materialExport != null ? nameof(MaterialExport) : null,
                SourceDocumentNumber = salesOrder?.Number ?? materialExport?.Number,
                IssueDate = salesOrder?.OrderDate ?? materialExport?.ExportDate,
                CustomerName = salesOrder?.Customer?.Name ?? materialExport?.CustomerName,
                CustomerPhoneNumber = salesOrder?.Customer?.PhoneNumber ?? materialExport?.CustomerPhoneNumber,
                SalesOrderDate = salesOrder?.OrderDate,
                CustomerWarrantyEndDate = x.CustomerWarrantyEndDate,
                IsCustomerWarrantyValid = x.CustomerWarrantyEndDate != null && x.CustomerWarrantyEndDate.Value.Date >= today,
                SupplierWarrantyEndDate = x.SupplierWarrantyEndDate,
                Movements = movementLookup.TryGetValue(x.Id, out var itemMovements) ? itemMovements : new List<WarrantyLookupMovementDto>()
            };
        }).ToList();

        return new GetWarrantyLookupResult
        {
            Data = data,
            TotalCount = totalCount,
            Page = page,
            PageSize = pageSize
        };
    }
}
