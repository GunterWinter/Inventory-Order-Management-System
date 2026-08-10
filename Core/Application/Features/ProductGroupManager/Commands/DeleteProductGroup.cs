using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.ProductGroupManager.Commands;

public class DeleteProductGroupResult
{
    public ProductGroup? Data { get; set; }
}

public class DeleteProductGroupRequest : IRequest<DeleteProductGroupResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteProductGroupValidator : AbstractValidator<DeleteProductGroupRequest>
{
    public DeleteProductGroupValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteProductGroupHandler : IRequestHandler<DeleteProductGroupRequest, DeleteProductGroupResult>
{
    private readonly ICommandRepository<ProductGroup> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteProductGroupHandler(
        ICommandRepository<ProductGroup> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteProductGroupResult> Handle(DeleteProductGroupRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        await _deletionGuard.EnsureProductGroupCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteProductGroupResult
        {
            Data = entity
        };
    }
}

