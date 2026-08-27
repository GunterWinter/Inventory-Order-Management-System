# Test research: FIFO inventory costing

Date: 2026-08-26

- Scope: database reset safety, DI startup, document-date FIFO for Material Export and physical Sales Order, exact serial cost, Sales Return source-layer reversal, frozen inventory-profit reporting, Vietnamese decimals, and all affected UI paths.
- Production evidence is read-only. `WHMS-LT` has backdated August receipts/exports, all opening movements currently dated 24/08, and one existing Material Export line differs from document-date FIFO by 3,750. No production mutation is authorized.
- Mutating verification must use a disposable `WHMS_UiRegression_*` database and visible UI actions. API/SQL may only create fixtures or verify persistence/tamper rejection.
- The required static C#/JavaScript source-to-test pairing analyzer was invoked once on 2026-08-26 but could not run because `tree-sitter-language-pack` is not installed. No dependency was added; this is only a static heuristic, not coverage evidence.
- Existing reusable components: `InventoryCostResolver`, `ProductSerialPicker`, `NumberFormatManager`, document confirm/cancel transactions, and the unused empty `MaterialExportItem` table. Prefer extending these over parallel implementations.
- 2026-08-27 Sales Order draft regression: the serial picker already returns an empty array, but the Sales Order grid discards that empty selection and both command handlers reject it. Reserved serials are also omitted from the generic stock lookup, so the current draft loses its warehouse context after reserving the last unit.
- Required behavior: a Draft serial line may persist with quantity `0` and no selected serials; saving an empty selection releases the old reservation. Confirmation must reject such a line. The current Sales Order may include its own reservations in stock lookup, while generic/other-order lookups must continue excluding them.
- No schema change or production data mutation is needed. Regression verification must use a disposable `WHMS_UiRegression_*` database and the visible Sales Order UI.
- The static C#/JavaScript pairing analyzer was invoked again on 2026-08-27 and remained unavailable because `tree-sitter-language-pack` is not installed; no dependency was added.

## Nghiên cứu cho 12 lỗi ngày 2026-08-27

- Sales Order đang tính/lưu tối đa 6 số lẻ nhưng grid có chỗ tự định dạng kiểu Anh và làm tròn 2 số, dẫn đến dòng `6,300,927.58` khác footer `6.300.927,576`.
- Warranty Lookup chỉ tải một trang từ API nhưng để grid sort/filter cục bộ; sự kết hợp remote paging và local grid state làm active page, sort và filter không đồng bộ.
- Warranty Lookup chỉ nối serial với Sales Order, nên serial xuất qua Material Export không có dữ liệu công trình/điện thoại/chứng từ.
- Material Export hiện tạo Cash Transaction chưa thanh toán dù nghiệp vụ đúng chỉ là xuất kho và ghi chi phí công trình.
- Báo cáo danh mục đang nhóm từ giao dịch phát sinh nên bỏ các danh mục bằng 0.
- `WHMS-LT` không có giao dịch năm 2000; lỗi ngày nằm ở việc grid render JavaScript Date.
- PO có bảo vệ không cho giảm `PaidAmount`, nhưng chưa có endpoint/UI hoàn thanh toán mà thông báo đang yêu cầu người dùng sử dụng.
- `sofa + nệm đâu giường` đã là hàng vật lý nhưng dòng PO xác nhận không có WarehouseId nên đồng bộ tồn kho bỏ qua dòng này.

### Tiêu chí nghiệm thu

- Tiền thương mại hiển thị và lưu nhất quán 2 số lẻ; giá vốn nội bộ vẫn giữ độ chính xác 6 số.
- Mỗi yêu cầu UI/nghiệp vụ có regression assertion; mọi browser mutation chỉ chạy trên `WHMS_UiRegression_*`.
- Mọi sửa dữ liệu `WHMS-LT` phải có preflight, transaction, idempotency và hậu kiểm đọc lại.

## Acceptance checklist

- Startup cannot delete `WHMS-LT`; demo reset only accepts `WHMS_UiRegression_*`. Nested FIFO value objects are not registered as DI services.
- Opening stock uses the first day of the business month while audit timestamps retain actual creation time.
- FIFO is ordered by business/document date, then stable tie-breakers; a line crossing layers stores each exact slice and displays total plus average summary.
- Physical non-serial Material Export and Sales Order use FIFO; serial lines use each selected serial's exact cost; missing source cost blocks confirmation.
- Sales Return restores the exact selected sold allocation/serial cost and cannot return more than the remaining source quantity.
- Cost allocations and line COGS are frozen on confirmation, reversed atomically on cancellation, and reports use frozen values.
- UI serial pickers show unit cost and selected total/average; affected grids expose cost summary and source details in Vietnamese.
- Vietnamese values such as `321.987,625`, `2,5`, and `1.234` survive editor, payload, database, reload, breakdown, report, and export boundaries.
- Backfill supports read-only dry-run and explicit apply; only dry-run may be executed until the user separately confirms production apply.
