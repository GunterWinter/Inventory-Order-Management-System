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

## Product Dropdown & Grid Name Invariants
- Khi hiển thị danh sách sản phẩm (Products) trên Dropdown List hoặc Grid (Syncfusion), **LUÔN LUÔN** hiển thị duy nhất thuộc tính `name` (tên sản phẩm), tuyệt đối không tự ý ghép mã (number) vào tên (không dùng chuỗi như `number - name`).
- Thuộc tính `value` của Dropdown phải là `id`, và `text` là `name`.
- Bất cứ khi nào cấu hình thuộc tính `valueAccessor` cho các cột `Product`, chỉ trả về `product.name`.

## Syncfusion Grid Inline Edit Reference Code
- Trong Syncfusion Grid, nếu một trường là read-only (ví dụ `Ref Code`) nhưng cần tự động cập nhật khi người dùng chọn `Product` ở cùng một hàng:
  - Do cơ chế `edit` của Syncfusion tạo ra các thẻ `<input>` bao phủ bên trên `<td>`, KHÔNG ĐƯỢC DÙNG `.innerText` trên `args.element.closest('tr').querySelector('[e-mappinguid]')`.
  - **Bắt buộc** truy vấn phần tử input ẩn hoặc bị disable bằng: `args.element.closest('tr').querySelector('input[name="tên_trường"]')` và cập nhật `.value`. Ví dụ: `refCell.value = args.rowData.productReferenceCode;`

## Background Task Management (Cleanup)
- When starting long-running background tasks (such as `dotnet run`, `npm start`, or any dev server/daemon) using the `run_command` tool to test API endpoints or functionality:
  - You **MUST ALWAYS** explicitly kill the task using the `manage_task` tool (with `Action: "kill"`) immediately after you finish testing or before concluding your final response to the user.
  - Never leave background servers running and locking files, unless the user explicitly requested you to "leave the server running".

## Product Lookup Data & Serial Picker Invariants

### Data Source Migration Safety
- Khi thay đổi nguồn dữ liệu (data source) của `state.productListLookupData` hoặc bất kỳ lookup data nào, **BẮT BUỘC** kiểm tra **tất cả consumer** của dữ liệu đó trong cùng file JS:
  - `valueAccessor` functions trong grid columns
  - `fields: { value, text }` trong dropdown configs
  - `ProductSerialPicker.createGridColumn()` — cần `serialTrackingMode` để `isSerialTrackedProduct()` hoạt động
  - Bất kỳ function nào dùng `.find()` trên lookup data
- Khi map dữ liệu sản phẩm từ API khác (ví dụ từ `SalesOrderItem`, `PurchaseOrderItem`), **LUÔN LUÔN** bao gồm đủ các thuộc tính: `id`, `name`, `referenceCode`, `physical: true`, `serialTrackingMode: 1`.

### ProductSerialPicker Module Filtering
- Trong các form Return (SalesReturn, PurchaseReturn), khi cấu hình `ProductSerialPicker.createGridColumn()`, **BẮT BUỘC** truyền `moduleIdGetter` để backend `GetProductSerialPickerList` có thể lọc serial theo đơn hàng gốc:
  - SalesReturn: `moduleIdGetter: () => state.salesOrderId`
  - PurchaseReturn: `moduleIdGetter: () => state.purchaseOrderId`
- Nếu thiếu `moduleIdGetter`, backend sẽ trả về **tất cả** serial có trạng thái phù hợp thay vì chỉ serial thuộc đơn hàng cụ thể.

## Multi-Step Workflow Change Safety
- Khi thay đổi hoặc chặn một bước trong multi-step workflow (ví dụ: `SynchronizeGoodsReceiveAsync`), **BẮT BUỘC** trace và kiểm tra **TẤT CẢ** các bước phụ thuộc downstream trong cùng flow:
  - Nếu bước A tạo dữ liệu (ví dụ: serial devices) và bước B sử dụng dữ liệu đó (ví dụ: `ApplyInventoryTransactionSerialsAsync`), thì khi chặn bước A, **PHẢI** đồng thời chặn/skip bước B.
  - Cụ thể với `PropagateParentUpdate`: nếu status là `Draft`, phải skip `ApplyInventoryTransactionSerialsAsync` vì chưa có serial nào được tạo.

## Syncfusion NumericTextBox Format Invariants
- Mọi `new ej.inputs.NumericTextBox({...})` cho các trường quantity, movement, hoặc số nguyên **BẮT BUỘC** phải có:
  ```javascript
  format: 'n0',
  decimals: 0,
  validateDecimalOnType: true,
  ```
- **Lý do**: Nếu thiếu `format`, NumericTextBox mặc định dùng `'n2'` (2 chữ số thập phân). Kết hợp với `number-format-manager.js` (`MAX_FRACTION_DIGITS = 0`), giá trị `50,00` (vi-VN locale) sẽ bị parse thành `5000`.
- Chỉ các trường tiền tệ (price, amount, total...) mới được dùng format mặc định vì `normalizeMoneyNumericTextBox` đã xử lý riêng.
