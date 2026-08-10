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
        CashTransaction? entity = null;
        var affectedAccountIds = new List<string?>();

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            entity = await _repository.GetAsync(request.Id ?? string.Empty, ct);

            if (entity == null)
            {
                throw new InvalidOperationException("Không tìm thấy giao dịch thu chi cần xóa.");
            }

            if (!string.IsNullOrWhiteSpace(entity.SourceModule)
                && !string.Equals(entity.SourceModule, "CashTransfer", StringComparison.OrdinalIgnoreCase))
            {
                var sourceName = GetSourceName(entity.SourceModule);
                var sourceNumber = string.IsNullOrWhiteSpace(entity.SourceModuleNumber)
                    ? entity.SourceModuleId
                    : entity.SourceModuleNumber;
                throw new InvalidOperationException(
                    $"Không thể xóa giao dịch tự sinh từ {sourceName} {sourceNumber}. " +
                    "Hãy hủy hoặc hoàn tác chứng từ nguồn để tồn kho, công nợ và số dư được cập nhật đồng bộ.");
            }

            affectedAccountIds.Add(entity.CashAccountId);
            var transactionIds = new List<string> { entity.Id };
            entity.UpdatedById = request.DeletedById;

            // Xóa một vế chuyển quỹ phải xóa cả vế đối ứng trong cùng transaction.
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
                    .FirstOrDefaultAsync(ct);

                if (!string.IsNullOrEmpty(siblingId))
                {
                    var sibling = await _repository.GetAsync(siblingId, ct);
                    if (sibling != null)
                    {
                        affectedAccountIds.Add(sibling.CashAccountId);
                        transactionIds.Add(sibling.Id);
                        sibling.UpdatedById = request.DeletedById;
                        _repository.Delete(sibling);
                    }
                }
            }

            var payments = await _paymentRepository.GetQuery()
                .Where(x => !x.IsDeleted && transactionIds.Contains(x.CashTransactionId))
                .ToListAsync(ct);
            var allocations = await _allocationRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.CashTransactionId != null && transactionIds.Contains(x.CashTransactionId))
                .ToListAsync(ct);
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
            await _unitOfWork.SaveAsync(ct);

            await _cashBalanceService.RecalculateManyAsync(
                affectedAccountIds.Where(x => !string.IsNullOrWhiteSpace(x)), ct);
        }, cancellationToken);

        return new DeleteCashTransactionResult
        {
            Data = entity!
        };
    }

    private static string GetSourceName(string? module) => module?.ToLowerInvariant() switch
    {
        "purchaseorder" => "đơn mua hàng",
        "salesorder" => "đơn bán hàng",
        "materialexport" => "phiếu xuất vật tư",
        "salesreturn" => "phiếu trả hàng bán",
        "purchasereturn" => "phiếu trả hàng mua",
        _ => "chứng từ nguồn"
    };

}
