using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class ScrappingSeeder
{
    private readonly ICommandRepository<Scrapping> _documents;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly ICommandRepository<Product> _products;
    private readonly ICommandRepository<Warehouse> _warehouses;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public ScrappingSeeder(ICommandRepository<Scrapping> scrappingRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        ICommandRepository<Product> productRepository, ICommandRepository<Warehouse> warehouseRepository,
        NumberSequenceService numberSequenceService, InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork)
    {
        _documents = scrappingRepository; _transactions = inventoryTransactionRepository;
        _products = productRepository; _warehouses = warehouseRepository; _numbers = numberSequenceService;
        _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _documents.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var warehouse = await _warehouses.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == DemoSeedData.MainWarehouse);
        var product = await _products.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.ReferenceCode == "MAT-MDF-001");
        if (warehouse == null || product == null) return;
        var document = new Scrapping { Number = _numbers.GenerateNumber(nameof(Scrapping), "", "SCRP"),
            ScrappingDate = DemoSeedData.BaseDate.AddDays(16), Status = ScrappingStatus.Draft,
            WarehouseId = warehouse.Id, Description = "DEMO HỦY HÀNG NHÁP" };
        await _documents.CreateAsync(document);
        var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
            ModuleId = document.Id, ModuleName = nameof(Scrapping), ModuleCode = "SCRP", ModuleNumber = document.Number,
            MovementDate = document.ScrappingDate, Status = InventoryTransactionStatus.Draft,
            WarehouseId = warehouse.Id, ProductId = product.Id, Movement = 1m };
        _inventory.CalculateInvenTrans(line);
        await _transactions.CreateAsync(line);
        await _unitOfWork.SaveAsync();
    }
}
