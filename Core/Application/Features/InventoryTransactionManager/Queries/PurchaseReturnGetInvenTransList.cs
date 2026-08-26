using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Queries;

public class PurchaseReturnGetInvenTransListResult
{
    public List<InventoryTransaction>? Data { get; set; }
}

public class PurchaseReturnGetInvenTransListRequest : IRequest<PurchaseReturnGetInvenTransListResult>
{
    public string? ModuleId { get; init; }

}

public class PurchaseReturnGetInvenTransListValidator : AbstractValidator<PurchaseReturnGetInvenTransListRequest>
{
    public PurchaseReturnGetInvenTransListValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
    }
}

public class PurchaseReturnGetInvenTransListHandler : IRequestHandler<PurchaseReturnGetInvenTransListRequest, PurchaseReturnGetInvenTransListResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public PurchaseReturnGetInvenTransListHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<PurchaseReturnGetInvenTransListResult> Handle(PurchaseReturnGetInvenTransListRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.PurchaseReturnGetInvenTransList(
            request.ModuleId,
            nameof(PurchaseReturn),
            cancellationToken);

        return new PurchaseReturnGetInvenTransListResult
        {
            Data = entity
        };
    }
}

public sealed class PurchaseReturnGetSourceLineListRequest : IRequest<List<ReturnSourceLineDto>>
{
    public string? PurchaseOrderId { get; init; }
    public string? PurchaseReturnId { get; init; }
}

public sealed class PurchaseReturnGetSourceLineListHandler(InventoryTransactionService service)
    : IRequestHandler<PurchaseReturnGetSourceLineListRequest, List<ReturnSourceLineDto>>
{
    public Task<List<ReturnSourceLineDto>> Handle(PurchaseReturnGetSourceLineListRequest request, CancellationToken cancellationToken)
        => service.PurchaseReturnGetSourceLineList(request.PurchaseOrderId, request.PurchaseReturnId, cancellationToken);
}
