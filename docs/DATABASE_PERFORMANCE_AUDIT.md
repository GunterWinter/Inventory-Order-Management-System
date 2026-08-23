# Database performance audit

Ngày rà soát: 2026-08-23

## Đã sửa

- PO serial từng đọc `ProductSerial` và `ProductSerialMovement` bằng `QueryContext` trong khi `CommandContext` đang giữ khóa của transaction `Serializable`. Connection thứ hai tự chờ transaction hiện tại và gây timeout. Toàn bộ read-after-write của luồng này nay dùng command repositories chung transaction.
- Đồng bộ PO từng chạy thêm một `SELECT InventoryTransaction` cho mỗi dòng hàng sau `SaveChanges`. Dòng vừa tạo/cập nhật nay được giữ trong danh sách tracked và dùng trực tiếp, nên số truy vấn không còn tăng theo số item ở bước này.
- Bộ lọc khách hàng và khoảng ngày của báo cáo lợi nhuận công trình được áp dụng trong từng truy vấn SQL trước khi materialize. Sales Return cũng lọc chứng từ nguồn trước khi tải movement.
- SQL command logging và sensitive-data logging không còn bật mặc định. Chỉ môi trường Development mới có thể bật bằng `DataAccess:LogSql` và `DataAccess:EnableSensitiveDataLogging`.
- Bổ sung filtered covering indexes cho inventory theo module item, serial theo PO item, serial movement theo inventory transaction và lịch sử thanh toán theo transaction/ngày. Startup compatibility tạo index idempotent cho database hiện hữu.

## Chỉ mục mới

| Chỉ mục | Phục vụ |
| --- | --- |
| `IX_InventoryTransaction_ActiveModuleItem` | Đồng bộ/hủy inventory theo chứng từ và dòng |
| `IX_ProductSerial_ActivePurchaseOrderItem` | Đồng bộ serial của dòng PO theo thứ tự tạo |
| `IX_ProductSerialMovement_ActiveInventoryTransaction` | Kiểm tra/applied/reverse movement serial |
| `IX_CashTransactionPayment_ActiveTransactionDate` | Tổng hợp và hiển thị lịch sử thanh toán |

## Việc cần đo trên dữ liệu lớn

- Các list Product, Customer, Vendor, PO, SO, Cash Transaction và Inventory Transaction vẫn trả mảng đầy đủ cho nhiều lookup hiện hữu. Trước khi dữ liệu đạt quy mô lớn cần chuyển đồng thời API, grid, lookup và export sang server-side paging/search; không được chỉ giới hạn UI vì vẫn tải toàn bộ rows từ SQL.
- `GetInventoryProfitReport` còn gọi cost resolver theo dòng bán. Cache đã giảm lặp cho hàng không serial, nhưng báo cáo nhiều serial cần một batch cost projection sau khi có số liệu thực tế.
- Khi có dữ liệu đại diện, bật `DataAccess:LogSql` chỉ ở Development, gắn tag cho các truy vấn trên và ghi lại query count, duration cùng actual execution plan trước/sau. Không bật sensitive logging trên production.
