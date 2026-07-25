using Application.Common.CQS.Queries;
using Domain.Entities;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager.Queries;

public class GetCostAllocationsByPurchaseOrderIdResult
{
    public List<PurchaseOrderCostAllocation>? Data { get; set; }
    public string? CashAccountId { get; set; }
    public string? CashCategoryId { get; set; }
}

public class GetCostAllocationsByPurchaseOrderIdRequest : IRequest<GetCostAllocationsByPurchaseOrderIdResult>
{
    public string? PurchaseOrderId { get; init; }
}

public class GetCostAllocationsByPurchaseOrderIdHandler : IRequestHandler<GetCostAllocationsByPurchaseOrderIdRequest, GetCostAllocationsByPurchaseOrderIdResult>
{
    private readonly IQueryContext _context;

    public GetCostAllocationsByPurchaseOrderIdHandler(IQueryContext context)
    {
        _context = context;
    }

    public async Task<GetCostAllocationsByPurchaseOrderIdResult> Handle(GetCostAllocationsByPurchaseOrderIdRequest request, CancellationToken cancellationToken)
    {
        var data = await _context.Set<PurchaseOrderCostAllocation>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.PurchaseOrderId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);

        var cashTransaction = await _context.Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(PurchaseOrder) && x.SourceModuleId == request.PurchaseOrderId && x.TransactionType == Domain.Enums.CashTransactionType.Credit)
            .FirstOrDefaultAsync(cancellationToken);

        return new GetCostAllocationsByPurchaseOrderIdResult
        {
            Data = data,
            CashAccountId = cashTransaction?.CashAccountId,
            CashCategoryId = cashTransaction?.CashCategoryId
        };
    }
}
