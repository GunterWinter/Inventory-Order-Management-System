using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class SalesReturnUpdateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class SalesReturnUpdateInvenTransRequest : IRequest<SalesReturnUpdateInvenTransResult>
{
    public string? Id { get; init; }
    public string? WarehouseId { get; init; }
    public string? ProductId { get; init; }
    public decimal? Movement { get; init; }
    public string? UpdatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public List<ReturnCostLayerSelectionDto>? CostLayers { get; init; }

}

public class SalesReturnUpdateInvenTransValidator : AbstractValidator<SalesReturnUpdateInvenTransRequest>
{
    public SalesReturnUpdateInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.UpdatedById).NotEmpty();
    }
}

public class SalesReturnUpdateInvenTransHandler : IRequestHandler<SalesReturnUpdateInvenTransRequest, SalesReturnUpdateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public SalesReturnUpdateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<SalesReturnUpdateInvenTransResult> Handle(SalesReturnUpdateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.SalesReturnUpdateInvenTrans(
            request.Id, request.WarehouseId, request.ProductId, request.Movement,
            request.UpdatedById, ct, request.ProductSerialIds, request.CostLayers), cancellationToken);

        return new SalesReturnUpdateInvenTransResult
        {
            Data = entity
        };
    }
}
