using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class PurchaseReturnDeleteInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class PurchaseReturnDeleteInvenTransRequest : IRequest<PurchaseReturnDeleteInvenTransResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }

}

public class PurchaseReturnDeleteInvenTransValidator : AbstractValidator<PurchaseReturnDeleteInvenTransRequest>
{
    public PurchaseReturnDeleteInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DeletedById).NotEmpty();
    }
}

public class PurchaseReturnDeleteInvenTransHandler : IRequestHandler<PurchaseReturnDeleteInvenTransRequest, PurchaseReturnDeleteInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public PurchaseReturnDeleteInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<PurchaseReturnDeleteInvenTransResult> Handle(PurchaseReturnDeleteInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.PurchaseReturnDeleteInvenTrans(
            request.Id,
            request.DeletedById,
            ct), cancellationToken);

        return new PurchaseReturnDeleteInvenTransResult
        {
            Data = entity
        };
    }
}
