using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Commands;

public class DeleteCashTransactionResult
{
    public CashTransaction? Data { get; set; }
}

public class DeleteCashTransactionRequest : IRequest<DeleteCashTransactionResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteCashTransactionValidator : AbstractValidator<DeleteCashTransactionRequest>
{
    public DeleteCashTransactionValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteCashTransactionHandler : IRequestHandler<DeleteCashTransactionRequest, DeleteCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashAccount> _accountRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashAccount> accountRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _accountRepository = accountRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeleteCashTransactionResult> Handle(DeleteCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var cashAccountId = entity.CashAccountId;

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Recalculate balance for the affected account
        if (!string.IsNullOrEmpty(cashAccountId))
        {
            await RecalculateAccountBalance(cashAccountId, cancellationToken);
        }

        return new DeleteCashTransactionResult
        {
            Data = entity
        };
    }

    private async Task RecalculateAccountBalance(string cashAccountId, CancellationToken cancellationToken)
    {
        var account = await _accountRepository.GetAsync(cashAccountId, cancellationToken);
        if (account == null) return;

        var balances = await _queryContext
            .CashTransaction
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId && x.Status == CashTransactionStatus.Confirmed)
            .GroupBy(x => 1)
            .Select(g => new
            {
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var initialBalance = account.InitialBalance ?? 0d;
        var totalDebit = balances?.TotalDebit ?? 0d;
        var totalCredit = balances?.TotalCredit ?? 0d;
        account.CurrentBalance = initialBalance + totalDebit - totalCredit;

        _accountRepository.Update(account);
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
