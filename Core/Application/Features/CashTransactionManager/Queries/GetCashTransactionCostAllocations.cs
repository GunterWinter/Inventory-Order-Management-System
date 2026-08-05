using Application.Common.CQS.Queries;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Queries;

public record GetCashTransactionCostAllocationsDto
{
    public string? ProductName { get; init; }
    public string? CustomerName { get; init; }
    public double? Quantity { get; init; }
    public double? UnitPrice { get; init; }
    public double? Total { get; init; }
}

public class GetCashTransactionCostAllocationsResult
{
    public List<GetCashTransactionCostAllocationsDto>? Data { get; init; }
}

public class GetCashTransactionCostAllocationsRequest : IRequest<GetCashTransactionCostAllocationsResult>
{
    public string? PurchaseOrderId { get; init; }
}

public class GetCashTransactionCostAllocationsValidator : AbstractValidator<GetCashTransactionCostAllocationsRequest>
{
    public GetCashTransactionCostAllocationsValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
    }
}

public class GetCashTransactionCostAllocationsHandler : IRequestHandler<GetCashTransactionCostAllocationsRequest, GetCashTransactionCostAllocationsResult>
{
    private readonly IQueryContext _context;

    public GetCashTransactionCostAllocationsHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetCashTransactionCostAllocationsResult> Handle(GetCashTransactionCostAllocationsRequest request, CancellationToken cancellationToken)
    {
        var allocations = await _context.Set<PurchaseOrderCostAllocation>()
            .AsNoTracking()
            .Where(x => x.PurchaseOrderId == request.PurchaseOrderId && !x.IsDeleted)
            .Include(x => x.PurchaseOrderItem)
                .ThenInclude(x => x!.Product)
            .Include(x => x.Customer)
            .ToListAsync(cancellationToken);

        if (!allocations.Any())
        {
            return new GetCashTransactionCostAllocationsResult { Data = new List<GetCashTransactionCostAllocationsDto>() };
        }

        var dtos = allocations.Select(a => new GetCashTransactionCostAllocationsDto
        {
            ProductName = a.PurchaseOrderItem?.Product?.Name,
            CustomerName = a.CustomerId == null ? "Kho" : (a.Customer?.Name ?? "N/A"),
            Quantity = a.Quantity,
            UnitPrice = a.UnitPrice,
            Total = (a.Quantity ?? 0) * (a.UnitPrice ?? 0)
        }).ToList();

        return new GetCashTransactionCostAllocationsResult { Data = dtos };
    }
}
