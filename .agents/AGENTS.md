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
- **Grid Configuration Closure Safety**: When configuring ProductSerialPicker.createGridColumn({ ... }) inside a Syncfusion grid column array, you MUST use the provided `rowData` parameter inside the arrow functions. Do NOT reference `args.rowData` which is undefined during configuration. (e.g. use `warehouseIdGetter: (rowData) => rowData.warehouseId`).
- **Transfer In**: Ensure `requireWarehouse: false` is passed if the warehouse is not predetermined before serial selection.

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

## Auto-Copy Workflow Serial ID Resolution
- Khi một module **auto-copy items** từ module khác (ví dụ: `CreateTransferIn` copy items từ `TransferOut`), nếu sản phẩm là serial-tracked:
  - **BẮT BUỘC** query `ProductSerialMovement` records từ source module's inventory transaction (`InventoryTransactionId == sourceItem.Id`)
  - Truyền danh sách `productSerialId` đã resolve cho target module's `CreateInvenTrans` method
  - Nếu không có serial movements (non-serial product), truyền `null` để skip serial processing
- **Lý do**: `ApplyInventoryTransactionSerialsAsync` với `productSerialIds = null` sẽ fallback vào `ResolveSerialIdsForTransactionAsync`, nhưng transaction mới chưa có movements → exception.

## Serial Tracking System Invariants

### SerialTrackingMode Enum
- `SerialTrackingMode` có đúng 3 giá trị: `None = 0`, `InternalAuto = 1`, `ManufacturerSerial = 2`.
- **KHÔNG TỒN TẠI** giá trị `Serial`. Để kiểm tra sản phẩm có theo dõi serial hay không, dùng: `product.SerialTrackingMode != SerialTrackingMode.None`.

### Serial Reservation Flow (SO → DO Pipeline)
- Khi tạo `SalesOrderItem` bằng code (quick export, auto-copy), nếu sản phẩm là serial-tracked, **BẮT BUỘC** phải reserve serial cho SO item **TRƯỚC KHI** gọi `SynchronizeDeliveryOrderAsync`:
  1. Tạo `SalesOrderItem`
  2. Query `ProductSerial` có `Status == InStock`, `SalesOrderItemId == null`, cùng product/warehouse/batch
  3. Gọi `ProductSerialService.ReserveSalesOrderItemSerialsAsync(soItem, serialIds, userId)`
  4. Sau đó mới gọi `SynchronizeDeliveryOrderAsync`
- **Lý do**: `ResolveSerialIdsForTransactionAsync` cho DeliveryOrder tìm serial qua `SalesOrderItemId`. Nếu chưa reserve → trả về empty → exception `"Serial-tracked products require selected serial numbers."`.

### Key ProductSerialService Methods
- `ReserveSalesOrderItemSerialsAsync`: Gán `SalesOrderItemId` + `Status=Reserved` — dùng trước SO→DO sync
- `ReleaseSalesOrderItemSerialsAsync`: Xóa `SalesOrderItemId` + `Status=InStock` — dùng khi hủy/xóa SO item
- `ApplyInventoryTransactionSerialsAsync`: Tạo `ProductSerialMovement`, cập nhật serial status — gọi nội bộ bởi `*CreateInvenTrans`
- `IsProductSerialTrackedAsync`: Kiểm tra `SerialTrackingMode != None` — guard check trước khi thao tác serial

## Quick Export & Partial Quantity Invariants
- **Editable Preview Grid**: Whenever a "Quick Export" or "Transfer" feature presents a preview grid, it **MUST** be an inline-editable grid (`allowEditing: true`) allowing the user to adjust the `quantity` and `unitPrice` before submission.
- **Dynamic Pricing Recalculation**: Dropdowns that dictate pricing strategy (e.g., Sales Type: Retail vs Internal) **MUST** bind to a `change` event that loops through the preview grid's `currentViewRecords` and dynamically updates the `unitPrice` and `total` via `grid.setCellValue()`.
- **Partial Export Tracking**: For partial exports, track the cumulative exported quantity directly on the source item using a `double?` field (e.g., `QuickSalesExportedQuantity`). **DO NOT** use a boolean flag or a single foreign key ID like `QuickSalesOrderId`, as they prevent multiple partial exports.
- **Remaining Quantity Validation**: The frontend must calculate and display `Remaining = Total Quantity - Exported Quantity`. The backend must explicitly validate that the requested export quantity does not exceed the remaining quantity.


## Syncfusion Grid Selection State Bleed
- **Clear Selection on Data Source Change**: When implementing master-detail views or re-using a Syncfusion grid (e.g., secondaryGrid) for different parent records, **ALWAYS** call `grid.clearSelection()` before or immediately after assigning the new data source. Syncfusion caches selected IDs (when `persistSelection: true` is used) and this leads to state bleed where items from the previous parent appear as selected in the new parent's context.


## Seeder Entity Tracking Invariants
- When fetching an entity within a Seeder for the purpose of updating it (Update() via a Repository), **ALWAYS** use the repository's GetQuery() method instead of _queryContext.Set<T>().
- **Correct**: `var warehouse = await _warehouseRepository.GetQuery().FirstOrDefaultAsync(...)`
- **Incorrect**: `var warehouse = await _queryContext.Set<Warehouse>().FirstOrDefaultAsync(...)`
- **Reason**: Multiple seeders run sequentially on the same scoped DataContext. Fetching via _queryContext (if it's a separate context or untracked) and then attaching to _warehouseRepository (which wraps DataContext) causes an identity tracking conflict if the entity was already cached by a previous seeder. Fetching via the repository guarantees you get the already-tracked instance.

## Cost Allocation Implicit 'Kho' (Warehouse) Rule
- In Purchase Order Cost Allocation UI, the "Kho" (Warehouse) fallback is IMPLICIT.
- DO NOT explicitly create "Kho" records in the frontend grid or allow the user to select "Kho" from the dropdown.
- The backend (AllocatePurchaseOrderCosts.cs) automatically computes Remaining Quantity = Total Quantity - Allocated Quantity for each PO item and implicitly assigns the remaining to CustomerId = null (Kho).
- When fetching existing allocations in the frontend, always filter out customerId == null so the user only sees what was explicitly allocated to customers.
- **Frontend Submit Filter**: When submitting cost allocations, the frontend MUST `.filter(row => row.customerId && row.allocateQuantity > 0)` before sending to the backend. Rows without a customer or with zero quantity are placeholder/Kho rows and must NOT be sent.
- **Customer Required Validation**: If a grid row has `allocateQuantity > 0`, the frontend MUST validate that `customerId` is not null/empty before submission. Show a warning if missing.
- **"Còn lại" Column Name**: The remaining quantity column in the cost allocation preview grid MUST use header text `'Còn lại'` (not `'Tổng SL'` or other variants). This was explicitly confirmed by the user.

## Material Export & Cost Allocation Pipeline Invariants

- **Material Export Data Structure**:
  - `MaterialExport` does NOT populate `MaterialExportItem` records. The UI directly saves added items as dummy `InventoryTransaction` records with `ModuleName == "MaterialExport"`.
  - When confirming a Material Export (`UpdateMaterialExport.cs`), the backend MUST query `InventoryTransaction` (not `MaterialExportItem`) to find the items to process.

- **Inventory Reduction & Serial Picking**:
  - `MaterialExport` does NOT deduct stock directly. It strictly delegates stock deduction to the `CostAllocation` module.
  - `UpdateMaterialExport` must map the dummy transactions to `AllocatePurchaseOrderCostsRequest` items, finding the original `PurchaseOrderItemId` via the `ProductId` and `PurchaseOrderId`.
  - `AllocatePurchaseOrderCostsHandler` is solely responsible for creating the real `InventoryTransaction` (with `ModuleName == "CostAllocation"`) and executing the **automatic random Serial picking** (`ApplyInventoryTransactionSerialsAsync`). You do NOT need to build a manual serial picker UI for Material Export or Cost Allocation.

- **Cost Allocation Aggregation Rule (Anti-Duplicate)**:
  - In `AllocatePurchaseOrderCostsHandler`, to prevent duplicate allocation records and double serial-picking for the same customer, `request.Items` **MUST** be aggregated by `{ PurchaseOrderItemId, CustomerId }` before creating `PurchaseOrderCostAllocation` records.
  - Failure to aggregate will cause the serial picker to reuse the same cached serials for duplicate rows, resulting in ghost stock discrepancies (e.g., deducting 10 from numeric stock but only allocating 5 unique serials).

- **CashTransaction Description Override**:
  - When `AllocatePurchaseOrderCosts` creates a `CashTransaction`, it auto-generates the `Description` field. Specifically for Purchase Orders or Material Exports, it MUST use the format: `[VendorName] - [CustomerName]`. Any `Description` submitted from the UI is intentionally ignored in the transaction history.

- **Serial Tracking Mode**:
  - The system actively uses only 2 levels: `InternalAuto` (System auto-generates) and `ManufacturerSerial` (Input from manufacturer - currently in development). Avoid referencing other unsupported modes for core logic.
