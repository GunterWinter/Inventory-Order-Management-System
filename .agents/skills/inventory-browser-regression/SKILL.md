---
name: inventory-browser-regression
description: Test this inventory system from the user's UI through persistence and downstream business effects. Use after application changes or when auditing Vietnamese numbers, Syncfusion grids, document lifecycles, serials, stock, cash, reports, localization, or data-protection regressions.
---

# Inventory browser regression

Read `.agents/AGENTS.md` completely. Treat every business rule there as an assertion, not background information.

Before testing, inspect the changed production files and their callers, the changed tests, `package.json`, and Playwright discovery. Read [references/ui-risk-matrix.md](references/ui-risk-matrix.md): read the cross-cutting section plus every affected area; read the whole matrix when a shared number, date, dropdown, grid, serial, document, stock, or cash helper changed.

## Safety

- Use `npm.cmd run test:browser:isolated` for destructive setup and cleanup. It may create or drop only the database generated for that run with prefix `WHMS_UiRegression_`.
- Never target a development or production database. Never enable `IsDemoVersion=true` outside the disposable runner.
- Preserve failure trace, video, screenshot, browser errors, request failures, and HTTP errors. Promote success evidence only after every required gate passes.

## UI-first contract

Perform the behavior under test exactly as a user does with Playwright locators and keyboard actions: navigate from the menu, click, fill, type, select, add a row, edit a cell, apply a picker, save, reopen, resize, upload, or download.

Do not use `page.evaluate` or application internals to perform the behavior. In particular, do not:

- call Axios instead of submitting the form;
- invoke Vue methods, `editCell`, `toolbarClick`, `batchSave`, or Syncfusion `change` handlers;
- assign widget `.value`, call `.dataBind()`, replace `getSelectedRecords`, or mutate row/batch data;
- force a click through a real overlay or use a fallback that commits data for the application.

`page.evaluate` may read state after a real UI action. API/SQL may create only prerequisite data for which no UI exists, and may read back persisted/downstream state. Document lifecycle fixtures must be created through the UI. A separate forged-request test may verify a backend trust boundary, but it never counts as UI coverage.

Prefer observable waits (`expect`, `waitForResponse`, `waitForURL`, `expect.poll`) over sleeps. Do not make a flaky test pass by increasing delays.

## Proof chain for every business scenario

One green final response is insufficient. Assert the same expected value at every applicable boundary:

1. visible editor text while the cell is still active;
2. visible grid/modal state after the real blur, Tab, picker Apply, or immediate Update/Save action;
3. outgoing request payload and HTTP response;
4. persisted readback;
5. close/reopen or full-page reload rendered value;
6. exact downstream stock, serial, warranty, debt, cash transaction, and report effect.

For a rejected action, assert that nothing changed at boundaries 3-6 and that the Vietnamese message identifies the blocking object. Screenshots are evidence, not business assertions.

## Mandatory adversarial dimensions

Choose cases from every relevant dimension; one happy integer row is never enough:

- Number policy: Vietnamese `321.987,625`, `2,5`, six decimals, grouping-only `1.234`, zero, invalid negative, and an integer-only serial quantity. Distinguish money, decimal quantity, and integer fields.
- Product policy: non-physical, physical without serials, internal serial, and manufacturer serial.
- Grid identity: new keyless row, saved row, changed row, duplicate-looking rows, product switch, deleted/re-added row, and a picker callback after its original editor was destroyed.
- Timing: cold first load with delayed lookups, save while the last editor is active, Update immediately after Apply, modal close/reopen, repeated bind, rapid repeat action, refresh, and window resize.
- Lifecycle: Draft, Confirmed, Archived, restored Confirmed, Cancelled, repeated confirm/cancel, and blocked dependency.
- Cardinality/history: empty, one, multiple lines, multiple cost sources, same customer, legacy duplicates, unpaid and paid linked transactions.
- Locale/date: Vietnamese first, then language rebind where relevant; exact business dates near a UTC day boundary.

Use unique values for fixture identity, but deliberately create duplicate display values when testing Vue keys, dropdown wrappers, grouping, or row reuse.

## Lifecycle and data invariants

For every affected document form, drive this matrix through visible controls:

- Draft: create, save, reopen, edit, delete; no stock/accounting effect.
- Confirmed: confirm once; verify exact stock/serial/debt/report effects; direct header/item editing and deletion are blocked.
- Archived: archive and restore through the UI; header/items remain locked and effects remain identical to Confirmed.
- Cancelled: cancel once; all effects reverse; repeat is idempotent or explicitly rejected.
- Dependencies: invalid delete/cancel/source selection is blocked in UI and backend without partial mutation.

After each transition, compare header, every line, aggregate totals, stock by product/warehouse, serial status/location/history, cash/debt, and reports. Confirm/cancel must be atomic.

## Regression effectiveness

For an escaped or high-risk bug, first make the new test fail on the unfixed behavior. If the old revision cannot be run safely, inject one minimal equivalent mutation, run the narrow test, revert immediately, and restore a green tree. A regression test is accepted only if it kills the defect it names.

Before claiming the gate covers a scenario:

- run `npx.cmd playwright test --list` and confirm the file/test is discovered;
- inspect `package.json` and the isolated runner to confirm the test is executed;
- ensure the test name matches the route and behavior it actually visits;
- treat full-menu navigation and screenshots as smoke coverage only;
- fail on every unexpected functional defect, not only one severity label.

Never weaken an assertion, replace UI interaction with setup code, or add a fallback merely to turn the gate green.

## Execution order

1. Run the narrowest affected Playwright scenario.
2. Run `npm.cmd run test:js`.
3. Run `dotnet build Indotalent.sln --no-restore`.
4. Run `npm.cmd run test:browser:isolated`.

The full gate does not erase a known scenario gap. If a required case is absent, add the regression or report it as untested.

## Completion report

Never say “tested everything” or “no bugs.” Report:

- exact commands and results;
- routes, lifecycle states, data variants, and downstream assertions exercised;
- the escaped defect or mutation each new regression kills;
- artifacts for failures;
- anything skipped, untestable, or still covered only by smoke/static assertions.

The strongest valid conclusion is: “No failure was found in the following tested matrix.”
