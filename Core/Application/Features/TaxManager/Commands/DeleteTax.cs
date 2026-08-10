using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.TaxManager.Commands;

public class DeleteTaxResult
{
    public Tax? Data { get; set; }
}

public class DeleteTaxRequest : IRequest<DeleteTaxResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteTaxValidator : AbstractValidator<DeleteTaxRequest>
{
    public DeleteTaxValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteTaxHandler : IRequestHandler<DeleteTaxRequest, DeleteTaxResult>
{
    private readonly ICommandRepository<Tax> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteTaxHandler(
        ICommandRepository<Tax> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteTaxResult> Handle(DeleteTaxRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        await _deletionGuard.EnsureTaxCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteTaxResult
        {
            Data = entity
        };
    }
}

