# Bảng Công Việc & Hướng Dẫn Nâng Cấp (UPGRADE_TODO)

Tài liệu này chứa các vấn đề cần khắc phục và nâng cấp trong tương lai. Bạn có thể mở hoặc copy nội dung file này cho AI Agent trong phiên làm việc tiếp theo để AI tự động đọc và thực thi chính xác.

---

## 1. Nâng Cấp Tính Tiện Lợi Bảng (Syncfusion Grid Usability)

**Mô tả:** Trong các màn hình như Đơn mua hàng (PO) hoặc Đơn bán hàng (SO), lưới mặt hàng (Secondary Grid) cần được bổ sung 2 tính năng:
1. Nhấn `Enter` để lưu (Save) dòng đang sửa, thay vì click ra ngoài.
2. Dùng phím mũi tên Trái/Phải để cuộn ngang (Horizontal scroll) lưới mặt hàng.

**Hướng dẫn kỹ thuật cho AI (Technical Guide for AI):**
- **Vị trí sửa:** Hàm cấu hình Syncfusion Grid (thường là trong `.cshtml.js`, ví dụ: `PurchaseOrderList.cshtml.js` hoặc `SalesOrderList.cshtml.js`, tại phần khai báo `secondaryGrid = new ej.grids.Grid({...})`).
- **Triển khai Enter để lưu:**
  - Lắng nghe sự kiện `keydown` trên `gridObj.element`.
  - Nếu `e.key === 'Enter'` và `gridObj.isEdit` là `true`, gọi `gridObj.endEdit()` và `e.preventDefault()`.
- **Triển khai cuộn bằng phím mũi tên:**
  - Trong cùng sự kiện `keydown` trên, nếu `gridObj.isEdit` là `false` (người dùng không đang gõ text trong ô input):
  - Tìm phần tử `.e-content`: `const content = gridObj.element.querySelector('.e-content');`
  - Nếu `e.key === 'ArrowRight'`, tăng `content.scrollLeft += 50;`
  - Nếu `e.key === 'ArrowLeft'`, giảm `content.scrollLeft -= 50;`

---

## 2. Sửa Lỗi Tra Cứu Bảo Hành (Warranty Lookup Bug)

**Mô tả:** Tại màn hình "Tra cứu bảo hành", khi click đúp vào một dòng lịch sử luồng (Movement History) của Serial, nếu luồng đó thuộc `CostAllocation`, `StockCount`, hoặc `MaterialExport`, hệ thống sẽ ném lỗi 404 (Không tìm thấy endpoint) hoặc mở lên View nhưng bị trắng dữ liệu Items.

**Hướng dẫn kỹ thuật cho AI (Technical Guide for AI):**
- **Vị trí sửa:** File `WarrantyLookup.cshtml.js` (hàm `openDocumentModal`) và trang hiển thị `WarrantyLookup.cshtml`.
- **Nguyên nhân cốt lõi:** Form modal hiện tại trong `WarrantyLookup.cshtml` được hardcode để chỉ đọc `purchaseOrderItemList` hoặc `salesOrderItemList`. Khi `moduleName` là `CostAllocation` (không có Controller) hoặc `MaterialExport`, hàm `Get...Single` gọi API thất bại hoặc trả về Model không khớp cấu trúc giao diện.
- **Giải pháp xử lý:**
  1. Trong `openDocumentModal` (`WarrantyLookup.cshtml.js`), khi `moduleName === 'CostAllocation'`, chúng ta thực chất muốn hiển thị nội dung của Đơn mua hàng (PO) gốc. Cần tạo một cơ chế/API nhỏ để từ `PurchaseOrderCostAllocation.Id` (`moduleId`) tra ngược ra được `PurchaseOrderId`. Sau đó trỏ `targetModule = 'PurchaseOrder'` và gọi `GetPurchaseOrderSingle`.
  2. Khi `moduleName === 'MaterialExport'` hoặc `StockCount`, cần đảm bảo frontend gọi đúng API tương ứng (đã có sẵn `GetMaterialExportSingle`). Tuy nhiên, cần cập nhật file HTML `WarrantyLookup.cshtml` để render được danh sách items của các Model này (ví dụ: `inventoryTransactionList` thay vì `purchaseOrderItemList`), hoặc hiển thị một bảng thông tin tối giản phù hợp nếu nó không phải là chứng từ PO/SO truyền thống.
