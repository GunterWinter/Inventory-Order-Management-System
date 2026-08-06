using Application.Common.Repositories;
using Application.Common.CQS.Queries;
using Application.Features.CashTransactionManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.CashTransactionManager.Commands;

public class DeleteCashTransactionResult
{
    public CashTransaction? Data { get; set; }
}

public class DeleteCashTransactionRequest : IRequest<DeleteCashTransactionResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteCashTransactionValidator : AbstractValidator<DeleteCashTransactionRequest>
{
    public DeleteCashTransactionValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteCashTransactionHandler : IRequestHandler<DeleteCashTransactionRequest, DeleteCashTransactionResult>
{
    private readonly ICommandRepository<CashTransaction> _repository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalanceService;

    public DeleteCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _cashBalanceService = cashBalanceService;
    }

    public async Task<DeleteCashTransactionResult> Handle(DeleteCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        var cashAccountId = entity.CashAccountId;

        if (!string.IsNullOrWhiteSpace(entity.SourceModule) && entity.SourceModule != "CashTransfer")
        {
            throw new Exception("Source-generated cash transactions are read-only.");
        }

        entity.UpdatedById = request.DeletedById;

        // Deleting one leg of a cash transfer removes the paired leg as well
        string? siblingAccountId = null;
        if (entity.SourceModule == "CashTransfer" && !string.IsNullOrEmpty(entity.SourceModuleId))
        {
            var siblingId = await _queryContext
                .CashTransaction
                .AsNoTracking()
                .Where(x => !x.IsDeleted
                    && x.SourceModule == "CashTransfer"
                    && x.SourceModuleId == entity.SourceModuleId
                    && x.Id != entity.Id)
                .Select(x => x.Id)
                .FirstOrDefaultAsync(cancellationToken);

            if (!string.IsNullOrEmpty(siblingId))
            {
                var sibling = await _repository.GetAsync(siblingId, cancellationToken);
                if (sibling != null)
                {
                    siblingAccountId = sibling.CashAccountId;
                    sibling.UpdatedById = request.DeletedById;
                    _repository.Delete(sibling);
                }
            }
        }

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        // Recalculate balance for the affected account
        if (!string.IsNullOrEmpty(cashAccountId))
        {
            await _cashBalanceService.RecalculateAsync(cashAccountId, cancellationToken);
        }

        if (!string.IsNullOrEmpty(siblingAccountId) && siblingAccountId != cashAccountId)
        {
            await _cashBalanceService.RecalculateAsync(siblingAccountId, cancellationToken);
        }

        return new DeleteCashTransactionResult
        {
            Data = entity
        };
    }

}
