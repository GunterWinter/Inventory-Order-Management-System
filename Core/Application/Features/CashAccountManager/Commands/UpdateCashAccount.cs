using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.CashAccountManager.Commands;

public class UpdateCashAccountResult
{
    public CashAccount? Data { get; set; }
}

public class UpdateCashAccountRequest : IRequest<UpdateCashAccountResult>
{
    public string? Id { get; init; }
    public string? Name { get; init; }
    public int? AccountType { get; init; }
    public string? Description { get; init; }
    public double? InitialBalance { get; init; }
    public double? CashOnHand { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateCashAccountValidator : AbstractValidator<UpdateCashAccountRequest>
{
    public UpdateCashAccountValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Name).NotEmpty();
    }
}

public class UpdateCashAccountHandler : IRequestHandler<UpdateCashAccountRequest, UpdateCashAccountResult>
{
    private readonly ICommandRepository<CashAccount> _repository;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<UpdateCashAccountResult> Handle(UpdateCashAccountRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.UpdatedById;

        entity.Name = request.Name;
        entity.AccountType = (Domain.Enums.CashAccountType?)request.AccountType;
        entity.Description = request.Description;
        entity.InitialBalance = request.InitialBalance ?? 0;
        entity.CashOnHand = request.CashOnHand;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new UpdateCashAccountResult
        {
            Data = entity
        };
    }
}
