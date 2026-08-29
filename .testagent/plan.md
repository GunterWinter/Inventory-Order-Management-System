# Test plan: FIFO inventory costing

## Follow-up plan 2026-08-29

1. [complete] Make PO/SO/PR/SR payment reversal share one linked negative-payment service and use net payment guards.
2. [complete] Synchronize confirmed return values into cash/debt, reports and dashboard; reverse them atomically on Draft/Cancel.
3. [complete] Enforce Draft-only delete and validate Sales Return stock before reversing the return.
4. [complete] Preserve Vietnamese Quick Add money display and canonical parsing.
5. [complete] Add bounded server paging/search/sort and active-list indexes for the seven planned high-volume grids.
6. [complete] Run focused JavaScript, build, isolated browser and publish verification; record assertion review.

## Final follow-up override (2026-08-28)

- [complete] Tasks 1-11 code and verification.
- [complete] Task 12 WHMS-LT inventory repair and reclassification guard.
- [complete] Final JavaScript/build/browser/publish gates and WHMS-LT postflight.

1. [complete] Guard production data and repair nested-type DI registration.
2. [complete] Persist FIFO/source allocations and implement document-date costing with deterministic decimal behavior.
3. [complete] Implement opening-date, serial-cost, Material Export, Sales Order, and Sales Return UI workflows.
4. [complete] Make inventory-profit reports consume frozen COGS/return allocations.
5. [complete] Add focused JavaScript and isolated Playwright regressions for affected direct callers and lifecycle paths.
6. [complete] Run JavaScript, build, isolated browser, and publish asset checks; IIS Express runtime smoke is unavailable because IIS Express is not installed.
7. [complete] Run production dry-run, explicitly authorized atomic apply, and post-apply read-only verification.
8. [complete] Repair Sales Order Draft serial lifecycle: preserve own reserved stock/warehouse, persist empty selection as quantity zero, release stale reservations, and block confirmation until serials are selected.
9. [complete] Add and run focused UI regression plus JavaScript/build/publish gates without touching `WHMS-LT`.

## Kế hoạch sửa lỗi ngày 2026-08-27

1. [complete] Chuẩn hóa làm tròn 2 số lẻ và định dạng tiền Việt Nam.
2. [complete] Thu gọn cột giá vốn Sales Order.
3. [complete] Sửa phân trang, sort, filter, localization và dữ liệu Warranty Lookup.
4. [complete] Giữ serial khi Material Export chuyển từ Đã xác nhận về Nháp.
5. [in progress] Phần code đã xong: tách Material Export khỏi thu chi; hỗ trợ giao dịch thủ công không chọn quỹ. Còn dọn dữ liệu cũ `WHMS-LT` sau cổng kiểm tra cuối.
6. [complete] Hiển thị toàn bộ danh mục trong báo cáo thu chi, kể cả danh mục có tổng 0.
7. [complete] Chuẩn hóa ngày báo cáo công nợ và giao dịch kho bằng cột Date thật và format dùng chung.
8. [complete] Thêm hoàn đầy đủ từng lần thanh toán PO bằng payment đảo chiều có liên kết, chống hoàn trùng và tính lại quỹ.
9. [pending] Sửa tồn kho sofa trong `WHMS-LT` và chặn lỗi tái diễn.
10. [pending] Chạy JavaScript, build, browser regression, publish và hậu kiểm `WHMS-LT`.
