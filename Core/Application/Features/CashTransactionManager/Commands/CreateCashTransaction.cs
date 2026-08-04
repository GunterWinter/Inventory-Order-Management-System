using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Application.Common.CQS.Queries;

namespace Application.Features.CashTransactionManager.Commands;

public class CreateCashTransactionResult
{
    public CashTransaction? Data { get; set; }
}

public class CreateCashTransactionRequest : IRequest<CreateCashTransactionResult>
{
    public DateTime? TransactionDate { get; init; }
    public int? TransactionType { get; init; }
    public double? Amount { get; init; }
    public double? PaidAmount { get; init; }
    public string? Description { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashCategoryId { get; init; }
    public string? CustomerId { get; init; }
    public string? VendorId { get; init; }
    public string? SourceModule { get; init; }
    public string? SourceModuleId { get; init; }
    public string? SourceModuleNumber { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateCashTransactionValidator : AbstractValidator<CreateCashTransactionRequest>
{
    public CreateCashTransactionValidator()
    {
        RuleFor(x => x.CashAccountId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0);
        RuleFor(x => x.PaidAmount).LessThanOrEqualTo(x => x.Amount).When(x => x.PaidAmount.HasValue);
    }
}

public class CreateCashTransactionHandler : IRequestHandler<CreateCashTransactionRequest, CreateCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashAccount> _accountRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashAccount> accountRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
        )
    {
        _repository = repository;
        _accountRepository = accountRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<CreateCashTransactionResult> Handle(CreateCashTransactionRequest request, CancellationToken cancellationToken = default)
    {
        var entity = new CashTransaction();
        entity.CreatedById = request.CreatedById;

        entity.Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT");
        entity.TransactionDate = request.TransactionDate;
        entity.TransactionType = (CashTransactionType?)request.TransactionType;
        entity.Amount = request.Amount;
        entity.PaidAmount = request.PaidAmount ?? 0;
        entity.Status = ComputePaymentStatus(entity.PaidAmount ?? 0, entity.Amount ?? 0);
        entity.Description = request.Description;
        entity.CashAccountId = request.CashAccountId;
        entity.CashCategoryId = request.CashCategoryId;
        entity.CustomerId = request.CustomerId;
        entity.VendorId = request.VendorId;
        entity.SourceModule = request.SourceModule;
        entity.SourceModuleId = request.SourceModuleId;
        entity.SourceModuleNumber = request.SourceModuleNumber;

        await _repository.CreateAsync(entity, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        if (!string.IsNullOrEmpty(request.CashAccountId))
        {
            await RecalculateAccountBalance(request.CashAccountId, cancellationToken);
        }

        return new CreateCashTransactionResult
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
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId)
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

    private static CashTransactionStatus ComputePaymentStatus(double paidAmount, double amount)
    {
        if (amount <= 0) return CashTransactionStatus.Paid;
        if (paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
    }
}
