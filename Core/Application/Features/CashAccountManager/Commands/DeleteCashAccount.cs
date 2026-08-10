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
    private readonly ICommandRepository<CashTransactionPayment> _paymentRepository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCashAccountHandler(
        ICommandRepository<CashAccount> repository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> paymentRepository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _cashTransactionRepository = cashTransactionRepository;
        _paymentRepository = paymentRepository;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeleteCashAccountResult> Handle(DeleteCashAccountRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new InvalidOperationException("Dữ liệu không còn tồn tại hoặc đã bị xóa. Vui lòng tải lại danh sách.");
        }

        var hasTransactions = await _cashTransactionRepository
            .GetQuery()
            .AnyAsync(x => !x.IsDeleted && x.CashAccountId == entity.Id, cancellationToken);

        if (hasTransactions)
        {
            throw new InvalidOperationException("Không thể xóa tài khoản quỹ vì tài khoản đang được sử dụng trong giao dịch thu chi.");
        }

        var paymentNumber = await _paymentRepository.GetQuery()
            .Where(x => !x.IsDeleted && x.CashAccountId == entity.Id)
            .Select(x => x.CashTransaction != null ? x.CashTransaction.Number : null)
            .FirstOrDefaultAsync(cancellationToken);
        if (paymentNumber != null)
        {
            throw new InvalidOperationException($"Không thể xóa tài khoản quỹ vì đã có lịch sử thanh toán tại giao dịch {paymentNumber}.");
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
