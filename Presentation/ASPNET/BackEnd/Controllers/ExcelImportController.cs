using System.Text.Json;
using Application.Common.Repositories;
using Application.Features.CashAccountManager.Commands;
using Application.Features.CashCategoryManager.Commands;
using Application.Features.CashTransactionManager.Commands;
using Application.Features.CustomerCategoryManager.Commands;
using Application.Features.CustomerContactManager.Commands;
using Application.Features.CustomerGroupManager.Commands;
using Application.Features.CustomerManager.Commands;
using Application.Features.InventoryTransactionManager.Commands;
using Application.Features.MaterialExportManager.Commands;
using Application.Features.ProductGroupManager.Commands;
using Application.Features.ProductManager.Commands;
using Application.Features.PurchaseOrderItemManager.Commands;
using Application.Features.PurchaseOrderManager.Commands;
using Application.Features.PurchaseReturnManager.Commands;
using Application.Features.SalesOrderItemManager.Commands;
using Application.Features.SalesOrderManager.Commands;
using Application.Features.SalesReturnManager.Commands;
using Application.Features.ScrappingManager.Commands;
using Application.Features.StockCountManager.Commands;
using Application.Features.TaxManager.Commands;
using Application.Features.TodoItemManager.Commands;
using Application.Features.TodoManager.Commands;
using Application.Features.TransferInManager.Commands;
using Application.Features.TransferOutManager.Commands;
using Application.Features.VendorCategoryManager.Commands;
using Application.Features.VendorContactManager.Commands;
using Application.Features.VendorGroupManager.Commands;
using Application.Features.VendorManager.Commands;
using Application.Features.WarehouseManager.Commands;
using ASPNET.BackEnd.Common.Base;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ASPNET.BackEnd.Controllers;

/// <summary>
/// Atomic workbook import endpoint.  The client resolves human-friendly lookup
/// values, while the normal application commands remain the authoritative source
/// for validation and business behaviour.
/// </summary>
[Route("api/ExcelImport")]
public sealed class ExcelImportController : BaseApiController
{
    private sealed record ModuleDefinition(Type HeaderType, Type? ItemType = null, string? ParentIdProperty = null);

    private static readonly JsonSerializerOptions SerializerOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly IReadOnlyDictionary<string, ModuleDefinition> Modules =
        new Dictionary<string, ModuleDefinition>(StringComparer.OrdinalIgnoreCase)
        {
            ["productgroups"] = new(typeof(CreateProductGroupRequest)),
            ["vendorgroups"] = new(typeof(CreateVendorGroupRequest)),
            ["vendorcategories"] = new(typeof(CreateVendorCategoryRequest)),
            ["customergroups"] = new(typeof(CreateCustomerGroupRequest)),
            ["customercategories"] = new(typeof(CreateCustomerCategoryRequest)),
            ["warehouses"] = new(typeof(CreateWarehouseRequest)),
            ["todos"] = new(typeof(CreateTodoRequest)),
            ["todoitems"] = new(typeof(CreateTodoItemRequest)),
            ["taxs"] = new(typeof(CreateTaxRequest)),
            ["products"] = new(typeof(CreateProductRequest)),
            ["vendors"] = new(typeof(CreateVendorRequest)),
            ["customers"] = new(typeof(CreateCustomerRequest)),
            ["customercontacts"] = new(typeof(CreateCustomerContactRequest)),
            ["vendorcontacts"] = new(typeof(CreateVendorContactRequest)),
            ["cashaccounts"] = new(typeof(CreateCashAccountRequest)),
            ["cashcategories"] = new(typeof(CreateCashCategoryRequest)),
            ["cashtransactions"] = new(typeof(CreateCashTransactionRequest)),
            ["salesorders"] = new(typeof(CreateSalesOrderRequest), typeof(CreateSalesOrderItemRequest), "SalesOrderId"),
            ["purchaseorders"] = new(typeof(CreatePurchaseOrderRequest), typeof(CreatePurchaseOrderItemRequest), "PurchaseOrderId"),
            ["purchasereturns"] = new(typeof(CreatePurchaseReturnRequest), typeof(PurchaseReturnCreateInvenTransRequest), "ModuleId"),
            ["salesreturns"] = new(typeof(CreateSalesReturnRequest), typeof(SalesReturnCreateInvenTransRequest), "ModuleId"),
            ["transferouts"] = new(typeof(CreateTransferOutRequest), typeof(TransferOutCreateInvenTransRequest), "ModuleId"),
            ["transferins"] = new(typeof(CreateTransferInRequest), typeof(TransferInCreateInvenTransRequest), "ModuleId"),
            ["scrappings"] = new(typeof(CreateScrappingRequest), typeof(ScrappingCreateInvenTransRequest), "ModuleId"),
            ["stockcounts"] = new(typeof(CreateStockCountRequest), typeof(StockCountCreateInvenTransRequest), "ModuleId"),
            ["materialexports"] = new(typeof(CreateMaterialExportRequest), typeof(MaterialExportCreateInvenTransRequest), "ModuleId")
        };

    private readonly IUnitOfWork _unitOfWork;

    public ExcelImportController(ISender sender, IUnitOfWork unitOfWork) : base(sender)
    {
        _unitOfWork = unitOfWork;
    }

    [Authorize]
    [HttpPost("/api/{module}/ImportExcel")]
    public async Task<IActionResult> ImportExcelAsync(
        string module,
        [FromBody] ExcelImportRequest request,
        CancellationToken cancellationToken)
    {
        if (!Modules.TryGetValue(NormalizeModule(module), out var definition))
        {
            return NotFound(new { errors = new[] { ImportError.General("UnsupportedModule", $"Import is not supported for '{module}'.") } });
        }

        var importRows = request.Documents.Count > 0 ? request.Documents : request.Rows;
        var sourceSheet = request.Documents.Count > 0 ? "Documents" : "Data";

        if (importRows.Count == 0)
        {
            return BadRequest(new { errors = new[] { ImportError.General("EmptyWorkbook", "The workbook does not contain any import rows.") } });
        }

        var importedIds = new List<string>();
        var activeRow = 0;
        var activeSheet = sourceSheet;

        try
        {
            await _unitOfWork.ExecuteInTransactionAsync(async ct =>
            {
                for (var index = 0; index < importRows.Count; index++)
                {
                    activeSheet = sourceSheet;
                    activeRow = index + 2;
                    var row = importRows[index];
                    var header = row.Deserialize(definition.HeaderType, SerializerOptions)
                        ?? throw new InvalidOperationException("The import row could not be read.");

                    ForceDraftStatus(header);
                    SetOptionalBoolean(header, "SkipDefaultItems", definition.ItemType != null);
                    var result = await _sender.Send(header, ct);
                    var parentId = GetResultId(result)
                        ?? throw new InvalidOperationException("The created record did not return an id.");
                    importedIds.Add(parentId);

                    if (definition.ItemType == null || !row.TryGetProperty("items", out var itemsElement)) continue;
                    if (itemsElement.ValueKind != JsonValueKind.Array) continue;

                    var itemElements = itemsElement.EnumerateArray().ToArray();
                    for (var itemIndex = 0; itemIndex < itemElements.Length; itemIndex++)
                    {
                        activeSheet = "Items";
                        activeRow = itemIndex + 2;
                        var itemElement = itemElements[itemIndex];
                        var itemRequest = itemElement.Deserialize(definition.ItemType, SerializerOptions)
                            ?? throw new InvalidOperationException("An item row could not be read.");
                        SetProperty(itemRequest, definition.ParentIdProperty!, parentId);
                        await _sender.Send(itemRequest, ct);
                    }
                }
            }, cancellationToken);
        }
        catch (Exception exception)
        {
            return BadRequest(new
            {
                errors = new[]
                {
                    new ImportError(activeSheet, activeRow, null, "ImportFailed", exception.Message)
                }
            });
        }

        return Ok(new
        {
            code = StatusCodes.Status200OK,
            content = new { importedCount = importedIds.Count, documentIds = importedIds }
        });
    }

    private static string NormalizeModule(string module) =>
        new(module.Where(char.IsLetterOrDigit).Select(char.ToLowerInvariant).ToArray());

    private static string? GetResultId(object? result)
    {
        var data = result?.GetType().GetProperty("Data")?.GetValue(result);
        return data?.GetType().GetProperty("Id")?.GetValue(data)?.ToString();
    }

    private static void SetProperty(object target, string propertyName, object? value)
    {
        var property = target.GetType().GetProperty(propertyName)
            ?? throw new InvalidOperationException($"Import property '{propertyName}' was not found.");
        property.SetValue(target, value);
    }

    private static void SetOptionalBoolean(object target, string propertyName, bool value)
    {
        var property = target.GetType().GetProperty(propertyName);
        if (property?.PropertyType == typeof(bool)) property.SetValue(target, value);
    }

    private static void ForceDraftStatus(object request)
    {
        var status = request.GetType().GetProperty("Status");
        if (status?.PropertyType == typeof(string)) status.SetValue(request, "0");

        var orderStatus = request.GetType().GetProperty("OrderStatus");
        if (orderStatus?.PropertyType == typeof(string)) orderStatus.SetValue(request, "0");
    }
}

public sealed class ExcelImportRequest
{
    public List<JsonElement> Rows { get; init; } = [];
    public List<JsonElement> Documents { get; init; } = [];
}

public sealed record ImportError(string Sheet, int? Row, string? Column, string Code, string Message)
{
    public static ImportError General(string code, string message) => new("Documents", null, null, code, message);
}
