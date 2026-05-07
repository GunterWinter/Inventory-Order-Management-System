using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _queryContext = queryContext;
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

        // Recalculate CurrentBalance when InitialBalance might have changed
        var balances = await _queryContext
            .CashTransaction
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashAccountId == entity.Id && x.Status == CashTransactionStatus.Confirmed)
            .GroupBy(x => 1)
            .Select(g => new
            {
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var totalDebit = balances?.TotalDebit ?? 0d;
        var totalCredit = balances?.TotalCredit ?? 0d;
        entity.CurrentBalance = entity.InitialBalance + totalDebit - totalCredit;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new UpdateCashAccountResult
        {
            Data = entity
        };
    }
}
