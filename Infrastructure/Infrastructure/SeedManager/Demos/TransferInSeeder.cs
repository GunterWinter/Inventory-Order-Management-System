using Application.Common.Repositories;
using Application.Features.InventoryTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class TransferInSeeder
{
    private readonly ICommandRepository<TransferIn> _receipts;
    private readonly ICommandRepository<TransferOut> _issues;
    private readonly ICommandRepository<InventoryTransaction> _transactions;
    private readonly NumberSequenceService _numbers;
    private readonly InventoryTransactionService _inventory;
    private readonly IUnitOfWork _unitOfWork;

    public TransferInSeeder(ICommandRepository<TransferIn> transferInRepository,
        ICommandRepository<TransferOut> transferOutRepository,
        ICommandRepository<InventoryTransaction> inventoryTransactionRepository,
        NumberSequenceService numberSequenceService, InventoryTransactionService inventoryTransactionService,
        IUnitOfWork unitOfWork)
    {
        _receipts = transferInRepository; _issues = transferOutRepository;
        _transactions = inventoryTransactionRepository; _numbers = numberSequenceService;
        _inventory = inventoryTransactionService; _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        if (await _receipts.GetQuery().AnyAsync(x => !x.IsDeleted)) return;
        var issue = await _issues.GetQuery().FirstOrDefaultAsync(x => !x.IsDeleted && x.Status == TransferStatus.Confirmed);
        if (issue == null) return;
        var sourceLines = await _transactions.GetQuery().Where(x => !x.IsDeleted
            && x.ModuleName == nameof(TransferOut) && x.ModuleId == issue.Id).ToListAsync();

        var receipt = new TransferIn { Number = _numbers.GenerateNumber(nameof(TransferIn), "", "IN"),
            TransferReceiveDate = DemoSeedData.BaseDate.AddDays(15), Status = TransferStatus.Confirmed,
            TransferOutId = issue.Id, Description = "DEMO NHẬN CHUYỂN KHO HỢP LỆ" };
        await _receipts.CreateAsync(receipt);
        foreach (var source in sourceLines)
        {
            var line = new InventoryTransaction { Number = _numbers.GenerateNumber(nameof(InventoryTransaction), "", "IVT"),
                ModuleId = receipt.Id, ModuleName = nameof(TransferIn), ModuleCode = "TO-IN", ModuleNumber = receipt.Number,
                MovementDate = receipt.TransferReceiveDate, Status = InventoryTransactionStatus.Confirmed,
                WarehouseId = issue.WarehouseToId, WarehouseFromId = issue.WarehouseFromId, WarehouseToId = issue.WarehouseToId,
                ProductId = source.ProductId, Movement = source.Movement };
            _inventory.CalculateInvenTrans(line);
            await _transactions.CreateAsync(line);
        }
        await _unitOfWork.SaveAsync();
    }
}
