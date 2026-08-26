# Implementation and verification status

Date: 2026-08-26

Status: in progress.

## Checkpoints

- [complete] 1. Production reset guard and DI startup fix.
- [complete] 2. Cost-allocation model and document-date FIFO.
- [complete] 3. Product/serial/Material Export UI and decimals.
- [complete] 4. Sales Order/Sales Return costing and UI.
- [complete] 5. Frozen-profit reporting.
- [in progress] 6. Narrow UI regression.
- [pending] 7. Full build/browser/publish verification.
- [pending] 8. Read-only `WHMS-LT` dry-run; production apply remains forbidden without separate confirmation.

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
