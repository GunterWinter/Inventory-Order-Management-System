---
name: inventory-browser-regression
description: Test only the UI routes and downstream effects actually impacted by changed code in this inventory system. Trace shared helper callers before selecting narrow browser scenarios; do not expand into unrelated modules.
---

# Inventory Browser Regression

Read `.agents/AGENTS.md` completely before acting. This skill narrows regression scope; it does not waive any repository-mandated verification gate.

## Build an impact map first

Before changing, adding, or running tests:

1. Inspect the diff and identify the exact behavior, branch, contract, or symbol that changed.
2. Search for every direct caller of each changed shared symbol with `rg`.
3. Map each executable caller to its real page, route, user action, endpoint, and existing test.
4. Select the smallest UI scenarios that exercise the changed behavior through those callers.

The changed file alone does not define the test scope. The executable caller chain does.

For a shared JavaScript or `lib` helper, do not test the whole application merely because the file is widely available. Search for the exact changed function, class method, event, option, or exported contract and test only callers that can execute the changed path.

Example: after changing `GridInteractionManager.syncBatchRowValues` in `grid-interaction-manager.js`, start with:

```powershell
rg -n "GridInteractionManager\.syncBatchRowValues|syncBatchRowValues" Presentation Tests
```

If the results include `PurchaseOrderList.cshtml.js`, test the relevant Purchase Order UI interaction. Repeat for every other actual caller returned by the search. Verify the changed batch-row behavior from the visible editor through the rendered row and, where that caller persists data, through its request/persistence/reload boundary.

Do not automatically add cash, report, serial, stock, document-lifecycle, or other module scenarios. Include a downstream effect only when the changed caller path actually produces that effect.

## Keep the scope bounded

- For page-specific code, test that page's affected action and its direct result.
- For a shared helper, test every direct caller that executes the changed branch, not pages that merely load the shared file.
- For backend code, identify its direct endpoint/service callers and test the affected UI path. Follow downstream data only when the changed mutation affects it.
- For formatting, localization, grid, date, number, or dropdown changes, test only the affected pages and the relevant input/display boundary.
- For test-only changes, verify the changed test contract; do not use them as permission to change unrelated production behavior.

If an unrelated pre-existing defect appears:

1. Preserve the error, trace, screenshot, video, and route needed to reproduce it.
2. Report it separately as outside the impact map.
3. Do not edit unrelated production code, test assertions, seed data, or fallback behavior to make the current task green.
4. Ask the user before expanding the implementation or regression scope when that defect blocks proof of the requested change.

## Select only relevant risk guidance

Read the cross-cutting assertions and only the affected sections of `references/ui-risk-matrix.md` identified by the impact map. A shared helper change does not by itself justify reading or testing the entire matrix.

Apply only adversarial dimensions tied to the changed contract, for example:

- Vietnamese parsing and formatting only when the changed path handles numbers or dates.
- Batch add/edit/delete/save only when the changed grid behavior participates in those actions.
- Dropdown identity and reload only when the changed path reads or writes dropdown values.
- Serial uniqueness only when the affected caller handles serial-controlled products.
- Confirm/cancel/reconfirm only when the changed code participates in document transitions.
- Stock, cash, reports, or ledger effects only when they are direct consequences of the affected operation.

Do not create a broad feature checklist unrelated to the diff.

## Protect real data

- Use only the isolated browser runner and its disposable database for mutating scenarios.
- Never run mutating browser tests against production, shared development, or an environment selected only by a convenient URL.
- Read-only production investigation requires explicit user authorization and must remain read-only.
- Keep failure artifacts; do not delete evidence before reporting.

## Exercise the real UI contract

Drive the affected behavior through visible user actions: navigate, click, type, choose, add, edit, delete, confirm, cancel, reload, and reopen as applicable.

- Use `page.evaluate` only for observation or diagnostics, never to perform the business action under test.
- Use direct API or database setup only when no UI setup path exists; explain why and keep it outside the assertion path.
- Wait for observable state such as a response, dialog, spinner transition, grid update, or persisted reload. Do not use fixed sleeps as proof.
- Assert the localized UI value and the canonical value at each boundary relevant to the changed path.

For a persisted edit, the useful proof chain is:

```text
visible editor -> rendered row -> batch record/request -> server binding -> stored value -> reload/reopen
```

Use only the boundaries that exist in the impacted caller. Do not manufacture downstream checks for unrelated subsystems.

## Run narrow verification

Run verification in this order:

1. List the changed symbols, direct callers, mapped routes, and selected scenarios.
2. Run the smallest isolated Playwright file or `-PlaywrightGrep` selection covering every impacted UI caller.
3. Run targeted JavaScript or unit tests that exercise the changed helper or contract when available.
4. Run broader build or test commands only when `.agents/AGENTS.md` explicitly requires them for this change type, the user requests a wider gate, or the impact map is genuinely unbounded.
5. Run the full isolated browser suite only for an explicit full-regression/release request or when no defensible narrower caller set exists.

A mandatory broad gate is a verification result, not authorization to investigate or fix unrelated failures. Record unrelated failures and leave them untouched.

## Report completion

Report:

- The changed behavior or symbols used to define scope.
- Every direct caller found and its mapped UI route.
- Which callers and user actions were tested.
- Any caller not tested and the concrete reason.
- Commands run and results.
- Relevant persistence or downstream evidence.
- Unrelated failures observed but deliberately not modified.

Do not claim coverage for a page, caller, or downstream subsystem that was not exercised.
