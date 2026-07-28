using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.InventoryTransactionManager.Queries;

public class MaterialExportGetInvenTransListResult
{
    public List<InventoryTransaction>? Data { get; set; }
}

public class MaterialExportGetInvenTransListRequest : IRequest<MaterialExportGetInvenTransListResult>
{
    public string? ModuleId { get; init; }
}

public class MaterialExportGetInvenTransListValidator : AbstractValidator<MaterialExportGetInvenTransListRequest>
{
    public MaterialExportGetInvenTransListValidator()
    {
        RuleFor(x => x.ModuleId).NotEmpty();
    }
}

public class MaterialExportGetInvenTransListHandler : IRequestHandler<MaterialExportGetInvenTransListRequest, MaterialExportGetInvenTransListResult>
{
    private readonly InventoryTransactionService _inventoryTransactionService;

    public MaterialExportGetInvenTransListHandler(
        InventoryTransactionService inventoryTransactionService
        )
    {
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<MaterialExportGetInvenTransListResult> Handle(MaterialExportGetInvenTransListRequest request, CancellationToken cancellationToken = default)
    {
        var entity = await _inventoryTransactionService.MaterialExportGetInvenTransList(
            request.ModuleId,
            nameof(MaterialExport),
            cancellationToken);

        return new MaterialExportGetInvenTransListResult
        {
            Data = entity
        };
    }
}
