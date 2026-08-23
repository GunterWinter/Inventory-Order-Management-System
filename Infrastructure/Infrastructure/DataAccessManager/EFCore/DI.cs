using Application.Common.CQS.Commands;
using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Serilog;

namespace Infrastructure.DataAccessManager.EFCore;



public static class DI
{
    public static IServiceCollection RegisterDataAccess(
        this IServiceCollection services,
        IConfiguration configuration,
        IHostEnvironment environment)
    {
        var connectionString = configuration.GetConnectionString("DefaultConnection");
        var databaseProvider = configuration["DatabaseProvider"];

        // Register Context
        switch (databaseProvider)
        {
            //case "MySql":
            //    services.AddDbContext<DataContext>(options =>
            //        options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)))
            //        .LogTo(Log.Information, LogLevel.Information)
            //        .EnableSensitiveDataLogging()
            //    );
            //    services.AddDbContext<CommandContext>(options =>
            //        options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)))
            //        .LogTo(Log.Information, LogLevel.Information)
            //        .EnableSensitiveDataLogging()
            //    );
            //    services.AddDbContext<QueryContext>(options =>
            //        options.UseMySql(connectionString, new MySqlServerVersion(new Version(8, 0, 21)))
            //        .LogTo(Log.Information, LogLevel.Information)
            //        .EnableSensitiveDataLogging()
            //    );
            //    break;

            case "SqlServer":
            default:
                void ConfigureSqlServer(DbContextOptionsBuilder options)
                {
                    options.UseSqlServer(connectionString);
                    if (environment.IsDevelopment() && configuration.GetValue<bool>("DataAccess:LogSql"))
                    {
                        options.LogTo(Log.Information, LogLevel.Information);
                    }
                    if (environment.IsDevelopment() && configuration.GetValue<bool>("DataAccess:EnableSensitiveDataLogging"))
                    {
                        options.EnableSensitiveDataLogging();
                    }
                }

                services.AddDbContext<DataContext>(ConfigureSqlServer);
                services.AddDbContext<CommandContext>(ConfigureSqlServer);
                services.AddDbContext<QueryContext>(ConfigureSqlServer);
                break;
        }


        services.AddScoped<ICommandContext, CommandContext>();
        services.AddScoped<IQueryContext, QueryContext>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped(typeof(ICommandRepository<>), typeof(CommandRepository<>));


        return services;
    }

    public static IHost CreateDatabase(this IHost host, bool resetDatabase = false)
    {
        using var scope = host.Services.CreateScope();
        var serviceProvider = scope.ServiceProvider;

        // Create database using DataContext
        var dataContext = serviceProvider.GetRequiredService<DataContext>();
        // Demo runs are intentionally disposable; production/non-demo runs must
        // never delete an existing database.
        if (resetDatabase)
        {
            dataContext.Database.EnsureDeleted();
        }
        dataContext.Database.EnsureCreated();
        // Keep only legacy column compatibility here. New tables should come from the EF model
        // when the database is recreated from scratch.
        EnsureCompatibilityColumns(dataContext);

        return host;
    }

    private static void EnsureCompatibilityColumns(DataContext dataContext)
    {
        if (dataContext.Database.ProviderName?.Contains("SqlServer") != true)
        {
            return;
        }

        EnsureDecimalColumns(dataContext);

        var duplicatePurchaseOrderProducts = dataContext.PurchaseOrderItem
            .AsNoTracking()
            .Where(x => !x.IsDeleted && x.PurchaseOrderId != null && x.ProductId != null)
            .GroupBy(x => new { x.PurchaseOrderId, x.ProductId })
            .Where(x => x.Count() > 1)
            .Select(x => new { x.Key.PurchaseOrderId, x.Key.ProductId, Count = x.Count() })
            .Take(10)
            .ToList();

        if (duplicatePurchaseOrderProducts.Count > 0)
        {
            Log.Warning(
                "Không thể tạo unique index dòng PO vì database hiện hữu có {Count} nhóm hàng trùng (chỉ hiển thị tối đa 10). Dữ liệu không bị tự động xóa; validation ứng dụng vẫn chặn phát sinh trùng mới. Ví dụ: {@Duplicates}",
                duplicatePurchaseOrderProducts.Count,
                duplicatePurchaseOrderProducts);
        }

        var commands = new[]
        {
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'DefaultWarehouseId') IS NULL ALTER TABLE [dbo].[Product] ADD [DefaultWarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'DefaultWarrantyMonths') IS NULL ALTER TABLE [dbo].[Product] ADD [DefaultWarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseOrderItem', N'WarehouseId') IS NULL ALTER TABLE [dbo].[PurchaseOrderItem] ADD [WarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseOrderItem', N'SupplierWarrantyMonths') IS NULL ALTER TABLE [dbo].[PurchaseOrderItem] ADD [SupplierWarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrderItem', N'WarrantyMonths') IS NULL ALTER TABLE [dbo].[SalesOrderItem] ADD [WarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrderItem', N'WarehouseId') IS NULL ALTER TABLE [dbo].[SalesOrderItem] ADD [WarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.CashTransaction', N'CustomerId') IS NULL ALTER TABLE [dbo].[CashTransaction] ADD [CustomerId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.CashTransaction', N'VendorId') IS NULL ALTER TABLE [dbo].[CashTransaction] ADD [VendorId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.CashTransaction', N'PaidAmount') IS NULL ALTER TABLE [dbo].[CashTransaction] ADD [PaidAmount] decimal(19,6) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.CashTransaction', N'SourceDetailId') IS NULL ALTER TABLE [dbo].[CashTransaction] ADD [SourceDetailId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'CostPrice') IS NULL ALTER TABLE [dbo].[Product] ADD [CostPrice] decimal(19,6) NULL;",
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'ImageUrl') IS NULL ALTER TABLE [dbo].[Product] ADD [ImageUrl] nvarchar(500) NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrder]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrder', N'SalesType') IS NULL ALTER TABLE [dbo].[SalesOrder] ADD [SalesType] int NOT NULL DEFAULT 1;",
            "IF OBJECT_ID(N'[dbo].[SalesReturn]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesReturn', N'SalesOrderId') IS NULL ALTER TABLE [dbo].[SalesReturn] ADD [SalesOrderId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseReturn]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseReturn', N'PurchaseOrderId') IS NULL ALTER TABLE [dbo].[PurchaseReturn] ADD [PurchaseOrderId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[ProductSerial]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.ProductSerial', N'UnitCost') IS NULL ALTER TABLE [dbo].[ProductSerial] ADD [UnitCost] decimal(19,6) NULL;",
            "IF OBJECT_ID(N'[dbo].[InventoryTransaction]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.InventoryTransaction', N'UnitCost') IS NULL ALTER TABLE [dbo].[InventoryTransaction] ADD [UnitCost] decimal(19,6) NULL;",
            "IF OBJECT_ID(N'[dbo].[InventoryTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_InventoryTransaction_StockLookup' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryTransaction]')) CREATE INDEX [IX_InventoryTransaction_StockLookup] ON [dbo].[InventoryTransaction] ([IsDeleted], [Status], [ProductId], [WarehouseId]) INCLUDE ([Stock], [CreatedAtUtc]);",
            "IF OBJECT_ID(N'[dbo].[InventoryTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_InventoryTransaction_ActiveModuleItem' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryTransaction]')) CREATE INDEX [IX_InventoryTransaction_ActiveModuleItem] ON [dbo].[InventoryTransaction] ([ModuleName], [ModuleId], [ModuleItemId]) INCLUDE ([Status], [ProductId], [WarehouseId], [Movement], [Stock]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[ProductSerial]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_ProductSerial_StockLookup' AND [object_id] = OBJECT_ID(N'[dbo].[ProductSerial]')) CREATE INDEX [IX_ProductSerial_StockLookup] ON [dbo].[ProductSerial] ([IsDeleted], [Status], [ProductId], [CurrentWarehouseId]) INCLUDE ([CreatedAtUtc]);",
            "IF OBJECT_ID(N'[dbo].[ProductSerial]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_ProductSerial_ActivePurchaseOrderItem' AND [object_id] = OBJECT_ID(N'[dbo].[ProductSerial]')) CREATE INDEX [IX_ProductSerial_ActivePurchaseOrderItem] ON [dbo].[ProductSerial] ([PurchaseOrderItemId], [CreatedAtUtc]) INCLUDE ([Status], [InternalSerialNumber], [ManufacturerSerialNumber]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[ProductSerialMovement]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_ProductSerialMovement_ActiveInventoryTransaction' AND [object_id] = OBJECT_ID(N'[dbo].[ProductSerialMovement]')) CREATE INDEX [IX_ProductSerialMovement_ActiveInventoryTransaction] ON [dbo].[ProductSerialMovement] ([InventoryTransactionId], [ReversedAtUtc], [Status]) INCLUDE ([ProductSerialId], [CreatedAtUtc]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[ProductSerial]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_ProductSerial_ManufacturerSerialNumber' AND [object_id] = OBJECT_ID(N'[dbo].[ProductSerial]')) AND NOT EXISTS (SELECT 1 FROM [dbo].[ProductSerial] WHERE [IsDeleted] = 0 AND [ManufacturerSerialNumber] IS NOT NULL GROUP BY [ManufacturerSerialNumber] HAVING COUNT(*) > 1) CREATE UNIQUE INDEX [IX_ProductSerial_ManufacturerSerialNumber] ON [dbo].[ProductSerial] ([ManufacturerSerialNumber]) WHERE [ManufacturerSerialNumber] IS NOT NULL AND [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_PurchaseOrderItem_PurchaseOrderId_ProductId' AND [object_id] = OBJECT_ID(N'[dbo].[PurchaseOrderItem]')) AND NOT EXISTS (SELECT 1 FROM [dbo].[PurchaseOrderItem] WHERE [IsDeleted] = 0 AND [PurchaseOrderId] IS NOT NULL AND [ProductId] IS NOT NULL GROUP BY [PurchaseOrderId], [ProductId] HAVING COUNT(*) > 1) CREATE UNIQUE INDEX [IX_PurchaseOrderItem_PurchaseOrderId_ProductId] ON [dbo].[PurchaseOrderItem] ([PurchaseOrderId], [ProductId]) WHERE [IsDeleted] = 0 AND [PurchaseOrderId] IS NOT NULL AND [ProductId] IS NOT NULL;",
            "IF OBJECT_ID(N'[dbo].[MaterialExport]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.MaterialExport', N'WarehouseId') IS NULL ALTER TABLE [dbo].[MaterialExport] ADD [WarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NULL BEGIN CREATE TABLE [dbo].[CashTransactionPayment] ([Id] nvarchar(50) NOT NULL, [IsDeleted] bit NOT NULL CONSTRAINT [DF_CashTransactionPayment_IsDeleted] DEFAULT 0, [CreatedAtUtc] datetime2 NULL, [CreatedById] nvarchar(450) NULL, [UpdatedAtUtc] datetime2 NULL, [UpdatedById] nvarchar(450) NULL, [CashTransactionId] nvarchar(50) NOT NULL, [CashAccountId] nvarchar(50) NULL, [PaymentDate] datetime2 NOT NULL, [Amount] decimal(19,6) NOT NULL, [Description] nvarchar(4000) NULL, CONSTRAINT [PK_CashTransactionPayment] PRIMARY KEY ([Id]), CONSTRAINT [FK_CashTransactionPayment_CashTransaction_CashTransactionId] FOREIGN KEY ([CashTransactionId]) REFERENCES [dbo].[CashTransaction] ([Id]), CONSTRAINT [FK_CashTransactionPayment_CashAccount_CashAccountId] FOREIGN KEY ([CashAccountId]) REFERENCES [dbo].[CashAccount] ([Id])); CREATE INDEX [IX_CashTransactionPayment_CashTransactionId] ON [dbo].[CashTransactionPayment] ([CashTransactionId]); CREATE INDEX [IX_CashTransactionPayment_CashAccountId] ON [dbo].[CashTransactionPayment] ([CashAccountId]); CREATE INDEX [IX_CashTransactionPayment_PaymentDate] ON [dbo].[CashTransactionPayment] ([PaymentDate]); END;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL ALTER TABLE [dbo].[CashTransactionPayment] ALTER COLUMN [CashAccountId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_CashTransaction_ActiveBalance' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransaction]')) CREATE INDEX [IX_CashTransaction_ActiveBalance] ON [dbo].[CashTransaction] ([CashAccountId], [TransactionType]) INCLUDE ([PaidAmount]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_CashTransactionPayment_ActiveBalance' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransactionPayment]')) CREATE INDEX [IX_CashTransactionPayment_ActiveBalance] ON [dbo].[CashTransactionPayment] ([CashAccountId]) INCLUDE ([CashTransactionId], [Amount]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_CashTransactionPayment_ActiveTransactionDate' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransactionPayment]')) CREATE INDEX [IX_CashTransactionPayment_ActiveTransactionDate] ON [dbo].[CashTransactionPayment] ([CashTransactionId], [PaymentDate]) INCLUDE ([Amount], [CashAccountId], [CreatedAtUtc]) WHERE [IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL INSERT INTO [dbo].[CashTransactionPayment] ([Id], [IsDeleted], [CreatedAtUtc], [CreatedById], [CashTransactionId], [CashAccountId], [PaymentDate], [Amount], [Description]) SELECT CONVERT(nvarchar(50), NEWID()), 0, SYSUTCDATETIME(), COALESCE(ct.[UpdatedById], ct.[CreatedById]), ct.[Id], ct.[CashAccountId], COALESCE(ct.[TransactionDate], SYSUTCDATETIME()), ISNULL(ct.[PaidAmount], 0) - ISNULL(history.[RecordedAmount], 0), N'Khôi phục lịch sử thanh toán' FROM [dbo].[CashTransaction] ct OUTER APPLY (SELECT SUM(p.[Amount]) AS [RecordedAmount] FROM [dbo].[CashTransactionPayment] p WHERE p.[CashTransactionId] = ct.[Id] AND p.[IsDeleted] = 0) history WHERE ct.[IsDeleted] = 0 AND ISNULL(ct.[PaidAmount], 0) - ISNULL(history.[RecordedAmount], 0) > 0.000001;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL UPDATE ct SET ct.[CashAccountId] = firstPayment.[CashAccountId] FROM [dbo].[CashTransaction] ct CROSS APPLY (SELECT TOP (1) pay.[CashAccountId] FROM [dbo].[CashTransactionPayment] pay WHERE pay.[CashTransactionId] = ct.[Id] AND pay.[IsDeleted] = 0 ORDER BY pay.[PaymentDate], pay.[CreatedAtUtc], pay.[Id]) firstPayment WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'PurchaseOrder';",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[PurchaseOrder]', N'U') IS NOT NULL UPDATE ct SET ct.[VendorId] = po.[VendorId] FROM [dbo].[CashTransaction] ct INNER JOIN [dbo].[PurchaseOrder] po ON po.[Id] = ct.[SourceModuleId] WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'PurchaseOrder' AND ct.[VendorId] IS NULL AND po.[VendorId] IS NOT NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL UPDATE ct SET ct.[PaidAmount] = p.[TotalPaid], ct.[Status] = CASE WHEN p.[TotalPaid] >= ISNULL(ct.[Amount], 0) THEN 2 WHEN p.[TotalPaid] > 0 THEN 1 ELSE 0 END FROM [dbo].[CashTransaction] ct CROSS APPLY (SELECT SUM(pay.[Amount]) AS [TotalPaid] FROM [dbo].[CashTransactionPayment] pay WHERE pay.[CashTransactionId] = ct.[Id] AND pay.[IsDeleted] = 0) p WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'PurchaseOrder' AND p.[TotalPaid] IS NOT NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[CashCategory]', N'U') IS NOT NULL UPDATE ct SET ct.[CashCategoryId] = category.[Id] FROM [dbo].[CashTransaction] ct CROSS APPLY (SELECT TOP (1) cc.[Id] FROM [dbo].[CashCategory] cc WHERE cc.[IsDeleted] = 0 AND cc.[Name] = N'Mua hàng' ORDER BY cc.[CreatedAtUtc], cc.[Id]) category WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'PurchaseOrder' AND ct.[CashCategoryId] IS NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[SalesOrder]', N'U') IS NOT NULL BEGIN WITH candidates AS (SELECT ct.[Id] AS [CashTransactionId], so.[Id] AS [SalesOrderId], so.[Number] AS [SalesOrderNumber], so.[AfterTaxAmount], ROW_NUMBER() OVER (PARTITION BY so.[Id] ORDER BY ct.[CreatedAtUtc] DESC, ct.[Id] DESC) AS [RowNumber] FROM [dbo].[CashTransaction] ct INNER JOIN [dbo].[SalesOrder] so ON so.[IsDeleted] = 0 AND ct.[CustomerId] = so.[CustomerId] AND ct.[Description] = N'Thu tiền đơn ' + so.[Number] WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] IS NULL AND ct.[TransactionType] = 0) UPDATE ct SET ct.[SourceModule] = N'SalesOrder', ct.[SourceModuleId] = candidates.[SalesOrderId], ct.[SourceModuleNumber] = candidates.[SalesOrderNumber], ct.[Amount] = candidates.[AfterTaxAmount], ct.[PaidAmount] = CASE WHEN ISNULL(ct.[Amount], 0) > ISNULL(candidates.[AfterTaxAmount], 0) THEN ISNULL(candidates.[AfterTaxAmount], 0) ELSE ISNULL(ct.[Amount], 0) END, ct.[Status] = CASE WHEN ISNULL(ct.[Amount], 0) >= ISNULL(candidates.[AfterTaxAmount], 0) THEN 2 WHEN ISNULL(ct.[Amount], 0) > 0 THEN 1 ELSE 0 END FROM [dbo].[CashTransaction] ct INNER JOIN candidates ON candidates.[CashTransactionId] = ct.[Id] AND candidates.[RowNumber] = 1 WHERE NOT EXISTS (SELECT 1 FROM [dbo].[CashTransaction] linked WHERE linked.[IsDeleted] = 0 AND linked.[SourceModule] = N'SalesOrder' AND linked.[SourceModuleId] = candidates.[SalesOrderId] AND linked.[TransactionType] = 0); UPDATE duplicate SET duplicate.[IsDeleted] = 1 FROM [dbo].[CashTransaction] duplicate INNER JOIN [dbo].[SalesOrder] so ON so.[IsDeleted] = 0 AND duplicate.[CustomerId] = so.[CustomerId] AND duplicate.[Description] = N'Thu tiền đơn ' + so.[Number] WHERE duplicate.[IsDeleted] = 0 AND duplicate.[SourceModule] IS NULL AND duplicate.[TransactionType] = 0 AND EXISTS (SELECT 1 FROM [dbo].[CashTransaction] linked WHERE linked.[IsDeleted] = 0 AND linked.[SourceModule] = N'SalesOrder' AND linked.[SourceModuleId] = so.[Id] AND linked.[TransactionType] = 0); END;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[CashCategory]', N'U') IS NOT NULL UPDATE ct SET ct.[CashCategoryId] = category.[Id] FROM [dbo].[CashTransaction] ct CROSS APPLY (SELECT TOP (1) cc.[Id] FROM [dbo].[CashCategory] cc WHERE cc.[IsDeleted] = 0 AND cc.[Name] = N'Bán hàng' ORDER BY cc.[CreatedAtUtc], cc.[Id]) category WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'SalesOrder' AND ct.[CashCategoryId] IS NULL;",
            "IF OBJECT_ID(N'[dbo].[CashAccount]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL UPDATE ca SET ca.[CurrentBalance] = ISNULL(ca.[InitialBalance], 0) + ISNULL(direct.[Balance], 0) + ISNULL(payments.[Balance], 0) FROM [dbo].[CashAccount] ca OUTER APPLY (SELECT SUM(CASE WHEN ct.[TransactionType] = 0 THEN ISNULL(ct.[PaidAmount], 0) ELSE -ISNULL(ct.[PaidAmount], 0) END) AS [Balance] FROM [dbo].[CashTransaction] ct WHERE ct.[IsDeleted] = 0 AND ct.[CashAccountId] = ca.[Id] AND NOT EXISTS (SELECT 1 FROM [dbo].[CashTransactionPayment] directPay WHERE directPay.[CashTransactionId] = ct.[Id] AND directPay.[IsDeleted] = 0)) direct OUTER APPLY (SELECT SUM(CASE WHEN parent.[TransactionType] = 0 THEN pay.[Amount] ELSE -pay.[Amount] END) AS [Balance] FROM [dbo].[CashTransactionPayment] pay INNER JOIN [dbo].[CashTransaction] parent ON parent.[Id] = pay.[CashTransactionId] WHERE pay.[IsDeleted] = 0 AND parent.[IsDeleted] = 0 AND pay.[CashAccountId] = ca.[Id]) payments WHERE ca.[IsDeleted] = 0;",
            "IF OBJECT_ID(N'[dbo].[InventoryTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[MaterialExport]', N'U') IS NOT NULL UPDATE it SET it.[Status] = 0, it.[WarehouseId] = me.[WarehouseId], it.[WarehouseFromId] = me.[WarehouseId], it.[WarehouseToId] = NULL, it.[TransType] = -1, it.[Stock] = -ABS(ISNULL(it.[Movement], 0)) FROM [dbo].[InventoryTransaction] it INNER JOIN [dbo].[MaterialExport] me ON me.[Id] = it.[ModuleId] WHERE it.[IsDeleted] = 0 AND me.[IsDeleted] = 0 AND it.[ModuleName] = N'MaterialExport' AND me.[Status] = 0;",
            "IF OBJECT_ID(N'[dbo].[CashCategory]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM [dbo].[CashCategory] WHERE [IsDeleted] = 0 AND [Name] = N'Phân bổ công trình') INSERT INTO [dbo].[CashCategory] ([Id], [IsDeleted], [CreatedAtUtc], [Name], [Description]) VALUES (CONVERT(nvarchar(50), NEWID()), 0, SYSUTCDATETIME(), N'Phân bổ công trình', N'Chi phí vật tư phân bổ cho công trình');",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL UPDATE [dbo].[CashTransaction] SET [IsDeleted] = 1, [UpdatedAtUtc] = SYSUTCDATETIME() WHERE [IsDeleted] = 0 AND [SourceModule] = N'MaterialExport' AND [TransactionType] = 0 AND [CashAccountId] IS NULL AND [CustomerId] IS NULL AND [Description] LIKE N'Warehouse offset - Material export %';",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[MaterialExport]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[Customer]', N'U') IS NOT NULL AND OBJECT_ID(N'[dbo].[CashCategory]', N'U') IS NOT NULL UPDATE ct SET ct.[Description] = N'Phân bổ công trình cho ' + customer.[Name], ct.[CashCategoryId] = COALESCE(ct.[CashCategoryId], category.[Id]) FROM [dbo].[CashTransaction] ct INNER JOIN [dbo].[MaterialExport] me ON me.[Id] = ct.[SourceModuleId] AND me.[IsDeleted] = 0 INNER JOIN [dbo].[Customer] customer ON customer.[Id] = me.[CustomerId] AND customer.[IsDeleted] = 0 CROSS APPLY (SELECT TOP (1) cc.[Id] FROM [dbo].[CashCategory] cc WHERE cc.[IsDeleted] = 0 AND cc.[Name] = N'Phân bổ công trình' ORDER BY cc.[CreatedAtUtc], cc.[Id]) category WHERE ct.[IsDeleted] = 0 AND ct.[SourceModule] = N'MaterialExport' AND ct.[TransactionType] = 1 AND ct.[Description] LIKE N'Customer material cost - %';",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UX_CashTransaction_MaterialExportOffset' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransaction]')) AND NOT EXISTS (SELECT 1 FROM [dbo].[CashTransaction] WHERE [IsDeleted] = 0 AND [SourceModule] = N'MaterialExport' AND [SourceDetailId] IS NOT NULL GROUP BY [SourceModule], [SourceModuleId], [SourceDetailId], [TransactionType] HAVING COUNT(*) > 1) CREATE UNIQUE INDEX [UX_CashTransaction_MaterialExportOffset] ON [dbo].[CashTransaction] ([SourceModule], [SourceModuleId], [SourceDetailId], [TransactionType]) WHERE [IsDeleted] = 0 AND [SourceModule] = N'MaterialExport' AND [SourceDetailId] IS NOT NULL;",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UX_CashTransaction_PurchaseOrderObligation' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransaction]')) AND NOT EXISTS (SELECT 1 FROM [dbo].[CashTransaction] WHERE [IsDeleted] = 0 AND [SourceModule] = N'PurchaseOrder' GROUP BY [SourceModule], [SourceModuleId], [TransactionType] HAVING COUNT(*) > 1) CREATE UNIQUE INDEX [UX_CashTransaction_PurchaseOrderObligation] ON [dbo].[CashTransaction] ([SourceModule], [SourceModuleId], [TransactionType]) WHERE [IsDeleted] = 0 AND [SourceModule] = N'PurchaseOrder';",
            "IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'UX_CashTransaction_SalesOrderPayment' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransaction]')) AND NOT EXISTS (SELECT 1 FROM [dbo].[CashTransaction] WHERE [IsDeleted] = 0 AND [SourceModule] = N'SalesOrder' GROUP BY [SourceModule], [SourceModuleId], [TransactionType] HAVING COUNT(*) > 1) CREATE UNIQUE INDEX [UX_CashTransaction_SalesOrderPayment] ON [dbo].[CashTransaction] ([SourceModule], [SourceModuleId], [TransactionType]) WHERE [IsDeleted] = 0 AND [SourceModule] = N'SalesOrder';"
        };

        foreach (var command in commands)
        {
            dataContext.Database.ExecuteSqlRaw(command);
        }
    }

    private static void EnsureDecimalColumns(DataContext dataContext)
    {
        dataContext.Database.ExecuteSqlRaw(
            "IF OBJECT_ID(N'[dbo].[InventoryTransaction]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.[object_id] = OBJECT_ID(N'[dbo].[InventoryTransaction]') AND c.[name] = N'Stock' AND (TYPE_NAME(c.[user_type_id]) <> N'decimal' OR c.[precision] <> 19 OR c.[scale] <> 6)) AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_InventoryTransaction_StockLookup' AND [object_id] = OBJECT_ID(N'[dbo].[InventoryTransaction]')) DROP INDEX [IX_InventoryTransaction_StockLookup] ON [dbo].[InventoryTransaction]; IF OBJECT_ID(N'[dbo].[CashTransaction]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.[object_id] = OBJECT_ID(N'[dbo].[CashTransaction]') AND c.[name] = N'PaidAmount' AND (TYPE_NAME(c.[user_type_id]) <> N'decimal' OR c.[precision] <> 19 OR c.[scale] <> 6)) AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_CashTransaction_ActiveBalance' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransaction]')) DROP INDEX [IX_CashTransaction_ActiveBalance] ON [dbo].[CashTransaction]; IF OBJECT_ID(N'[dbo].[CashTransactionPayment]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.[object_id] = OBJECT_ID(N'[dbo].[CashTransactionPayment]') AND c.[name] = N'Amount' AND (TYPE_NAME(c.[user_type_id]) <> N'decimal' OR c.[precision] <> 19 OR c.[scale] <> 6)) AND EXISTS (SELECT 1 FROM sys.indexes WHERE [name] = N'IX_CashTransactionPayment_ActiveBalance' AND [object_id] = OBJECT_ID(N'[dbo].[CashTransactionPayment]')) DROP INDEX [IX_CashTransactionPayment_ActiveBalance] ON [dbo].[CashTransactionPayment];");

        foreach (var entityType in dataContext.Model.GetEntityTypes())
        {
            var tableName = entityType.GetTableName();
            if (tableName == null) continue;
            var schema = entityType.GetSchema() ?? "dbo";
            var table = StoreObjectIdentifier.Table(tableName, schema);

            foreach (var property in entityType.GetProperties()
                .Where(property => Nullable.GetUnderlyingType(property.ClrType) == typeof(decimal)
                    || property.ClrType == typeof(decimal)))
            {
                var columnName = property.GetColumnName(table);
                if (columnName == null) continue;
                var nullability = property.IsNullable ? "NULL" : "NOT NULL";
#pragma warning disable EF1002 // Identifiers come only from the trusted EF model, never from request input.
                dataContext.Database.ExecuteSqlRaw(
                    $"IF OBJECT_ID(N'[{schema}].[{tableName}]', N'U') IS NOT NULL AND EXISTS (SELECT 1 FROM sys.columns c WHERE c.[object_id] = OBJECT_ID(N'[{schema}].[{tableName}]') AND c.[name] = N'{columnName}' AND (TYPE_NAME(c.[user_type_id]) <> N'decimal' OR c.[precision] <> 19 OR c.[scale] <> 6)) ALTER TABLE [{schema}].[{tableName}] ALTER COLUMN [{columnName}] decimal(19,6) {nullability};");
#pragma warning restore EF1002
            }
        }
    }
}


