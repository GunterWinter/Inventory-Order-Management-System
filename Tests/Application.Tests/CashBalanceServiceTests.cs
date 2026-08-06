using Application.Features.CashTransactionManager;
using Application.Features.CashTransactionManager.Commands;
using Application.Features.CashTransactionManager.Queries;
using Application.Features.InventoryTransactionManager;
using Application.Features.MaterialExportManager.Commands;
using Application.Features.PurchaseOrderManager.Commands;
using Application.Features.SalesOrderManager.Commands;
using Application.Features.NumberSequenceManager;
using Application.Features.ProductSerialManager;
using Application.Features.WarehouseManager;
using Domain.Entities;
using Domain.Enums;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace Application.Tests;

public class CashBalanceServiceTests
{
    [Fact]
    public async Task RecalculateAsync_UsesPaidAmountsAndPaymentHistoryWithoutCountingUnpaidDebt()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"cash-balance-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var account = new CashAccount
        {
            Name = "Test account",
            InitialBalance = 1000d,
            CurrentBalance = 1000d
        };
        var directDebit = new CashTransaction
        {
            TransactionType = CashTransactionType.Debit,
            Amount = 100d,
            PaidAmount = 40d,
            CashAccountId = account.Id
        };
        var directCredit = new CashTransaction
        {
            TransactionType = CashTransactionType.Credit,
            Amount = 200d,
            PaidAmount = 20d,
            CashAccountId = account.Id
        };
        var purchaseOrderObligation = new CashTransaction
        {
            TransactionType = CashTransactionType.Credit,
            Amount = 500d,
            PaidAmount = 30d,
            CashAccountId = account.Id,
            SourceModule = nameof(PurchaseOrder)
        };
        var payment = new CashTransactionPayment
        {
            CashTransactionId = purchaseOrderObligation.Id,
            CashAccountId = account.Id,
            PaymentDate = DateTime.UtcNow,
            Amount = 30d
        };

        commandContext.AddRange(account, directDebit, directCredit, purchaseOrderObligation, payment);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var accountRepository = new CommandRepository<CashAccount>(commandContext);
        var service = new CashBalanceService(queryContext, accountRepository, unitOfWork);

        await service.RecalculateAsync(account.Id);

        Assert.Equal(990d, account.CurrentBalance);
    }

    [Fact]
    public void ExportedSerialStatus_IsAppendedWithoutRenumberingExistingStatuses()
    {
        Assert.Equal(8, (int)ProductSerialStatus.ReturnedByCustomer);
        Assert.Equal(9, (int)ProductSerialStatus.Exported);
    }

    [Fact]
    public async Task PayPurchaseOrder_KeepsAllInstallmentsOnTheTransactionsFirstAccount()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"purchase-payment-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var accountOne = new CashAccount
        {
            Name = "Account one",
            InitialBalance = 100d,
            CurrentBalance = 100d
        };
        var accountTwo = new CashAccount
        {
            Name = "Account two",
            InitialBalance = 200d,
            CurrentBalance = 200d
        };
        var obligation = new CashTransaction
        {
            Number = "PO-DEBT-001",
            SourceModule = nameof(PurchaseOrder),
            SourceModuleId = "purchase-order-1",
            TransactionType = CashTransactionType.Credit,
            Status = CashTransactionStatus.Unpaid,
            Amount = 100d,
            PaidAmount = 0d
        };

        commandContext.AddRange(accountOne, accountTwo, obligation);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var cashTransactionRepository = new CommandRepository<CashTransaction>(commandContext);
        var paymentRepository = new CommandRepository<CashTransactionPayment>(commandContext);
        var cashAccountRepository = new CommandRepository<CashAccount>(commandContext);
        var handler = new PayPurchaseOrderHandler(
            cashTransactionRepository,
            paymentRepository,
            cashAccountRepository,
            unitOfWork);

        var firstResult = await handler.Handle(new PayPurchaseOrderRequest
        {
            PurchaseOrderId = obligation.SourceModuleId,
            CashAccountId = accountOne.Id,
            PaymentAmount = 30d,
            PaymentDate = new DateTime(2026, 8, 1)
        }, CancellationToken.None);
        var secondResult = await handler.Handle(new PayPurchaseOrderRequest
        {
            PurchaseOrderId = obligation.SourceModuleId,
            CashAccountId = accountOne.Id,
            PaymentAmount = 20d,
            PaymentDate = new DateTime(2026, 8, 2)
        }, CancellationToken.None);

        Assert.Equal(30d, firstResult.PaidAmount);
        Assert.Equal(50d, secondResult.PaidAmount);
        Assert.Equal(50d, secondResult.RemainingAmount);
        Assert.Equal(nameof(CashTransactionStatus.PartiallyPaid), secondResult.Status);
        Assert.Equal(2, await commandContext.Set<CashTransactionPayment>().CountAsync());
        Assert.Equal(accountOne.Id, obligation.CashAccountId);
        Assert.Equal(50d, accountOne.CurrentBalance);
        Assert.Equal(200d, accountTwo.CurrentBalance);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(new PayPurchaseOrderRequest
        {
            PurchaseOrderId = obligation.SourceModuleId,
            CashAccountId = accountTwo.Id,
            PaymentAmount = 1d
        }, CancellationToken.None));

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(new PayPurchaseOrderRequest
        {
            PurchaseOrderId = obligation.SourceModuleId,
            CashAccountId = accountOne.Id,
            PaymentAmount = 51d
        }, CancellationToken.None));
    }

    [Fact]
    public async Task UpdateSourceTransaction_OnlyChangesAllowedFieldsAndRecordsPaidAmountAdjustment()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"source-transaction-update-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var account = new CashAccount { Name = "PO account", InitialBalance = 100d, CurrentBalance = 70d };
        var category = new CashCategory { Name = "Purchases" };
        var obligation = new CashTransaction
        {
            Number = "PO-DEBT-EDIT",
            SourceModule = nameof(PurchaseOrder),
            SourceModuleId = "purchase-order-edit",
            TransactionDate = new DateTime(2026, 8, 1),
            TransactionType = CashTransactionType.Credit,
            Amount = 100d,
            PaidAmount = 30d,
            Status = CashTransactionStatus.PartiallyPaid,
            CashAccountId = account.Id,
            Description = "Original description"
        };
        var existingPayment = new CashTransactionPayment
        {
            CashTransactionId = obligation.Id,
            CashAccountId = account.Id,
            PaymentDate = new DateTime(2026, 8, 1),
            Amount = 30d
        };
        commandContext.AddRange(account, category, obligation, existingPayment);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var transactionRepository = new CommandRepository<CashTransaction>(commandContext);
        var paymentRepository = new CommandRepository<CashTransactionPayment>(commandContext);
        var accountRepository = new CommandRepository<CashAccount>(commandContext);
        var balanceService = new CashBalanceService(queryContext, accountRepository, unitOfWork);
        var handler = new UpdateCashTransactionHandler(
            transactionRepository,
            paymentRepository,
            unitOfWork,
            balanceService);

        await handler.Handle(new UpdateCashTransactionRequest
        {
            Id = obligation.Id,
            TransactionDate = new DateTime(2030, 1, 1),
            TransactionType = (int)CashTransactionType.Debit,
            Amount = 999d,
            PaidAmount = 50d,
            CashAccountId = null,
            CashCategoryId = category.Id,
            Description = "Updated description"
        }, CancellationToken.None);

        Assert.Equal(new DateTime(2026, 8, 1), obligation.TransactionDate);
        Assert.Equal(CashTransactionType.Credit, obligation.TransactionType);
        Assert.Equal(100d, obligation.Amount);
        Assert.Equal(account.Id, obligation.CashAccountId);
        Assert.Equal(50d, obligation.PaidAmount);
        Assert.Equal(category.Id, obligation.CashCategoryId);
        Assert.Equal("Updated description", obligation.Description);
        Assert.Equal(2, await commandContext.Set<CashTransactionPayment>().CountAsync());
        Assert.Equal(50d, await commandContext.Set<CashTransactionPayment>().SumAsync(x => x.Amount));
        Assert.Equal(50d, account.CurrentBalance);

        await handler.Handle(new UpdateCashTransactionRequest
        {
            Id = obligation.Id,
            PaidAmount = 40d,
            CashCategoryId = category.Id,
            Description = "Corrected description"
        }, CancellationToken.None);

        Assert.Equal(40d, obligation.PaidAmount);
        Assert.Equal(40d, await commandContext.Set<CashTransactionPayment>().SumAsync(x => x.Amount));
        Assert.Equal(60d, account.CurrentBalance);
    }

    [Fact]
    public async Task VendorDebt_UsesConfirmedPurchaseOrdersAndExcludesManualAndMaterialExportTransactions()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"vendor-debt-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var vendor = new Vendor { Name = "Debt vendor" };
        var purchaseOrder = new PurchaseOrder
        {
            Number = "PO-DEBT-001",
            VendorId = vendor.Id,
            OrderStatus = PurchaseOrderStatus.Confirmed,
            AfterTaxAmount = 100d
        };
        commandContext.AddRange(
            vendor,
            purchaseOrder,
            new CashTransaction
            {
                VendorId = vendor.Id,
                TransactionType = CashTransactionType.Credit,
                SourceModule = nameof(PurchaseOrder),
                SourceModuleId = purchaseOrder.Id,
                Amount = 100d,
                PaidAmount = 30d
            },
            new CashTransaction
            {
                VendorId = vendor.Id,
                TransactionType = CashTransactionType.Credit,
                Amount = 10d,
                PaidAmount = 5d
            },
            new CashTransaction
            {
                VendorId = null,
                TransactionType = CashTransactionType.Credit,
                SourceModule = nameof(MaterialExport),
                SourceModuleId = "export-1",
                Amount = 999d,
                PaidAmount = 999d
            });
        await commandContext.SaveChangesAsync();

        var handler = new GetVendorDebtReportHandler(queryContext);
        var result = await handler.Handle(new GetVendorDebtReportRequest(), CancellationToken.None);
        var debt = Assert.Single(result.Data!);

        Assert.Equal(100d, debt.TotalPurchase);
        Assert.Equal(30d, debt.TotalPaid);
        Assert.Equal(70d, debt.RemainingDebt);
    }

    [Fact]
    public async Task SalesOrderPayment_UpdatesOneTransactionAndMovesTheBalanceWhenAccountChanges()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"sales-payment-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var customer = new Customer { Name = "Test customer" };
        var accountOne = new CashAccount { Name = "Cash", InitialBalance = 100d, CurrentBalance = 100d };
        var accountTwo = new CashAccount { Name = "Bank", InitialBalance = 200d, CurrentBalance = 200d };
        var order = new SalesOrder
        {
            Number = "SO-ONE-PAYMENT",
            CustomerId = customer.Id,
            OrderStatus = SalesOrderStatus.Confirmed,
            AfterTaxAmount = 100d
        };
        commandContext.AddRange(customer, accountOne, accountTwo, order);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var transactionRepository = new CommandRepository<CashTransaction>(commandContext);
        var accountRepository = new CommandRepository<CashAccount>(commandContext);
        var numberSequenceService = new NumberSequenceService(new CommandRepository<NumberSequence>(commandContext), unitOfWork);
        var balanceService = new CashBalanceService(queryContext, accountRepository, unitOfWork);
        var handler = new UpsertSalesOrderPaymentHandler(
            new CommandRepository<SalesOrder>(commandContext),
            transactionRepository,
            accountRepository,
            unitOfWork,
            numberSequenceService,
            balanceService);

        var first = await handler.Handle(new UpsertSalesOrderPaymentRequest
        {
            SalesOrderId = order.Id,
            CashAccountId = accountOne.Id,
            PaidAmount = 40d,
            Description = "First save"
        }, CancellationToken.None);

        var second = await handler.Handle(new UpsertSalesOrderPaymentRequest
        {
            SalesOrderId = order.Id,
            CashAccountId = accountTwo.Id,
            PaidAmount = 100d,
            Description = "Paid in full"
        }, CancellationToken.None);

        Assert.Equal(first.CashTransactionId, second.CashTransactionId);
        Assert.Equal(nameof(CashTransactionStatus.Paid), second.Status);
        Assert.Equal(0d, second.RemainingAmount);
        Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => x.SourceModule == nameof(SalesOrder) && x.SourceModuleId == order.Id)
            .ToListAsync());
        Assert.Equal(100d, accountOne.CurrentBalance);
        Assert.Equal(300d, accountTwo.CurrentBalance);
    }

    [Fact]
    public async Task MaterialExportCashTransaction_CanEditCategoryAndDescriptionWithoutCashAccount()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"material-export-cash-edit-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var category = new CashCategory { Name = "Material cost" };
        var transaction = new CashTransaction
        {
            SourceModule = nameof(MaterialExport),
            SourceModuleId = "export-1",
            TransactionType = CashTransactionType.Credit,
            Amount = 100d,
            PaidAmount = 100d,
            Status = CashTransactionStatus.Paid,
            CashAccountId = null,
            Description = "Original"
        };
        commandContext.AddRange(category, transaction);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var accountRepository = new CommandRepository<CashAccount>(commandContext);
        var handler = new UpdateCashTransactionHandler(
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashTransactionPayment>(commandContext),
            unitOfWork,
            new CashBalanceService(queryContext, accountRepository, unitOfWork));

        await handler.Handle(new UpdateCashTransactionRequest
        {
            Id = transaction.Id,
            Amount = 100d,
            PaidAmount = 0d,
            CashAccountId = null,
            CashCategoryId = category.Id,
            Description = "Updated"
        }, CancellationToken.None);

        Assert.Equal(category.Id, transaction.CashCategoryId);
        Assert.Equal("Updated", transaction.Description);
        Assert.Equal(100d, transaction.PaidAmount);
        Assert.Null(transaction.CashAccountId);
    }

    [Fact]
    public async Task CustomerProfitReport_UsesPaidCustomerTransactionsAndExcludesSameNameVendorDebt()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"customer-profit-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var customer = new Customer { Name = "Shared partner name" };
        var vendor = new Vendor { Name = "Shared partner name" };
        commandContext.AddRange(
            customer,
            vendor,
            new CashTransaction
            {
                CustomerId = customer.Id,
                TransactionType = CashTransactionType.Debit,
                Amount = 50d,
                PaidAmount = 40d,
                TransactionDate = new DateTime(2026, 8, 1),
                CreatedAtUtc = new DateTime(2026, 8, 1, 10, 0, 0, DateTimeKind.Utc)
            },
            new CashTransaction
            {
                CustomerId = customer.Id,
                TransactionType = CashTransactionType.Credit,
                SourceModule = nameof(MaterialExport),
                Amount = 30d,
                PaidAmount = 30d,
                TransactionDate = new DateTime(2026, 8, 2),
                CreatedAtUtc = new DateTime(2026, 8, 2, 10, 0, 0, DateTimeKind.Utc)
            },
            new CashTransaction
            {
                VendorId = vendor.Id,
                TransactionType = CashTransactionType.Credit,
                SourceModule = nameof(PurchaseOrder),
                Amount = 60d,
                PaidAmount = 60d,
                TransactionDate = new DateTime(2026, 8, 3),
                CreatedAtUtc = new DateTime(2026, 8, 3, 10, 0, 0, DateTimeKind.Utc)
            });
        await commandContext.SaveChangesAsync();

        var handler = new GetCustomerProfitReportHandler(queryContext);
        var result = await handler.Handle(new GetCustomerProfitReportRequest
        {
            CustomerId = customer.Id,
            FromDate = new DateTime(2026, 8, 1),
            ToDate = new DateTime(2026, 8, 2)
        }, CancellationToken.None);

        Assert.Equal(2, result.Data.Count);
        Assert.Equal(40d, result.ActualReceived);
        Assert.Equal(30d, result.ProjectCost);
        Assert.Equal(10d, result.Profit);
        Assert.DoesNotContain(result.Data, x => x.CustomerId == null);
    }

    [Fact]
    public async Task ConfirmMaterialExport_CreatesOnlyOneCustomerProjectCostCredit()
    {
        var options = new DbContextOptionsBuilder<DataContext>()
            .UseInMemoryDatabase($"material-export-confirm-{Guid.NewGuid()}")
            .Options;
        await using var commandContext = new CommandContext(options);
        await using var queryContext = new QueryContext(options);

        var customer = new Customer { Name = "Project customer" };
        var warehouse = new Warehouse { Name = "Main warehouse" };
        var product = new Product
        {
            Name = "Serial product",
            Physical = true,
            SerialTrackingMode = SerialTrackingMode.InternalAuto
        };
        var purchaseOrder = new PurchaseOrder
        {
            Number = "PO-SOURCE",
            OrderStatus = PurchaseOrderStatus.Confirmed
        };
        var purchaseOrderItem = new PurchaseOrderItem
        {
            PurchaseOrderId = purchaseOrder.Id,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Quantity = 1d
        };
        var materialExport = new MaterialExport
        {
            Number = "ME-PROJECT",
            ExportDate = new DateTime(2026, 8, 6),
            Status = MaterialExportStatus.Draft,
            CustomerId = customer.Id,
            WarehouseId = warehouse.Id
        };
        var line = new InventoryTransaction
        {
            ModuleId = materialExport.Id,
            ModuleName = nameof(MaterialExport),
            ModuleNumber = materialExport.Number,
            ProductId = product.Id,
            WarehouseId = warehouse.Id,
            Movement = 1d,
            Status = InventoryTransactionStatus.Draft
        };
        var serial = new ProductSerial
        {
            ProductId = product.Id,
            InternalSerialNumber = "SERIAL-PROJECT",
            Status = ProductSerialStatus.InStock,
            CurrentWarehouseId = warehouse.Id,
            PurchaseOrderItemId = purchaseOrderItem.Id,
            UnitCost = 30d
        };

        commandContext.AddRange(customer, warehouse, product, purchaseOrder, purchaseOrderItem, materialExport, line, serial);
        await commandContext.SaveChangesAsync();

        var unitOfWork = new UnitOfWork(commandContext);
        var numberSequenceService = new NumberSequenceService(
            new CommandRepository<NumberSequence>(commandContext), unitOfWork);
        var serialService = new ProductSerialService(
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<ProductSerialMovement>(commandContext),
            queryContext,
            unitOfWork);
        var inventoryService = new InventoryTransactionService(
            numberSequenceService,
            new WarehouseService(queryContext),
            queryContext,
            new CommandRepository<InventoryTransaction>(commandContext),
            unitOfWork,
            new CommandRepository<SalesOrderItem>(commandContext),
            serialService);
        var handler = new UpdateMaterialExportHandler(
            new CommandRepository<MaterialExport>(commandContext),
            new CommandRepository<InventoryTransaction>(commandContext),
            new CommandRepository<ProductSerial>(commandContext),
            new CommandRepository<ProductSerialMovement>(commandContext),
            new CommandRepository<CashTransaction>(commandContext),
            new CommandRepository<CashCategory>(commandContext),
            new CommandRepository<Customer>(commandContext),
            unitOfWork,
            inventoryService,
            serialService,
            numberSequenceService);

        var request = new UpdateMaterialExportRequest
        {
            Id = materialExport.Id,
            MaterialExportDate = materialExport.ExportDate,
            WarehouseId = warehouse.Id,
            CustomerId = customer.Id,
            Status = ((int)MaterialExportStatus.Confirmed).ToString()
        };
        await handler.Handle(request, CancellationToken.None);

        var transaction = Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(MaterialExport))
            .ToListAsync());
        Assert.Equal(CashTransactionType.Credit, transaction.TransactionType);
        Assert.Equal(30d, transaction.Amount);
        Assert.Equal(30d, transaction.PaidAmount);
        Assert.Equal(customer.Id, transaction.CustomerId);
        Assert.Equal(purchaseOrder.Id, transaction.SourceDetailId);
        Assert.Null(transaction.VendorId);
        Assert.Null(transaction.CashAccountId);
        Assert.Equal("Phân bổ công trình cho Project customer", transaction.Description);
        Assert.NotNull(transaction.CashCategoryId);

        await Assert.ThrowsAsync<InvalidOperationException>(() => handler.Handle(request, CancellationToken.None));
        Assert.Single(await commandContext.Set<CashTransaction>()
            .Where(x => !x.IsDeleted && x.SourceModule == nameof(MaterialExport))
            .ToListAsync());
    }
}
