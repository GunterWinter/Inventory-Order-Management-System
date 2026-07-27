using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using AutoMapper;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.MaterialExportManager.Queries;


public class GetMaterialExportSingleProfile : Profile
{
    public GetMaterialExportSingleProfile()
    {
    }
}

public class GetMaterialExportSingleResult
{
    public MaterialExport? Data { get; init; }
    public List<InventoryTransaction>? TransactionList { get; init; }
}

public class GetMaterialExportSingleRequest : IRequest<GetMaterialExportSingleResult>
{
    public string? Id { get; init; }
}

public class GetMaterialExportSingleValidator : AbstractValidator<GetMaterialExportSingleRequest>
{
    public GetMaterialExportSingleValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class GetMaterialExportSingleHandler : IRequestHandler<GetMaterialExportSingleRequest, GetMaterialExportSingleResult>
{
    private readonly IQueryContext _context;

    public GetMaterialExportSingleHandler(
        IQueryContext context
        )
    {
        _context = context;
    }

    public async Task<GetMaterialExportSingleResult> Handle(GetMaterialExportSingleRequest request, CancellationToken cancellationToken)
    {
        var queryData = _context
            .MaterialExport
            .AsNoTracking()
            .Include(x => x.PurchaseOrder)
            .Include(x => x.Customer)
            .Include(x => x.MaterialExportItemList)
                .ThenInclude(x => x.PurchaseOrderItem)
                    .ThenInclude(x => x.Product)
            .Where(x => x.Id == request.Id)
            .AsQueryable();

        var data = await queryData.SingleOrDefaultAsync(cancellationToken);

        return new GetMaterialExportSingleResult
        {
            Data = data,
            TransactionList = new List<InventoryTransaction>()
        };
    }
}
