using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Domain.Entities;
using Domain.Enums;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Queries;

public record GetAvailablePurchaseOrdersDto
{
    public string? Id { get; init; }
    public string? Number { get; init; }
}

public class GetAvailablePurchaseOrdersResult
{
    public List<GetAvailablePurchaseOrdersDto>? Data { get; init; }
}

public class GetAvailablePurchaseOrdersRequest : IRequest<GetAvailablePurchaseOrdersResult>
{
}

public class GetAvailablePurchaseOrdersHandler : IRequestHandler<GetAvailablePurchaseOrdersRequest, GetAvailablePurchaseOrdersResult>
{
    private readonly IQueryContext _context;

    public GetAvailablePurchaseOrdersHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetAvailablePurchaseOrdersResult> Handle(GetAvailablePurchaseOrdersRequest request, CancellationToken cancellationToken)
    {
        var purchaseOrders = await _context.Set<PurchaseOrder>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .Include(x => x.PurchaseOrderItemList)
            .ToListAsync(cancellationToken);

        var costAllocations = await _context.Set<PurchaseOrderCostAllocation>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CustomerId != null)
            .ToListAsync(cancellationToken);

        var availablePos = new List<GetAvailablePurchaseOrdersDto>();

        foreach (var po in purchaseOrders)
        {
            double totalItems = po.PurchaseOrderItemList.Sum(x => x.Quantity ?? 0);
            double allocated = costAllocations.Where(x => x.PurchaseOrderId == po.Id).Sum(x => x.Quantity ?? 0);

            if (totalItems > allocated)
            {
                availablePos.Add(new GetAvailablePurchaseOrdersDto
                {
                    Id = po.Id,
                    Number = po.Number
                });
            }
        }

        return new GetAvailablePurchaseOrdersResult
        {
            Data = availablePos
        };
    }
}
