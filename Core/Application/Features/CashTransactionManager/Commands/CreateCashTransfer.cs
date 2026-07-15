using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Application.Common.CQS.Queries;

namespace Application.Features.CashTransactionManager.Commands;

public class CreateCashTransferResult
{
    public CashTransaction? Source { get; set; }
    public CashTransaction? Destination { get; set; }
}

public class CreateCashTransferRequest : IRequest<CreateCashTransferResult>
{
    public DateTime? TransferDate { get; init; }
    public string? FromCashAccountId { get; init; }
    public string? ToCashAccountId { get; init; }
    public double? Amount { get; init; }
    public string? Description { get; init; }
    public string? CashCategoryId { get; init; }
    public string? CreatedById { get; init; }
}

public class CreateCashTransferValidator : AbstractValidator<CreateCashTransferRequest>
{
    public CreateCashTransferValidator()
    {
        RuleFor(x => x.TransferDate).NotNull();
        RuleFor(x => x.FromCashAccountId).NotEmpty();
        RuleFor(x => x.ToCashAccountId)
            .NotEmpty()
            .NotEqual(x => x.FromCashAccountId)
            .WithMessage("Source and destination accounts must be different.");
        RuleFor(x => x.Amount).GreaterThan(0);
    }
}

public class CreateCashTransferHandler : IRequestHandler<CreateCashTransferRequest, CreateCashTransferResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashAccount> _accountRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public CreateCashTransferHandler(
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

    public async Task<CreateCashTransferResult> Handle(CreateCashTransferRequest request, CancellationToken cancellationToken = default)
    {
        var fromAccount = await _accountRepository.GetAsync(request.FromCashAccountId ?? string.Empty, cancellationToken);
        var toAccount = await _accountRepository.GetAsync(request.ToCashAccountId ?? string.Empty, cancellationToken);

        if (fromAccount == null)
        {
            throw new Exception($"Source cash account not found: {request.FromCashAccountId}");
        }

        if (toAccount == null)
        {
            throw new Exception($"Destination cash account not found: {request.ToCashAccountId}");
        }

        var transferNumber = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CTF");
        var transferId = Guid.NewGuid().ToString();
        var description = !string.IsNullOrWhiteSpace(request.Description)
            ? request.Description
            : $"Fund transfer {fromAccount.Name} -> {toAccount.Name}";

        var sourceLeg = new CashTransaction
        {
            CreatedById = request.CreatedById,
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
            TransactionDate = request.TransferDate,
            TransactionType = CashTransactionType.Credit,
            Status = CashTransactionStatus.Confirmed,
            Amount = request.Amount,
            Description = description,
            CashAccountId = request.FromCashAccountId,
            CashCategoryId = request.CashCategoryId,
            SourceModule = "CashTransfer",
            SourceModuleId = transferId,
            SourceModuleNumber = transferNumber
        };

        var destinationLeg = new CashTransaction
        {
            CreatedById = request.CreatedById,
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
            TransactionDate = request.TransferDate,
            TransactionType = CashTransactionType.Debit,
            Status = CashTransactionStatus.Confirmed,
            Amount = request.Amount,
            Description = description,
            CashAccountId = request.ToCashAccountId,
            CashCategoryId = request.CashCategoryId,
            SourceModule = "CashTransfer",
            SourceModuleId = transferId,
            SourceModuleNumber = transferNumber
        };

        await _repository.CreateAsync(sourceLeg, cancellationToken);
        await _repository.CreateAsync(destinationLeg, cancellationToken);
        await _unitOfWork.SaveAsync(cancellationToken);

        await RecalculateAccountBalance(request.FromCashAccountId!, cancellationToken);
        await RecalculateAccountBalance(request.ToCashAccountId!, cancellationToken);

        return new CreateCashTransferResult
        {
            Source = sourceLeg,
            Destination = destinationLeg
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
