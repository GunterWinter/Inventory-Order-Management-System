using Application.Common.Repositories;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;

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
    private readonly IUnitOfWork _unitOfWork;

    public UpdateCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<UpdateCashTransactionResult> Handle(UpdateCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

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

        return new UpdateCashTransactionResult
        {
            Data = entity
        };
    }
}
