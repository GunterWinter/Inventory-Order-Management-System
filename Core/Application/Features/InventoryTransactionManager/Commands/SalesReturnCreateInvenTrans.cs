using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;

namespace Application.Features.InventoryTransactionManager.Commands;

public class SalesReturnCreateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class SalesReturnCreateInvenTransRequest : IRequest<SalesReturnCreateInvenTransResult>
{
    public string? ModuleId { get; init; }
    public string? WarehouseId { get; init; }
    public string? ProductId { get; init; }
    public string? SourceItemId { get; init; }
    public decimal? Movement { get; init; }
    public string? CreatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public List<ReturnCostLayerSelectionDto>? CostLayers { get; init; }
}

public class SalesReturnCreateInvenTransValidator : AbstractValidator<SalesReturnCreateInvenTransRequest>
{
    public SalesReturnCreateInvenTransValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
        RuleFor(x => x.SourceItemId).NotEmpty().When(x => string.IsNullOrWhiteSpace(x.ProductId) || string.IsNullOrWhiteSpace(x.WarehouseId));
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.CreatedById).NotEmpty();
    }
}

public class SalesReturnCreateInvenTransHandler : IRequestHandler<SalesReturnCreateInvenTransRequest, SalesReturnCreateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public SalesReturnCreateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<SalesReturnCreateInvenTransResult> Handle(SalesReturnCreateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.SalesReturnCreateInvenTrans(
            request.ModuleId, request.WarehouseId, request.ProductId, request.Movement,
            request.CreatedById, ct, request.ProductSerialIds, request.SourceItemId, request.CostLayers), cancellationToken);

        return new SalesReturnCreateInvenTransResult
        {
            Data = entity
        };
    }
}
