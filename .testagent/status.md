# Implementation and verification status

Date: 2026-08-23

## Implemented

- Lookup cells resolve Product/Tax display values instead of rendering UUIDs.
- Sales Order items show `Tồn khả dụng` and validate decimal quantity against the selected warehouse stock.
- Accounting quantities, prices, taxes, balances, costs, and totals use `decimal(19,6)` end to end; existing SQL Server columns are upgraded from floating-point types at startup.
- Cash payment creation/update/delete is atomic, requires a cash account when paid amount increases, supports payment from the Cash Transaction screen, records only the payment delta, rejects future payment dates, and recalculates affected accounts with grouped queries.
- Confirmed inventory and order documents reject future dates while Draft documents may be dated ahead.
- Main grids select on a row click, preserve Ctrl/Shift/checkbox multi-selection, enable multi-delete, and clear deleted persisted selections.
- Vietnamese is the default locale; Inventory Profit Report and Excel Export labels are localized.
- Import templates contain Vietnamese instructions and separate non-imported `Example-*` sheets with realistic sample rows.
- Money values use Vietnamese grouping with 2-6 decimal digits; SO/PO payments refresh their grid status immediately; guarded Customer/Customer Group deletes show the backend reason; empty Excel imports are localized.
- Browser test builds run from per-run artifacts so localhost/Visual Studio output files are not locked.

## Tests added or strengthened

- JavaScript checks for Vietnamese decimal parsing/formatting (`10.000.000,00`, `12.350,231`), decimal edit precision, localized empty Excel imports, lookup display values, row selection, stale selection cleanup, and import example sheets.
- Playwright Sales Order flow uses opening stock `2,5`, verifies persisted decimal values, product display rather than UUID, `Tồn khả dụng`, and writes a stable screenshot.
- Playwright serial-tracked Sales Order flow verifies selecting 2 of 3 serials renders, batches, and persists quantity `2` with exactly those two serial IDs.
- Browser cash flow rejects paid-amount increase without an account, completes it with an account in under 10 seconds, verifies source transactions can select an account, and confirms SO/PO payment statuses update without F5.
- Browser Vendor Group flow selects two rows with Ctrl+click, deletes them together, then selects/deletes the remaining row without stale selection.
- Existing isolated browser suite continues to cover locale switching, document modal/date controls, atomic import, Excel export, stock lifecycle/cost/profit, reports, and nine PDF types.

## Final verification

- `npm.cmd run test:js`: 41 passed, 0 failed.
- `dotnet build Indotalent.sln --no-restore`: succeeded, 0 warnings, 0 errors.
- `npm.cmd run test:browser:isolated`: succeeded on disposable database; Product/PO/SO 2 passed, cash/report/payment refresh/multi-delete passed, atomic import passed, Excel export 18 rows, PDF count 9.
- `git diff --check`: no whitespace errors (only Git line-ending notices).

## Test quality audit

- Assertions check persisted/API values and rendered UI, not only HTTP success.
- Negative accounting paths leave the modal open and data unsaved until the missing account is supplied.
- Browser mutations run only against the isolated `WHMS_AntigravityTest_*` database and fixture records are uniquely prefixed.
- No new test/runtime dependency or permanent test database was added.
