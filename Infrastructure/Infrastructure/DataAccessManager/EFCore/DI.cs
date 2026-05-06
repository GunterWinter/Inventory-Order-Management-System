using Application.Common.CQS.Commands;
using Application.Common.CQS.Queries;
using Application.Common.Repositories;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Infrastructure.DataAccessManager.EFCore.Repositories;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Serilog;

namespace Infrastructure.DataAccessManager.EFCore;



public static class DI
{
    public static IServiceCollection RegisterDataAccess(this IServiceCollection services, IConfiguration configuration)
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
                services.AddDbContext<DataContext>(options =>
                    options.UseSqlServer(connectionString)
                    .LogTo(Log.Information, LogLevel.Information)
                    .EnableSensitiveDataLogging()
                );
                services.AddDbContext<CommandContext>(options =>
                    options.UseSqlServer(connectionString)
                    .LogTo(Log.Information, LogLevel.Information)
                    .EnableSensitiveDataLogging()
                );
                services.AddDbContext<QueryContext>(options =>
                    options.UseSqlServer(connectionString)
                    .LogTo(Log.Information, LogLevel.Information)
                    .EnableSensitiveDataLogging()
                );
                break;
        }


        services.AddScoped<ICommandContext, CommandContext>();
        services.AddScoped<IQueryContext, QueryContext>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped(typeof(ICommandRepository<>), typeof(CommandRepository<>));


        return services;
    }

    public static IHost CreateDatabase(this IHost host)
    {
        using var scope = host.Services.CreateScope();
        var serviceProvider = scope.ServiceProvider;

        // Create database using DataContext
        var dataContext = serviceProvider.GetRequiredService<DataContext>();
        dataContext.Database.EnsureCreated(); // Ensure database is created (development only)
        EnsureCompatibilityColumns(dataContext);

        return host;
    }

    private static void EnsureCompatibilityColumns(DataContext dataContext)
    {
        if (dataContext.Database.ProviderName?.Contains("SqlServer") != true)
        {
            return;
        }

        var commands = new[]
        {
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'DefaultWarehouseId') IS NULL ALTER TABLE [dbo].[Product] ADD [DefaultWarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[Product]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.Product', N'DefaultWarrantyMonths') IS NULL ALTER TABLE [dbo].[Product] ADD [DefaultWarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseOrderItem', N'WarehouseId') IS NULL ALTER TABLE [dbo].[PurchaseOrderItem] ADD [WarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseOrderItem', N'BatchNumber') IS NULL ALTER TABLE [dbo].[PurchaseOrderItem] ADD [BatchNumber] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[PurchaseOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.PurchaseOrderItem', N'SupplierWarrantyMonths') IS NULL ALTER TABLE [dbo].[PurchaseOrderItem] ADD [SupplierWarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrderItem', N'WarrantyMonths') IS NULL ALTER TABLE [dbo].[SalesOrderItem] ADD [WarrantyMonths] int NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrderItem', N'WarehouseId') IS NULL ALTER TABLE [dbo].[SalesOrderItem] ADD [WarehouseId] nvarchar(50) NULL;",
            "IF OBJECT_ID(N'[dbo].[SalesOrderItem]', N'U') IS NOT NULL AND COL_LENGTH(N'dbo.SalesOrderItem', N'BatchNumber') IS NULL ALTER TABLE [dbo].[SalesOrderItem] ADD [BatchNumber] nvarchar(50) NULL;"
        };

        foreach (var command in commands)
        {
            dataContext.Database.ExecuteSqlRaw(command);
        }
    }
}


