using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.ProductManager.Commands;

public class CreateProductResult
{
    public Product? Data { get; set; }
}

public class CreateProductRequest : IRequest<CreateProductResult>
{
    public string? Number { get; init; }
    public string? Name { get; init; }
    public string? ReferenceCode { get; set; }
    public string? Description { get; init; }
    public double? UnitPrice { get; init; }
    public double? CostPrice { get; init; }
    public string? ImageUrl { get; init; }
    public bool? Physical { get; init; } = true;
    public SerialTrackingMode? SerialTrackingMode { get; init; } = Domain.Enums.SerialTrackingMode.InternalAuto;
    public string? InternalSerialFixedCode { get; init; }
    public string? DefaultWarehouseId { get; init; }
    public int? DefaultWarrantyMonths { get; init; }
    public string? UnitMeasureName { get; init; }
    public string? ProductGroupId { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateProductValidator : AbstractValidator<CreateProductRequest>
{
    public CreateProductValidator()
    {
        RuleFor(x => x.Name).NotEmpty();
        RuleFor(x => x.UnitPrice).GreaterThanOrEqualTo(0).When(x => x.UnitPrice.HasValue);
        RuleFor(x => x.CostPrice).GreaterThanOrEqualTo(0).When(x => x.CostPrice.HasValue);
        RuleFor(x => x.Physical).NotNull();
        RuleFor(x => x.InternalSerialFixedCode)
            .NotEmpty()
            .Length(2, 4)
            .Matches("^[A-Za-z0-9]+$")
            .When(x => x.Physical == true && x.SerialTrackingMode == SerialTrackingMode.InternalAuto);
        RuleFor(x => x.DefaultWarrantyMonths).GreaterThanOrEqualTo(0).When(x => x.DefaultWarrantyMonths.HasValue);

        RuleFor(x => x.ProductGroupId).NotEmpty();
    }
}

public class CreateProductHandler : IRequestHandler<CreateProductRequest, CreateProductResult>
{
    private readonly ICommandRepository<Product> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateProductHandler(
        ICommandRepository<Product> repository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<CreateProductResult> Handle(CreateProductRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new Product();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART");
        entity.Name = request.Name;
        entity.UnitPrice = request.UnitPrice;
        entity.CostPrice = request.CostPrice;
        entity.ImageUrl = request.ImageUrl;
        entity.Physical = request.Physical;
        entity.SerialTrackingMode = request.Physical == true
            ? request.SerialTrackingMode ?? SerialTrackingMode.InternalAuto
            : SerialTrackingMode.None;
        entity.InternalSerialFixedCode = entity.SerialTrackingMode == SerialTrackingMode.InternalAuto
            ? NormalizeInternalSerialFixedCode(request.InternalSerialFixedCode)
            : null;
        entity.DefaultWarehouseId = request.DefaultWarehouseId;
        entity.DefaultWarrantyMonths = request.DefaultWarrantyMonths;
        entity.ReferenceCode = request.ReferenceCode;
        entity.Description = request.Description;
        entity.UnitMeasureName = request.UnitMeasureName;
        entity.ProductGroupId = request.ProductGroupId;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new CreateProductResult
        {
            Data = entity
        };
    }

    private static string? NormalizeInternalSerialFixedCode(string? value)
    {
        return string.IsNullOrWhiteSpace(value)
            ? null
            : value.Trim().ToUpperInvariant();
    }
}
