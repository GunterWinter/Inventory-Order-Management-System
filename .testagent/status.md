# Implementation and verification status

Date: 2026-08-27

Status: complete for the FIFO/database scope. One unrelated Cash Transaction browser scenario remains failing.

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
