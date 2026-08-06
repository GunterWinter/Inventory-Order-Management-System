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
}

public class UpdateCashTransactionValidator : AbstractValidator<UpdateCashTransactionRequest>
{
    public UpdateCashTransactionValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0).When(x => x.Amount.HasValue);
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
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalanceService;

    public UpdateCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _paymentRepository = paymentRepository;
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
                throw new InvalidOperationException($"Entity not found: {request.Id}");
            }

            previousAccountId = entity.CashAccountId;
            entity.UpdatedById = request.UpdatedById;

            if (!string.IsNullOrWhiteSpace(entity.SourceModule))
            {
                if (entity.SourceModule == nameof(MaterialExport))
                {
                    // Material export offsets do not represent a cash-account movement. Their source,
                    // amount and paid state remain immutable; only classification text can be corrected.
                    entity.Description = request.Description;
                    entity.CashCategoryId = request.CashCategoryId;
                }
                else if (entity.SourceModule == nameof(PurchaseOrder)
                    || entity.SourceModule == nameof(SalesOrder))
                {
                    var amount = entity.Amount ?? 0d;
                    var requestedPaidAmount = request.PaidAmount ?? entity.PaidAmount ?? 0d;
                    if (requestedPaidAmount < 0d || requestedPaidAmount > amount)
                    {
                        throw new InvalidOperationException("Paid amount must be between zero and the original amount.");
                    }

                    var recordedPaidAmount = await _paymentRepository.GetQuery()
                        .Where(x => !x.IsDeleted && x.CashTransactionId == entity.Id)
                        .SumAsync(x => x.Amount, ct);
                    var adjustmentAmount = requestedPaidAmount - recordedPaidAmount;

                    if (Math.Abs(adjustmentAmount) > 0.000001d)
                    {
                        if (string.IsNullOrWhiteSpace(entity.CashAccountId))
                        {
                            throw new InvalidOperationException("Select a payment account before changing the paid amount.");
                        }

                        await _paymentRepository.CreateAsync(new CashTransactionPayment
                        {
                            CashTransactionId = entity.Id,
                            CashAccountId = entity.CashAccountId,
                            PaymentDate = DateTime.Today,
                            Amount = adjustmentAmount,
                            Description = "Manual payment adjustment",
                            CreatedById = request.UpdatedById
                        }, ct);
                    }

                    entity.PaidAmount = requestedPaidAmount;
                    entity.Status = ComputePaymentStatus(requestedPaidAmount, amount);
                    entity.Description = request.Description;
                    entity.CashCategoryId = request.CashCategoryId;
                }
                else
                {
                    throw new InvalidOperationException("This source-generated cash transaction is read-only.");
                }
            }
            else
            {
                if (string.IsNullOrWhiteSpace(request.CashAccountId))
                {
                    throw new InvalidOperationException("Cash account is required.");
                }

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
            }

            _repository.Update(entity);
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
