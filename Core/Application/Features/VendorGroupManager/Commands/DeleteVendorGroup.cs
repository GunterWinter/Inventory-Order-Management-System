using Application.Common.Repositories;
using Application.Features.MasterDataManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.VendorGroupManager.Commands;

public class DeleteVendorGroupResult
{
    public VendorGroup? Data { get; set; }
}

public class DeleteVendorGroupRequest : IRequest<DeleteVendorGroupResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteVendorGroupValidator : AbstractValidator<DeleteVendorGroupRequest>
{
    public DeleteVendorGroupValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteVendorGroupHandler : IRequestHandler<DeleteVendorGroupRequest, DeleteVendorGroupResult>
{
    private readonly ICommandRepository<VendorGroup> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly MasterDataDeletionGuard _deletionGuard;

    public DeleteVendorGroupHandler(
        ICommandRepository<VendorGroup> repository,
        IUnitOfWork unitOfWork,
        MasterDataDeletionGuard deletionGuard
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _deletionGuard = deletionGuard;
    }

    public async Task<DeleteVendorGroupResult> Handle(DeleteVendorGroupRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        await _deletionGuard.EnsureVendorGroupCanBeDeletedAsync(entity.Id, entity.Name, cancellationToken);

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteVendorGroupResult
        {
            Data = entity
        };
    }
}

