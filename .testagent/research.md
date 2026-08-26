# Test research: FIFO inventory costing

Date: 2026-08-26

- Scope: database reset safety, DI startup, document-date FIFO for Material Export and physical Sales Order, exact serial cost, Sales Return source-layer reversal, frozen inventory-profit reporting, Vietnamese decimals, and all affected UI paths.
- Production evidence is read-only. `WHMS-LT` has backdated August receipts/exports, all opening movements currently dated 24/08, and one existing Material Export line differs from document-date FIFO by 3,750. No production mutation is authorized.
- Mutating verification must use a disposable `WHMS_UiRegression_*` database and visible UI actions. API/SQL may only create fixtures or verify persistence/tamper rejection.
- The required static C#/JavaScript source-to-test pairing analyzer was invoked once on 2026-08-26 but could not run because `tree-sitter-language-pack` is not installed. No dependency was added; this is only a static heuristic, not coverage evidence.
- Existing reusable components: `InventoryCostResolver`, `ProductSerialPicker`, `NumberFormatManager`, document confirm/cancel transactions, and the unused empty `MaterialExportItem` table. Prefer extending these over parallel implementations.

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
