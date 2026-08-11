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
            .Include(x => x.Warehouse)
            .Include(x => x.Customer)
            .Where(x => x.Id == request.Id)
            .AsQueryable();

        var data = await queryData.SingleOrDefaultAsync(cancellationToken);

        var transactionList = await _context
            .InventoryTransaction
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Include(x => x.Warehouse)
            .Where(x => x.ModuleId == request.Id && x.ModuleName == nameof(MaterialExport))
            .ToListAsync(cancellationToken);

        return new GetMaterialExportSingleResult
        {
            Data = data,
            TransactionList = transactionList
        };
    }
}
