using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashAccountManager.Commands;

public class DeleteCashAccountResult
{
    public CashAccount? Data { get; set; }
}

public class DeleteCashAccountRequest : IRequest<DeleteCashAccountResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteCashAccountValidator : AbstractValidator<DeleteCashAccountRequest>
{
    public DeleteCashAccountValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteCashAccountHandler : IRequestHandler<DeleteCashAccountRequest, DeleteCashAccountResult>
{
    private readonly ICommandRepository<CashAccount> _repository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _cashTransactionRepository = cashTransactionRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeleteCashAccountResult> Handle(DeleteCashAccountRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var hasTransactions = await _cashTransactionRepository
            .GetQuery()
            .AnyAsync(x => !x.IsDeleted && x.CashAccountId == entity.Id, cancellationToken);

        if (hasTransactions)
        {
            throw new Exception("Cannot delete cash account because it has cash transactions.");
        }

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteCashAccountResult
        {
            Data = entity
        };
    }
}
