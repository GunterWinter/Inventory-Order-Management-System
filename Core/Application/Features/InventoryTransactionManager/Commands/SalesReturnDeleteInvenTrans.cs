using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class SalesReturnDeleteInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class SalesReturnDeleteInvenTransRequest : IRequest<SalesReturnDeleteInvenTransResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }

}

public class SalesReturnDeleteInvenTransValidator : AbstractValidator<SalesReturnDeleteInvenTransRequest>
{
    public SalesReturnDeleteInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DeletedById).NotEmpty();
    }
}

public class SalesReturnDeleteInvenTransHandler : IRequestHandler<SalesReturnDeleteInvenTransRequest, SalesReturnDeleteInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public SalesReturnDeleteInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<SalesReturnDeleteInvenTransResult> Handle(SalesReturnDeleteInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.SalesReturnDeleteInvenTrans(
            request.Id,
            request.DeletedById,
            ct), cancellationToken);

        return new SalesReturnDeleteInvenTransResult
        {
            Data = entity
        };
    }
}
