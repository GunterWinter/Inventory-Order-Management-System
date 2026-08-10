using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.WarehouseManager.Commands;

public class DeleteWarehouseResult
{
    public Warehouse? Data { get; set; }
}

public class DeleteWarehouseRequest : IRequest<DeleteWarehouseResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteWarehouseValidator : AbstractValidator<DeleteWarehouseRequest>
{
    public DeleteWarehouseValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteWarehouseHandler : IRequestHandler<DeleteWarehouseRequest, DeleteWarehouseResult>
{
    private readonly ICommandRepository<Warehouse> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteWarehouseHandler(
        ICommandRepository<Warehouse> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteWarehouseResult> Handle(DeleteWarehouseRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        if (entity.SystemWarehouse == true)
        {
            throw new Exception($"Updating system warehouse is not allowed.");
        }

        await _deletionGuard.EnsureWarehouseCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteWarehouseResult
        {
            Data = entity
        };
    }
}

