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
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly ICommandRepository<CashTransactionCostAllocation> _allocationRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly CashBalanceService _cashBalanceService;

    public DeleteCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        ICommandRepository<CashTransactionCostAllocation> allocationRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _paymentRepository = paymentRepository;
        _allocationRepository = allocationRepository;
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

        var affectedAccountIds = new List<string?> { entity.CashAccountId };
        var transactionIds = new List<string> { entity.Id };

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
                    affectedAccountIds.Add(siblingAccountId);
                    transactionIds.Add(sibling.Id);
                    sibling.UpdatedById = request.DeletedById;
                    _repository.Delete(sibling);
                }
            }
        }

        var payments = await _paymentRepository.GetQuery()
            .Where(x => !x.IsDeleted && transactionIds.Contains(x.CashTransactionId))
            .ToListAsync(cancellationToken);
        var allocations = await _allocationRepository.GetQuery()
            .Where(x => !x.IsDeleted && x.CashTransactionId != null && transactionIds.Contains(x.CashTransactionId))
            .ToListAsync(cancellationToken);
        foreach (var payment in payments)
        {
            payment.UpdatedById = request.DeletedById;
            affectedAccountIds.Add(payment.CashAccountId);
            _paymentRepository.Delete(payment);
        }
        foreach (var allocation in allocations)
        {
            allocation.UpdatedById = request.DeletedById;
            _allocationRepository.Delete(allocation);
        }

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        await _cashBalanceService.RecalculateManyAsync(
            affectedAccountIds.Where(x => !string.IsNullOrWhiteSpace(x)),
            cancellationToken);

        return new DeleteCashTransactionResult
        {
            Data = entity
        };
    }

}
