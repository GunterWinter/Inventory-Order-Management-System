using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
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
    private readonly CashBalanceService _cashBalanceService;

    public UpdateCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _cashBalanceService = cashBalanceService;
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

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);
        await _cashBalanceService.RecalculateAsync(entity.Id, cancellationToken);

        return new UpdateCashAccountResult
        {
            Data = entity
        };
    }
}
