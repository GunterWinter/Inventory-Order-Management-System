using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Commands;

public class MaterialExportDeleteInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class MaterialExportDeleteInvenTransRequest : IRequest<MaterialExportDeleteInvenTransResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class MaterialExportDeleteInvenTransValidator : AbstractValidator<MaterialExportDeleteInvenTransRequest>
{
    public MaterialExportDeleteInvenTransValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.DeletedById).NotEmpty();
    }
}

public class MaterialExportDeleteInvenTransHandler : IRequestHandler<MaterialExportDeleteInvenTransRequest, MaterialExportDeleteInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public MaterialExportDeleteInvenTransHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<MaterialExportDeleteInvenTransResult> Handle(MaterialExportDeleteInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.MaterialExportDeleteInvenTrans(
            request.Id,
            request.DeletedById,
            cancellationToken);

        return new MaterialExportDeleteInvenTransResult
        {
            Data = entity
        };
    }
}
