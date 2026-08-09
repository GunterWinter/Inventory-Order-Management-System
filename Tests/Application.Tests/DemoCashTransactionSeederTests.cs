using Application.Features.CashTransactionManager;
using Application.Features.NumberSequenceManager;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Infrastructure.SeedManager.Demos;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class DemoCashTransactionSeederTests
{
    [Fact]
    public async Task GenerateData_CreatesSourceCashTransactionsForEveryConfirmedPoAndSo()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"demo-cash-seed-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var customer = new Customer { Name = "Customer" };
        var vendor = new Vendor { Name = "Vendor" };
        var salesOrders = Enumerable.Range(1, 3).Select(index => new SalesOrder
        {
            Number = $"SO-{index}",
            OrderDate = new DateTime(2026, 8, index),
            OrderStatus = SalesOrderStatus.Confirmed,
            CustomerId = customer.Id,
            AfterTaxAmount = 100d * index
        }).ToList();
        var purchaseOrders = Enumerable.Range(1, 3).Select(index => new PurchaseOrder
        {
            Number = $"PO-{index}",
            OrderDate = new DateTime(2026, 8, index),
            OrderStatus = PurchaseOrderStatus.Confirmed,
            VendorId = vendor.Id,
            AfterTaxAmount = 200d * index
        }).ToList();
        commandContext.AddRange(customer, vendor);
        commandContext.AddRange(salesOrders);
        commandContext.AddRange(purchaseOrders);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var accountRepository = new CommandRepository<CashAccount>(commandContext);
        var seeder = new CashManagementSeeder(
            queryContext,
            accountRepository,
            new CommandRepository<CashCategory>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashTransactionPayment>(commandContext),
            new NumberSequenceService(new CommandRepository<NumberSequence>(commandContext), unitOfWork),
            new CashBalanceService(queryContext, accountRepository, unitOfWork),
            unitOfWork);

        await seeder.GenerateDataAsync();

        var sourceTransactions = await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModuleId != null)
            .ToListAsync();
        Assert.Equal(salesOrders.Count, sourceTransactions.Count(x => x.SourceModule == nameof(SalesOrder)));
        Assert.Equal(purchaseOrders.Count, sourceTransactions.Count(x => x.SourceModule == nameof(PurchaseOrder)));
        Assert.All(salesOrders, order =>
            Assert.Contains(sourceTransactions, transaction =>
                transaction.SourceModuleId == order.Id && transaction.Amount == order.AfterTaxAmount));
        Assert.All(purchaseOrders, order =>
            Assert.Contains(sourceTransactions, transaction =>
                transaction.SourceModuleId == order.Id && transaction.Amount == order.AfterTaxAmount));
        Assert.Equal(salesOrders.Count, await commandContext.Set<CashTransactionPayment>()
            .CountAsync(x => !x.IsDeleted && x.CashTransaction!.SourceModule == nameof(SalesOrder)));
    }
}
