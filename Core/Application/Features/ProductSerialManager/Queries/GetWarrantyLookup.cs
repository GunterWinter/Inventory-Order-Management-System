using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.ProductSerialManager.Queries;

public record WarrantyLookupMovementDto
{
    public string? ModuleName { get; init; }
    public string? ModuleId { get; init; }
    public string? ModuleItemId { get; init; }
    public string? FromWarehouseId { get; init; }
    public string? ToWarehouseId { get; init; }
    public DateTime? MovementDate { get; init; }
    public string? StatusName { get; init; }
}

public record WarrantyLookupDto
{
    public string? ProductSerialId { get; init; }
    public string? InternalSerialNumber { get; init; }
    public string? ProductName { get; init; }
    public string? StatusName { get; init; }
    public string? WarehouseName { get; init; }
    public string? BatchNumber { get; init; }
    public string? SalesOrderNumber { get; init; }
    public string? CustomerName { get; init; }
    public string? CustomerPhoneNumber { get; init; }
    public DateTime? SalesOrderDate { get; init; }
    public DateTime? CustomerWarrantyEndDate { get; init; }
    public bool IsCustomerWarrantyValid { get; init; }
    public List<WarrantyLookupMovementDto>? Movements { get; init; }
}

public class GetWarrantyLookupResult
{
    public List<WarrantyLookupDto>? Data { get; init; }
}

public class GetWarrantyLookupRequest : IRequest<GetWarrantyLookupResult>
{
    public string? Search { get; init; }
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
        if (string.IsNullOrWhiteSpace(search))
        {
            return new GetWarrantyLookupResult { Data = new List<WarrantyLookupDto>() };
        }

        var serialQuery = _context
            .Set<ProductSerial>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.CurrentWarehouse)
            .Include(x => x.SalesOrderItem)
                .ThenInclude(x => x!.SalesOrder)
                    .ThenInclude(x => x!.Customer)
            .Where(x =>
                (x.InternalSerialNumber ?? string.Empty).Contains(search) ||
                (x.SalesOrderItem != null &&
                    x.SalesOrderItem.SalesOrder != null &&
                    (
                        (x.SalesOrderItem.SalesOrder.Number ?? string.Empty).Contains(search) ||
                        (x.SalesOrderItem.SalesOrder.Customer != null &&
                            (x.SalesOrderItem.SalesOrder.Customer.PhoneNumber ?? string.Empty).Contains(search))
                    )));

        var serials = await serialQuery
            .OrderBy(x => x.InternalSerialNumber)
            .Take(100)
            .ToListAsync(cancellationToken);

        var serialIds = serials.Select(x => x.Id).ToList();
        var movements = await _context
            .Set<ProductSerialMovement>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => serialIds.Contains(x.ProductSerialId!))
            .OrderByDescending(x => x.MovementDate)
            .Select(x => new
            {
                x.ProductSerialId,
                Movement = new WarrantyLookupMovementDto
                {
                    ModuleName = x.ModuleName,
                    ModuleId = x.ModuleId,
                    ModuleItemId = x.ModuleItemId,
                    FromWarehouseId = x.FromWarehouseId,
                    ToWarehouseId = x.ToWarehouseId,
                    MovementDate = x.MovementDate,
                    StatusName = x.Status.ToString()
                }
            })
            .ToListAsync(cancellationToken);

        var movementLookup = movements
            .GroupBy(x => x.ProductSerialId)
            .ToDictionary(x => x.Key, x => x.Select(y => y.Movement).ToList());

        var today = DateTime.UtcNow.Date;
        var data = serials.Select(x => new WarrantyLookupDto
        {
            ProductSerialId = x.Id,
            InternalSerialNumber = x.InternalSerialNumber,
            ProductName = x.Product?.Name,
            StatusName = x.Status.ToString(),
            WarehouseName = x.CurrentWarehouse?.Name,
            BatchNumber = x.BatchNumber,
            SalesOrderNumber = x.SalesOrderItem?.SalesOrder?.Number,
            CustomerName = x.SalesOrderItem?.SalesOrder?.Customer?.Name,
            CustomerPhoneNumber = x.SalesOrderItem?.SalesOrder?.Customer?.PhoneNumber,
            SalesOrderDate = x.SalesOrderItem?.SalesOrder?.OrderDate,
            CustomerWarrantyEndDate = x.CustomerWarrantyEndDate,
            IsCustomerWarrantyValid = x.CustomerWarrantyEndDate != null && x.CustomerWarrantyEndDate.Value.Date >= today,
            Movements = movementLookup.TryGetValue(x.Id, out var itemMovements) ? itemMovements : new List<WarrantyLookupMovementDto>()
        }).ToList();

        return new GetWarrantyLookupResult { Data = data };
    }
}
