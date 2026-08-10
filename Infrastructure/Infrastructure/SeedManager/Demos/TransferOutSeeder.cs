using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class TransferOutSeeder
{
    private readonly ICommandRepository<TransferOut> _transfers;
    private readonly ICommandRepository<Warehouse> _warehouses;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly ICommandRepository<Product> _products;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public TransferOutSeeder(ICommandRepository<TransferOut> transferOutRepository,
        ICommandRepository<Warehouse> warehouseRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<Product> productRepository, NumberSequenceService numberSequenceService,
        InventoryTransactionService inventoryTransactionService, IUnitOfWork unitOfWork)
    {
        _transfers = transferOutRepository; _warehouses = warehouseRepository;
        _transactions = inventoryTransactionRepository; _products = productRepository;
        _numbers = numberSequenceService; _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _transfers.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var from = await _warehouses.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoSeedData.MainWarehouse);
        var to = await _warehouses.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoSeedData.ProjectWarehouse);
        var product = await _products.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "MAT-LED-001");
        if (from == null || to == null || product == null) return;

        var transfer = new TransferOut { Number = _numbers.GenerateNumber(nameof(TransferOut), "", "OUT"),
            TransferReleaseDate = DemoSeedData.BaseDate.AddDays(14), Status = TransferStatus.Confirmed,
            WarehouseFromId = from.Id, WarehouseToId = to.Id, Description = "DEMO CHUYỂN KHO HỢP LỆ" };
        await _transfers.CreateAsync(transfer);
        var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            ModuleId = transfer.Id, ModuleName = nameof(TransferOut), ModuleCode = "TO-OUT", ModuleNumber = transfer.Number,
            MovementDate = transfer.TransferReleaseDate, Status = InventoryTransactionStatus.Confirmed,
            WarehouseId = from.Id, WarehouseFromId = from.Id, WarehouseToId = to.Id,
            ProductId = product.Id, Movement = 1d };
        _inventory.CalculateInvenTrans(line);
        await _transactions.CreateAsync(line);
        await _unitOfWork.SaveAsync();
    }
}
