---
name: inventory-browser-regression
description: Run UI-first browser, lifecycle, boundary, and regression testing for this inventory system against disposable fake data. Use after any application code change, especially JavaScript, UI, localization, reports, document forms, stock, cash, or shared managers.
---

# Inventory browser regression

Read `.agents/AGENTS.md` completely and treat its business rules as assertions.

## Safety boundary

- Run `npm.cmd run test:browser:isolated`; it alone owns destructive setup and cleanup.
- Only create or drop the exact database generated for the current run with prefix `WHMS_UiRegression_`.
- Never point the runner at a development or production database. Never enable `IsDemoVersion=true` outside the disposable runner.
- Use fake data freely inside that disposable database. Exercise empty, zero, negative, decimal, maximum-length, duplicate, rapid Enter/click, refresh, retry, cancel, and repeated-action boundaries.

## UI-first contract

- Perform the behavior under test with visible Playwright locators: click, fill, select, keyboard, upload, download, and modal actions.
- Do not call an API, invoke a Vue method, replace grid selection, or execute a grid toolbar handler instead of the user's UI action.
- API/SQL may only read back persisted state after the UI action. Fixture creation through API is allowed only when no user UI exists; document lifecycle fixtures must use the UI.
- Capture a screenshot at the failure point. The full gate must visit every authorized sidebar leaf page and reject JavaScript errors, failed same-origin requests, HTTP 4xx/5xx, `Invalid Date`, `[object Object]`, hidden content, and duplicate visible controls.

## Required lifecycle matrix

For each changed document form, verify through the UI:

- Draft: create, save, reopen, edit, delete; no stock/accounting effect.
- Confirmed: confirm once, verify exact stock/serial/debt/report effect, and verify direct item editing/deletion is blocked.
- Cancelled: cancel once, verify every effect is reversed; repeat the action and verify idempotency or an explicit rejection.
- Archived: archive and restore through visible controls; business effects stay identical to Confirmed while archived.
- Dependencies: attempt invalid cancel/delete and assert the message names the blocking document, product, serial, warehouse, or quantity.

Run the directly affected Playwright test first, then `npm.cmd run test:js`, `dotnet build Indotalent.sln --no-restore`, and finally `npm.cmd run test:browser:isolated`. A pass requires exact rendered, request, response, persisted, and downstream report assertions. Never weaken an assertion or add a fallback to make a test green.

The isolated runner keeps failure artifacts and promotes screenshots to `artifacts/browser-regression/latest` only after every gate succeeds.
