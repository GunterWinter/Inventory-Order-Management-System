using Microsoft.AspNetCore.HttpOverrides; 
using Microsoft.Extensions.FileProviders;
using ASPNET.BackEnd;
using ASPNET.BackEnd.Common.Middlewares;
using ASPNET.FrontEnd;

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

app.UseForwardedHeaders();

app.RegisterBackEndBuilder(app.Environment, app, builder.Configuration);

// Serve wwwroot through the regular static-file middleware. The generated
// ASP.NET 9 static-asset manifest can contain an unusable gzip variant when the
// application is started from bin/Debug, which otherwise returns an empty body.
app.UseStaticFiles();

var frontEndAssetsPath = Path.Combine(app.Environment.ContentRootPath, "FrontEnd");
if (Directory.Exists(frontEndAssetsPath))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(frontEndAssetsPath),
        RequestPath = "/FrontEnd"
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
