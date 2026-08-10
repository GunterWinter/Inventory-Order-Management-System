using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.ProductManager.Commands;

public class DeleteProductResult
{
    public Product? Data { get; set; }
}

public class DeleteProductRequest : IRequest<DeleteProductResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteProductValidator : AbstractValidator<DeleteProductRequest>
{
    public DeleteProductValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteProductHandler : IRequestHandler<DeleteProductRequest, DeleteProductResult>
{
    private readonly ICommandRepository<Product> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteProductHandler(
        ICommandRepository<Product> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteProductResult> Handle(DeleteProductRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        await _deletionGuard.EnsureProductCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteProductResult
        {
            Data = entity
        };
    }
}

