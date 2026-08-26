# Project UI risk matrix

Use the cross-cutting section for every run, then select all affected area sections. These are minimum regression targets derived from defects that previously survived a green gate.

## Cross-cutting proof

For each scenario, act through visible UI and assert editor text, rendered row, request payload, persisted value, reload value, and downstream effects where applicable. Test new and existing rows. Save once while the final editor is still active. A route screenshot, non-empty datasource, or HTTP 200 alone does not satisfy a row.

Monitor JavaScript/console errors, same-origin 4xx/5xx, request failures, `Invalid Date`, `[object Object]`, duplicate visible controls, hidden required content, and unexpected English text in Vietnamese mode.

## Vietnamese numbers across the system

- Enter `321.987,625` in money fields and `2,5` in decimal quantity fields. Assert the exact numeric payload, persistence, reload rendering, totals, exports, and reports.
- Enter `1.234` and assert it means grouping (`1234`), not a decimal. Exercise zero, negative rejection, and six fractional digits without trailing zero display.
- Verify explicit policies: money and non-serial quantities allow up to six decimals; serial counts and genuinely integral fields reject fractions.
- Scan menu page scripts for direct `en-US`, `toLocaleString`, `parseFloat`, `toFixed`, and integer `N0/n0` on decimal-capable fields. Static scanning supplements, never replaces, browser assertions.
- When costs are grouped, use values equal at four decimals but different after that and assert they remain distinct until the business rule intentionally aggregates them.

## Purchase Order

- Through the grid editor, type price `321.987,625` and non-serial quantity `2,5`; blur into another editor, save immediately, inspect payload, reopen, and verify totals/allocation displays.
- Repeat on an existing row to catch stale editor values. The just-typed price must win over the previous row/model value.
- Verify physical non-serial accepts decimals; both serial modes require whole quantity and the correct serial workflow.
- Verify allocation preview and saved allocation use Vietnamese formatting and preserve decimals.

## Sales Order

- Type Vietnamese decimal price and quantity through real cell interaction, then change tax/another cell and save. Assert the new value survives editor teardown, persistence, and reload.
- Test serial and non-serial quantity policies separately; selected serial count must become the line quantity.
- Trigger multiple grid binds/reopens, then click payment status once. Assert exactly one request and one state transition per click.

## Cash transactions and allocations

- Add, remove, and re-add allocation rows; close/reopen the modal and change language. Every row must show exactly one searchable customer control and no visible native duplicate.
- Create two rows with identical product/customer/warehouse display values. Assert both remain independently editable and persisted; row identity must not depend on display text.
- Repeat for Debit and Credit and verify allocation sum equals the parent transaction without double-counting reports.

## Shared serial picker and Syncfusion batch grids

- Test a new keyless added row and an existing changed row. Open the picker from the visible serial cell, select serials, press Apply, then press Update immediately.
- Assert serial IDs, serial text, and quantity in the rendered row, request payload, added/changed batch record readback, persisted row, and reload.
- Exercise a callback after the quantity editor has been destroyed. Row index/UID/editor context must still identify the correct record.
- Change the product after selecting serials. Old IDs/text must disappear from UI, payload, batch state, and persistence; quantity follows the new serial selection.
- Use two similar rows and verify the picker updates only the intended row.

## Material Export product selection

- Add a line via the toolbar and assert the product editor opens visibly without calling grid internals.
- Select a product and immediately assert reference code and decimal warehouse stock in the rendered row before saving.
- Compare editor preview, row data readback, request payload, added/changed record readback, persistence, and reload.
- Switch products and warehouses and assert stock/reference/serial state is refreshed, not retained from the previous selection.

## Material Export project cost transaction

- Confirm one export containing multiple lines, multiple purchase/opening/fallback cost sources, and the same customer. Assert exactly one document-level Credit transaction whose amount equals all line costs.
- Open source details in the UI and assert every export line remains visible with its own source item identity, quantity, exact unit cost, and total.
- Confirm/cancel/retry and assert transaction uniqueness, stock reversal, serial reversal, and no partial state.
- Seed legacy duplicate unpaid transactions in the disposable database and verify the supported merge/migration path. Paid groups must remain untouched and produce an explicit warning. Fresh-database success is not legacy coverage.
- Verify a document-level database uniqueness guard separately from the UI scenario.

## Purchase Return

- Create source Purchase Orders through UI in Draft, Confirmed, Cancelled, and Archived states. Only valid source states may appear; a forged invalid source request must also be rejected by backend.
- Return non-physical, physical non-serial, internal-serial, and manufacturer-serial items. The source item’s real `physical` and serial policy controls warehouse, fractional quantity, and picker requirements.
- Select serials, switch source order, and assert old serial IDs/text disappear. After creation, source order is locked.
- Confirm/cancel and verify exact source quantity, stock, serial, payable, and report reversal.

## Sales Return

- Create source Sales Orders through UI in Draft, Confirmed, Cancelled, and Archived states. Invalid sources must be absent from the picker and rejected by backend tamper testing.
- The serial picker must return only serials sold by the selected valid order. Switching source clears every previous serial reference; created returns lock the source selector.
- Confirm/cancel and verify stock, serial, warranty, receivable, revenue, cost, and report effects.
- In Vietnamese mode, exercise success, validation, dependency, delete, and server-error Swal paths; visible UI must be translated.

## Stock Count

- Open each status with API returning both string and numeric enum shapes. Assert dropdown datasource, current text/value, enabled state, and Vietnamese label after modal show and data rebind.
- Drive Draft → Confirmed → Archived → Confirmed restore and Confirmed → Cancelled through visible controls.
- Archived restore may change only status/audit data. Assert header and lines are locked and stock/serial effects are byte-for-byte unchanged; backend rejects any tampered content during restore.
- Verify invalid cancellation with a later dependent movement leaves all data unchanged and names the dependency.

## Inventory transaction report

- Seed matching Draft, Confirmed, Archived, and Cancelled movements. UI/report data must include only Confirmed and Archived.
- Assert reference code and product name are separate columns, movement magnitude/direction and running stock signs are correct, and group/footer totals use Vietnamese decimals.
- After initial bind and rebind, every group is collapsed. Open one group and ensure others stay collapsed.
- Assert useful initial grid height, then resize the viewport and assert the grid recalculates while rows remain visible.

## Warranty Lookup

- Use business dates near UTC day boundaries. Assert sale, warranty-end, and movement dates remain the same calendar day from response through rendered UI and display as dates, not datetimes.
- Use a fractional movement quantity and assert it remains fractional in the movement grid.
- Switch language and rebind; dates and quantities must reformat without changing their underlying value.

## Product cold start and Quick Add

- Delay product-group and warehouse lookup responses on first navigation. Assert the main grid and dropdowns do not settle into missing lookup text, and Quick Add sees the completed sources.
- Test product type transitions: non-physical hides warehouse/serial/opening stock; non-serial permits decimal opening stock; serial modes require integer quantity and correct serial inputs.
- Save immediately after typing the final opening-stock value, then assert payload, persistence, stock report, and transaction report.

## Shared dropdowns, Vue identity, and repeated binding

- Re-render lists containing duplicate display values. Add/delete/reorder rows and reopen modals; no control may disappear, reuse another row’s state, or acquire a second Syncfusion wrapper.
- Rebind grids and language multiple times. One user click must cause one listener invocation and one request.
- For every dropdown, verify current value/text, enabled state, searchable eligible datasource, empty search reset, and wrapper cleanup.

## Data protection and reports

- UI filtering is not a backend guard. After proving the UI path, send a separate forged stale/invalid request for source status, serial ownership, locked document content, and duplicate document transaction; assert rejection and no partial writes.
- Test concurrency-sensitive uniqueness with the database constraint, not only an application `Any` check.
- Reports and dashboards must exclude Draft/Cancelled/deleted data, include Confirmed/Archived and returns with correct sign, and reconcile to source documents.
- Legacy migration tests must include duplicate unpaid records and paid records. Never auto-merge paid history; preserve it and surface a warning.
