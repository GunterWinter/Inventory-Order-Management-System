using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.SeedManager.Demos;

public class CashManagementSeeder
{
    private const string DemoPrefix = "";
    private const string BatchDemoPrefix = "";

    private readonly IQueryContext _queryContext;
    private readonly ICommandRepository<CashAccount> _cashAccountRepository;
    private readonly ICommandRepository<CashCategory> _cashCategoryRepository;
    private readonly ICommandRepository<CashTransaction> _cashTransactionRepository;
    private readonly NumberSequenceService _numberSequenceService;
    private readonly IUnitOfWork _unitOfWork;

    public CashManagementSeeder(
        IQueryContext queryContext,
        ICommandRepository<CashAccount> cashAccountRepository,
        ICommandRepository<CashCategory> cashCategoryRepository,
        ICommandRepository<CashTransaction> cashTransactionRepository,
        NumberSequenceService numberSequenceService,
        IUnitOfWork unitOfWork)
    {
        _queryContext = queryContext;
        _cashAccountRepository = cashAccountRepository;
        _cashCategoryRepository = cashCategoryRepository;
        _cashTransactionRepository = cashTransactionRepository;
        _numberSequenceService = numberSequenceService;
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
            CashAccountType.Personal,
            "Tài khoản cá nhân ",
            initialBalance: 0d,
            cashOnHand: 510_000d);

        var companyAccount = await GetOrCreateAccountAsync(
            "TKCT",
            CashAccountType.Company,
            "Tài khoản công ty",
            initialBalance: 50_000_000d,
            cashOnHand: null);

        var demoAlreadySeeded = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .AnyAsync(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(DemoPrefix));

        if (demoAlreadySeeded)
        {
            return;
        }

        var demoSalesOrder = await _queryContext
            .Set<SalesOrder>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(BatchDemoPrefix))
            .OrderBy(x => x.OrderDate)
            .FirstOrDefaultAsync();

        var demoPurchaseOrder = await _queryContext
            .Set<PurchaseOrder>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.Description != null && x.Description.StartsWith(BatchDemoPrefix))
            .OrderBy(x => x.OrderDate)
            .FirstOrDefaultAsync();

        if (demoSalesOrder != null)
        {
            await CreateTransactionAsync(
                date: new DateTime(2026, 4, 6),
                type: CashTransactionType.Debit,
                status: CashTransactionStatus.Confirmed,
                amount: demoSalesOrder.AfterTaxAmount ?? demoSalesOrder.BeforeTaxAmount ?? 0d,
                description: $"{DemoPrefix} - Thu tiền đơn {demoSalesOrder.Number}",
                cashAccountId: personalAccount.Id,
                cashCategoryId: categories["Bán hàng"].Id,
                sourceModule: "SalesOrder",
                sourceModuleId: demoSalesOrder.Id,
                sourceModuleNumber: demoSalesOrder.Number);
        }

        if (demoPurchaseOrder != null)
        {
            await CreateTransactionAsync(
                date: new DateTime(2026, 4, 3),
                type: CashTransactionType.Credit,
                status: CashTransactionStatus.Draft,
                amount: demoPurchaseOrder.AfterTaxAmount ?? demoPurchaseOrder.BeforeTaxAmount ?? 0d,
                description: $"{DemoPrefix} - Nháp chi tiền đơn {demoPurchaseOrder.Number}",
                cashAccountId: companyAccount.Id,
                cashCategoryId: categories["Mua hàng"].Id,
                sourceModule: "PurchaseOrder",
                sourceModuleId: demoPurchaseOrder.Id,
                sourceModuleNumber: demoPurchaseOrder.Number);
        }

        await CreateTransactionAsync(
            date: new DateTime(2026, 4, 7),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Confirmed,
            amount: 50_000d,
            description: $"{DemoPrefix}Chi tiền xăng xe giao hàng",
            cashAccountId: personalAccount.Id,
            cashCategoryId: categories["Xăng xe"].Id);

        await CreateTransactionAsync(
            date: new DateTime(2026, 4, 8),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Confirmed,
            amount: 2_500_000d,
            description: $"{DemoPrefix} - Chi phí gia công tủ điện mẫu",
            cashAccountId: companyAccount.Id,
            cashCategoryId: categories["Gia công"].Id);

        await CreateTransactionAsync(
            date: new DateTime(2026, 4, 9),
            type: CashTransactionType.Credit,
            status: CashTransactionStatus.Draft,
            amount: 8_000_000d,
            description: $"{DemoPrefix}Nháp chi lương nhân viên tháng 4",
            cashAccountId: personalAccount.Id,
            cashCategoryId: categories["Lương nhân viên"].Id);

        await CreateTransactionAsync(
            date: new DateTime(2026, 4, 10),
            type: CashTransactionType.Debit,
            status: CashTransactionStatus.Confirmed,
            amount: 5_000_000d,
            description: $"{DemoPrefix}Thu tiền cho thuê mặt bằng",
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

        var isNew = category == null;
        category ??= new CashCategory();
        category.Name = name;
        category.Description = description;

        if (isNew)
        {
            await _cashCategoryRepository.CreateAsync(category);
        }
        else
        {
            _cashCategoryRepository.Update(category);
        }

        await _unitOfWork.SaveAsync();
        return category;
    }

    private async Task<CashAccount> GetOrCreateAccountAsync(
        string name,
        CashAccountType accountType,
        string description,
        double initialBalance,
        double? cashOnHand)
    {
        var account = await _queryContext
            .Set<CashAccount>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Name == name);

        var isNew = account == null;
        account ??= new CashAccount
        {
            Number = _numberSequenceService.GenerateNumber(nameof(CashAccount), "", "CA")
        };

        account.Name = name;
        account.AccountType = accountType;
        account.Description = description;
        account.InitialBalance = initialBalance;
        account.CashOnHand = cashOnHand;

        if (isNew)
        {
            await _cashAccountRepository.CreateAsync(account);
        }
        else
        {
            _cashAccountRepository.Update(account);
        }

        await _unitOfWork.SaveAsync();
        return account;
    }

    private async Task CreateTransactionAsync(
        DateTime date,
        CashTransactionType type,
        CashTransactionStatus status,
        double amount,
        string description,
        string? cashAccountId,
        string? cashCategoryId,
        string? sourceModule = null,
        string? sourceModuleId = null,
        string? sourceModuleNumber = null)
    {
        if (amount <= 0)
        {
            return;
        }

        var entity = new CashTransaction
        {
            Number = _numberSequenceService.GenerateNumber(nameof(CashTransaction), "", "CT"),
            TransactionDate = date,
            TransactionType = type,
            Status = status,
            Amount = amount,
            Description = description,
            CashAccountId = cashAccountId,
            CashCategoryId = cashCategoryId,
            SourceModule = sourceModule,
            SourceModuleId = sourceModuleId,
            SourceModuleNumber = sourceModuleNumber
        };

        await _cashTransactionRepository.CreateAsync(entity);
        await _unitOfWork.SaveAsync();
    }

    private async Task RecalculateAccountBalance(string cashAccountId)
    {
        var account = await _queryContext
            .Set<CashAccount>()
            .FirstOrDefaultAsync(x => !x.IsDeleted && x.Id == cashAccountId);
        if (account == null) return;

        var balances = await _queryContext
            .Set<CashTransaction>()
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.CashAccountId == cashAccountId && x.Status == CashTransactionStatus.Confirmed)
            .GroupBy(x => 1)
            .Select(g => new
            {
                TotalDebit = g.Where(x => x.TransactionType == CashTransactionType.Debit).Sum(x => x.Amount ?? 0d),
                TotalCredit = g.Where(x => x.TransactionType == CashTransactionType.Credit).Sum(x => x.Amount ?? 0d)
            })
            .FirstOrDefaultAsync();

        var initialBalance = account.InitialBalance ?? 0d;
        var totalDebit = balances?.TotalDebit ?? 0d;
        var totalCredit = balances?.TotalCredit ?? 0d;
        account.CurrentBalance = initialBalance + totalDebit - totalCredit;

        _cashAccountRepository.Update(account);
        await _unitOfWork.SaveAsync();
    }
}
