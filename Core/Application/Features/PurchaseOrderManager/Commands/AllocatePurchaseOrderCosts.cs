using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using FluentValidation;
using MediatR;
using Microsoft.EntityFrameworkCore;

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
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public AllocatePurchaseOrderCostsHandler(
        IQueryContext queryContext,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashAccount> cashAccountRepository,
        ICommandRepository<PurchaseOrderCostAllocation> purchaseOrderCostAllocationRepository,
        ICommandRepository<ProductSerial> productSerialRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService
    )
    {
        _queryContext = queryContext;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _cashAccountRepository = cashAccountRepository;
        _purchaseOrderCostAllocationRepository = purchaseOrderCostAllocationRepository;
        _productSerialRepository = productSerialRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
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
            throw new Exception($"Không tìm thấy đơn mua hàng: {request.PurchaseOrderId}");
        }

        if (purchaseOrder.OrderStatus != PurchaseOrderStatus.Confirmed)
        {
            throw new Exception("Chỉ có thể chia đơn cho đơn mua hàng đã được xác nhận (Confirmed).");
        }

        // Load the CashAccount for description (optional - may be null for Draft)
        CashAccount? cashAccount = null;
        if (!string.IsNullOrWhiteSpace(request.CashAccountId))
        {
            cashAccount = await _queryContext
                .Set<CashAccount>()
                .AsNoTracking()
                .ApplyIsDeletedFilter(false)
                .FirstOrDefaultAsync(x => x.Id == request.CashAccountId, cancellationToken);
        }

        // 1. Load and process old allocations
        var oldAllocations = await _purchaseOrderCostAllocationRepository.GetQuery()
            .Where(x => !x.IsDeleted && x.PurchaseOrderId == request.PurchaseOrderId)
            .ToListAsync(cancellationToken);

        var existingSerialMap = new Dictionary<string, List<string>>();

        foreach (var alloc in oldAllocations)
        {
            if (alloc.CustomerId != null)
            {
                // Save serials
                var allocSerials = await _queryContext.Set<ProductSerial>()
                    .AsNoTracking()
                    .Where(x => x.CostAllocationId == alloc.Id)
                    .Select(x => x.Id!)
                    .ToListAsync(cancellationToken);

                var key = $"{alloc.PurchaseOrderItemId}_{alloc.CustomerId}";
                if (!existingSerialMap.ContainsKey(key)) existingSerialMap[key] = new List<string>();
                existingSerialMap[key].AddRange(allocSerials);

                // Delete inventory transaction if it exists
                var invenTrans = await _queryContext.Set<InventoryTransaction>()
                    .AsNoTracking()
                    .Where(x => x.ModuleId == alloc.Id && x.ModuleName == "CostAllocation" && !x.IsDeleted)
                    .FirstOrDefaultAsync(cancellationToken);

                if (invenTrans != null)
                {
                    await _inventoryTransactionService.CostAllocationDeleteInvenTrans(invenTrans.Id, request.CreatedById, cancellationToken);
                }

                // Clear CostAllocationId explicitly from serials before deleting allocation
                foreach (var serialId in allocSerials)
                {
                    var serial = await _productSerialRepository.GetAsync(serialId, cancellationToken);
                    if (serial != null)
                    {
                        serial.CostAllocationId = null;
                        _productSerialRepository.Update(serial);
                    }
                }
            }

            _purchaseOrderCostAllocationRepository.Delete(alloc);
        }

        // Save changes to commit serial releases and allocation deletions
        await _unitOfWork.SaveAsync(cancellationToken);

        // 2. Delete old Credit cash transactions for this PO
        var oldCashTransactions = await _cashTransactionRepository.GetQuery()
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
        var poItems = await _purchaseOrderItemRepository.GetQuery()
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

        foreach (var reqItem in request.Items!)
        {
            if (reqItem.Quantity > 0)
            {
                finalItems.Add(reqItem);
            }
        }

        // Aggregate to prevent duplicate customer rows and duplicate serial selection
        finalItems = finalItems
            .GroupBy(x => new { x.PurchaseOrderItemId, x.CustomerId })
            .Select(g => new AllocatePurchaseOrderCostsItem
            {
                PurchaseOrderItemId = g.Key.PurchaseOrderItemId,
                CustomerId = g.Key.CustomerId,
                Quantity = g.Sum(x => x.Quantity),
                UnitPrice = g.First().UnitPrice
            })
            .ToList();

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
                    UnitPrice = (poItem.AfterTaxAmount ?? 0) / (poItem.Quantity > 0 ? poItem.Quantity.Value : 1)
                });
            }
            else if (remaining < 0)
            {
                throw new Exception($"Tổng số lượng phân bổ ({requestedForThisItem}) vượt quá số lượng mua ({poItem.Quantity}) của sản phẩm {poItem.Product?.Name ?? poItem.ProductId}.");
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

                // We must save immediately to get the alloc.Id for CostAllocationId and InventoryTransaction
                await _unitOfWork.SaveAsync(cancellationToken);

                if (alloc.CustomerId != null)
                {
                    List<string> selectedSerialIds = new List<string>();
                    var isTracked = poItem.Product?.SerialTrackingMode != SerialTrackingMode.None;

                    if (isTracked)
                    {
                        int neededCount = (int)alloc.Quantity;
                        var key = $"{poItem.Id}_{alloc.CustomerId}";

                        var availableSerials = existingSerialMap.ContainsKey(key) ? existingSerialMap[key] : new List<string>();

                        if (availableSerials.Count >= neededCount)
                        {
                            selectedSerialIds = availableSerials.Take(neededCount).ToList();
                        }
                        else
                        {
                            selectedSerialIds.AddRange(availableSerials);
                            int missing = neededCount - availableSerials.Count;

                            var extraSerials = await _queryContext.Set<ProductSerial>()
                                .AsNoTracking()
                                .Where(x => x.PurchaseOrderItemId == poItem.Id
                                         && x.Status == ProductSerialStatus.InStock
                                         && x.CostAllocationId == null
                                         && !selectedSerialIds.Contains(x.Id))
                                .Take(missing)
                                .Select(x => x.Id!)
                                .ToListAsync(cancellationToken);

                            if (extraSerials.Count < missing)
                            {
                                throw new Exception($"Không đủ số serial InStock cho sản phẩm {poItem.Product?.Name}. Cần {missing} nhưng chỉ có {extraSerials.Count}.");
                            }

                            selectedSerialIds.AddRange(extraSerials);
                        }

                        // Set CostAllocationId on selected serials
                        foreach (var serialId in selectedSerialIds)
                        {
                            var serial = await _productSerialRepository.GetAsync(serialId, cancellationToken);
                            if (serial != null)
                            {
                                serial.CostAllocationId = alloc.Id;
                                _productSerialRepository.Update(serial);
                            }
                        }
                        await _unitOfWork.SaveAsync(cancellationToken);
                    }

                    // Create inventory transaction for this allocation
                    // Pass selectedSerialIds (null if not tracked)
                    await _inventoryTransactionService.CostAllocationCreateInvenTrans(
                        moduleId: alloc.Id,
                        productId: poItem.ProductId,
                        movement: alloc.Quantity,
                        createdById: request.CreatedById,
                        cancellationToken: cancellationToken,
                        productSerialIds: isTracked ? selectedSerialIds : null
                    );
                }
            }
        }

        // 5. Group by Customer to create new CashTransactions
        var groupedByCustomer = finalItems
            .GroupBy(x => x.CustomerId ?? "__KHO__", StringComparer.OrdinalIgnoreCase)
            .ToList();

        var vendorDescription =
            !string.IsNullOrWhiteSpace(purchaseOrder.Vendor?.Name)
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

            var description = $"{vendorDescription} - {customerName}".Trim();

            var cashTransaction = new CashTransaction
            {
                CreatedById = request.CreatedById,
                Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
                TransactionDate = DateTime.Today,
                TransactionType = CashTransactionType.Credit,
                Status = CashTransactionStatus.Unpaid,
                Amount = totalAmount,
                PaidAmount = 0,
                Description = description,
                CashAccountId = request.CashAccountId,
                CashCategoryId = request.CashCategoryId,
                CustomerId = isKho ? null : customerGroup.Key,
                VendorId = purchaseOrder.VendorId,
                SourceModule = nameof(PurchaseOrder),
                SourceModuleId = purchaseOrder.Id,
                SourceModuleNumber = purchaseOrder.Number
            };

            await _cashTransactionRepository.CreateAsync(cashTransaction, cancellationToken);
            createdTransactions.Add(cashTransaction);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        // Draft transactions do not affect account balance - no recalculation needed
        // Old confirmed transactions that were deleted still need balance recalculation
        var oldAccountIds = oldCashTransactions
            .Where(x => x.Status != CashTransactionStatus.Unpaid)
            .Select(x => x.CashAccountId)
            .Where(x => x != null)
            .Distinct()
            .ToList();
        foreach (var oldAccId in oldAccountIds)
        {
            await RecalculateAccountBalance(oldAccId!, cancellationToken);
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
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId)
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
