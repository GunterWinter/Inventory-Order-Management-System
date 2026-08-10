using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.VendorCategoryManager.Commands;

public class DeleteVendorCategoryResult
{
    public VendorCategory? Data { get; set; }
}

public class DeleteVendorCategoryRequest : IRequest<DeleteVendorCategoryResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteVendorCategoryValidator : AbstractValidator<DeleteVendorCategoryRequest>
{
    public DeleteVendorCategoryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteVendorCategoryHandler : IRequestHandler<DeleteVendorCategoryRequest, DeleteVendorCategoryResult>
{
    private readonly ICommandRepository<VendorCategory> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteVendorCategoryHandler(
        ICommandRepository<VendorCategory> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteVendorCategoryResult> Handle(DeleteVendorCategoryRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        await _deletionGuard.EnsureVendorCategoryCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteVendorCategoryResult
        {
            Data = entity
        };
    }
}

