using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class StockCountDeleteInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class StockCountDeleteInvenTransRequest : IRequest<StockCountDeleteInvenTransResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }

}

public class StockCountDeleteInvenTransValidator : AbstractValidator<StockCountDeleteInvenTransRequest>
{
    public StockCountDeleteInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DeletedById).NotEmpty();
    }
}

public class StockCountDeleteInvenTransHandler : IRequestHandler<StockCountDeleteInvenTransRequest, StockCountDeleteInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public StockCountDeleteInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<StockCountDeleteInvenTransResult> Handle(StockCountDeleteInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.StockCountDeleteInvenTrans(
            request.Id,
            request.DeletedById,
            ct), cancellationToken);

        return new StockCountDeleteInvenTransResult
        {
            Data = entity
        };
    }
}
