using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public sealed record CashTransactionSourceItemDto
{
    public string? ProductName { get; init; }
    public string? CustomerName { get; init; }
    public string? WarehouseName { get; init; }
    public decimal Quantity { get; init; }
    public decimal UnitPrice { get; init; }
    public decimal Total { get; init; }
    public string? ProductSerialNumbers { get; init; }
}

public sealed class GetCashTransactionSourceItemsResult
{
    public string? SourceModule { get; init; }
    public string? SourceModuleNumber { get; init; }
    public List<CashTransactionSourceItemDto> Data { get; init; } = [];
}

public sealed record GetCashTransactionSourceItemsRequest : IRequest<GetCashTransactionSourceItemsResult>
{
    public string? CashTransactionId { get; init; }
}

public sealed class GetCashTransactionSourceItemsValidator : AbstractValidator<GetCashTransactionSourceItemsRequest>
{
    public GetCashTransactionSourceItemsValidator() => RuleFor(x => x.CashTransactionId).NotEmpty();
}

public sealed class GetCashTransactionSourceItemsHandler
    : IRequestHandler<GetCashTransactionSourceItemsRequest, GetCashTransactionSourceItemsResult>
{
    private readonly IQueryContext _context;

    public GetCashTransactionSourceItemsHandler(IQueryContext context) => _context = context;

    public async Task<GetCashTransactionSourceItemsResult> Handle(
        GetCashTransactionSourceItemsRequest request,
        CancellationToken cancellationToken)
    {
        var transaction = await _context.Set<CashTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == request.CashTransactionId)
            .Select(x => new { x.SourceModule, x.SourceModuleId, x.SourceModuleNumber, x.SourceDetailId, x.Amount })
            .SingleOrDefaultAsync(cancellationToken);

        if (transaction == null || string.IsNullOrWhiteSpace(transaction.SourceModuleId))
            return new GetCashTransactionSourceItemsResult();

        List<CashTransactionSourceItemDto> items = [];
        if (transaction.SourceModule == nameof(PurchaseOrder))
        {
            items = await _context.Set<PurchaseOrderCostAllocation>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Where(x => x.PurchaseOrderId == transaction.SourceModuleId)
                .Select(x => new CashTransactionSourceItemDto
                {
                    ProductName = x.PurchaseOrderItem != null && x.PurchaseOrderItem.Product != null
                        ? x.PurchaseOrderItem.Product.Name : null,
                    CustomerName = x.Customer != null ? x.Customer.Name : null,
                    WarehouseName = x.Warehouse != null
                        ? x.Warehouse.Name
                        : x.PurchaseOrderItem != null && x.PurchaseOrderItem.Warehouse != null
                            ? x.PurchaseOrderItem.Warehouse.Name : null,
                    Quantity = x.Quantity ?? 0m,
                    UnitPrice = x.UnitPrice ?? 0m,
                    Total = x.Amount ?? (x.Quantity ?? 0m) * (x.UnitPrice ?? 0m)
                })
                .ToListAsync(cancellationToken);

            if (items.Count == 0)
            {
                items = await _context.Set<PurchaseOrderItem>()
                    .AsNoTracking()
                    .ApplyIsDeletedFilter(false)
                    .Where(x => x.PurchaseOrderId == transaction.SourceModuleId)
                    .Select(x => new CashTransactionSourceItemDto
                    {
                        ProductName = x.Product != null ? x.Product.Name : null,
                        WarehouseName = x.Warehouse != null ? x.Warehouse.Name : null,
                        Quantity = x.Quantity ?? 0m,
                        UnitPrice = x.UnitPrice ?? 0m,
                        Total = x.Total ?? (x.Quantity ?? 0m) * (x.UnitPrice ?? 0m)
                    })
                    .ToListAsync(cancellationToken);
            }
        }
        else if (transaction.SourceModule == nameof(SalesOrder))
        {
            var salesItems = await _context.Set<SalesOrderItem>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.Product)
                .Include(x => x.Warehouse)
                .Include(x => x.SalesOrder).ThenInclude(x => x!.Customer)
                .Include(x => x.ProductSerials.Where(serial => !serial.IsDeleted))
                .Where(x => x.SalesOrderId == transaction.SourceModuleId)
                .ToListAsync(cancellationToken);

            items = salesItems.Select(x => new CashTransactionSourceItemDto
            {
                ProductName = x.Product?.Name,
                CustomerName = x.SalesOrder?.Customer?.Name,
                WarehouseName = x.Warehouse?.Name,
                Quantity = x.Quantity ?? 0m,
                UnitPrice = x.UnitPrice ?? 0m,
                Total = x.Total ?? (x.Quantity ?? 0m) * (x.UnitPrice ?? 0m),
                ProductSerialNumbers = string.Join(", ", x.ProductSerials
                    .OrderBy(serial => serial.InternalSerialNumber)
                    .Select(serial => string.IsNullOrWhiteSpace(serial.ManufacturerSerialNumber)
                        ? serial.InternalSerialNumber
                        : $"{serial.InternalSerialNumber} / {serial.ManufacturerSerialNumber}")
                    .Where(number => !string.IsNullOrWhiteSpace(number)))
            }).ToList();
        }
        else if (transaction.SourceModule is nameof(MaterialExport) or nameof(SalesReturn) or nameof(PurchaseReturn))
        {
            items = await LoadInventoryDocumentItemsAsync(
                transaction.SourceModule,
                transaction.SourceModuleId,
                transaction.SourceDetailId,
                transaction.Amount ?? 0m,
                cancellationToken);
        }

        return new GetCashTransactionSourceItemsResult
        {
            SourceModule = transaction.SourceModule,
            SourceModuleNumber = transaction.SourceModuleNumber,
            Data = items
        };
    }

    private async Task<List<CashTransactionSourceItemDto>> LoadInventoryDocumentItemsAsync(
        string moduleName,
        string moduleId,
        string? sourceDetailId,
        decimal sourceAmount,
        CancellationToken cancellationToken)
    {
        var lines = await _context.Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.Warehouse)
            .Where(x => x.ModuleName == moduleName && x.ModuleId == moduleId)
            .OrderBy(x => x.CreatedAtUtc)
            .ThenBy(x => x.Id)
            .ToListAsync(cancellationToken);

        if (lines.Count == 0)
        {
            return [];
        }

        var customerName = moduleName switch
        {
            nameof(MaterialExport) => await _context.Set<MaterialExport>().AsNoTracking()
                .Where(x => x.Id == moduleId && !x.IsDeleted)
                .Select(x => x.Customer != null ? x.Customer.Name : null)
                .FirstOrDefaultAsync(cancellationToken),
            nameof(SalesReturn) => await _context.Set<SalesReturn>().AsNoTracking()
                .Where(x => x.Id == moduleId && !x.IsDeleted)
                .Select(x => x.SalesOrder != null && x.SalesOrder.Customer != null ? x.SalesOrder.Customer.Name : null)
                .FirstOrDefaultAsync(cancellationToken),
            _ => null
        };

        var lineIds = lines.Select(x => x.Id).ToList();
        var movementSerials = await (
            from movement in _context.Set<ProductSerialMovement>().AsNoTracking()
            join serial in _context.Set<ProductSerial>().AsNoTracking()
                on movement.ProductSerialId equals serial.Id
            where !movement.IsDeleted && movement.ReversedAtUtc == null
                && movement.InventoryTransactionId != null
                && lineIds.Contains(movement.InventoryTransactionId)
            select new
            {
                movement.InventoryTransactionId,
                serial.InternalSerialNumber,
                serial.ManufacturerSerialNumber,
                UnitCost = serial.UnitCost ?? 0m,
                serial.PurchaseOrderItemId
            })
            .ToListAsync(cancellationToken);

        Dictionary<string, decimal> sourcePrices = new(StringComparer.OrdinalIgnoreCase);
        if (moduleName == nameof(SalesReturn))
        {
            var salesOrderId = await _context.Set<SalesReturn>().AsNoTracking()
                .Where(x => x.Id == moduleId && !x.IsDeleted)
                .Select(x => x.SalesOrderId)
                .FirstOrDefaultAsync(cancellationToken);
            sourcePrices = await _context.Set<SalesOrderItem>().AsNoTracking()
                .Where(x => !x.IsDeleted && x.SalesOrderId == salesOrderId && x.ProductId != null)
                .GroupBy(x => x.ProductId!)
                .ToDictionaryAsync(x => x.Key, x => x.First().UnitPrice ?? 0m, StringComparer.OrdinalIgnoreCase, cancellationToken);
        }
        else if (moduleName == nameof(PurchaseReturn))
        {
            var purchaseOrderId = await _context.Set<PurchaseReturn>().AsNoTracking()
                .Where(x => x.Id == moduleId && !x.IsDeleted)
                .Select(x => x.PurchaseOrderId)
                .FirstOrDefaultAsync(cancellationToken);
            sourcePrices = await _context.Set<PurchaseOrderItem>().AsNoTracking()
                .Where(x => !x.IsDeleted && x.PurchaseOrderId == purchaseOrderId && x.ProductId != null)
                .GroupBy(x => x.ProductId!)
                .ToDictionaryAsync(x => x.Key, x => x.First().UnitPrice ?? 0m, StringComparer.OrdinalIgnoreCase, cancellationToken);
        }

        var result = new List<CashTransactionSourceItemDto>();
        foreach (var line in lines)
        {
            var quantity = Math.Abs(line.Movement ?? line.Stock ?? 0m);
            var serials = movementSerials.Where(x => x.InventoryTransactionId == line.Id).ToList();
            decimal unitPrice;
            if (serials.Count > 0)
            {
                unitPrice = serials.Average(x => x.UnitCost);
            }
            else if (line.ProductId != null && sourcePrices.TryGetValue(line.ProductId, out var sourcePrice))
            {
                unitPrice = sourcePrice;
            }
            else if (lines.Count == 1 && quantity > 0m && sourceAmount > 0m)
            {
                unitPrice = sourceAmount / quantity;
            }
            else
            {
                unitPrice = line.Product?.CostPrice ?? 0m;
            }

            result.Add(new CashTransactionSourceItemDto
            {
                ProductName = line.Product?.Name,
                CustomerName = customerName,
                WarehouseName = line.Warehouse?.Name,
                Quantity = quantity,
                UnitPrice = unitPrice,
                Total = quantity * unitPrice,
                ProductSerialNumbers = string.Join(", ", serials.Select(x =>
                        string.IsNullOrWhiteSpace(x.ManufacturerSerialNumber)
                            ? x.InternalSerialNumber
                            : $"{x.InternalSerialNumber} / {x.ManufacturerSerialNumber}")
                    .Where(x => !string.IsNullOrWhiteSpace(x)))
            });
        }

        return result;
    }
}
