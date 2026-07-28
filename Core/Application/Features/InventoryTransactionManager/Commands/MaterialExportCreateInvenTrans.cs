using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Commands;

public class MaterialExportCreateInvenTransResult
{
    public InventoryTransaction? Data { get; set; }
}

public class MaterialExportCreateInvenTransRequest : IRequest<MaterialExportCreateInvenTransResult>
{
    public string? ModuleId { get; init; }
    public string? ProductId { get; init; }
    public double? Movement { get; init; }
    public string? CreatedById { get; init; }
}

public class MaterialExportCreateInvenTransValidator : AbstractValidator<MaterialExportCreateInvenTransRequest>
{
    public MaterialExportCreateInvenTransValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
        RuleFor(x => x.ProductId).NotEmpty();
        RuleFor(x => x.Movement).NotEmpty();
        RuleFor(x => x.CreatedById).NotEmpty();
    }
}

public class MaterialExportCreateInvenTransHandler : IRequestHandler<MaterialExportCreateInvenTransRequest, MaterialExportCreateInvenTransResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public MaterialExportCreateInvenTransHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<MaterialExportCreateInvenTransResult> Handle(MaterialExportCreateInvenTransRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.MaterialExportCreateInvenTrans(
            request.ModuleId,
            request.ProductId,
            request.Movement,
            request.CreatedById,
            cancellationToken);

        return new MaterialExportCreateInvenTransResult
        {
            Data = entity
        };
    }
}
