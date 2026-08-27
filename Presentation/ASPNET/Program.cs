using Microsoft.AspNetCore.HttpOverrides; 
using Microsoft.Extensions.FileProviders;
using Application.Features.InventoryTransactionManager;
using ASPNET.BackEnd;
using ASPNET.BackEnd.Common.Middlewares;
using ASPNET.FrontEnd;
using Infrastructure.DataAccessManager.EFCore.Contexts;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);

//>>> Create Logs folder for Serilog
var logPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "app_data", "logs");
if (!Directory.Exists(logPath))
{
    Directory.CreateDirectory(logPath);
}

builder.Services.AddBackEndServices(builder.Configuration, builder.Environment);
builder.Services.AddFrontEndServices();

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

var inventoryCostBackfillMode = builder.Configuration["InventoryCostBackfill:Mode"];
if (!string.IsNullOrWhiteSpace(inventoryCostBackfillMode))
{
    if (inventoryCostBackfillMode is not ("dry-run" or "apply"))
        throw new InvalidOperationException("InventoryCostBackfill:Mode must be 'dry-run' or 'apply'.");

    await using var scope = app.Services.CreateAsyncScope();
    var dataContext = scope.ServiceProvider.GetRequiredService<DataContext>();
    var databaseName = dataContext.Database.GetDbConnection().Database;
    if (inventoryCostBackfillMode == "apply"
        && builder.Configuration["InventoryCostBackfill:ConfirmDatabase"] != databaseName)
    {
        throw new InvalidOperationException(
            $"Refusing inventory cost backfill for '{databaseName}'. Set InventoryCostBackfill:ConfirmDatabase to the exact database name.");
    }

    var result = await scope.ServiceProvider.GetRequiredService<InventoryCostBackfillService>()
        .RunAsync(inventoryCostBackfillMode == "apply");
    Console.WriteLine(JsonSerializer.Serialize(result, new JsonSerializerOptions { WriteIndented = true }));
    return;
}

app.UseForwardedHeaders();

app.RegisterBackEndBuilder(app.Environment, app, builder.Configuration);

// Serve wwwroot through the regular static-file middleware. The generated
// ASP.NET 9 static-asset manifest can contain an unusable gzip variant when the
// application is started from bin/Debug, which otherwise returns an empty body.
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = context =>
    {
        if (!context.Context.Request.Path.StartsWithSegments("/FrontEnd")) return;
        context.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        context.Context.Response.Headers.Pragma = "no-cache";
        context.Context.Response.Headers.Expires = "0";
    }
});

var frontEndAssetsPath = Path.Combine(app.Environment.ContentRootPath, "FrontEnd");
if (Directory.Exists(frontEndAssetsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontEndAssetsPath),
        RequestPath = "/FrontEnd",
        OnPrepareResponse = context =>
        {
            context.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
            context.Context.Response.Headers.Pragma = "no-cache";
            context.Context.Response.Headers.Expires = "0";
        }
    });
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}

app.UseRouting();
app.UseCors();
app.UseMiddleware<GlobalApiExceptionHandlerMiddleware>();

app.UseAuthentication();
app.UseAuthorization();

app.MapFrontEndRoutes();
app.MapBackEndRoutes();

app.Run();
