using Domain.Entities;
using FluentValidation;
using MediatR;
using Application.Common.Repositories;
using Application.Features.ProductSerialManager;

namespace Application.Features.InventoryTransactionManager.Commands;

public class StockCountCreateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class StockCountCreateInvenTransRequest : IRequest<StockCountCreateInvenTransResult>
{
    public string? ModuleId { get; init; }
    public string? ProductId { get; init; }
    public decimal? QtySCCount { get; init; }
    public string? CreatedById { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public decimal? UnitCost { get; init; }
    public List<string>? NewManufacturerSerialNumbers { get; init; }
    public List<StockCountNewSerialInput>? NewSerials { get; init; }
}

public class StockCountCreateInvenTransValidator : AbstractValidator<StockCountCreateInvenTransRequest>
{
    public StockCountCreateInvenTransValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.QtySCCount).NotNull().GreaterThanOrEqualTo(0);
        RuleFor(x => x.UnitCost).GreaterThanOrEqualTo(0).When(x => x.UnitCost.HasValue);
        RuleFor(x => x.CreatedById).NotEmpty();
    }
}

public class StockCountCreateInvenTransHandler : IRequestHandler<StockCountCreateInvenTransRequest, StockCountCreateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;
    private readonly IUnitOfWork _unitOfWork;

    public StockCountCreateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
        _unitOfWork = unitOfWork;
    }

    public async Task<StockCountCreateInvenTransResult> Handle(StockCountCreateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        InventoryTransaction? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct => entity = await _inventoryTransactionService.StockCountCreateInvenTrans(
            request.ModuleId,
            request.ProductId,
            request.QtySCCount,
            request.CreatedById,
            ct,
            request.ProductSerialIds,
            request.UnitCost,
            request.NewManufacturerSerialNumbers,
            request.NewSerials), cancellationToken);

        return new StockCountCreateInvenTransResult
        {
            Data = entity
        };
    }
}
