using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.CashCategoryManager.Commands;

public class UpdateCashCategoryResult
{
    public CashCategory? Data { get; set; }
}

public class UpdateCashCategoryRequest : IRequest<UpdateCashCategoryResult>
{
    public string? Id { get; init; }
    public string? Name { get; init; }
    public string? Description { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateCashCategoryValidator : AbstractValidator<UpdateCashCategoryRequest>
{
    public UpdateCashCategoryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty();
    }
}

public class UpdateCashCategoryHandler : IRequestHandler<UpdateCashCategoryRequest, UpdateCashCategoryResult>
{
    private readonly ICommandRepository<CashCategory> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCashCategoryHandler(
        ICommandRepository<CashCategory> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<UpdateCashCategoryResult> Handle(UpdateCashCategoryRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;
        entity.Name = request.Name;
        entity.Description = request.Description;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new UpdateCashCategoryResult
        {
            Data = entity
        };
    }
}
