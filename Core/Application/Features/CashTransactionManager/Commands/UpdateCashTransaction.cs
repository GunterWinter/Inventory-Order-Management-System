using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Domain.Entities;
using Domain.Enums;
using Domain.Common;
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
    public DateTime? PaymentDate { get; init; }
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
        RuleFor(x => x.PaymentDate)
            .Must(value => !value.HasValue || value.Value.Date <= AppDateTime.VietnamNow().Date)
            .WithMessage("Ngày thanh toán không được lớn hơn ngày hiện tại.");
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
            entity.TransactionDate = request.TransactionDate;

            if (string.IsNullOrWhiteSpace(entity.SourceModule))
            {
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

            var amount = entity.Amount ?? 0m;
            var previousPaidAmount = entity.PaidAmount ?? 0m;
            var requestedPaidAmount = request.PaidAmount ?? previousPaidAmount;
            if (requestedPaidAmount < 0m || requestedPaidAmount > amount)
            {
                throw new InvalidOperationException("Số tiền đã trả phải nằm trong khoảng từ 0 đến tổng giao dịch.");
            }
            if (requestedPaidAmount < previousPaidAmount - 0.000001m)
            {
                throw new InvalidOperationException("Không được giảm số tiền đã trả. Hãy dùng nghiệp vụ hoàn/hủy riêng.");
            }
            var recordedPaidAmount = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId == entity.Id)
                .SumAsync(x => x.Amount, ct);
            var missingHistoryAmount = previousPaidAmount - recordedPaidAmount;
            if (missingHistoryAmount > 0.000001m)
            {
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = entity.Id,
                    CashAccountId = previousAccountId,
                    PaymentDate = entity.TransactionDate ?? AppDateTime.VietnamNow(),
                    Amount = missingHistoryAmount,
                    Description = entity.Description,
                    CreatedById = request.UpdatedById
                }, ct);
            }
            var installmentAmount = requestedPaidAmount - previousPaidAmount;
            if (installmentAmount > 0.000001m)
            {
                if (string.IsNullOrWhiteSpace(request.CashAccountId))
                    throw new InvalidOperationException("Phải chọn tài khoản quỹ khi tăng số tiền đã trả.");
                await _paymentRepository.CreateAsync(new CashTransactionPayment
                {
                    CashTransactionId = entity.Id,
                    CashAccountId = request.CashAccountId,
                    PaymentDate = request.PaymentDate ?? AppDateTime.VietnamNow(),
                    Amount = installmentAmount,
                    Description = request.Description,
                    CreatedById = request.UpdatedById
                }, ct);
                entity.CashAccountId = request.CashAccountId;
            }
            entity.PaidAmount = requestedPaidAmount;
            entity.Status = ComputePaymentStatus(requestedPaidAmount, amount);

            _repository.Update(entity);
            if (string.IsNullOrWhiteSpace(entity.SourceModule) && request.Allocations != null)
            {
                var existing = await _allocationRepository.GetQuery().Where(a => !a.IsDeleted && a.CashTransactionId == entity.Id).ToListAsync(ct);
                foreach (var allocation in existing) _allocationRepository.Delete(allocation);
                var total = request.Allocations.Where(a => a.Amount > 0).Sum(a => a.Amount);
                if (request.Allocations.Count > 0 && Math.Abs(total - (entity.Amount ?? 0m)) > 0.000001m)
                    throw new InvalidOperationException("Allocation total must equal transaction amount.");
                foreach (var input in request.Allocations.Where(a => a.Amount > 0))
                {
                    if (string.IsNullOrWhiteSpace(input.CustomerId)) throw new InvalidOperationException("An allocation must target a customer.");
                    await _allocationRepository.CreateAsync(new CashTransactionCostAllocation { CashTransactionId = entity.Id, CustomerId = input.CustomerId, Amount = input.Amount, Description = input.Description, CreatedById = request.UpdatedById }, ct);
                }
            }
            await _unitOfWork.SaveAsync(ct);

            await _cashBalanceService.RecalculateManyAsync(
                new[] { previousAccountId, request.CashAccountId }, ct);
        }, cancellationToken);

        return new UpdateCashTransactionResult
        {
            Data = entity!
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
