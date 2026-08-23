using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.CashTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class CashManagementSeeder
{
    private const string DemoPrefix = "DEMO THU CHI ";
    private const string DemoDescriptionPrefix = "DEMO THIẾT BỊ NHÀ THÔNG MINH";

    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly ICommandRepository<CashCategory> _cashCategoryRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly ICommandRepository<CashTransactionPayment> _cashTransactionPaymentRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly CashBalanceService _cashBalanceService;
    private readonly IUnitOfWork _unitOfWork;

    public CashManagementSeeder(
        IQueryContext queryContext,
        ICommandRepository<CashAccount> cashAccountRepository,
        ICommandRepository<CashCategory> cashCategoryRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        ICommandRepository<CashTransactionPayment> cashTransactionPaymentRepository,
        NumberSequenceService numberSequenceService,
        CashBalanceService cashBalanceService,
        IUnitOfWork unitOfWork)
    {
        _queryContext = queryContext;
        _cashAccountRepository = cashAccountRepository;
        _cashCategoryRepository = cashCategoryRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _cashTransactionPaymentRepository = cashTransactionPaymentRepository;
        _numberSequenceService = numberSequenceService;
        _cashBalanceService = cashBalanceService;
        _unitOfWork = unitOfWork;
    }

    public async Task GenerateDataAsync()
    {
        var categories = new Dictionary<string, CashCategory>
        {
            ["Lương nhân viên"] = await GetOrCreateCategoryAsync("Lương nhân viên", "Chi lương hằng tháng"),
            ["Gia công"] = await GetOrCreateCategoryAsync("Gia công", "Chi phí gia công bên ngoài"),
            ["Xăng xe"] = await GetOrCreateCategoryAsync("Xăng xe", "Chi phí vận chuyển và giao hàng"),
            ["Cho thuê mặt bằng"] = await GetOrCreateCategoryAsync("Cho thuê mặt bằng", "Thu từ cho thuê mặt bằng"),
            ["Bán hàng"] = await GetOrCreateCategoryAsync("Bán hàng", "Thu tiền từ đơn bán hàng"),
            ["Mua hàng"] = await GetOrCreateCategoryAsync("Mua hàng", "Chi tiền cho đơn mua hàng")
        };

        var personalAccount = await GetOrCreateAccountAsync(
            "TKCN",
            CashAccountType.Bank,
            "Tài khoản ngân hàng cá nhân",
            initialBalance: 0m);

        var companyAccount = await GetOrCreateAccountAsync(
            "TKCT",
            CashAccountType.Bank,
            "Tài khoản ngân hàng công ty",
            initialBalance: 50_000_000m);

        var cashFundAccount = await GetOrCreateAccountAsync(
            "QTM",
            CashAccountType.Cash,
            "Quỹ tiền mặt",
            initialBalance: 0m);

        var demoAlreadySeeded = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(DemoPrefix));

        if (demoAlreadySeeded)
        {
            return;
        }

        var demoSalesOrders = await _queryContext
            .Set<SalesOrder>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.OrderStatus == SalesOrderStatus.Confirmed)
            .OrderBy(x => x.OrderDate)
            .ToListAsync();

        var demoPurchaseOrders = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.OrderStatus == PurchaseOrderStatus.Confirmed)
            .OrderBy(x => x.OrderDate)
            .ToListAsync();

        for (var index = 0; index < demoSalesOrders.Count; index++)
        {
            var demoSalesOrder = demoSalesOrders[index];
            await CreateTransactionAsync(
                date: (demoSalesOrder.OrderDate ?? new DateTime(2026, 4, 6)).AddDays(1),
                type: CashTransactionType.Debit,
                status: CashTransactionStatus.Paid,
                amount: demoSalesOrder.AfterTaxAmount ?? demoSalesOrder.BeforeTaxAmount ?? 0m,
                description: $"{DemoPrefix}Thu tiền đơn {demoSalesOrder.Number}",
                cashAccountId: index % 2 == 0 ? personalAccount.Id : companyAccount.Id,
                cashCategoryId: categories["Bán hàng"].Id,
                sourceModule: "SalesOrder",
                sourceModuleId: demoSalesOrder.Id,
                sourceModuleNumber: demoSalesOrder.Number,
                customerId: demoSalesOrder.CustomerId);
        }

        foreach (var demoPurchaseOrder in demoPurchaseOrders)
        {
            await CreateTransactionAsync(
                date: (demoPurchaseOrder.OrderDate ?? new DateTime(2026, 4, 3)).AddDays(2),
                type: CashTransactionType.Credit,
                status: CashTransactionStatus.Unpaid,
                amount: demoPurchaseOrder.AfterTaxAmount ?? demoPurchaseOrder.BeforeTaxAmount ?? 0m,
                description: $"{DemoPrefix}Nháp chi tiền đơn {demoPurchaseOrder.Number}",
                cashAccountId: null,
                cashCategoryId: categories["Mua hàng"].Id,
                sourceModule: "PurchaseOrder",
                sourceModuleId: demoPurchaseOrder.Id,
                sourceModuleNumber: demoPurchaseOrder.Number,
                vendorId: demoPurchaseOrder.VendorId);
        }

        var serialSaleId = await _queryContext.Set<SalesOrder>().AsNoTracking()
            .Where(x => !x.IsDeleted && x.Description == DemoSeedData.SerialSaleDescription)
            .Select(x => x.Id)
            .FirstOrDefaultAsync();
        var partialReceivable = await _cashTransactionRepository.GetQuery()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.SourceModule == nameof(SalesOrder)
                && x.SourceModuleId == serialSaleId);
        if (partialReceivable != null && (partialReceivable.PaidAmount ?? 0m) == 0m)
        {
            var partialAmount = Math.Min(1_000_000m, (partialReceivable.Amount ?? 0m) / 2m);
            partialReceivable.CashAccountId = companyAccount.Id;
            partialReceivable.PaidAmount = partialAmount;
            partialReceivable.Status = CashTransactionStatus.PartiallyPaid;
            partialReceivable.UpdatedById = "demo-seeder";
            _cashTransactionRepository.Update(partialReceivable);
            await _cashTransactionPaymentRepository.CreateAsync(new CashTransactionPayment
            {
                CashTransactionId = partialReceivable.Id,
                CashAccountId = companyAccount.Id,
                PaymentDate = DemoSeedData.BaseDate.AddDays(9),
                Amount = partialAmount,
                Description = "DEMO THANH TOÁN MỘT PHẦN SO SERIAL",
                CreatedById = "demo-seeder"
            });
            await _unitOfWork.SaveAsync();
        }

        await CreateTransactionAsync(
            date: DemoSeedData.BaseDate.AddDays(20),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Paid,
            amount: 50_000m,
            description: $"{DemoPrefix}chi tiền xăng xe giao hàng",
            cashAccountId: personalAccount.Id,
            cashCategoryId: categories["Xăng xe"].Id);

        await CreateTransactionAsync(
            date: DemoSeedData.BaseDate.AddDays(21),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Paid,
            amount: 2_500_000m,
            description: $"{DemoPrefix}chi phí gia công tủ điện mẫu",
            cashAccountId: companyAccount.Id,
            cashCategoryId: categories["Gia công"].Id);

        await CreateTransactionAsync(
            date: DemoSeedData.BaseDate.AddDays(22),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Unpaid,
            amount: 8_000_000m,
            description: $"{DemoPrefix}nháp chi lương nhân viên tháng 4",
            cashAccountId: personalAccount.Id,
            cashCategoryId: categories["Lương nhân viên"].Id);

        await CreateTransactionAsync(
            date: DemoSeedData.BaseDate.AddDays(23),
            type: CashTransactionType.Debit,
            status: CashTransactionStatus.Paid,
            amount: 5_000_000m,
            description: $"{DemoPrefix}thu tiền cho thuê mặt bằng",
            cashAccountId: companyAccount.Id,
            cashCategoryId: categories["Cho thuê mặt bằng"].Id);

        await RecalculateAccountBalance(personalAccount.Id);
        await RecalculateAccountBalance(companyAccount.Id);
    }

    private async Task<CashCategory> GetOrCreateCategoryAsync(string name, string description)
    {
        var category = await _queryContext
            .Set<CashCategory>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == name);

        if (category == null)
        {
            category = new CashCategory
            {
                Name = name,
                Description = description
            };
            await _cashCategoryRepository.CreateAsync(category);
            await _unitOfWork.SaveAsync();
        }

        return category;
    }

    private async Task<CashAccount> GetOrCreateAccountAsync(
        string name,
        CashAccountType accountType,
        string description,
        decimal initialBalance)
    {
        var account = await _queryContext
            .Set<CashAccount>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == name);

        if (account == null)
        {
            account = new CashAccount
            {
                Number = _numberSequenceService.GenerateNumber(nameof(CashAccount), "", "CA"),
                Name = name,
                AccountType = accountType,
                Description = description,
                InitialBalance = initialBalance,
                CurrentBalance = initialBalance
            };
            await _cashAccountRepository.CreateAsync(account);
            await _unitOfWork.SaveAsync();
        }

        return account;
    }

    private async Task CreateTransactionAsync(
        DateTime date,
        CashTransactionType type,
        CashTransactionStatus status,
        decimal amount,
        string description,
        string? cashAccountId,
        string? cashCategoryId,
        string? sourceModule = null,
        string? sourceModuleId = null,
        string? sourceModuleNumber = null,
        string? vendorId = null,
        string? customerId = null)
    {
        if (amount <= 0)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(sourceModule) && !string.IsNullOrWhiteSpace(sourceModuleId))
        {
            var sourceTransactionExists = await _queryContext.Set<CashTransaction>()
                .AsNoTracking()
                .AnyAsync(x => !x.IsDeleted
                    && x.SourceModule == sourceModule
                    && x.SourceModuleId == sourceModuleId
                    && x.TransactionType == type);
            if (sourceTransactionExists)
            {
                return;
            }
        }

        var entity = new CashTransaction
        {
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
            TransactionDate = date,
            TransactionType = type,
            Status = status,
            Amount = amount,
            PaidAmount = status == CashTransactionStatus.Paid ? amount : 0,
            Description = description,
            CashAccountId = cashAccountId,
            CashCategoryId = cashCategoryId,
            VendorId = vendorId,
            CustomerId = customerId,
            SourceModule = sourceModule,
            SourceModuleId = sourceModuleId,
            SourceModuleNumber = sourceModuleNumber
        };

        await _cashTransactionRepository.CreateAsync(entity);
        await _unitOfWork.SaveAsync();

        if ((entity.PaidAmount ?? 0m) > 0m)
        {
            await _cashTransactionPaymentRepository.CreateAsync(new CashTransactionPayment
            {
                CashTransactionId = entity.Id,
                CashAccountId = entity.CashAccountId,
                PaymentDate = entity.TransactionDate ?? DateTime.Today,
                Amount = entity.PaidAmount ?? 0m,
                Description = entity.Description
            });
            await _unitOfWork.SaveAsync();
        }
    }

    private async Task RecalculateAccountBalance(string cashAccountId)
    {
        await _cashBalanceService.RecalculateAsync(cashAccountId);
    }
}
