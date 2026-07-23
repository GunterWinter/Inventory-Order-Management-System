# Project Rules & Customizations

## Controller Payload Binding & Validation
- Every API Controller POST/PUT endpoint accepting a request DTO parameter MUST include:
  - Explicit `[FromBody]` attribute on the DTO parameter.
  - Guard check inspecting `ModelState` for deserialization errors when `request == null`:
    ```csharp
    if (request == null)
    {
        var errors = ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage).Where(msg => !string.IsNullOrWhiteSpace(msg)).ToList();
        return BadRequest(errors.Any() ? string.Join("; ", errors) : "Request body cannot be null.");
    }
    ```

## System.Text.Json Enum Serialization & Deserialization
- In ASP.NET Core Web APIs accepting DTOs with `enum` / `enum?` properties:
  - Register `FlexibleEnumConverterFactory` in `AddJsonOptions` so System.Text.Json seamlessly converts numbers (`2`), numeric strings (`"2"`), and string names (`"Internal"`) without model binding failures.

## Syncfusion EJ2 Grid Inline Edit & Validation Safety
- **Required Fields in ActionBegin**:
  - In `secondaryGrid` event `actionBegin` for `args.requestType === 'save'`, explicitly validate required item fields (e.g. `productId`, `warehouseId`, `taxId`, `quantity`).
  - If a required field is missing, set `args.cancel = true` and show a clear `Swal.fire` warning in Vietnamese (e.g. `"Vui lòng chọn Thuế trước khi lưu."`).
- **Main Form Submission Guard (`handleFormSubmit`)**:
  - In `handleFormSubmit`, check if `secondaryGrid.obj && secondaryGrid.obj.isEdit`.
  - Call `secondaryGrid.obj.endEdit()` and wait 150ms. If `secondaryGrid.obj.isEdit` is still `true`, cancel main form submission and alert the user with `Swal.fire` so un-saved item rows are never discarded.
- **UI Localization Invariants**:
  - Ensure all default Syncfusion validation strings (e.g. `"This field is required."`) are mapped in `ui-localization.js` (`'Trường này là bắt buộc.'`) to maintain 100% consistent Vietnamese UI text.

## Syncfusion Grid Column `edit.write` Function Scope
- Inside `edit: { write: function(args) { ... } }` blocks, ALWAYS use `args.rowData` to access the current row's data. NEVER use a bare `rowData` variable — it does not exist in the `write` function's scope. The parameter `args` is the only way to access `rowData`, `element`, etc.
- When performing bulk find-and-replace in grid JS files, ALWAYS verify that `args.rowData` references are intact and not accidentally truncated to `rowData`.

## Database Schema & Data Type Invariants
- In EF Core with Microsoft SQL Server, always match C# primitive types with SQL Server column data types in raw SQL `ALTER TABLE` scripts:
  - C# `double` / `double?` properties MUST map to SQL Server **`float`**.
  - C# `decimal` / `decimal?` properties MUST map to SQL Server **`decimal(18,2)`**.
  - C# `int` / `int?` properties MUST map to SQL Server **`int`**.

## Mandatory End-to-End Runtime Testing
- After modifying database models, backend logic, or frontend JS, launch the application locally and execute runtime integration tests against the live endpoints to verify clean execution (HTTP 200 OK) before completing the turn.
- After modifying frontend JS files (especially grid column configurations), open the affected page in the browser and verify that inline Add/Edit works without console errors before declaring done.

## Product Serial Picker Invariants
- **Grid Configuration Closure Safety**: When configuring ProductSerialPicker.createGridColumn({ ... }) inside a Syncfusion grid column array, you MUST use the provided owData parameter inside the arrow functions. Do NOT reference rgs.rowData which is undefined during configuration. (e.g. use warehouseIdGetter: (rowData) => rowData.warehouseId).
- **Transfer In**: Ensure equireWarehouse: false is passed if the warehouse is not predetermined before serial selection.

## Returns Reference Invariants
- SalesReturn domain entity, DTOs, APIs, and UI must exclusively reference SalesOrder / SalesOrderId. Do NOT reference DeliveryOrder.
- PurchaseReturn domain entity, DTOs, APIs, and UI must exclusively reference PurchaseOrder / PurchaseOrderId. Do NOT reference GoodsReceive.
