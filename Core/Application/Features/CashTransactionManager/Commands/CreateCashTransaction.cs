using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Application.Features.CashTransactionManager;

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
    public List<CashTransactionAllocationInput>? Allocations { get; init; }
}

public class CashTransactionAllocationInput
{
    public string? CustomerId { get; init; }
    public double Amount { get; init; }
    public string? Description { get; init; }
}

public class CreateCashTransactionValidator : AbstractValidator<CreateCashTransactionRequest>
{
    public CreateCashTransactionValidator()
    {
        RuleFor(x => x.Amount).GreaterThan(0);
        RuleFor(x => x.Allocations).Must((r, a) => (a?.Sum(x => x.Amount) ?? 0d) <= (r.Amount ?? 0d) + 0.000001d)
            .WithMessage("Allocation total cannot exceed transaction amount.");
        RuleFor(x => x.PaidAmount)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(x => x.Amount)
            .When(x => x.PaidAmount.HasValue);
    }
}

public class CreateCashTransactionHandler : IRequestHandler<CreateCashTransactionRequest, CreateCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashTransactionCostAllocation> _allocationRepository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly CashBalanceService _cashBalanceService;

    public CreateCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashTransactionCostAllocation> allocationRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _allocationRepository = allocationRepository;
        _paymentRepository = paymentRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _cashBalanceService = cashBalanceService;
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
        // This endpoint creates manual transactions only. Source links are reserved
        // for the handlers that own Purchase Order, Material Export and Cash Transfer.
        entity.SourceModule = null;
        entity.SourceModuleId = null;
        entity.SourceModuleNumber = null;

        await _repository.CreateAsync(entity, cancellationToken);

        if ((entity.PaidAmount ?? 0d) > 0d)
        {
            await _paymentRepository.CreateAsync(new CashTransactionPayment
            {
                CashTransactionId = entity.Id,
                CashAccountId = entity.CashAccountId,
                PaymentDate = entity.TransactionDate ?? DateTime.Today,
                Amount = entity.PaidAmount ?? 0d,
                Description = entity.Description,
                CreatedById = request.CreatedById
            }, cancellationToken);
        }

        if (request.Allocations != null)
        {
            foreach (var input in request.Allocations.Where(x => x.Amount > 0))
            {
                if (string.IsNullOrWhiteSpace(input.CustomerId))
                    throw new InvalidOperationException("An allocation must target a customer.");
                await _allocationRepository.CreateAsync(new CashTransactionCostAllocation
                {
                    CashTransactionId = entity.Id, CustomerId = input.CustomerId,
                    Amount = input.Amount, Description = input.Description, CreatedById = request.CreatedById
                }, cancellationToken);
            }
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        if (!string.IsNullOrEmpty(request.CashAccountId))
        {
            await _cashBalanceService.RecalculateAsync(request.CashAccountId, cancellationToken);
        }

        return new CreateCashTransactionResult
        {
            Data = entity
        };
    }

    private static CashTransactionStatus ComputePaymentStatus(double paidAmount, double amount)
    {
        if (amount <= 0) return CashTransactionStatus.Paid;
        if (paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
    }
}
