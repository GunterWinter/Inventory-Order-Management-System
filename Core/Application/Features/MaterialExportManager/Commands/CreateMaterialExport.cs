using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.MaterialExportManager.Commands;

public class CreateMaterialExportResult
{
    public MaterialExport? Data { get; set; }
}

public class CreateMaterialExportRequest : IRequest<CreateMaterialExportResult>
{
    public DateTime? ExportDate { get; init; }
    public string? PurchaseOrderId { get; init; }
    public string? CustomerId { get; init; }
    public string? Status { get; init; }
    public string? Description { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateMaterialExportValidator : AbstractValidator<CreateMaterialExportRequest>
{
    public CreateMaterialExportValidator()
    {
        RuleFor(x => x.ExportDate).NotEmpty();
        RuleFor(x => x.Status).NotEmpty();
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.CustomerId).NotEmpty();
    }
}

public class CreateMaterialExportHandler : IRequestHandler<CreateMaterialExportRequest, CreateMaterialExportResult>
{
    private readonly ICommandRepository<MaterialExport> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateMaterialExportHandler(
        ICommandRepository<MaterialExport> repository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<CreateMaterialExportResult> Handle(CreateMaterialExportRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new MaterialExport();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(MaterialExport), "", "MTEX");
        entity.ExportDate = request.ExportDate;
        entity.PurchaseOrderId = request.PurchaseOrderId;
        entity.CustomerId = request.CustomerId;
        entity.Status = (MaterialExportStatus)int.Parse(request.Status!);
        entity.Description = request.Description;
        

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new CreateMaterialExportResult
        {
            Data = entity
        };
    }
}
