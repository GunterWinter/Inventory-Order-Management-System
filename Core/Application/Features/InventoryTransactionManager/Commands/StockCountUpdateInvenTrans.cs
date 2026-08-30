using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;
using Application.Features.ProductSerialManager;

namespace Application.Features.InventoryTransactionManager.Commands;

public class StockCountUpdateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class StockCountUpdateInvenTransRequest : IRequest<StockCountUpdateInvenTransResult>
{
    public string? Id { get; init; }
    public string? ProductId { get; init; }
    public decimal? QtySCCount { get; init; }
    public string? UpdatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public decimal? UnitCost { get; init; }
    public List<string>? NewManufacturerSerialNumbers { get; init; }
    public List<StockCountNewSerialInput>? NewSerials { get; init; }

}

public class StockCountUpdateInvenTransValidator : AbstractValidator<StockCountUpdateInvenTransRequest>
{
    public StockCountUpdateInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.QtySCCount).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.UnitCost).GreaterThanOrEqualTo(0).When(x => x.UnitCost.HasValue);
        RuleFor(x => x.UpdatedById).NotEmpty();
    }
}

public class StockCountUpdateInvenTransHandler : IRequestHandler<StockCountUpdateInvenTransRequest, StockCountUpdateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public StockCountUpdateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<StockCountUpdateInvenTransResult> Handle(StockCountUpdateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.StockCountUpdateInvenTrans(
            request.Id,
            request.ProductId,
            request.QtySCCount,
            request.UpdatedById,
            ct,
            request.ProductSerialIds,
            request.UnitCost,
            request.NewManufacturerSerialNumbers,
            request.NewSerials), cancellationToken);

        return new StockCountUpdateInvenTransResult
        {
            Data = entity
        };
    }
}
