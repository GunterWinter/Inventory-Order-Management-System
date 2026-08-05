# Tái thiết kế Material Export & Luồng Tài Chính PO

Tái cấu trúc MaterialExport để hoạt động **độc lập hoàn toàn** khỏi PurchaseOrder, sử dụng cơ chế **Debit/Credit đối ứng** thay vì Wipe & Rebuild, và sửa triệt để CashTransaction để không gây sai lệch báo cáo tài chính.

## User Review Required

> [!IMPORTANT]
> **Thay đổi kiến trúc lớn**: MaterialExport sẽ không còn gọi `AllocatePurchaseOrderCosts`. Thay vào đó, nó tự trừ kho + tự tạo CashTransaction đối ứng.

> [!WARNING]
> **Database breaking change**: Thêm field `UnitCost` vào `ProductSerial` và gỡ `PurchaseOrderId` khỏi `MaterialExport`. Bác drop database mỗi lần chạy lại nên không cần migration script.

> [!CAUTION]
> **AllocatePurchaseOrderCosts thay đổi output**: Từ nhiều phiếu CashTransaction (1/khách + 1/kho) → 1 phiếu duy nhất cho toàn bộ PO. `PayPurchaseOrder` cũng cần sửa theo.

---

## Proposed Changes

### Component 1: Domain Entity Changes

#### [MODIFY] [ProductSerial.cs](file:///d:/Inventory-Order-Management-System/Core/Domain/Entities/ProductSerial.cs)
- Thêm `public double? UnitCost { get; set; }` — giá nhập gốc, gán khi GoodsReceive confirm

#### [MODIFY] [MaterialExport.cs](file:///d:/Inventory-Order-Management-System/Core/Domain/Entities/MaterialExport.cs)
- **GỠ BỎ** `PurchaseOrderId` và navigation `PurchaseOrder`
- **THÊM** `WarehouseId` (string?, bắt buộc) + navigation `Warehouse` — user chọn kho trước khi chọn sản phẩm

---

### Component 2: ProductSerial UnitCost — Gán giá nhập khi tạo serial

#### [MODIFY] [ProductSerialService.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/ProductSerialManager/ProductSerialService.cs) (Line ~157)
- Trong method `SynchronizeGoodsReceiveAsync` (hoặc tương đương), khi tạo `new ProductSerial`:
  ```csharp
  UnitCost = (item.AfterTaxAmount ?? 0) / (item.Quantity > 0 ? item.Quantity.Value : 1)
  ```
- Giá nhập = `PurchaseOrderItem.AfterTaxAmount / Quantity` tại thời điểm nhập kho

---

### Component 3: MaterialExport Backend — Tách khỏi PO, tự trừ kho

#### [MODIFY] [UpdateMaterialExport.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs)
**Thay đổi lớn nhất** — Khi `Status == Confirmed`:

1. **GỠ BỎ** toàn bộ logic gọi `AllocatePurchaseOrderCosts`
2. **Thêm logic mới**:
   - Fetch các InventoryTransaction dummy (`ModuleName == "MaterialExport"`)
   - Với mỗi item:
     - **Bốc serial FIFO**: Query `ProductSerial WHERE ProductId = item.ProductId AND CurrentWarehouseId = entity.WarehouseId AND Status = InStock` ORDER BY `CreatedAtUtc ASC` → Take(quantity)
     - Nếu item đã có serial được chọn tay (from Serial Picker) → dùng serial đó thay vì FIFO
     - Validate: `selectedSerials.Count == quantity`, throw nếu thiếu
     - **Lấy giá vốn**: `totalCost = selectedSerials.Sum(s => s.UnitCost ?? 0)`
     - **Tạo InventoryTransaction Out** (Confirmed): trừ kho trực tiếp
     - **Cập nhật serial status** → `Exported/Delivered`
   - **Truy vết PO qua serial chain**: `serial.PurchaseOrderItemId → PurchaseOrderItem.PurchaseOrderId`
   - Nhóm serial theo PO gốc → với mỗi PO:
     - Tìm phiếu CashTransaction "Kho" cũ (`SourceModule = "PurchaseOrder" AND SourceModuleId = PO.Id AND CustomerId = null`)
     - Tạo **2 phiếu đối ứng**:
       - **Phiếu Debit (bù trừ Kho)**: `TransactionType = Debit, Amount = totalCost, CustomerId = null, CashAccountId = null, VendorId = null, Status = Paid, SourceModule = "MaterialExport", SourceModuleId = entity.Id`
       - **Phiếu Credit (chi cho Khách)**: `TransactionType = Credit, Amount = totalCost, CustomerId = entity.CustomerId, CashAccountId = null, VendorId = null, Status = Paid, SourceModule = "MaterialExport", SourceModuleId = entity.Id`

#### [MODIFY] [CreateMaterialExport.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/MaterialExportManager/Commands/CreateMaterialExport.cs)
- Gỡ `PurchaseOrderId` khỏi request
- Thêm `WarehouseId` (bắt buộc)

#### [MODIFY] [UpdateMaterialExportValidator](file:///d:/Inventory-Order-Management-System/Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs)
- Gỡ `RuleFor(x => x.PurchaseOrderId).NotEmpty()`
- Thêm `RuleFor(x => x.WarehouseId).NotEmpty()`

#### [DELETE] [GetMaterialExportPOItems.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/MaterialExportManager/Queries/GetMaterialExportPOItems.cs)
- Không còn cần load items từ PO

#### [DELETE] [GetAvailablePurchaseOrders.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/MaterialExportManager/Queries/GetAvailablePurchaseOrders.cs)
- Không còn dropdown PO

#### [NEW] GetWarehouseProductStock.cs
- **Query mới**: Trả về danh sách sản phẩm còn tồn trong 1 kho cụ thể
- Input: `WarehouseId`
- Logic: Query `ProductSerial WHERE CurrentWarehouseId = warehouseId AND Status = InStock`, Group by `ProductId`, trả về `productId, productName, referenceCode, stockQuantity, serialTrackingMode`
- Dùng cho MaterialExport frontend thay thế `GetMaterialExportPOItems`

---

### Component 4: AllocatePurchaseOrderCosts — 1 phiếu CashTransaction duy nhất

#### [MODIFY] [AllocatePurchaseOrderCosts.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/PurchaseOrderManager/Commands/AllocatePurchaseOrderCosts.cs)

**Thay đổi logic tạo CashTransaction** (Line 345-407):
- Thay vì group by Customer tạo nhiều phiếu → **tạo 1 phiếu CashTransaction duy nhất**:
  ```csharp
  var cashTransaction = new CashTransaction
  {
      TransactionType = CashTransactionType.Credit,
      Amount = poItems.Sum(x => x.AfterTaxAmount ?? 0), // Tổng PO
      PaidAmount = 0,
      Status = CashTransactionStatus.Unpaid,
      VendorId = purchaseOrder.VendorId,     // GIỮ VendorId để công nợ đúng
      CashAccountId = null,                  // KHÔNG trừ tiền thật
      CustomerId = null,                     // Phiếu cho cả PO, không riêng khách nào
      SourceModule = "PurchaseOrder",
      SourceModuleId = purchaseOrder.Id,
      SourceModuleNumber = purchaseOrder.Number,
      Description = $"{purchaseOrder.Vendor?.Name} - {purchaseOrder.Number}"
  };
  ```
- **GỠ BỎ** logic `RecalculateAccountBalance` vì `CashAccountId = null`
- **GIỮ NGUYÊN** logic tạo `PurchaseOrderCostAllocation` records + serial picking + InventoryTransaction (chỉ thay đổi phần CashTransaction)

---

### Component 5: CashTransaction — Thêm mục chi tiết chia đơn

#### [MODIFY] [GetCashTransactionList.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/CashTransactionManager/Queries/GetCashTransactionList.cs)
- Hoặc tạo endpoint mới `GetCashTransactionDetail` để khi click vào phiếu PO:
  - Fetch `PurchaseOrderCostAllocation` records theo `PurchaseOrderId = SourceModuleId`
  - Trả về danh sách items: Sản phẩm, Số lượng, Đơn giá, Khách hàng, Kho
  - Frontend hiển thị trong modal chi tiết

#### [NEW] GetCashTransactionCostAllocations.cs
- Query: `PurchaseOrderCostAllocation WHERE PurchaseOrderId = request.SourceModuleId`
- Join Product, Customer để lấy tên
- Trả về danh sách chi tiết chia đơn cho UI hiển thị

---

### Component 6: PayPurchaseOrder — Sửa flow thanh toán

#### [MODIFY] [PayPurchaseOrder.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/PurchaseOrderManager/Commands/PayPurchaseOrder.cs)
- Hiện tại: tìm nhiều phiếu rồi chia tiền đều
- **Sửa**: Tìm 1 phiếu CashTransaction duy nhất (`SourceModule = "PurchaseOrder" AND SourceModuleId = PO.Id`)
- Cập nhật `PaidAmount += paymentAmount`, `CashAccountId = request.CashAccountId`
- Tính `Status` = Paid/PartiallyPaid/Unpaid
- Gọi `RecalculateAccountBalance` cho account được chọn

---

### Component 7: VendorDebtReport — Review & fix

#### [MODIFY] [GetVendorDebtReport.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/CashTransactionManager/Queries/GetVendorDebtReport.cs)
- Logic hiện tại: `TotalPurchase = SUM(PO.AfterTaxAmount)`, `TotalPaid = SUM(CashTransaction với VendorId)`
- **Sửa `TotalPaid`**: Chỉ tính `SUM(PaidAmount)` của CashTransaction có `VendorId != null` (bao gồm cả phiếu PO lẫn phiếu tạo tay)
- **Không tính Amount** — vì Amount là tổng nợ, PaidAmount là đã trả
- Phiếu MaterialExport có `VendorId = null` → tự động bị loại ✅
- Phiếu CostAllocation (chia đơn) có `VendorId = PO.VendorId` nhưng giờ chỉ còn 1 phiếu → PaidAmount phản ánh đúng số tiền đã trả cho Vendor

---

### Component 8: MaterialExport Frontend

#### [MODIFY] [MaterialExportList.cshtml](file:///d:/Inventory-Order-Management-System/Presentation/ASPNET/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml)
- **GỠ BỎ** dropdown "Đơn mua hàng (Dư)" (`purchaseOrderIdRef`)
- **THÊM** dropdown "Kho" (`warehouseIdRef`) — bắt buộc chọn trước
- Giữ nguyên: Ngày xuất, Khách hàng, Trạng thái, Ghi chú

#### [MODIFY] [MaterialExportList.cshtml.js](file:///d:/Inventory-Order-Management-System/Presentation/ASPNET/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml.js)
- **GỠ BỎ**: `purchaseOrderListLookupData`, `PurchaseOrderListLookup`, validate `purchaseOrderId`, `populatepurchaseOrderListLookupData()`
- **THÊM**: `warehouseListLookupData`, dropdown Warehouse
- **SỬA** `populateProductListLookupData()`:
  - Thay vì call `GetMaterialExportPOItems?purchaseOrderId=...`
  - Call `GetWarehouseProductStock?warehouseId=...` (endpoint mới)
  - Chỉ hiện sản phẩm còn tồn, kèm `stockQuantity`
- **THÊM validate**: Khi save item trên grid, validate `quantity <= stockQuantity`
- **THÊM Serial Picker**: Cấu hình `ProductSerialPicker.createGridColumn()` cho grid items
  - Mặc định: không bắt buộc chọn serial (FIFO auto)
  - Nếu user click Serial Picker → chọn tay → override FIFO
- Grid cột: Gỡ cột `purchaseOrderName`, thêm cột `warehouseName`

---

### Component 9: CashTransaction Frontend — Chi tiết chia đơn

#### [MODIFY] CashTransaction detail modal (trong trang CashTransaction hoặc PurchaseOrder)
- Khi click phiếu có `SourceModule = "PurchaseOrder"`:
  - Fetch `GetCashTransactionCostAllocations?sourceModuleId=xxx`
  - Hiển thị bảng chi tiết: Sản phẩm | Khách hàng | Số lượng | Đơn giá | Thành tiền
  - Readonly, không cho sửa → muốn sửa phải về PO chia lại

---

### Component 10: InventoryTransactionService — Thêm MaterialExport trừ kho trực tiếp

#### [MODIFY] [InventoryTransactionService.MaterialExport.cs](file:///d:/Inventory-Order-Management-System/Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.MaterialExport.cs)
- `MaterialExportCreateInvenTrans`: Thêm param `warehouseId` + `productSerialIds`
  - Set `WarehouseId = warehouseId`
  - Set `Status = Confirmed` (trừ kho trực tiếp)
  - Gọi `ApplyInventoryTransactionSerialsAsync` để cập nhật serial movements

---

### Component 11: API Controller Changes

#### [MODIFY] MaterialExport Controller
- Gỡ endpoint `GetMaterialExportPOItems`, `GetAvailablePurchaseOrders`
- Thêm endpoint `GetWarehouseProductStock`
- Sửa Create/Update request DTO: gỡ `PurchaseOrderId`, thêm `WarehouseId`

---

## Verification Plan

### Manual Verification

1. **Material Export flow**:
   - Tạo PO 10 cái, confirm → chia đơn: Khách A = 5, Kho = 5
   - Kiểm tra: 1 phiếu CashTransaction duy nhất cho PO, Amount = tổng PO, Status = Unpaid
   - Vào MaterialExport, chọn Kho, chọn sản phẩm còn tồn
   - Xuất 4 cái cho Khách B → Confirm
   - Kiểm tra: 2 phiếu đối ứng (Debit Kho -4 cái + Credit Khách B 4 cái)
   - Kiểm tra tồn kho: Kho còn 1

2. **Báo cáo tài chính**:
   - VendorDebtReport: Công nợ = PO.Amount - PaidAmount
   - Thanh toán PO 40tr → kiểm tra: PaidAmount = 40tr, Status = PartiallyPaid
   - Phiếu MaterialExport không xuất hiện trong công nợ Vendor

3. **Serial picking**:
   - Test FIFO: serial cũ nhất được bốc trước
   - Test manual: user chọn serial cụ thể qua Serial Picker
   - Test UnitCost: giá xuất = giá nhập gốc của serial

4. **Chống chồng chi**:
   - Tổng CashTransaction = PO Amount (60tr) + Debit Kho (-24tr) + Credit Khách B (24tr) = **60tr** ✅
   - Không có double expense
