using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.SalesOrderManager;

public class SalesOrderService
{
    private readonly ICommandRepository<SalesOrder> _salesOrderRepository;
    private readonly ICommandRepository<SalesOrderItem> _salesOrderItemRepository;
    private readonly ICommandRepository<DeliveryOrder> _deliveryOrderRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public SalesOrderService(
        ICommandRepository<SalesOrder> salesOrderRepository,
        ICommandRepository<SalesOrderItem> salesOrderItemRepository,
        ICommandRepository<DeliveryOrder> deliveryOrderRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _salesOrderRepository = salesOrderRepository;
        _salesOrderItemRepository = salesOrderItemRepository;
        _deliveryOrderRepository = deliveryOrderRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public void Recalculate(string salesOrderId)
    {
        var salesOrder = _salesOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.Id == salesOrderId)
            .Include(x => x.Tax)
            .SingleOrDefault();

        if (salesOrder == null)
            return;

        var salesOrderItems = _salesOrderItemRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.SalesOrderId == salesOrderId)
            .ToList();

        salesOrder.BeforeTaxAmount = salesOrderItems.Sum(x => x.Total ?? 0);

        var taxPercentage = salesOrder.Tax?.Percentage ?? 0;
        salesOrder.TaxAmount = (salesOrder.BeforeTaxAmount ?? 0) * taxPercentage / 100;

        salesOrder.AfterTaxAmount = (salesOrder.BeforeTaxAmount ?? 0) + (salesOrder.TaxAmount ?? 0);

        _salesOrderRepository.Update(salesOrder);
        _unitOfWork.Save();
    }

    public async Task SynchronizeDeliveryOrderAsync(
        string salesOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(salesOrderId))
        {
            return;
        }

        var salesOrder = await _salesOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == salesOrderId)
            .Include(x => x.SalesOrderItemList.Where(item => !item.IsDeleted))
                .ThenInclude(x => x.Product)
            .SingleOrDefaultAsync(cancellationToken);

        if (salesOrder == null)
        {
            return;
        }

        var deliverableItems = salesOrder.SalesOrderItemList
            .Where(x =>
                x.Product?.Physical == true &&
                !string.IsNullOrWhiteSpace(x.WarehouseId) &&
                !string.IsNullOrWhiteSpace(x.ProductId) &&
                !string.IsNullOrWhiteSpace(x.BatchNumber) &&
                x.WarrantyMonths.HasValue &&
                (x.Quantity ?? 0) > 0)
            .ToList();

        var deliveryOrder = await _deliveryOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderId == salesOrder.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (deliveryOrder == null && deliverableItems.Count == 0)
        {
            return;
        }

        var isNewDeliveryOrder = deliveryOrder == null;

        if (isNewDeliveryOrder)
        {
            deliveryOrder = new DeliveryOrder
            {
                CreatedById = userId,
                Number = _numberSequenceService.GenerateNumber(nameof(DeliveryOrder), "", "DO"),
                SalesOrderId = salesOrder.Id
            };
        }
        else
        {
            deliveryOrder.UpdatedById = userId;
        }

        deliveryOrder.DeliveryDate = salesOrder.OrderDate;
        deliveryOrder.Status = ToDeliveryOrderStatus(salesOrder.OrderStatus);
        deliveryOrder.Description = salesOrder.Description;

        if (deliveryOrder.Id == null)
        {
            throw new Exception("Delivery order id not generated.");
        }

        if (isNewDeliveryOrder)
        {
            await _deliveryOrderRepository.CreateAsync(deliveryOrder, cancellationToken);
        }
        else
        {
            _deliveryOrderRepository.Update(deliveryOrder);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == deliveryOrder.Id && x.ModuleName == nameof(DeliveryOrder))
            .ToListAsync(cancellationToken);

        var validModuleItemIds = deliverableItems
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .Select(x => x.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var obsoleteTransaction in inventoryTransactions.Where(x => !validModuleItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            await _inventoryTransactionService.DeliveryOrderDeleteInvenTrans(
                obsoleteTransaction.Id,
                userId,
                cancellationToken
            );
        }

        foreach (var item in deliverableItems)
        {
            var existingTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);
            await ValidateDeliverableStockAsync(item, existingTransaction, cancellationToken);

            if (existingTransaction == null)
            {
                await _inventoryTransactionService.DeliveryOrderCreateInvenTrans(
                    deliveryOrder.Id,
                    item.WarehouseId,
                    item.ProductId,
                    item.Quantity,
                    userId,
                    item.Id,
                    item.BatchNumber,
                    cancellationToken
                );
            }
            else
            {
                await _inventoryTransactionService.DeliveryOrderUpdateInvenTrans(
                    existingTransaction.Id,
                    item.WarehouseId,
                    item.ProductId,
                    item.Quantity,
                    userId,
                    item.Id,
                    item.BatchNumber,
                    cancellationToken
                );
            }
        }

        await _inventoryTransactionService.PropagateParentUpdate(
            deliveryOrder.Id,
            nameof(DeliveryOrder),
            deliveryOrder.DeliveryDate,
            (InventoryTransactionStatus?)deliveryOrder.Status,
            deliveryOrder.IsDeleted,
            userId,
            null,
            cancellationToken
        );
    }

    public async Task DeleteSynchronizedDeliveryOrdersAsync(
        string salesOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        var deliveryOrders = await _deliveryOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.SalesOrderId == salesOrderId)
            .ToListAsync(cancellationToken);

        foreach (var deliveryOrder in deliveryOrders)
        {
            deliveryOrder.UpdatedById = userId;
            _deliveryOrderRepository.Delete(deliveryOrder);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        foreach (var deliveryOrder in deliveryOrders)
        {
            await _inventoryTransactionService.PropagateParentUpdate(
                deliveryOrder.Id,
                nameof(DeliveryOrder),
                deliveryOrder.DeliveryDate,
                (InventoryTransactionStatus?)deliveryOrder.Status,
                true,
                userId,
                null,
                cancellationToken
            );
        }
    }

    private static DeliveryOrderStatus ToDeliveryOrderStatus(SalesOrderStatus? status)
    {
        return status switch
        {
            SalesOrderStatus.Cancelled => DeliveryOrderStatus.Cancelled,
            SalesOrderStatus.Confirmed => DeliveryOrderStatus.Confirmed,
            SalesOrderStatus.Archived => DeliveryOrderStatus.Archived,
            _ => DeliveryOrderStatus.Draft
        };
    }

    private async Task ValidateDeliverableStockAsync(
        SalesOrderItem item,
        InventoryTransaction? existingTransaction,
        CancellationToken cancellationToken)
    {
        var availableStock = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x =>
                x.Status == InventoryTransactionStatus.Confirmed &&
                x.ProductId == item.ProductId &&
                x.WarehouseId == item.WarehouseId &&
                x.BatchNumber == item.BatchNumber)
            .SumAsync(x => x.Stock ?? 0d, cancellationToken);

        if (existingTransaction?.Status == InventoryTransactionStatus.Confirmed &&
            existingTransaction.ProductId == item.ProductId &&
            existingTransaction.WarehouseId == item.WarehouseId &&
            existingTransaction.BatchNumber == item.BatchNumber)
        {
            availableStock -= existingTransaction.Stock ?? 0d;
        }

        if ((item.Quantity ?? 0d) > availableStock)
        {
            throw new Exception($"Not enough stock for the selected warehouse and batch. Available: {availableStock}.");
        }
    }
}
