using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using FluentValidation;
using MediatR;

namespace Application.Features.CashAccountManager.Commands;

public class CreateCashAccountResult
{
    public CashAccount? Data { get; set; }
}

public class CreateCashAccountRequest : IRequest<CreateCashAccountResult>
{
    public string? Name { get; init; }
    public int? AccountType { get; init; }
    public string? Description { get; init; }
    public double? InitialBalance { get; init; }
    public double? CashOnHand { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateCashAccountValidator : AbstractValidator<CreateCashAccountRequest>
{
    public CreateCashAccountValidator()
    {
        RuleFor(x => x.Name).NotEmpty();
    }
}

public class CreateCashAccountHandler : IRequestHandler<CreateCashAccountRequest, CreateCashAccountResult>
{
    private readonly ICommandRepository<CashAccount> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<CreateCashAccountResult> Handle(CreateCashAccountRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new CashAccount();
        entity.CreatedById = request.CreatedById;

        entity.Name = request.Name;
        entity.Number = _numberSequenceService.GenerateNumber(nameof(CashAccount), "", "CA");
        entity.AccountType = (Domain.Enums.CashAccountType?)request.AccountType;
        entity.Description = request.Description;
        entity.InitialBalance = request.InitialBalance ?? 0;
        entity.CashOnHand = request.CashOnHand;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new CreateCashAccountResult
        {
            Data = entity
        };
    }
}
