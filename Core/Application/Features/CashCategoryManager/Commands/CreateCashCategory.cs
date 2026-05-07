using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.CashCategoryManager.Commands;

public class CreateCashCategoryResult
{
    public CashCategory? Data { get; set; }
}

public class CreateCashCategoryRequest : IRequest<CreateCashCategoryResult>
{
    public string? Name { get; init; }
    public string? Description { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateCashCategoryValidator : AbstractValidator<CreateCashCategoryRequest>
{
    public CreateCashCategoryValidator()
    {
        RuleFor(x => x.Name).NotEmpty();
    }
}

public class CreateCashCategoryHandler : IRequestHandler<CreateCashCategoryRequest, CreateCashCategoryResult>
{
    private readonly ICommandRepository<CashCategory> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public CreateCashCategoryHandler(
        ICommandRepository<CashCategory> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<CreateCashCategoryResult> Handle(CreateCashCategoryRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new CashCategory();
        entity.CreatedById = request.CreatedById;

        entity.Name = request.Name;
        entity.Description = request.Description;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new CreateCashCategoryResult
        {
            Data = entity
        };
    }
}
