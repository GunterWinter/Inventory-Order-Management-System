# Implementation and verification status

## Final follow-up checkpoint (2026-08-28)

- Test-gap/assertion review: focused high-risk paths (money rounding, source-module cash exclusion, PO reversal/cancel guard, report dates, warranty paging/filtering, serial lifecycle and product-history guard) have direct equality, negative, state/side-effect, and structural assertions. No new test is assertion-free or only a presence check; mutation execution was not requested, so survivor claims are not made.

- Browser gate: 15/15 passed on disposable `WHMS_UiRegression_*` database; runner cleanup completed.
- JavaScript gate: `npm.cmd run test:js` 114/114 passed; solution build 0 warnings/errors.
- Publish: `.testagent/publish-verification/20260828_reported_fixes_final`; 8 affected JS assets have matching source/published SHA-256. IIS Express unavailable on this machine.
- WHMS-LT atomic repair committed for product `e2fdfcbb-0b80-4303-bef7-b4b2022b0bb8` and PO item `8f9709d3-0e02-4659-bb59-b4b2022ce23d`: both now use `Kho công ty` (`a6b1c5c5-b257-4608-a947-b4b0019d7498`); confirmed receipt `REPAIR-001720260826IVT` has Movement=1, Stock=1, UnitCost=5300000.
- WHMS-LT postflight: PO `001720260826PO` remains Confirmed, receipt stock is 1, active MaterialExport cash rows are 0; six legacy rows were soft-deleted (two older rows were already archived).
- Task 12 complete: product Physical/SerialTrackingMode changes are blocked once PO/SO inventory history exists, and the sofa inventory has been restored.

Date: 2026-08-27

Status: FIFO/database scope and Sales Order Draft serial lifecycle follow-up are complete. One unrelated Cash Transaction browser scenario remains outside scope.

## Checkpoints

- [complete] 1. Production reset guard and DI startup fix.
- [complete] 2. Cost-allocation model and document-date FIFO.
- [complete] 3. Product/serial/Material Export UI and decimals.
- [complete] 4. Sales Order/Sales Return costing and UI.
- [complete] 5. Frozen-profit reporting.
- [complete] 6. Narrow UI regression.
- [complete] 7. Full build/browser/publish verification for all impacted routes.
- [complete] 8. `WHMS-LT` dry-run, explicitly authorized apply, and read-only post-apply verification.

## Evidence so far

- Baseline before implementation: `npm.cmd run test:js` passed 91/91; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Static pairing analyzer was invoked once and was unavailable because `tree-sitter-language-pack` is not installed; no dependency was added.
- Safety changes now restrict demo reset to database names matching `WHMS_UiRegression_*` and set the checked-in `WHMS-LT` configuration to non-demo.
- DI scanning now excludes nested feature implementation details such as `InventoryCostResolver.InventoryFifoLayer`.
- Checkpoint 1 verification: `npm.cmd run test:js` passed 93/93; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Checkpoint 2: FIFO is ordered by document date, exact source slices are frozen in the existing empty `MaterialExportItem` table, physical Sales Orders share FIFO, serial costs are specific, Sales Returns carry source-layer selections, and new opening stock is effective on day 1 of its month.
- Checkpoint 2 verification: `npm.cmd run test:js` passed 95/95; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Checkpoint 3: Product and Quick Add show the opening-stock effective date rule; the shared serial picker shows exact per-serial cost plus selected total/average; PO manufacturer-serial entry explains the per-serial PO cost; Material Export shows frozen average/total/status and exact source-layer details.
- Checkpoint 3 verification: `npm.cmd run test:js` passed 96/96; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors; `git diff --check` passed (line-ending notices only).
- Checkpoint 4: Sales Order shows frozen average/total COGS, profit, status, and source layers; Sales Return selects exact non-serial source layers and sends them in the API payload, while serial returns retain exact serial costs.
- Checkpoint 4 verification: `npm.cmd run test:js` passed 97/97; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Checkpoint 5: Inventory Profit Report no longer resolves current inventory cost; it reads frozen `CogsAmount`/`ProfitAmount`, reports allocation sources, and preserves six-decimal display.
- Checkpoint 5 verification: `npm.cmd run test:js` passed 98/98; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Checkpoint 6: isolated UI scenarios pass for backdated FIFO (opening 01/08, PO 10/08, Material Export 20/08), Sales Order serial cost, Material Export serial persistence, and Purchase/Sales Return source quantities/cost layers.
- Production apply on 2026-08-27: synchronized 76 opening-stock transaction/parent dates to day 1, froze 27 FIFO ledger rows for 27 confirmed Material Export lines, and synchronized 6 unpaid project-cost obligations. Total frozen cost is 2,969,950; one legacy line changed by 3,750. Post-apply dry-run reports 0 opening dates and 0 lines pending.
- Serial costing now reads serial movements through the command context, eliminating the self-lock/30-second timeout inside the Serializable document transaction.
- Final static/build gates: `npm.cmd run test:js` passed 101/101; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors.
- Broad browser run exposed stale FIFO assertions and test-selection lifecycle issues. After the narrow fixes, every impacted UI scenario passes individually: backdated FIFO, serial PO/SO/Material Export, Purchase/Sales Return, Stock Count serial release, Material Export Draft/edit, and paid-document 409 handling.
- The broad run was not repeated after all narrow repairs because the remaining failure is the unrelated Cash Transaction date-edit scenario; it is deliberately left outside this FIFO change.
- Isolated publish completed at `.testagent/publish-verification/20260827_0945`; all 6 affected JavaScript assets match source by SHA-256. IIS Express is not installed on this machine, so an IIS Express runtime smoke was unavailable.
- 2026-08-27 follow-up baseline: the existing isolated browser scenario `Sales Order hiển thị số lượng bằng số serial đã chọn` passes, but it does not cover unchecking every serial, releasing the reservation, retaining the warehouse, or blocking confirmation of a zero-serial line.
- Sales Order Draft now includes its own reserved serials in the stock lookup, persists an empty picker selection as quantity/totals/cost zero, releases the old reservation, retains product/warehouse/unit price, and blocks confirmation until the line has matching reserved serials.
- Focused UI regression `Sales Order Nháp giữ chỗ, bỏ hết và chọn lại serial mà không mất kho` passed on disposable database `WHMS_UiRegression_SOSerialLifecycle7`; the runner dropped the database after success. Earlier failed attempts retained artifacts and exposed the demo-seed status invariant, the pre-mutation batch bug, and two test-helper assertion/selector gaps.
- Final gates: `npm.cmd run test:js` passed 101/101; `dotnet build Indotalent.sln --no-restore` passed with 0 warnings/errors; `git diff --check` passed with line-ending notices only.
- Final isolated publish completed without warnings at `.testagent/publish-verification/20260827_so_serial_final`; the source and published Sales Order JavaScript SHA-256 both equal `A8FB2AF2C037AF97AA74EAD7354F524C95AF7FD0A5F9A19CC824076736752A34`. IIS Express remains unavailable.
- `WHMS-LT` was not read or mutated during this follow-up. The pre-existing `Presentation/ASPNET/Program.cs` worktree change was preserved untouched.

## Tiến độ gói sửa lỗi ngày 2026-08-27

- [complete] Mục 1-2: tiền thương mại dùng `RoundMoney` 2 số và định dạng Việt Nam cố định; FIFO/giá vốn vẫn dùng 6 số.
- [complete] Mục 3: Sales Order chỉ còn Giá vốn và Lợi nhuận; đã bỏ giá vốn bình quân, trạng thái và nút chi tiết.
- [complete] Mục 4-6: Warranty Lookup tải đủ kết quả rồi dùng paging/sort/filter native; active page không còn bị reset bởi remote paging, đã dịch Manufacturer Serial và lấy nguồn khách hàng/chứng từ từ cả SO lẫn Material Export.
- [complete] Mục 7: Confirmed → Draft đảo movement đã xác nhận rồi tái áp đúng danh sách serial thành reservation của phiếu Nháp; Cancelled vẫn giải phóng hoàn toàn.
- [in progress] Mục 8: tách Material Export khỏi quỹ và giao dịch thủ công không quỹ.
- [complete] Mục 9: báo cáo thu chi hiển thị toàn bộ danh mục đang hoạt động, bao gồm danh mục chưa phát sinh có tổng 0.
- [complete] Mục 10: báo cáo công nợ và giao dịch kho không còn render `Date.toString()`/`Invalid Date`; cột được khai báo là Date và hiển thị theo locale chung.
- [complete] Mục 11: có quy trình hoàn toàn bộ từng lần thanh toán PO; sau khi tổng payment ròng về 0 thì PO được phép chuyển Nháp/Hủy.
- [pending] Mục 12 theo `.testagent/plan.md`.
- Quy ước: cập nhật phần này ngay sau khi mỗi mục hoàn tất và có bằng chứng kiểm tra.

### Bằng chứng checkpoint 1-3

- `node --test Tests/JavaScript/number-format-manager.test.js Tests/JavaScript/sales-order-item-editor.test.js`: 15/15 passed.
- Regression tiền xác nhận `6.300.927,576` làm tròn thành `6.300.927,58`, trong khi số lượng thập phân vẫn giữ tối đa 6 chữ số.
- Regression `Sales Order chỉ hiển thị giá vốn và lợi nhuận` xác nhận ba cột được yêu cầu đã biến mất.
- `dotnet build Indotalent.sln --no-restore`: thành công, 0 warnings, 0 errors.

### Bằng chứng checkpoint 4-6

- `node --test Tests/JavaScript/warranty-lookup-contract.test.js Tests/JavaScript/asset-versioning.test.js`: 5/5 passed.
- `dotnet build Core/Application/Application.csproj --no-restore`: thành công, 0 warnings, 0 errors.
- Browser regression thực tế cho pager/filter và hai nguồn chứng từ được xếp vào cổng browser cuối sau khi hoàn tất toàn bộ luồng liên quan.

### Bằng chứng checkpoint 7

- `node --test Tests/JavaScript/document-reopen-contract.test.js`: 5/5 passed, gồm regression `Material Export xác nhận trở về Nháp giữ lại đúng serial đã chọn`.
- `dotnet build Core/Application/Application.csproj --no-restore`: thành công, 0 warnings, 0 errors.

### Bằng chứng checkpoint 8 (phần code)

- Material Export không còn tạo, xóa, kiểm tra thanh toán hay backfill `CashTransaction`; chi phí công trình được báo cáo trực tiếp từ các `MaterialExportItem` đã chốt.
- Giao dịch thu/chi thủ công cho phép ghi nhận thanh toán không có tài khoản quỹ; nghiệp vụ sinh từ chứng từ vẫn bắt buộc quỹ. UI cảnh báo đúng câu: `Nếu để trống tài khoản quỹ thì chỉ biết chi/thu của giao dịch`.
- `node --test Tests/JavaScript/material-export-cash-contract.test.js Tests/JavaScript/document-reopen-contract.test.js`: 7/7 passed.
- `dotnet build Core/Application/Application.csproj --no-restore`: thành công, 0 warnings, 0 errors; `git diff --check` không có whitespace error.
- Còn chờ cổng cuối: soft-delete các giao dịch Material Export cũ trong `WHMS-LT` bằng transaction và hậu kiểm.

### Bằng chứng checkpoint 9

- `GetCashCategorySummary` lấy danh sách từ toàn bộ `CashCategory` chưa xóa rồi ghép hoạt động thu/chi; danh mục không có giao dịch vẫn trả về với tổng 0.
- `node --test Tests/JavaScript/cash-category-summary-contract.test.js`: 1/1 passed.
- `dotnet build Core/Application/Application.csproj --no-restore`: thành công, 0 warnings, 0 errors.

### Bằng chứng checkpoint 10

- Các cột `documentDate`, `movementDate`, `createdAtUtc` của hai báo cáo đã khai báo `type: 'date'`; `DateFormatManager` tiếp tục là nơi duy nhất chuẩn hóa sang `dd/MM/yyyy`.
- `node --test Tests/JavaScript/report-date-contract.test.js Tests/JavaScript/date-format-manager.test.js`: 4/4 passed.
- `git diff --check`: không có whitespace error.

### Bằng chứng checkpoint 11

- `CashTransactionPayment.ReversalOfPaymentId` liên kết payment đảo chiều với payment gốc; unique filtered index ngăn hoàn trùng.
- API `ReversePurchaseOrderPayment` chỉ nhận payment dương của PO, tạo đúng payment âm toàn phần, cập nhật trạng thái và tính lại quỹ.
- Popup thanh toán PO hiển lịch sử và nút `Hoàn` trên từng lần còn hiệu lực.
- `node --test Tests/JavaScript/purchase-order-payment-reversal-contract.test.js`: 2/2 passed.
- `dotnet build Indotalent.sln --no-restore`: thành công, 0 warnings, 0 errors.

### Preflight checkpoint 12 / WHMS-LT (chỉ đọc)

- Sản phẩm `e2fdfcbb-0b80-4303-bef7-b4b2022b0bb8` / `010620260826ART` / `sofa + nệm đâu giường`: `Physical=1`, `SerialTrackingMode=0`, chưa có kho mặc định.
- PO `001720260826PO` (`8c1f6918-16f4-4825-ada5-b4b2022a7ab8`) đã xác nhận; item `8f9709d3-0e02-4659-bb59-b4b2022ce23d` có số lượng 1, đơn giá 5.300.000, `WarehouseId=NULL` và chưa có InventoryTransaction.
- Kho thường duy nhất: `a6b1c5c5-b257-4608-a947-b4b0019d7498` / `Kho công ty`.
- Có đúng 6 CashTransaction Material Export cũ đang hoạt động; `PaidRows=0`, `HistoryRows=0`.
- Chưa ghi database; chỉ apply sau khi các cổng code/build/browser đạt.
