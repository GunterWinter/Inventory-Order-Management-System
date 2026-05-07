using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashCategoryManager.Commands;

public class DeleteCashCategoryResult
{
    public CashCategory? Data { get; set; }
}

public class DeleteCashCategoryRequest : IRequest<DeleteCashCategoryResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteCashCategoryValidator : AbstractValidator<DeleteCashCategoryRequest>
{
    public DeleteCashCategoryValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteCashCategoryHandler : IRequestHandler<DeleteCashCategoryRequest, DeleteCashCategoryResult>
{
    private readonly ICommandRepository<CashCategory> _repository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCashCategoryHandler(
        ICommandRepository<CashCategory> repository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _cashTransactionRepository = cashTransactionRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeleteCashCategoryResult> Handle(DeleteCashCategoryRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var hasTransactions = await _cashTransactionRepository
            .GetQuery()
            .AnyAsync(x => !x.IsDeleted && x.CashCategoryId == entity.Id, cancellationToken);

        if (hasTransactions)
        {
            throw new Exception("Cannot delete cash category because it has cash transactions.");
        }

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteCashCategoryResult
        {
            Data = entity
        };
    }
}
