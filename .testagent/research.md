# Research

## Target inventory

- `CashBalanceService`, cash transaction create/update/delete, sales/purchase payment commands, and their EF Core contexts/transactions.
- Numeric domain/entities, EF configurations, document calculations, inventory movements, and financial/inventory reports.
- Shared browser helpers: `grid-interaction-manager.js`, `number-format-manager.js`, `excel-import-manager.js`, and `ui-localization.js`.
- Sales/Purchase item grids, cash transaction grid, list selection/deletion handlers, isolated Playwright runner, and browser guide.

## Existing conventions

- .NET 9 SDK-style solution with no persistent .NET test project. Repository rules require JavaScript tests plus the isolated Playwright suite and explicitly disallow retaining temporary application test projects.
- JavaScript tests use Node's built-in `node:test`; browser tests use installed Playwright 1.54.2.
- Vue 3 Composition API is embedded in CSHTML page scripts; cross-page behavior is centralized in plain JavaScript managers.
- Browser tests must mutate only a disposable `WHMS_AntigravityTest_*` database and exercise behavior through the real UI.

## Acceptance checklist

- Lookup cells display product/tax/warehouse names rather than GUIDs after batch editing.
- Sales Order displays live warehouse-specific available stock and prevents confirmed negative stock.
- Cash payments use one EF transaction/context, never self-block, require an account for a positive delta, preserve immutable installment history, allow different accounts, and reject decreases.
- Project material allocations remain non-cash costs and do not alter cash balances.
- Non-serial quantities support six decimal places; serial quantities remain integers; VND line/tax totals round to whole dong.
- Vietnamese number input/display is consistent across grids/forms/reports.
- Future documents may be saved as Draft but cannot be confirmed; posted cash payments cannot use a future date.
- Single-click row selection follows Windows semantics; double-click opens view; deletion clears stale selection; multi-delete is all-or-nothing wherever delete is offered.
- Vietnamese is the default UI, English remains selectable, and import/export/PDF follow the active locale.
- Excel templates contain Vietnamese instructions plus separate ignored example sheets; imports remain atomic and document imports remain Draft.
- Regression commands finish cleanly: `npm.cmd run test:js`, `dotnet build Indotalent.sln --no-restore`, and `npm.cmd run test:browser:isolated`.

## Static pairing result

- Polyglot analyzer scanned 1,292 source files and 14 test files, reporting 142 statically paired sources and 1,150 unpaired sources.
- Relevant shared managers already pair to neighboring JavaScript/browser tests, so those suites are the correct extension points.
- The report is a static identifier/import heuristic, not evidence of line or branch coverage; vendor and temporary tooling files add noise.
