using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class SalesReturnSeeder
{
    private readonly ICommandRepository<SalesReturn> _returns;
    private readonly ICommandRepository<SalesOrder> _orders;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public SalesReturnSeeder(ICommandRepository<SalesReturn> salesReturnRepository,
        ICommandRepository<SalesOrder> salesOrderRepository, ICommandRepository<Warehouse> warehouseRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        NumberSequenceService numberSequenceService, InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork)
    {
        _returns = salesReturnRepository; _orders = salesOrderRepository;
        _transactions = inventoryTransactionRepository; _numbers = numberSequenceService;
        _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _returns.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var order = await _orders.GetQuery().Where(x => !x.IsDeleted
                && x.OrderStatus == SalesOrderStatus.Confirmed
                && x.Description == DemoSeedData.PhysicalSaleDescription)
            .FirstOrDefaultAsync();
        if (order == null) return;
        var sourceLine = await _transactions.GetQuery().Where(x => !x.IsDeleted
                && x.ModuleName == nameof(SalesOrder) && x.ModuleId == order.Id)
            .FirstOrDefaultAsync();
        if (sourceLine == null) return;

        var result = new SalesReturn { Number = _numbers.GenerateNumber(nameof(SalesReturn), "", "SRN"),
            ReturnDate = DemoSeedData.BaseDate.AddDays(12), Status = SalesReturnStatus.Draft,
            SalesOrderId = order.Id, Description = "DEMO TRẢ HÀNG BÁN NHÁP" };
        await _returns.CreateAsync(result);
        var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            ModuleId = result.Id, ModuleName = nameof(SalesReturn), ModuleCode = "SRN", ModuleNumber = result.Number,
            ModuleItemId = sourceLine.ModuleItemId, MovementDate = result.ReturnDate, Status = InventoryTransactionStatus.Draft,
            WarehouseId = sourceLine.WarehouseId, ProductId = sourceLine.ProductId, Movement = 1m };
        _inventory.CalculateInvenTrans(line);
        await _transactions.CreateAsync(line);
        await _unitOfWork.SaveAsync();
    }
}
