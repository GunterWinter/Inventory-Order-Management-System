using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class PurchaseReturnSeeder
{
    private readonly ICommandRepository<PurchaseReturn> _returns;
    private readonly ICommandRepository<PurchaseOrder> _orders;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public PurchaseReturnSeeder(ICommandRepository<PurchaseReturn> purchaseReturnRepository,
        ICommandRepository<PurchaseOrder> purchaseOrderRepository, ICommandRepository<Warehouse> warehouseRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        NumberSequenceService numberSequenceService, InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork)
    {
        _returns = purchaseReturnRepository; _orders = purchaseOrderRepository;
        _transactions = inventoryTransactionRepository; _numbers = numberSequenceService;
        _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _returns.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var order = await _orders.GetQuery().Where(x => !x.IsDeleted
                && x.OrderStatus == PurchaseOrderStatus.Confirmed
                && x.Description == "DEMO PO VẬT TƯ GIÁ VỐN THỰC TẾ")
            .FirstOrDefaultAsync();
        if (order == null) return;
        var sourceLine = await _transactions.GetQuery().Where(x => !x.IsDeleted
                && x.ModuleName == nameof(PurchaseOrder) && x.ModuleId == order.Id)
            .FirstOrDefaultAsync();
        if (sourceLine == null) return;

        var result = new PurchaseReturn { Number = _numbers.GenerateNumber(nameof(PurchaseReturn), "", "PRN"),
            ReturnDate = DemoSeedData.BaseDate.AddDays(13), Status = PurchaseReturnStatus.Draft,
            PurchaseOrderId = order.Id, Description = "DEMO TRẢ HÀNG MUA NHÁP" };
        await _returns.CreateAsync(result);
        var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            ModuleId = result.Id, ModuleName = nameof(PurchaseReturn), ModuleCode = "PRN", ModuleNumber = result.Number,
            ModuleItemId = sourceLine.ModuleItemId, MovementDate = result.ReturnDate, Status = InventoryTransactionStatus.Draft,
            WarehouseId = sourceLine.WarehouseId, ProductId = sourceLine.ProductId, Movement = 1d };
        _inventory.CalculateInvenTrans(line);
        await _transactions.CreateAsync(line);
        await _unitOfWork.SaveAsync();
    }
}
