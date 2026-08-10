using Application.Features.DashboardManager.Queries;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class DashboardCardsTests
{
    [Fact]
    public async Task ConfirmedValuesUseBeforeTax_WhileDebtUsesAfterTaxMinusPayments()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"dashboard-cards-{Guid.NewGuid()}").Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var salesOrder = new SalesOrder
        {
            Number = "SO-1",
            OrderStatus = SalesOrderStatus.Confirmed,
            BeforeTaxAmount = 100d,
            AfterTaxAmount = 110d
        };
        var purchaseOrder = new PurchaseOrder
        {
            Number = "PO-1",
            OrderStatus = PurchaseOrderStatus.Confirmed,
            BeforeTaxAmount = 200d,
            AfterTaxAmount = 220d
        };
        commandContext.AddRange(
            salesOrder,
            purchaseOrder,
            new CashTransaction
            {
                SourceModule = nameof(SalesOrder),
                SourceModuleId = salesOrder.Id,
                TransactionType = CashTransactionType.Debit,
                Amount = 110d,
                PaidAmount = 40d
            },
            new CashTransaction
            {
                SourceModule = nameof(PurchaseOrder),
                SourceModuleId = purchaseOrder.Id,
                TransactionType = CashTransactionType.Credit,
                Amount = 220d,
                PaidAmount = 20d
            });
        await commandContext.SaveChangesAsync();

        var result = await new GetCardsDashboardHandler(queryContext)
            .Handle(new GetCardsDashboardRequest(), CancellationToken.None);
        var cards = Assert.IsType<CardsItem>(result.Data?.CardsDashboard);

        Assert.Equal(100d, cards.ConfirmedSalesAmount);
        Assert.Equal(70d, cards.CustomerReceivable);
        Assert.Equal(200d, cards.ConfirmedPurchaseAmount);
        Assert.Equal(200d, cards.VendorDebt);
    }
}
