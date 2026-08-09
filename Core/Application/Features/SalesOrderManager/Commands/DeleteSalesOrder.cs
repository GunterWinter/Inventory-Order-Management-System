using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Application.Features.SalesOrderManager;
using Domain.Entities;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager.Commands;

public class DeleteSalesOrderResult
{
    public SalesOrder? Data { get; set; }
}

public class DeleteSalesOrderRequest : IRequest<DeleteSalesOrderResult>
{
    public string? Id { get; init; }
    public string? DeletedById { get; init; }
}

public class DeleteSalesOrderValidator : AbstractValidator<DeleteSalesOrderRequest>
{
    public DeleteSalesOrderValidator()
    {
        RuleFor(x => x.Id).NotEmpty();
    }
}

public class DeleteSalesOrderHandler : IRequestHandler<DeleteSalesOrderRequest, DeleteSalesOrderResult>
{
    private readonly ICommandRepository<SalesOrder> _repository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly SalesOrderService _salesOrderService;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly CashBalanceService _cashBalanceService;

    public DeleteSalesOrderHandler(
        ICommandRepository<SalesOrder> repository,
        IUnitOfWork unitOfWork,
        SalesOrderService salesOrderService,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        CashBalanceService cashBalanceService
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
        _salesOrderService = salesOrderService;
        _cashTransactionRepository = cashTransactionRepository;
        _cashBalanceService = cashBalanceService;
    }

    public async Task<DeleteSalesOrderResult> Handle(DeleteSalesOrderRequest request, CancellationToken cancellationToken)
    {

        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.DeletedById;

        // Payments created by the sales-order payment flow are source-owned;
        // remove them with the order and refresh each affected account balance.
        var generatedPayments = await _cashTransactionRepository.GetQuery()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(SalesOrder)
                && x.SourceModuleId == entity.Id)
            .ToListAsync(cancellationToken);
        var affectedCashAccounts = generatedPayments
            .Select(x => x.CashAccountId)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
        foreach (var payment in generatedPayments)
        {
            payment.UpdatedById = request.DeletedById;
            _cashTransactionRepository.Delete(payment);
        }

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        await _cashBalanceService.RecalculateManyAsync(affectedCashAccounts, cancellationToken);

        await _salesOrderService.DeleteSynchronizedDeliveryOrdersAsync(
            entity.Id ?? "",
            entity.UpdatedById,
            cancellationToken
        );

        return new DeleteSalesOrderResult
        {
            Data = entity
        };
    }
}

