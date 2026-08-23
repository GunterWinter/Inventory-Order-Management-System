using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
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
    public decimal? Amount { get; init; }
    public decimal? PaidAmount { get; init; }
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
    public decimal Amount { get; init; }
    public string? Description { get; init; }
}

public class CreateCashTransactionValidator : AbstractValidator<CreateCashTransactionRequest>
{
    public CreateCashTransactionValidator()
    {
        RuleFor(x => x.TransactionDate).NotNull();
        RuleFor(x => x.TransactionType)
            .NotNull()
            .Must(value => !value.HasValue || Enum.IsDefined(typeof(CashTransactionType), value.Value))
            .WithMessage("Transaction Type is invalid.");
        RuleFor(x => x.Amount).NotNull().GreaterThan(0);
        RuleFor(x => x.Allocations).Must((r, a) => a == null || a.Count == 0
                || Math.Abs(a.Where(x => x.Amount > 0m).Sum(x => x.Amount) - (r.Amount ?? 0m)) <= 0.000001m)
            .WithMessage("Allocation total must equal transaction amount.");
        RuleFor(x => x.PaidAmount)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(x => x.Amount)
            .When(x => x.PaidAmount.HasValue);
        RuleFor(x => x.CashAccountId)
            .NotEmpty()
            .When(x => (x.PaidAmount ?? 0m) > 0m)
            .WithMessage("Phải chọn tài khoản quỹ khi nhập số tiền đã trả.");
        RuleFor(x => x.TransactionDate)
            .Must(value => !value.HasValue || value.Value.Date <= AppDateTime.VietnamNow().Date)
            .WithMessage("Ngày giao dịch không được lớn hơn ngày hiện tại.");
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
        if (request.Allocations?.Count > 0
            && Math.Abs(request.Allocations.Where(x => x.Amount > 0m).Sum(x => x.Amount) - (request.Amount ?? 0m)) > 0.000001m)
            throw new InvalidOperationException("Allocation total must equal transaction amount.");

        var entity = new CashTransaction();
        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
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
            entity.SourceModule = null;
            entity.SourceModuleId = null;
            entity.SourceModuleNumber = null;

            await _repository.CreateAsync(entity, ct);

            if ((entity.PaidAmount ?? 0m) > 0m)
            {
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = entity.Id,
                    CashAccountId = entity.CashAccountId,
                    PaymentDate = entity.TransactionDate ?? AppDateTime.VietnamNow(),
                    Amount = entity.PaidAmount ?? 0m,
                    Description = entity.Description,
                    CreatedById = request.CreatedById
                }, ct);
            }

            if (request.Allocations != null)
            {
                foreach (var input in request.Allocations.Where(x => x.Amount > 0))
                {
                    if (string.IsNullOrWhiteSpace(input.CustomerId))
                        throw new InvalidOperationException("Mỗi dòng phân bổ phải chọn một khách hàng/công trình.");
                    await _allocationRepository.CreateAsync(new CashTransactionCostAllocation
                    {
                        CashTransactionId = entity.Id, CustomerId = input.CustomerId,
                        Amount = input.Amount, Description = input.Description, CreatedById = request.CreatedById
                    }, ct);
                }
            }

            await _unitOfWork.SaveAsync(ct);
            await _cashBalanceService.RecalculateAsync(request.CashAccountId, ct);
        }, cancellationToken);

        return new CreateCashTransactionResult
        {
            Data = entity
        };
    }

    private static CashTransactionStatus ComputePaymentStatus(decimal paidAmount, decimal amount)
    {
        if (amount <= 0) return CashTransactionStatus.Paid;
        if (paidAmount >= amount) return CashTransactionStatus.Paid;
        if (paidAmount > 0) return CashTransactionStatus.PartiallyPaid;
        return CashTransactionStatus.Unpaid;
    }
}
