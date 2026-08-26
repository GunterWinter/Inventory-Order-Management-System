using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class PurchaseReturnUpdateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class PurchaseReturnUpdateInvenTransRequest : IRequest<PurchaseReturnUpdateInvenTransResult>
{
    public string? Id { get; init; }
    public string? WarehouseId { get; init; }
    public string? ProductId { get; init; }
    public decimal? Movement { get; init; }
    public string? UpdatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }

}

public class PurchaseReturnUpdateInvenTransValidator : AbstractValidator<PurchaseReturnUpdateInvenTransRequest>
{
    public PurchaseReturnUpdateInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.UpdatedById).NotEmpty();
    }
}

public class PurchaseReturnUpdateInvenTransHandler : IRequestHandler<PurchaseReturnUpdateInvenTransRequest, PurchaseReturnUpdateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public PurchaseReturnUpdateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<PurchaseReturnUpdateInvenTransResult> Handle(PurchaseReturnUpdateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.PurchaseReturnUpdateInvenTrans(
            request.Id, request.WarehouseId, request.ProductId, request.Movement,
            request.UpdatedById, ct, request.ProductSerialIds), cancellationToken);

        return new PurchaseReturnUpdateInvenTransResult
        {
            Data = entity
        };
    }
}
