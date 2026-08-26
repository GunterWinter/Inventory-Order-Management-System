using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Queries;

public class SalesReturnGetInvenTransListResult
{
    public List<InventoryTransaction>? Data { get; set; }
}

public class SalesReturnGetInvenTransListRequest : IRequest<SalesReturnGetInvenTransListResult>
{
    public string? ModuleId { get; init; }

}

public class SalesReturnGetInvenTransListValidator : AbstractValidator<SalesReturnGetInvenTransListRequest>
{
    public SalesReturnGetInvenTransListValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
    }
}

public class SalesReturnGetInvenTransListHandler : IRequestHandler<SalesReturnGetInvenTransListRequest, SalesReturnGetInvenTransListResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public SalesReturnGetInvenTransListHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<SalesReturnGetInvenTransListResult> Handle(SalesReturnGetInvenTransListRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.SalesReturnGetInvenTransList(
            request.ModuleId,
            nameof(SalesReturn),
            cancellationToken);

        return new SalesReturnGetInvenTransListResult
        {
            Data = entity
        };
    }
}

public sealed class SalesReturnGetSourceLineListRequest : IRequest<List<ReturnSourceLineDto>>
{
    public string? SalesOrderId { get; init; }
    public string? SalesReturnId { get; init; }
}

public sealed class SalesReturnGetSourceLineListHandler(InventoryTransactionService service)
    : IRequestHandler<SalesReturnGetSourceLineListRequest, List<ReturnSourceLineDto>>
{
    public Task<List<ReturnSourceLineDto>> Handle(SalesReturnGetSourceLineListRequest request, CancellationToken cancellationToken)
        => service.SalesReturnGetSourceLineList(request.SalesOrderId, request.SalesReturnId, cancellationToken);
}
