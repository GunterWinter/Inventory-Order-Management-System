using Application.Common.Repositories;
using Application.Features.ProductManager;
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
    public decimal? UnitPrice { get; init; }
    public decimal? CostPrice { get; init; }
    public string? ImageUrl { get; init; }
    public bool? Physical { get; init; }
    public SerialTrackingMode? SerialTrackingMode { get; init; }
    public string? InternalSerialFixedCode { get; init; }
    public string? DefaultWarehouseId { get; init; }
    public int? DefaultWarrantyMonths { get; init; }
    public string? UnitMeasureName { get; init; }
    public string? ProductGroupId { get; init; }
    public decimal? OpeningStockQuantity { get; init; }
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
            .Must(x => !x.HasValue || x.Value >= 0m)
            .WithMessage("Opening stock must be a finite, non-negative number.");
        RuleFor(x => x.OpeningStockQuantity)
            .Must((request, quantity) => !quantity.HasValue
                || (request.Physical == true
                    && (request.SerialTrackingMode == null
                        || request.SerialTrackingMode == SerialTrackingMode.None)))
            .WithMessage("Only physical products without serial tracking can have opening stock edited.");
        RuleFor(x => x.UpdatedById)
            .NotEmpty()
            .When(x => x.OpeningStockQuantity.HasValue)
            .WithMessage("Người xác nhận là bắt buộc khi hiệu chỉnh tồn đầu kỳ.");
    }
}

public class UpdateProductHandler : IRequestHandler<UpdateProductRequest, UpdateProductResult>
{
    private readonly ICommandRepository<Product> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly ProductOpeningStockService _openingStockService;

    public UpdateProductHandler(
        ICommandRepository<Product> repository,
        IUnitOfWork unitOfWork,
        ProductOpeningStockService openingStockService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _openingStockService = openingStockService;
    }

    public async Task<UpdateProductResult> Handle(UpdateProductRequest request, CancellationToken cancellationToken)
    {
        Product? entity = null;
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct);

            if (entity == null)
            {
                throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            }

            var requestedPhysical = request.Physical == true;
            var currentTrackingMode = entity.Physical == true
                ? entity.SerialTrackingMode ?? SerialTrackingMode.None
                : SerialTrackingMode.None;
            var requestedTrackingMode = requestedPhysical
                ? request.SerialTrackingMode ?? currentTrackingMode
                : SerialTrackingMode.None;

            if (request.OpeningStockQuantity.HasValue
                && (entity.Physical != true || currentTrackingMode != SerialTrackingMode.None))
            {
                throw new InvalidOperationException(
                    "Chỉ hàng hóa vật lý đang ở chế độ không theo dõi serial mới được sửa tồn đầu kỳ.");
            }

            var trackingModeChanged = entity.Physical != requestedPhysical || currentTrackingMode != requestedTrackingMode;
            if (trackingModeChanged)
            {
                if (await _openingStockService.HasInventoryOrSerialHistoryAsync(entity.Id, ct))
                {
                    throw new InvalidOperationException(
                        "Không thể đổi loại vật lý hoặc chế độ serial của hàng hóa đã được dùng trong chứng từ.");
                }
            }

            var previousFixedCode = entity.InternalSerialFixedCode;
            entity.UpdatedById = request.UpdatedById;
            entity.Name = request.Name;
            entity.UnitPrice = request.UnitPrice;
            entity.CostPrice = request.CostPrice;
            entity.ImageUrl = request.ImageUrl;
            entity.Physical = requestedPhysical;
            entity.SerialTrackingMode = requestedTrackingMode;
            entity.InternalSerialFixedCode = entity.SerialTrackingMode == SerialTrackingMode.InternalAuto
                ? NormalizeInternalSerialFixedCode(request.InternalSerialFixedCode)
                    ?? (request.SerialTrackingMode == null ? previousFixedCode : null)
                : null;
            entity.DefaultWarehouseId = requestedPhysical ? request.DefaultWarehouseId : null;
            entity.DefaultWarrantyMonths = requestedPhysical ? request.DefaultWarrantyMonths : null;
            entity.ReferenceCode = request.ReferenceCode;
            entity.Description = request.Description;
            entity.UnitMeasureName = request.UnitMeasureName;
            entity.ProductGroupId = request.ProductGroupId;

            _repository.Update(entity);
            await _unitOfWork.SaveAsync(ct);
            await _openingStockService.ApplyAsync(
                entity,
                request.OpeningStockQuantity,
                isCreate: false,
                userId: request.UpdatedById,
                cancellationToken: ct);
        }, cancellationToken);

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

