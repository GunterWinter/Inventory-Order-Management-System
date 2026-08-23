using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Application.Features.CashTransactionManager;

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
    public decimal? Amount { get; init; }
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
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly CashBalanceService _cashBalanceService;

    public CreateCashTransferHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashAccount> accountRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _accountRepository = accountRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _cashBalanceService = cashBalanceService;
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
            Status = CashTransactionStatus.Paid,
            Amount = request.Amount,
            PaidAmount = request.Amount,
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
            Status = CashTransactionStatus.Paid,
            Amount = request.Amount,
            PaidAmount = request.Amount,
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

        await _cashBalanceService.RecalculateManyAsync(
            new[] { request.FromCashAccountId, request.ToCashAccountId },
            cancellationToken);

        return new CreateCashTransferResult
        {
            Source = sourceLeg,
            Destination = destinationLeg
        };
    }

}
