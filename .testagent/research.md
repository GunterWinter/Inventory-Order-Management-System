# Test research

Date: 2026-08-25

- Scope: Purchase Order Enter isolation, Cash Transaction allocation control/decimal input, Dashboard locale dates, and UI-first full-menu/lifecycle regression.
- Root causes under test: shared grid Enter propagation through passive SweetAlert, unstable Vue allocation row keys plus incompletely hidden native selects, allocation input bypassing `NumberFormatManager`, and a Dashboard date column reparsing already-formatted text.
- Runtime: Node `node:test`, Playwright, ASP.NET Core build/publish, and a disposable SQL database runner. Production/development databases are forbidden.
- Required static source/test pairing was run once. It is unavailable because `tree-sitter-language-pack` is not installed; no parser dependency is added because executable browser and unit checks are authoritative for this change.
- Existing Antigravity status/evidence is stale and must not be treated as acceptance evidence.

## Acceptance checklist

- A passive PO validation warning consumes Enter, closes only the warning, keeps the PO modal open, restores the invalid editor, and sends no item request.
- Interactive Quick Add still owns Enter and never saves the unfinished parent batch.
- Each allocation row has one visible searchable customer/project control; adding/removing rows preserves independent selections.
- Allocation amounts accept and preserve Vietnamese decimal input up to six fractional digits and totals/payload use the parsed decimal value.
- Dashboard recent sales and purchase dates render in the active locale and never show `Invalid Date` or weekday-formatted strings.
- Browser regression navigates the real UI, records screenshots, checks all visible menu pages and document lifecycle states, and only uses API calls for read-only verification.
- The isolated runner uses `WHMS_UiRegression_*`, sets `IsDemoVersion=true`, cleans up in `finally`, and promotes screenshots only after a successful run.
- `docs/ANTIGRAVITY_BROWSER_TEST_GUIDE.md` and the API-heavy Antigravity chaos entrypoint are removed.
