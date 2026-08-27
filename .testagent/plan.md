# Test plan: FIFO inventory costing

1. [complete] Guard production data and repair nested-type DI registration.
2. [complete] Persist FIFO/source allocations and implement document-date costing with deterministic decimal behavior.
3. [complete] Implement opening-date, serial-cost, Material Export, Sales Order, and Sales Return UI workflows.
4. [complete] Make inventory-profit reports consume frozen COGS/return allocations.
5. [complete] Add focused JavaScript and isolated Playwright regressions for affected direct callers and lifecycle paths.
6. [complete] Run JavaScript, build, isolated browser, and publish asset checks; IIS Express runtime smoke is unavailable because IIS Express is not installed.
7. [complete] Run production dry-run, explicitly authorized atomic apply, and post-apply read-only verification.
