using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Commands;

public class MaterialExportUpdateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class MaterialExportUpdateInvenTransRequest : IRequest<MaterialExportUpdateInvenTransResult>
{
    public string? Id { get; init; }
    public string? ProductId { get; init; }
    public decimal? Movement { get; init; }
    public List<string>? ProductSerialIds { get; init; }
    public string? UpdatedById { get; init; }
}

public class MaterialExportUpdateInvenTransValidator : AbstractValidator<MaterialExportUpdateInvenTransRequest>
{
    public MaterialExportUpdateInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.UpdatedById).NotEmpty();
    }
}

public class MaterialExportUpdateInvenTransHandler : IRequestHandler<MaterialExportUpdateInvenTransRequest, MaterialExportUpdateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public MaterialExportUpdateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<MaterialExportUpdateInvenTransResult> Handle(MaterialExportUpdateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.MaterialExportUpdateInvenTrans(
            request.Id,
            request.ProductId,
            request.Movement,
            request.ProductSerialIds,
            request.UpdatedById,
            cancellationToken);

        return new MaterialExportUpdateInvenTransResult
        {
            Data = entity
        };
    }
}
