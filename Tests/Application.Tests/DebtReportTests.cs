using Application.Features.CashTransactionManager.Queries;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class DebtReportTests
{
    [Fact]
    public async Task CombinedDebtReport_SeparatesCustomerAndVendorAndReturnsPayments()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"debt-report-{Guid.NewGuid()}").Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);
        var customer = new Customer { Name = "Project A" };
        var vendor = new Vendor { Name = "Vendor A" };
        var sales = new SalesOrder { Number = "SO-1", CustomerId = customer.Id, OrderStatus = SalesOrderStatus.Confirmed, AfterTaxAmount = 2_000d };
        var purchase = new PurchaseOrder { Number = "PO-1", VendorId = vendor.Id, OrderStatus = PurchaseOrderStatus.Confirmed, AfterTaxAmount = 1_000d };
        var receivable = new CashTransaction
        {
            Number = "CT-SO", SourceModule = nameof(SalesOrder), SourceModuleId = sales.Id,
            SourceModuleNumber = sales.Number, CustomerId = customer.Id, TransactionType = CashTransactionType.Debit,
            Amount = 2_000d, PaidAmount = 500d, Status = CashTransactionStatus.PartiallyPaid
        };
        var payable = new CashTransaction
        {
            Number = "CT-PO", SourceModule = nameof(PurchaseOrder), SourceModuleId = purchase.Id,
            SourceModuleNumber = purchase.Number, VendorId = vendor.Id, TransactionType = CashTransactionType.Credit,
            Amount = 1_000d, PaidAmount = 300d, Status = CashTransactionStatus.PartiallyPaid
        };
        commandContext.AddRange(customer, vendor, sales, purchase, receivable, payable,
            new CashTransactionPayment { CashTransactionId = receivable.Id, PaymentDate = new DateTime(2026, 8, 10), Amount = 500d },
            new CashTransactionPayment { CashTransactionId = payable.Id, PaymentDate = new DateTime(2026, 8, 10), Amount = 300d });
        await commandContext.SaveChangesAsync();

        var handler = new GetDebtReportHandler(queryContext);
        var customerResult = await handler.Handle(new GetDebtReportRequest { PartyType = "Customer" }, CancellationToken.None);
        var customerDebt = Assert.Single(customerResult.Data);
        Assert.Equal(2_000d, customerDebt.TotalAmount);
        Assert.Equal(500d, customerDebt.PaidAmount);
        Assert.Equal(1_500d, customerDebt.Remaining);
        Assert.Single(Assert.Single(customerDebt.Documents).Payments);

        var vendorResult = await handler.Handle(new GetDebtReportRequest { PartyType = "Vendor" }, CancellationToken.None);
        var vendorDebt = Assert.Single(vendorResult.Data);
        Assert.Equal(1_000d, vendorDebt.TotalAmount);
        Assert.Equal(300d, vendorDebt.PaidAmount);
        Assert.Equal(700d, vendorDebt.Remaining);
        Assert.Single(Assert.Single(vendorDebt.Documents).Payments);
    }
}
