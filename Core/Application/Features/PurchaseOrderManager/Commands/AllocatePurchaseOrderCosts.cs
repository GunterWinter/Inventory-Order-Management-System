using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Application.Common.CQS.Queries;
using Application.Common.Extensions;

namespace Application.Features.PurchaseOrderManager.Commands;

public class AllocatePurchaseOrderCostsResult
{
    public List<CashTransaction>? CreatedTransactions { get; set; }
}

public class AllocatePurchaseOrderCostsItem
{
    public string? PurchaseOrderItemId { get; set; }
    public string? CustomerId { get; set; }
    public double Quantity { get; set; }
    public double UnitPrice { get; set; }
}

public class AllocatePurchaseOrderCostsRequest : IRequest<AllocatePurchaseOrderCostsResult>
{
    public string? PurchaseOrderId { get; init; }
    public string? CashAccountId { get; init; }
    public string? CashCategoryId { get; init; }
    public List<AllocatePurchaseOrderCostsItem>? Items { get; init; }
    public string? CreatedById { get; init; }
}

public class AllocatePurchaseOrderCostsValidator : AbstractValidator<AllocatePurchaseOrderCostsRequest>
{
    public AllocatePurchaseOrderCostsValidator()
    {
        RuleFor(x => x.PurchaseOrderId).NotEmpty();
        RuleFor(x => x.CashAccountId).NotEmpty();
        RuleFor(x => x.Items).NotEmpty();
    }
}

public class AllocatePurchaseOrderCostsHandler : IRequestHandler<AllocatePurchaseOrderCostsRequest, AllocatePurchaseOrderCostsResult>
{
    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly ICommandRepository<PurchaseOrderCostAllocation> _purchaseOrderCostAllocationRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;

    public AllocatePurchaseOrderCostsHandler(
        IQueryContext queryContext,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        ICommandRepository<PurchaseOrderCostAllocation> purchaseOrderCostAllocationRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService
    )
    {
        _queryContext = queryContext;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _cashAccountRepository = cashAccountRepository;
        _purchaseOrderCostAllocationRepository = purchaseOrderCostAllocationRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
    }

    public async Task<AllocatePurchaseOrderCostsResult> Handle(AllocatePurchaseOrderCostsRequest request, CancellationToken cancellationToken = default)
    {
        // Load the PurchaseOrder
        var purchaseOrder = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Vendor)
            .FirstOrDefaultAsync(x => x.Id == request.PurchaseOrderId, cancellationToken);

        if (purchaseOrder == null)
        {
            throw new Exception($"Không tìm th?y don mua hàng: {request.PurchaseOrderId}");
        }

        // Load the CashAccount for description
        var cashAccount = await _queryContext
            .Set<CashAccount>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .FirstOrDefaultAsync(x => x.Id == request.CashAccountId, cancellationToken);

        if (cashAccount == null)
        {
            throw new Exception($"Không tìm th?y tài kho?n ti?n: {request.CashAccountId}");
        }

        // --- OVERWRITE LOGIC START ---
        // 1. Delete old cost allocations
        var oldAllocations = await _queryContext
            .Set<PurchaseOrderCostAllocation>()
            .Where(x => !x.IsDeleted && x.PurchaseOrderId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);
        
        foreach (var alloc in oldAllocations)
        {
            _purchaseOrderCostAllocationRepository.Delete(alloc);
        }

        // 2. Delete old Credit cash transactions for this PO
        var oldCashTransactions = await _queryContext
            .Set<CashTransaction>()
            .Where(x => !x.IsDeleted && 
                        x.SourceModule == nameof(PurchaseOrder) && 
                        x.SourceModuleId == request.PurchaseOrderId && 
                        x.TransactionType == CashTransactionType.Credit)
            .ToListAsync(cancellationToken);

        foreach (var tx in oldCashTransactions)
        {
            _cashTransactionRepository.Delete(tx);
        }

        // 3. Reset AllocatedQuantity on all PO items
        var poItems = await _queryContext
            .Set<PurchaseOrderItem>()
            .ApplyIsDeletedFilter(false)
            .Include(x => x.Product)
            .Where(x => x.PurchaseOrderId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);

        foreach (var item in poItems)
        {
            item.AllocatedQuantity = 0;
            _purchaseOrderItemRepository.Update(item);
        }
        
        // Finalize items list: Auto-append "Kho" for remaining quantities
        var finalItems = new List<AllocatePurchaseOrderCostsItem>();
        
        // First add the explicitly requested items
        foreach(var reqItem in request.Items!)
        {
            if (reqItem.Quantity > 0)
            {
                finalItems.Add(reqItem);
            }
        }
        
        // Then calculate remaining for each PO item and add Kho
        foreach (var poItem in poItems)
        {
            var requestedForThisItem = finalItems
                .Where(x => x.PurchaseOrderItemId == poItem.Id)
                .Sum(x => x.Quantity);
                
            var remaining = (poItem.Quantity ?? 0) - requestedForThisItem;
            
            if (remaining > 0)
            {
                finalItems.Add(new AllocatePurchaseOrderCostsItem
                {
                    PurchaseOrderItemId = poItem.Id,
                    CustomerId = null, // Kho
                    Quantity = remaining,
                    UnitPrice = poItem.UnitPrice ?? 0
                });
            }
            else if (remaining < 0)
            {
                throw new Exception($"T?ng s? lu?ng phân b? ({requestedForThisItem}) vu?t quá s? lu?ng mua ({poItem.Quantity}) c?a s?n ph?m {poItem.Product?.Name ?? poItem.ProductId}.");
            }
        }

        var customerIds = finalItems
            .Where(x => x.CustomerId != null)
            .Select(x => x.CustomerId)
            .Distinct()
            .ToList();

        var customers = await _queryContext
            .Set<Customer>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => customerIds.Contains(x.Id))
            .ToDictionaryAsync(x => x.Id, x => x.Name ?? "N/A", cancellationToken);

        var groupedByPoItem = finalItems
            .GroupBy(x => x.PurchaseOrderItemId, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // 4. Create new allocations and update PO item AllocatedQuantity
        foreach (var group in groupedByPoItem)
        {
            var poItem = poItems.FirstOrDefault(x => x.Id == group.Key);
            if (poItem == null) continue;

            var totalAllocated = group.Sum(x => x.Quantity);
            poItem.AllocatedQuantity = totalAllocated;
            _purchaseOrderItemRepository.Update(poItem);

            foreach (var reqItem in group)
            {
                var alloc = new PurchaseOrderCostAllocation
                {
                    PurchaseOrderId = purchaseOrder.Id,
                    PurchaseOrderItemId = poItem.Id,
                    CustomerId = reqItem.CustomerId,
                    Quantity = reqItem.Quantity,
                    UnitPrice = reqItem.UnitPrice,
                    Amount = reqItem.Quantity * reqItem.UnitPrice,
                    CreatedById = request.CreatedById
                };
                await _purchaseOrderCostAllocationRepository.CreateAsync(alloc, cancellationToken);
            }
        }

        // 5. Group by Customer to create new CashTransactions
        var groupedByCustomer = finalItems
            .GroupBy(x => x.CustomerId ?? "__KHO__", StringComparer.OrdinalIgnoreCase)
            .ToList();

        var vendorDescription =
            !string.IsNullOrWhiteSpace(purchaseOrder.Description)
                ? purchaseOrder.Description
                : !string.IsNullOrWhiteSpace(purchaseOrder.Vendor?.Name)
                    ? purchaseOrder.Vendor.Name
                    : !string.IsNullOrWhiteSpace(purchaseOrder.Number)
                        ? purchaseOrder.Number
                        : "";
        var createdTransactions = new List<CashTransaction>();

        foreach (var customerGroup in groupedByCustomer)
        {
            var isKho = customerGroup.Key == "__KHO__";
            var customerName = isKho ? "Kho" : (customers.GetValueOrDefault(customerGroup.Key) ?? "N/A");
            var totalAmount = customerGroup.Sum(x => x.Quantity * x.UnitPrice);

            var description = $"{cashAccount.Name} {vendorDescription} - {customerName}";

            var cashTransaction = new CashTransaction
            {
                CreatedById = request.CreatedById,
                Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
                TransactionDate = DateTime.Today,
                TransactionType = CashTransactionType.Credit,
                Status = CashTransactionStatus.Confirmed,
                Amount = totalAmount,
                Description = description,
                CashAccountId = request.CashAccountId,
                CashCategoryId = request.CashCategoryId,
                CustomerId = isKho ? null : customerGroup.Key,
                SourceModule = nameof(PurchaseOrder),
                SourceModuleId = purchaseOrder.Id,
                SourceModuleNumber = purchaseOrder.Number
            };

            await _cashTransactionRepository.CreateAsync(cashTransaction, cancellationToken);
            createdTransactions.Add(cashTransaction);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        // Recalculate CashAccount balance
        await RecalculateAccountBalance(request.CashAccountId!, cancellationToken);
        var oldAccountIds = oldCashTransactions.Select(x => x.CashAccountId).Where(x => x != null).Distinct().ToList();
        foreach (var oldAccId in oldAccountIds)
        {
            if (oldAccId != request.CashAccountId)
            {
                await RecalculateAccountBalance(oldAccId!, cancellationToken);
            }
        }

        return new AllocatePurchaseOrderCostsResult
        {
            CreatedTransactions = createdTransactions
        };
    }

    private async Task RecalculateAccountBalance(string cashAccountId, CancellationToken cancellationToken)
    {
        var account = await _cashAccountRepository.GetAsync(cashAccountId, cancellationToken);
        if (account == null) return;

        var balances = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId && x.Status == CashTransactionStatus.Confirmed)
            .GroupBy(x => 1)
            .Select(g => new
            {
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .FirstOrDefaultAsync(cancellationToken);

        var initialBalance = account.InitialBalance ?? 0d;
        var totalDebit = balances?.TotalDebit ?? 0d;
        var totalCredit = balances?.TotalCredit ?? 0d;

        account.CurrentBalance = initialBalance + totalCredit - totalDebit;
        _cashAccountRepository.Update(account);
        await _unitOfWork.SaveAsync(cancellationToken);
    }
}
