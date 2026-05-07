using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Commands;

public class UpdateCashTransactionResult
{
    public CashTransaction? Data { get; set; }
}

public class UpdateCashTransactionRequest : IRequest<UpdateCashTransactionResult>
{
    public string? Id { get; init; }
    public DateTime? TransactionDate { get; init; }
    public int? TransactionType { get; init; }
    public int? Status { get; init; }
    public double? Amount { get; init; }
    public string? Description { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashCategoryId { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceModuleId { get; init; }
    public string? SourceModuleNumber { get; init; }
    public string? UpdatedById { get; init; }
}

public class UpdateCashTransactionValidator : AbstractValidator<UpdateCashTransactionRequest>
{
    public UpdateCashTransactionValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.CashAccountId)
            .NotEmpty()
            .When(x => x.Status == (int)CashTransactionStatus.Confirmed);
        RuleFor(x => x.Amount)
            .GreaterThan(0)
            .When(x => x.Status == (int)CashTransactionStatus.Confirmed);
    }
}

public class UpdateCashTransactionHandler : IRequestHandler<UpdateCashTransactionRequest, UpdateCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashAccount> _accountRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCashTransactionHandler(
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

    public async Task<UpdateCashTransactionResult> Handle(UpdateCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var previousAccountId = entity.CashAccountId;

        entity.UpdatedById = request.UpdatedById;

        entity.TransactionDate = request.TransactionDate;
        entity.TransactionType = (CashTransactionType?)request.TransactionType;
        entity.Status = (CashTransactionStatus?)request.Status;
        entity.Amount = request.Amount;
        entity.Description = request.Description;
        entity.CashAccountId = request.CashAccountId;
        entity.CashCategoryId = request.CashCategoryId;
        entity.SourceModule = request.SourceModule;
        entity.SourceModuleId = request.SourceModuleId;
        entity.SourceModuleNumber = request.SourceModuleNumber;

        _repository.Update(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Recalculate balance for the current account
        if (!string.IsNullOrEmpty(request.CashAccountId))
        {
            await RecalculateAccountBalance(request.CashAccountId, cancellationToken);
        }

        // If account changed, also recalculate the previous account
        if (!string.IsNullOrEmpty(previousAccountId) && previousAccountId != request.CashAccountId)
        {
            await RecalculateAccountBalance(previousAccountId, cancellationToken);
        }

        return new UpdateCashTransactionResult
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
