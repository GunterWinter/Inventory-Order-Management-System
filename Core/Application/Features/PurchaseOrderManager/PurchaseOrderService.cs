using Application.Common.CQS.Queries;
using Application.Common.Extensions;
using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Application.Features.PurchaseOrderManager;

public class PurchaseOrderService
{
    private readonly ICommandRepository<PurchaseOrder> _purchaseOrderRepository;
    private readonly ICommandRepository<PurchaseOrderItem> _purchaseOrderItemRepository;
    private readonly ICommandRepository<GoodsReceive> _goodsReceiveRepository;
    private readonly IQueryContext _queryContext;
    private readonly IUnitOfWork _unitOfWork;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly InventoryTransactionService _inventoryTransactionService;

    public PurchaseOrderService(
        ICommandRepository<PurchaseOrder> purchaseOrderRepository,
        ICommandRepository<PurchaseOrderItem> purchaseOrderItemRepository,
        ICommandRepository<GoodsReceive> goodsReceiveRepository,
        IQueryContext queryContext,
        IUnitOfWork unitOfWork,
        NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService
        )
    {
        _purchaseOrderRepository = purchaseOrderRepository;
        _purchaseOrderItemRepository = purchaseOrderItemRepository;
        _goodsReceiveRepository = goodsReceiveRepository;
        _queryContext = queryContext;
        _unitOfWork = unitOfWork;
        _numberSequenceService = numberSequenceService;
        _inventoryTransactionService = inventoryTransactionService;
    }

    public void Recalculate(string purchaseOrderId)
    {
        var purchaseOrder = _purchaseOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.Id == purchaseOrderId)
            .Include(x => x.Tax)
            .SingleOrDefault();

        if (purchaseOrder == null)
            return;

        var purchaseOrderItems = _purchaseOrderItemRepository
            .GetQuery()
            .ApplyIsDeletedFilter()
            .Where(x => x.PurchaseOrderId == purchaseOrderId)
            .ToList();

        purchaseOrder.BeforeTaxAmount = purchaseOrderItems.Sum(x => x.Total ?? 0);

        var taxPercentage = purchaseOrder.Tax?.Percentage ?? 0;
        purchaseOrder.TaxAmount = (purchaseOrder.BeforeTaxAmount ?? 0) * taxPercentage / 100;

        purchaseOrder.AfterTaxAmount = (purchaseOrder.BeforeTaxAmount ?? 0) + (purchaseOrder.TaxAmount ?? 0);

        _purchaseOrderRepository.Update(purchaseOrder);
        _unitOfWork.Save();
    }

    public async Task SynchronizeGoodsReceiveAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(purchaseOrderId))
        {
            return;
        }

        var purchaseOrder = await _purchaseOrderRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.Id == purchaseOrderId)
            .Include(x => x.PurchaseOrderItemList.Where(item => !item.IsDeleted))
                .ThenInclude(x => x.Product)
            .SingleOrDefaultAsync(cancellationToken);

        if (purchaseOrder == null)
        {
            return;
        }

        var receivableItems = purchaseOrder.PurchaseOrderItemList
            .Where(x =>
                x.Product?.Physical == true &&
                !string.IsNullOrWhiteSpace(x.WarehouseId) &&
                !string.IsNullOrWhiteSpace(x.ProductId) &&
                !string.IsNullOrWhiteSpace(x.BatchNumber) &&
                (x.Quantity ?? 0) > 0)
            .ToList();

        var goodsReceive = await _goodsReceiveRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderId == purchaseOrder.Id)
            .OrderBy(x => x.CreatedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);

        if (goodsReceive == null && receivableItems.Count == 0)
        {
            return;
        }

        var isNewGoodsReceive = goodsReceive == null;

        if (isNewGoodsReceive)
        {
            goodsReceive = new GoodsReceive
            {
                CreatedById = userId,
                Number = _numberSequenceService.GenerateNumber(nameof(GoodsReceive), "", "GR"),
                PurchaseOrderId = purchaseOrder.Id
            };
        }
        else
        {
            goodsReceive.UpdatedById = userId;
        }

        goodsReceive.ReceiveDate = purchaseOrder.OrderDate;
        goodsReceive.Status = ToGoodsReceiveStatus(purchaseOrder.OrderStatus);
        goodsReceive.Description = purchaseOrder.Description;

        if (goodsReceive.Id == null)
        {
            throw new Exception("Goods receive id not generated.");
        }

        if (isNewGoodsReceive)
        {
            await _goodsReceiveRepository.CreateAsync(goodsReceive, cancellationToken);
        }
        else
        {
            _goodsReceiveRepository.Update(goodsReceive);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        var inventoryTransactions = await _queryContext
            .Set<InventoryTransaction>()
            .AsNoTracking()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.ModuleId == goodsReceive.Id && x.ModuleName == nameof(GoodsReceive))
            .ToListAsync(cancellationToken);

        var validModuleItemIds = receivableItems
            .Where(x => !string.IsNullOrWhiteSpace(x.Id))
            .Select(x => x.Id)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        foreach (var obsoleteTransaction in inventoryTransactions.Where(x => !validModuleItemIds.Contains(x.ModuleItemId ?? string.Empty)))
        {
            await _inventoryTransactionService.GoodsReceiveDeleteInvenTrans(
                obsoleteTransaction.Id,
                userId,
                cancellationToken
            );
        }

        foreach (var item in receivableItems)
        {
            var existingTransaction = inventoryTransactions.FirstOrDefault(x => x.ModuleItemId == item.Id);

            if (existingTransaction == null)
            {
                await _inventoryTransactionService.GoodsReceiveCreateInvenTrans(
                    goodsReceive.Id,
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
                await _inventoryTransactionService.GoodsReceiveUpdateInvenTrans(
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
            goodsReceive.Id,
            nameof(GoodsReceive),
            goodsReceive.ReceiveDate,
            (InventoryTransactionStatus?)goodsReceive.Status,
            goodsReceive.IsDeleted,
            userId,
            null,
            cancellationToken
        );
    }

    public async Task DeleteSynchronizedGoodsReceivesAsync(
        string purchaseOrderId,
        string? userId,
        CancellationToken cancellationToken = default)
    {
        var goodsReceives = await _goodsReceiveRepository
            .GetQuery()
            .ApplyIsDeletedFilter(false)
            .Where(x => x.PurchaseOrderId == purchaseOrderId)
            .ToListAsync(cancellationToken);

        foreach (var goodsReceive in goodsReceives)
        {
            goodsReceive.UpdatedById = userId;
            _goodsReceiveRepository.Delete(goodsReceive);
        }

        await _unitOfWork.SaveAsync(cancellationToken);

        foreach (var goodsReceive in goodsReceives)
        {
            await _inventoryTransactionService.PropagateParentUpdate(
                goodsReceive.Id,
                nameof(GoodsReceive),
                goodsReceive.ReceiveDate,
                (InventoryTransactionStatus?)goodsReceive.Status,
                true,
                userId,
                null,
                cancellationToken
            );
        }
    }

    private static GoodsReceiveStatus ToGoodsReceiveStatus(PurchaseOrderStatus? status)
    {
        return status switch
        {
            PurchaseOrderStatus.Cancelled => GoodsReceiveStatus.Cancelled,
            PurchaseOrderStatus.Confirmed => GoodsReceiveStatus.Confirmed,
            PurchaseOrderStatus.Archived => GoodsReceiveStatus.Archived,
            _ => GoodsReceiveStatus.Draft
        };
    }
}
