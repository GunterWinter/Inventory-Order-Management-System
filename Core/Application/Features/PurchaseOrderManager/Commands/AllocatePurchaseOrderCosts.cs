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
        RuleFor(x => x.Items).NotNull();
        RuleForEach(x => x.Items).ChildRules(item =>
        {
            item.RuleFor(x => x.PurchaseOrderItemId).NotEmpty();
            item.RuleFor(x => x.Quantity).GreaterThan(0);
            item.RuleFor(x => x.CustomerId).NotEmpty();
        });
    }
}

public class AllocatePurchaseOrderCostsHandler
    : IRequestHandler<AllocatePurchaseOrderCostsRequest, AllocatePurchaseOrderCostsResult>
{
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<PurchaseOrderCostAllocation> _allocationRepository;
    private readonly ICommandRepository<ProductSerial> _productSerialRepository;
    private readonly ICommandRepository<InventoryTransaction> _inventoryTransactionRepository;
    private readonly ICommandRepository<Customer> _customerRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public AllocatePurchaseOrderCostsHandler(
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<PurchaseOrderCostAllocation> allocationRepository,
        ICommandRepository<ProductSerial> productSerialRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<Customer> customerRepository,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService)
    {
        _purchaseOrderRepository = purchaseOrderRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _allocationRepository = allocationRepository;
        _productSerialRepository = productSerialRepository;
        _inventoryTransactionRepository = inventoryTransactionRepository;
        _customerRepository = customerRepository;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public async Task<AllocatePurchaseOrderCostsResult> Handle(
        AllocatePurchaseOrderCostsRequest request,
        CancellationToken cancellationToken = default)
    {
        CashTransaction? obligation = null;

        await _unitOfWork.ExecuteInTransactionAsync(async ct =>
        {
            var purchaseOrder = await _purchaseOrderRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.Vendor)
                .SingleOrDefaultAsync(x => x.Id == request.PurchaseOrderId, ct);

            if (purchaseOrder == null)
            {
                throw new InvalidOperationException($"Purchase order was not found: {request.PurchaseOrderId}");
            }

            if (purchaseOrder.OrderStatus != PurchaseOrderStatus.Confirmed)
            {
                throw new InvalidOperationException("Only confirmed purchase orders can be allocated.");
            }

            if (string.IsNullOrWhiteSpace(purchaseOrder.VendorId))
            {
                throw new InvalidOperationException("The purchase order must have a vendor before allocation.");
            }

            var existingObligations = await _cashTransactionRepository.GetQuery()
                .Where(x => !x.IsDeleted
                    && x.SourceModule == nameof(PurchaseOrder)
                    && x.SourceModuleId == purchaseOrder.Id
                    && x.TransactionType == CashTransactionType.Credit)
                .ToListAsync(ct);

            if (existingObligations.Count > 1)
            {
                throw new InvalidOperationException("More than one cash transaction exists for this purchase order.");
            }

            obligation = existingObligations.SingleOrDefault();
            if ((obligation?.PaidAmount ?? 0d) > 0d)
            {
                throw new InvalidOperationException("A partially or fully paid purchase order cannot be reallocated.");
            }

            var purchaseOrderItems = await _purchaseOrderItemRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .Include(x => x.Product)
                .Where(x => x.PurchaseOrderId == purchaseOrder.Id)
                .ToListAsync(ct);

            var itemMap = purchaseOrderItems.ToDictionary(x => x.Id, StringComparer.OrdinalIgnoreCase);
            var requestedItems = (request.Items ?? new List<AllocatePurchaseOrderCostsItem>())
                .Where(x => x.Quantity > 0d)
                .GroupBy(x => new { x.PurchaseOrderItemId, x.CustomerId })
                .Select(g => new AllocatePurchaseOrderCostsItem
                {
                    PurchaseOrderItemId = g.Key.PurchaseOrderItemId,
                    CustomerId = g.Key.CustomerId,
                    Quantity = g.Sum(x => x.Quantity),
                    UnitPrice = g.First().UnitPrice
                })
                .ToList();

            if (requestedItems.Any(x => string.IsNullOrWhiteSpace(x.CustomerId)))
            {
                throw new InvalidOperationException("Every allocated quantity must have a customer.");
            }

            if (requestedItems.Any(x => string.IsNullOrWhiteSpace(x.PurchaseOrderItemId)
                || !itemMap.ContainsKey(x.PurchaseOrderItemId)))
            {
                throw new InvalidOperationException("An allocation contains an item that does not belong to the purchase order.");
            }

            var customerIds = requestedItems.Select(x => x.CustomerId!).Distinct().ToList();
            var validCustomerCount = await _customerRepository.GetQuery()
                .ApplyIsDeletedFilter(false)
                .CountAsync(x => customerIds.Contains(x.Id), ct);
            if (validCustomerCount != customerIds.Count)
            {
                throw new InvalidOperationException("One or more allocation customers were not found.");
            }

            foreach (var purchaseOrderItem in purchaseOrderItems)
            {
                var requestedQuantity = requestedItems
                    .Where(x => string.Equals(x.PurchaseOrderItemId, purchaseOrderItem.Id, StringComparison.OrdinalIgnoreCase))
                    .Sum(x => x.Quantity);
                if (requestedQuantity > (purchaseOrderItem.Quantity ?? 0d) + 0.000001d)
                {
                    throw new InvalidOperationException(
                        $"Allocated quantity exceeds purchased quantity for {purchaseOrderItem.Product?.Name ?? purchaseOrderItem.ProductId}.");
                }
            }

            var oldAllocations = await _allocationRepository.GetQuery()
                .Where(x => !x.IsDeleted && x.PurchaseOrderId == purchaseOrder.Id)
                .ToListAsync(ct);
            var existingSerialMap = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

            foreach (var allocation in oldAllocations)
            {
                var allocatedSerials = await _productSerialRepository.GetQuery()
                    .Where(x => !x.IsDeleted && x.CostAllocationId == allocation.Id)
                    .ToListAsync(ct);

                if (!string.IsNullOrWhiteSpace(allocation.CustomerId))
                {
                    var key = $"{allocation.PurchaseOrderItemId}_{allocation.CustomerId}";
                    if (!existingSerialMap.TryGetValue(key, out var serialIds))
                    {
                        serialIds = new List<string>();
                        existingSerialMap[key] = serialIds;
                    }
                    serialIds.AddRange(allocatedSerials.Select(x => x.Id));
                }

                var inventoryTransactions = await _inventoryTransactionRepository.GetQuery()
                    .Where(x => !x.IsDeleted
                        && x.ModuleName == "CostAllocation"
                        && x.ModuleId == allocation.Id)
                    .ToListAsync(ct);
                foreach (var inventoryTransaction in inventoryTransactions)
                {
                    await _inventoryTransactionService.CostAllocationDeleteInvenTrans(
                        inventoryTransaction.Id,
                        request.CreatedById,
                        ct);
                }

                foreach (var serial in allocatedSerials)
                {
                    serial.CostAllocationId = null;
                    _productSerialRepository.Update(serial);
                }

                _allocationRepository.Delete(allocation);
            }

            foreach (var purchaseOrderItem in purchaseOrderItems)
            {
                purchaseOrderItem.AllocatedQuantity = 0d;
                _purchaseOrderItemRepository.Update(purchaseOrderItem);
            }
            await _unitOfWork.SaveAsync(ct);

            var finalItems = new List<AllocatePurchaseOrderCostsItem>(requestedItems);
            foreach (var purchaseOrderItem in purchaseOrderItems)
            {
                var allocated = requestedItems
                    .Where(x => string.Equals(x.PurchaseOrderItemId, purchaseOrderItem.Id, StringComparison.OrdinalIgnoreCase))
                    .Sum(x => x.Quantity);
                var remaining = (purchaseOrderItem.Quantity ?? 0d) - allocated;
                if (remaining > 0.000001d)
                {
                    finalItems.Add(new AllocatePurchaseOrderCostsItem
                    {
                        PurchaseOrderItemId = purchaseOrderItem.Id,
                        CustomerId = null,
                        Quantity = remaining,
                        UnitPrice = ResolveUnitPrice(purchaseOrderItem)
                    });
                }
            }

            foreach (var group in finalItems.GroupBy(x => x.PurchaseOrderItemId, StringComparer.OrdinalIgnoreCase))
            {
                var purchaseOrderItem = itemMap[group.Key!];
                purchaseOrderItem.AllocatedQuantity = group.Sum(x => x.Quantity);
                _purchaseOrderItemRepository.Update(purchaseOrderItem);

                foreach (var item in group)
                {
                    var allocation = new PurchaseOrderCostAllocation
                    {
                        PurchaseOrderId = purchaseOrder.Id,
                        PurchaseOrderItemId = purchaseOrderItem.Id,
                        CustomerId = item.CustomerId,
                        Quantity = item.Quantity,
                        UnitPrice = ResolveUnitPrice(purchaseOrderItem),
                        Amount = item.Quantity * ResolveUnitPrice(purchaseOrderItem),
                        CreatedById = request.CreatedById
                    };
                    await _allocationRepository.CreateAsync(allocation, ct);
                    await _unitOfWork.SaveAsync(ct);

                    if (string.IsNullOrWhiteSpace(allocation.CustomerId))
                    {
                        continue;
                    }

                    IReadOnlyCollection<string>? serialIds = null;
                    if (purchaseOrderItem.Product?.SerialTrackingMode != SerialTrackingMode.None)
                    {
                        var allocationQuantity = allocation.Quantity ?? 0d;
                        if (Math.Abs(allocationQuantity - Math.Round(allocationQuantity)) > 0.000001d)
                        {
                            throw new InvalidOperationException("Serial-tracked products require a whole-number quantity.");
                        }

                        var required = Convert.ToInt32(Math.Round(allocationQuantity));
                        var key = $"{purchaseOrderItem.Id}_{allocation.CustomerId}";
                        var preferredIds = existingSerialMap.GetValueOrDefault(key) ?? new List<string>();
                        var selected = await _productSerialRepository.GetQuery()
                            .Where(x => !x.IsDeleted
                                && preferredIds.Contains(x.Id)
                                && x.PurchaseOrderItemId == purchaseOrderItem.Id
                                && x.Status == ProductSerialStatus.InStock
                                && x.CostAllocationId == null)
                            .OrderBy(x => x.CreatedAtUtc)
                            .ThenBy(x => x.Id)
                            .Take(required)
                            .ToListAsync(ct);

                        if (selected.Count < required)
                        {
                            var selectedIds = selected.Select(x => x.Id).ToList();
                            var extra = await _productSerialRepository.GetQuery()
                                .Where(x => !x.IsDeleted
                                    && x.PurchaseOrderItemId == purchaseOrderItem.Id
                                    && x.Status == ProductSerialStatus.InStock
                                    && x.CostAllocationId == null
                                    && !selectedIds.Contains(x.Id))
                                .OrderBy(x => x.CreatedAtUtc)
                                .ThenBy(x => x.Id)
                                .Take(required - selected.Count)
                                .ToListAsync(ct);
                            selected.AddRange(extra);
                        }

                        if (selected.Count != required)
                        {
                            throw new InvalidOperationException(
                                $"Not enough in-stock serials for {purchaseOrderItem.Product?.Name ?? purchaseOrderItem.ProductId}.");
                        }

                        foreach (var serial in selected)
                        {
                            serial.CostAllocationId = allocation.Id;
                            _productSerialRepository.Update(serial);
                        }
                        await _unitOfWork.SaveAsync(ct);
                        serialIds = selected.Select(x => x.Id).ToList();
                    }

                    await _inventoryTransactionService.CostAllocationCreateInvenTrans(
                        allocation.Id,
                        purchaseOrderItem.ProductId,
                        allocation.Quantity,
                        purchaseOrderItem.WarehouseId,
                        purchaseOrder.Number,
                        request.CreatedById,
                        ct,
                        serialIds);
                }
            }

            var totalAmount = purchaseOrderItems.Sum(x => x.AfterTaxAmount ?? 0d);
            var isNewObligation = obligation == null;
            if (isNewObligation)
            {
                obligation = new CashTransaction
                {
                    CreatedById = request.CreatedById,
                    Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
                    SourceModule = nameof(PurchaseOrder),
                    SourceModuleId = purchaseOrder.Id
                };
            }

            obligation.TransactionDate = DateTime.Today;
            obligation.TransactionType = CashTransactionType.Credit;
            obligation.Status = CashTransactionStatus.Unpaid;
            obligation.Amount = totalAmount;
            obligation.PaidAmount = 0d;
            obligation.Description = $"{purchaseOrder.Vendor?.Name} - {purchaseOrder.Number}".Trim(' ', '-');
            obligation.CashAccountId = null;
            obligation.CashCategoryId = request.CashCategoryId ?? obligation.CashCategoryId;
            obligation.CustomerId = null;
            obligation.VendorId = purchaseOrder.VendorId;
            obligation.SourceModuleNumber = purchaseOrder.Number;

            if (isNewObligation)
            {
                await _cashTransactionRepository.CreateAsync(obligation, ct);
            }
            else
            {
                obligation.UpdatedById = request.CreatedById;
                _cashTransactionRepository.Update(obligation);
            }

            await _unitOfWork.SaveAsync(ct);
        }, cancellationToken);

        return new AllocatePurchaseOrderCostsResult
        {
            CreatedTransactions = new List<CashTransaction> { obligation! }
        };
    }

    private static double ResolveUnitPrice(PurchaseOrderItem item)
    {
        var quantity = item.Quantity ?? 0d;
        return quantity > 0d ? (item.AfterTaxAmount ?? 0d) / quantity : 0d;
    }
}
