using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

namespace Application.Features.ProductManager.Commands;

public class UpdateProductResult
{
    public Product? Data { get; set; }
}

public class UpdateProductRequest : IRequest<UpdateProductResult>
{
    public string? Id { get; init; }
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
    public string? UnitMeasureId { get; init; }
    public string? ProductGroupId { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateProductValidator : AbstractValidator<UpdateProductRequest>
{
    public UpdateProductValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
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
        RuleFor(x => x.UnitMeasureId).NotEmpty();
        RuleFor(x => x.ProductGroupId).NotEmpty();
    }
}

public class UpdateProductHandler : IRequestHandler<UpdateProductRequest, UpdateProductResult>
{
    private readonly ICommandRepository<Product> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateProductHandler(
        ICommandRepository<Product> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<UpdateProductResult> Handle(UpdateProductRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;

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
        entity.UnitMeasureId = request.UnitMeasureId;
        entity.ProductGroupId = request.ProductGroupId;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new UpdateProductResult
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

