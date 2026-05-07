using Application.Common.Repositories;
using Domain.Entities;
using FluentValidation;
using MediatR;

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
    private readonly IUnitOfWork _unitOfWork;

    public DeleteCashTransactionHandler(
        ICommandRepository<CashTransaction> repository,
        IUnitOfWork unitOfWork
        )
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<DeleteCashTransactionResult> Handle(DeleteCashTransactionRequest request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetAsync(request.Id ?? string.Empty, cancellationToken);

        if (entity == null)
        {
            throw new Exception($"Entity not found: {request.Id}");
        }

        entity.UpdatedById = request.DeletedById;

        _repository.Delete(entity);
        await _unitOfWork.SaveAsync(cancellationToken);

        return new DeleteCashTransactionResult
        {
            Data = entity
        };
    }
}
