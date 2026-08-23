# Test implementation plan

1. Extend Node tests for lookup display resolution, row-selection decisions, locale numeric parsing/formatting, workbook example sheets, and localized strings.
2. Extend browser gates for Sales Order available stock/GUID regression, cumulative cash payment with required account/date and multiple accounts, stale-selection/multi-delete, future-date confirmation, localized template/export, and real PDF validation.
3. Use API calls only to seed and verify isolated fixtures; all behavior under test is performed through UI controls.
4. Run focused Node tests during implementation, then the complete JavaScript suite, full .NET build, and isolated browser suite.
5. Re-read assertions against every acceptance item and record the final quality audit in `.testagent/status.md`.
