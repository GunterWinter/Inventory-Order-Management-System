using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class StockCountSeeder
{
    private readonly ICommandRepository<StockCount> _documents;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly ICommandRepository<Product> _products;
    private readonly ICommandRepository<Warehouse> _warehouses;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public StockCountSeeder(ICommandRepository<StockCount> stockCountRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<Product> productRepository, ICommandRepository<Warehouse> warehouseRepository,
        NumberSequenceService numberSequenceService, InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork)
    {
        _documents = stockCountRepository; _transactions = inventoryTransactionRepository;
        _products = productRepository; _warehouses = warehouseRepository; _numbers = numberSequenceService;
        _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _documents.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var warehouse = await _warehouses.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoSeedData.MainWarehouse);
        var product = await _products.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "MAT-LED-001");
        if (warehouse == null || product == null) return;
        var currentStock = _inventory.GetStock(warehouse.Id, product.Id);
        var document = new StockCount { Number = _numbers.GenerateNumber(nameof(StockCount), "", "SC"),
            CountDate = DemoSeedData.BaseDate.AddDays(17), Status = StockCountStatus.Draft,
            WarehouseId = warehouse.Id, Description = "DEMO KIỂM KÊ NHÁP KHÔNG CHÊNH LỆCH" };
        await _documents.CreateAsync(document);
        var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            ModuleId = document.Id, ModuleName = nameof(StockCount), ModuleCode = "COUNT", ModuleNumber = document.Number,
            MovementDate = document.CountDate, Status = InventoryTransactionStatus.Draft,
            WarehouseId = warehouse.Id, ProductId = product.Id, QtySCCount = Math.Max(0d, currentStock) };
        _inventory.CalculateInvenTrans(line);
        await _transactions.CreateAsync(line);
        await _unitOfWork.SaveAsync();
    }
}
