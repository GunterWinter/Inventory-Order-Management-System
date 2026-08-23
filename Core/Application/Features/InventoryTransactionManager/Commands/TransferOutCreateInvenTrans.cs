using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Commands;

public class TransferOutCreateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class TransferOutCreateInvenTransRequest : IRequest<TransferOutCreateInvenTransResult>
{
    public string? ModuleId { get; init; }
    public string? ProductId { get; init; }
    public decimal? Movement { get; init; }
    public string? CreatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }
}

public class TransferOutCreateInvenTransValidator : AbstractValidator<TransferOutCreateInvenTransRequest>
{
    public TransferOutCreateInvenTransValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.CreatedById).NotEmpty();
    }
}

public class TransferOutCreateInvenTransHandler : IRequestHandler<TransferOutCreateInvenTransRequest, TransferOutCreateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public TransferOutCreateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<TransferOutCreateInvenTransResult> Handle(TransferOutCreateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.TransferOutCreateInvenTrans(
            request.ModuleId,
            request.ProductId,
            request.Movement,
            request.CreatedById,
            cancellationToken,
            request.ProductSerialIds);

        return new TransferOutCreateInvenTransResult
        {
            Data = entity
        };
    }
}