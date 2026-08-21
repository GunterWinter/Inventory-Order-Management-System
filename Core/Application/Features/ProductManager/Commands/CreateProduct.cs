using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductManager;
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
    public SerialTrackingMode? SerialTrackingMode { get; init; } = Domain.Enums.SerialTrackingMode.None;
    public string? InternalSerialFixedCode { get; init; }
    public string? DefaultWarehouseId { get; init; }
    public int? DefaultWarrantyMonths { get; init; }
    public string? UnitMeasureName { get; init; }
    public string? ProductGroupId { get; init; }
    public double? OpeningStockQuantity { get; init; }
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
        RuleFor(x => x.SerialTrackingMode).IsInEnum().When(x => x.SerialTrackingMode.HasValue);
        RuleFor(x => x.InternalSerialFixedCode)
            .NotEmpty()
            .Length(2, 4)
            .Matches("^[A-Za-z0-9]+$")
            .When(x => x.Physical == true && x.SerialTrackingMode == SerialTrackingMode.InternalAuto);
        RuleFor(x => x.DefaultWarrantyMonths).GreaterThanOrEqualTo(0).When(x => x.DefaultWarrantyMonths.HasValue);
        RuleFor(x => x.UnitMeasureName).NotEmpty();
        RuleFor(x => x.ProductGroupId).NotEmpty();
        RuleFor(x => x.OpeningStockQuantity)
            .Must(x => !x.HasValue || (double.IsFinite(x.Value) && x.Value >= 0d))
            .WithMessage("Opening stock must be a finite, non-negative number.");
        RuleFor(x => x.OpeningStockQuantity)
            .Must((request, quantity) => !quantity.HasValue
                || quantity.Value == 0d
                || (request.Physical == true
                    && (request.SerialTrackingMode ?? SerialTrackingMode.None) != SerialTrackingMode.ManufacturerSerial))
            .WithMessage("Opening stock is only supported for physical products without manufacturer serial entry.");
        RuleFor(x => x.OpeningStockQuantity)
            .Must(x => !x.HasValue || Math.Abs(x.Value - Math.Round(x.Value)) <= 0.000001d)
            .When(x => x.Physical == true
                && (x.SerialTrackingMode ?? SerialTrackingMode.None) == SerialTrackingMode.InternalAuto)
            .WithMessage("Opening stock for auto-generated internal serials must be a whole number.");
        RuleFor(x => x.CostPrice)
            .NotNull()
            .When(x => x.OpeningStockQuantity > 0d
                && x.Physical == true
                && (x.SerialTrackingMode ?? SerialTrackingMode.None) != SerialTrackingMode.ManufacturerSerial);
        RuleFor(x => x.DefaultWarehouseId)
            .NotEmpty()
            .When(x => x.OpeningStockQuantity > 0d
                && x.Physical == true
                && (x.SerialTrackingMode ?? SerialTrackingMode.None) != SerialTrackingMode.ManufacturerSerial);
        RuleFor(x => x.CreatedById)
            .NotEmpty()
            .When(x => x.OpeningStockQuantity > 0d)
            .WithMessage("Người xác nhận là bắt buộc khi ghi nhận tồn đầu kỳ.");
    }
}

public class CreateProductHandler : IRequestHandler<CreateProductRequest, CreateProductResult>
{
    private readonly ICommandRepository<Product> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly ProductOpeningStockService _openingStockService;

    public CreateProductHandler(
        ICommandRepository<Product> repository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        ProductOpeningStockService openingStockService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _openingStockService = openingStockService;
    }

    public async Task<CreateProductResult> Handle(CreateProductRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new Product();
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity.CreatedById = request.CreatedById;
            entity.Number = _numberSequenceService.GenerateNumber(nameof(Product), "", "ART");
            entity.Name = request.Name;
            entity.UnitPrice = request.UnitPrice;
            entity.CostPrice = request.CostPrice;
            entity.ImageUrl = request.ImageUrl;
            entity.Physical = request.Physical;
            entity.SerialTrackingMode = request.Physical == true
                ? request.SerialTrackingMode ?? SerialTrackingMode.None
                : SerialTrackingMode.None;
            entity.InternalSerialFixedCode = entity.SerialTrackingMode == SerialTrackingMode.InternalAuto
                ? NormalizeInternalSerialFixedCode(request.InternalSerialFixedCode)
                : null;
            entity.DefaultWarehouseId = entity.Physical == true ? request.DefaultWarehouseId : null;
            entity.DefaultWarrantyMonths = entity.Physical == true ? request.DefaultWarrantyMonths : null;
            entity.ReferenceCode = request.ReferenceCode;
            entity.Description = request.Description;
            entity.UnitMeasureName = request.UnitMeasureName;
            entity.ProductGroupId = request.ProductGroupId;

            await _repository.CreateAsync(entity, ct);
            await _unitOfWork.SaveAsync(ct);
            await _openingStockService.ApplyAsync(
                entity,
                request.OpeningStockQuantity,
                isCreate: true,
                userId: request.CreatedById,
                cancellationToken: ct);
        }, cancellationToken);

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
