using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
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
    public string? UpdatedById { get; init; }
    public List<CashTransactionAllocationInput>? Allocations { get; init; }
}

public class UpdateCashTransactionValidator : AbstractValidator<UpdateCashTransactionRequest>
{
    public UpdateCashTransactionValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.TransactionDate).NotNull();
        RuleFor(x => x.TransactionType)
            .NotNull()
            .Must(value => !value.HasValue || Enum.IsDefined(typeof(CashTransactionType), value.Value))
            .WithMessage("Transaction Type is invalid.");
        RuleFor(x => x.Amount).NotNull().GreaterThan(0);
        RuleFor(x => x.PaidAmount)
            .GreaterThanOrEqualTo(0)
            .LessThanOrEqualTo(x => x.Amount)
            .When(x => x.PaidAmount.HasValue);
    }
}

public class UpdateCashTransactionHandler : IRequestHandler<UpdateCashTransactionRequest, UpdateCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashTransactionCostAllocation> _allocationRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalanceService;

    public UpdateCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashTransactionCostAllocation> allocationRepository,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _paymentRepository = paymentRepository;
        _allocationRepository = allocationRepository;
        _unitOfWork = unitOfWork;
        _cashBalanceService = cashBalanceService;
    }

    public async Task<UpdateCashTransactionResult> Handle(UpdateCashTransactionRequest request, CancellationToken cancellationToken)
    {
        CashTransaction? entity = null;
        string? previousAccountId = null;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct);

            if (entity == null)
            {
                throw new InvalidOperationException("Giao dịch không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
            }

            previousAccountId = entity.CashAccountId;
            entity.UpdatedById = request.UpdatedById;

            if (string.IsNullOrWhiteSpace(entity.SourceModule))
            {
                entity.TransactionDate = request.TransactionDate;
                entity.TransactionType = (CashTransactionType?)request.TransactionType;
                entity.Amount = request.Amount;
                entity.Description = request.Description;
                entity.CashAccountId = request.CashAccountId;
                entity.CashCategoryId = request.CashCategoryId;
                entity.CustomerId = request.CustomerId;
                entity.VendorId = request.VendorId;
            }
            else
            {
                // Source identity and amount remain owned by the source document, while every
                // cash transaction can still receive payments and classification updates.
                entity.Description = request.Description;
                entity.CashCategoryId = request.CashCategoryId;
                if (request.CashAccountId != null)
                {
                    entity.CashAccountId = request.CashAccountId;
                }
            }

            var amount = entity.Amount ?? 0d;
            var requestedPaidAmount = request.PaidAmount ?? entity.PaidAmount ?? 0d;
            if (requestedPaidAmount < 0d || requestedPaidAmount > amount)
            {
                throw new InvalidOperationException("Paid amount must be between zero and the transaction amount.");
            }
            var recordedPaidAmount = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == entity.Id)
                .SumAsync(x => x.Amount, ct);
            var adjustmentAmount = requestedPaidAmount - recordedPaidAmount;
            if (Math.Abs(adjustmentAmount) > 0.000001d)
            {
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = entity.Id,
                    CashAccountId = entity.CashAccountId,
                    PaymentDate = request.TransactionDate ?? DateTime.Today,
                    Amount = adjustmentAmount,
                    Description = request.Description,
                    CreatedById = request.UpdatedById
                }, ct);
            }
            entity.PaidAmount = requestedPaidAmount;
            entity.Status = ComputePaymentStatus(requestedPaidAmount, amount);

            _repository.Update(entity);
            if (string.IsNullOrWhiteSpace(entity.SourceModule) && request.Allocations != null)
            {
                var existing = await _allocationRepository.GetQuery().Where(a => !a.IsDeleted && a.CashTransactionId == entity.Id).ToListAsync(ct);
                foreach (var allocation in existing) _allocationRepository.Delete(allocation);
                var total = request.Allocations.Where(a => a.Amount > 0).Sum(a => a.Amount);
                if (request.Allocations.Count > 0 && Math.Abs(total - (entity.Amount ?? 0d)) > 0.000001d)
                    throw new InvalidOperationException("Allocation total must equal transaction amount.");
                foreach (var input in request.Allocations.Where(a => a.Amount > 0))
                {
                    if (string.IsNullOrWhiteSpace(input.CustomerId)) throw new InvalidOperationException("An allocation must target a customer.");
                    await _allocationRepository.CreateAsync(new CashTransactionCostAllocation { CashTransactionId = entity.Id, CustomerId = input.CustomerId, Amount = input.Amount, Description = input.Description, CreatedById = request.UpdatedById }, ct);
                }
            }
            await _unitOfWork.SaveAsync(ct);

            if (!string.IsNullOrEmpty(entity.CashAccountId))
            {
                await _cashBalanceService.RecalculateAsync(entity.CashAccountId, ct);
            }

            if (!string.IsNullOrEmpty(previousAccountId) && previousAccountId != entity.CashAccountId)
            {
                await _cashBalanceService.RecalculateAsync(previousAccountId, ct);
            }
        }, cancellationToken);

        return new UpdateCashTransactionResult
        {
            Data = entity!
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
