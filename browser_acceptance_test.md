# Browser Acceptance Test Guide (Antigravity)

## 1. Mission and rules

Test the Inventory and Order Management application entirely through its browser UI. Do not edit source code, run SQL, seed data through APIs, or attempt to fix failures. Capture evidence and return a defect report.

- Test only a backed-up development database.
- Create and verify the database backup before the first application startup after this change; startup applies the compatibility schema upgrade and legacy-data backfill.
- Keep DevTools Console and Network panels open for the whole run.
- Use `E2E-{YYYYMMDD-HHmmss}` as the prefix for every record created.
- Record the visible Number and, when available in Network responses, the Id of every Vendor, Customer, Purchase Order, Material Export, Cash Transaction and Payment created.
- Remove authorization tokens, cookies and secrets from all copied request/response data.
- Mark every numbered step `PASS`, `FAIL` or `BLOCKED`.

## 2. Run information

Record before testing:

| Item | Value |
|---|---|
| Application URL | |
| Git commit | |
| Start time/timezone | |
| Browser/version | |
| Viewport | |
| Tester | Antigravity |
| Test-data prefix | |

Start the application and sign in with the configured development administrator account. Confirm access to Customers, Vendors, Products, Warehouses, Purchase Orders, Goods Receives, Material Exports, Cash Transactions and Vendor Debt Reports. Confirm at least two cash accounts exist; create them through the UI if missing.

## 3. Evidence format

For each failure record:

1. Scenario and exact failed step.
2. Minimal reproduction steps.
3. Expected result.
4. Actual result.
5. Screenshot or video timestamp.
6. Console message and stack trace.
7. Network method, URL, status and sanitized response body.
8. Created record Numbers/Ids involved.
9. Severity: `Critical`, `High`, `Medium` or `Low`.

Critical failures include incorrect stock, duplicate transactions, incorrect vendor debt, lost PaidAmount, or a partially committed confirmation.

## 4. Quick Add scenarios

Run each row separately. Before clicking Quick Add, enter a recognizable value in another field of the parent modal; it must remain unchanged after Quick Add closes.

| Step | Parent screen | Quick Add target | Expected result | Result |
|---|---|---|---|---|
| QA-01 | Customer | Customer Group | Popup opens; create succeeds; new group is refreshed and selected | |
| QA-02 | Customer | Customer Category | Popup opens; create succeeds; new category is refreshed and selected | |
| QA-03 | Vendor | Vendor Group | Popup opens; create succeeds; new group is refreshed and selected | |
| QA-04 | Vendor | Vendor Category | Popup opens; create succeeds; new category is refreshed and selected | |
| QA-05 | Purchase Order | Vendor | Full Vendor popup opens; new Vendor is selected in the PO | |
| QA-06 | Sales Order | Customer | Full Customer popup opens; new Customer is selected | |
| QA-07 | Material Export | Customer | Full Customer popup opens; new Customer is selected | |
| QA-08 | Customer Contact | Customer | New Customer is refreshed and selected | |
| QA-09 | Vendor Contact | Vendor | New Vendor is refreshed and selected | |
| QA-10 | Product | Product Group | New group is refreshed and selected | |
| QA-11 | Product | Warehouse | New warehouse is refreshed and selected | |

For every row capture: parent modal before click, Quick Add popup, and selected value after creation. A silent button, closed parent modal, lost parent values, unselected new record, Console error or failed request is a failure.

## 5. Purchase Order allocation

### 5.1 Prepare stock

1. Create Vendor `E2E-...-VENDOR` and Customers `E2E-...-CUSTOMER-A` and `E2E-...-CUSTOMER-B`.
2. Create or select a serial-tracked physical product and a normal warehouse.
3. Create a Purchase Order for quantity 4 with a clearly calculable total, for example total 400.
4. Confirm the PO and complete Goods Receive so four serials are `InStock` with UnitCost 100.
5. Record PO Number, Vendor and the four serial numbers.

### 5.2 Select customers and allocate

1. Open the confirmed PO and open Cost Allocation.
2. Edit the Customer cell using the dropdown; choose Customer A and allocate quantity 1.
3. Add a split row, use Quick Add or choose Customer B, and allocate quantity 1.
4. Save. Expect the remaining quantity 2 to be allocated automatically to Warehouse.
5. Open Cash Transactions and locate the PO source transaction.
6. Verify exactly one source transaction exists: Credit, Amount 400, PaidAmount 0, Unpaid, correct Vendor, no Customer, no Cash Account and no Cash Category.
7. Open it in view mode. Verify read-only allocation rows for Customer A = 1, Customer B = 1 and Warehouse = 2.
8. Reopen allocation, change Customer A quantity while still unpaid, and save.
9. Verify the CashTransaction Id/Number did not change and no second PO obligation was created.

### 5.3 Negative allocation checks

1. Try saving a positive allocation without Customer: expect UI validation and no request, or backend rejection.
2. Try allocating more than purchased quantity: expect rejection and unchanged data.
3. After the payment scenario below has recorded a partial payment, try reopening allocation: expect both UI and direct form submission to reject reallocation.

## 6. Payment, balances and vendor debt

1. Record starting balances of Cash Account A and Cash Account B.
2. Pay 30 on the test PO using Account A. Verify the popup distinguishes Total, Paid, Remaining and Payment This Time.
3. Verify parent obligation: Amount 400, PaidAmount 30, Remaining 370, Partially Paid, Cash Account A.
4. Open payment again. Verify Account A is selected and locked. Attempt a direct payment with Account B and expect HTTP 409 with no new history row.
5. Pay 20 using Account A. Verify PaidAmount 50 and Remaining 350.
6. Open the source Cash Transaction and verify two payment-history rows with the correct dates, Account A and amounts.
7. Verify Account A decreased by exactly 50 and Account B did not change. The unpaid 350 must not affect either balance.
8. Try payment 0, a negative value and a value above 350. Each must be rejected without creating payment history or changing balances.
9. Create a manual Vendor Credit Amount 10, PaidAmount 5 for the same Vendor.
10. Open Vendor Debt Report. For this isolated data, expected remaining debt contribution is PO 350 plus manual 5. If the PO test total was 100 instead, expected total is 75 as specified in the requirements.
11. Try editing/deleting the PO-generated Cash Transaction: expect read-only protection. Confirm a manual transaction remains editable/deletable.

## 7. Material Export

### 7.1 Prepare data

Use a warehouse/product combination with at least four `InStock` serials. Every serial must have UnitCost and a PurchaseOrderItem link. Record serial order by creation time and originating PO.

### 7.2 Draft and serial selection

1. Create a Draft Material Export with Warehouse and Customer.
2. Add line 1, select the product, open Serial Numbers and choose one explicit serial. Save quantity 1.
3. Add line 2 for the same product, leave Serial Numbers empty, and enter quantity 1; this requests FIFO at confirmation.
4. Edit line 1 and confirm its selected serial is still displayed.
5. Attempt to change Warehouse while lines exist. Expect rejection and the old Warehouse to remain selected.
6. Add or edit lines so their aggregate quantity exceeds available stock. Expect rejection even if each individual row is below stock.
7. Create another manually selected Draft line, delete it, and verify that serial becomes selectable/InStock again.

### 7.3 Confirmation and accounting

1. Confirm the Material Export once.
2. Verify the manually selected serial was exported and the FIFO line used the oldest eligible InStock serial.
3. Verify both serials have status Exported and no CurrentWarehouse.
4. Verify stock decreased by exactly 2 and the existing draft InventoryTransaction rows became Confirmed Out rows; no duplicate rows were created.
5. Group exported serial UnitCost by originating PO. For each PO verify exactly one paid Credit project-cost transaction; no Debit `Warehouse offset` transaction may be created.
6. Verify the Credit has the Material Export Customer, `Phân bổ công trình` category and description `Phân bổ công trình cho {CustomerName}`. Vendor and Cash Account must be empty.
7. Click Confirm rapidly twice or repeat the submit action. Expect the second attempt to fail safely and no duplicate inventory/cash transaction.
8. Attempt to edit or delete the confirmed document and its lines. Expect rejection.

### 7.4 Rollback checks

Using isolated test data, create a Draft export whose chosen serial has missing UnitCost or missing PO source. Confirm it and verify:

- Header remains Draft.
- Inventory lines remain Draft.
- Serial does not become Exported.
- Stock does not change.
- No Material Export CashTransaction is created.

## 8. Localization

1. Select English and reload. Check navigation, labels, grids, dropdowns, statuses, placeholders, Quick Add, allocation, Serial Picker, payment popup/history and Swal messages.
2. Record every Vietnamese UI string still visible in English mode. User-entered business data is excluded.
3. Switch to Vietnamese without reload and reopen all dynamic UI listed above. Check that English UI strings are translated.
4. Switch back to English without reload. Verify Vietnamese strings do not remain and text is not progressively corrupted.
5. Repeat EN → VI → EN three times while a modal and dropdown are open.
6. Capture the same Purchase Order, Material Export and Cash Transaction views in both languages.

## 9. Final report

Return:

1. A summary table with scenario, Passed, Failed and Blocked counts.
2. Defects ordered Critical → High → Medium → Low.
3. Links/paths to screenshots and recordings.
4. Sanitized Console and Network evidence.
5. A table of all `E2E-...` records created so they can be cleaned up.
6. Explicit confirmation whether stock, cash balances, vendor debt, PaidAmount and duplicate protection reconciled exactly.

## 10. Mandatory runtime regression pass

Run this section first when verifying the August 2026 runtime fixes. Do not use the current `WHMS` database for write tests; restore its verified backup as `WHMS_CodexTest` or use another disposable development clone.

| Step | Action | Expected result | Result |
|---|---|---|---|
| RR-01 | Open DevTools Network, then open Material Export List | `/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml.js` returns 200; there is no request to `/Pages/MaterialExports/MaterialExportList.cshtml.js` | |
| RR-02 | Wait for Material Export List to initialize | `#app` no longer has `v-cloak`, Main Grid is visible, and Console contains no initialization error | |
| RR-03 | Allocate a confirmed PO that has a Vendor but no existing PO CashTransaction | Request returns HTTP 200, no optimistic-concurrency message appears, and exactly one Unpaid Credit obligation is created | |
| RR-04 | Inspect the new PO obligation | Vendor matches the PO; Cash Account and Customer are empty; Cash Category is `Mua hàng`; Amount equals PO total; PaidAmount is zero | |
| RR-05 | Reallocate the still-unpaid PO | HTTP 200; the CashTransaction Id/Number remains unchanged and the obligation count stays one | |
| RR-06 | Try to pay a confirmed PO that has never been allocated | UI explains that allocation is required; a direct submit returns HTTP 409; no success message appears | |
| RR-07 | Pay 30 and then 20 from Account A; try Account B between the two payments | Parent PaidAmount becomes 50; history has two Account A rows; Account A falls by 50; Account B is rejected and unchanged | |
| RR-08 | Reallocate that partially paid PO | UI blocks the action and the backend returns HTTP 409 without changing allocation, inventory or obligation | |
| RR-09 | Open Vendor Debt Report for Yueqing Nova using the supplied development snapshot | Total PO is 44,892,000; Paid is 12,341,231; Remaining is 32,550,769 | |
| RR-10 | Open a PO/SO item modal | `Add Warehouse` is on the grid toolbar beside Add/Edit/Delete/Update/Cancel; no Quick Add item is inside the Warehouse dropdown | |
| RR-11 | Click `Add Warehouse`, then Cancel without saving | Parent modal and edited values remain; toolbar button remains; Warehouse dropdown opens and can select normally | |
| RR-12 | Open PO Cost Allocation | `Add Customer` is on the allocation toolbar beside Add Split Row/Delete; Customer dropdown contains business records only, not a Quick Add footer | |
| RR-13 | Click allocation `Add Customer`, then Cancel | Allocation modal remains open, batch edits remain intact, and the Customer editor is still usable | |
| RR-14 | In Cash Transaction Add, type `100000000` into Amount without leaving the field | The display changes live through grouped values and ends at `100.000.000`; the component value remains numeric `100000000` | |
| RR-15 | Focus and blur Amount and Paid Amount repeatedly in an existing transaction | Values remain visible and unchanged; neither field becomes blank | |
| RR-16 | Repeat RR-14 on Product Cost Price, Product Unit Price, Cash Account Initial Balance and one editable money grid cell | Every field groups thousands while typing and saves the ungrouped numeric value | |
| RR-17 | Open PO payment after its first installment | The parent Cash Account box shows the chosen account; the payment popup shows the same locked account; history remains installment-only | |
| RR-18 | On PO and Cash Transaction screens switch EN → VI → EN while the payment/modal UI is open | Labels, grids, statuses, placeholders, validation and Swal content fully follow the selected language; business-entered names are unchanged | |
| RR-19 | View a PO-generated Cash Transaction that has allocation and payment rows | Both Cost Allocation Details and Payment History show the database rows; `Customer / Warehouse` and `Warehouse` follow the selected language | |
| RR-20 | Close the Cash Transaction View modal with the header X and footer Close buttons | The main Cash Transaction grid remains visible, populated and interactive; Console has no Vue render error | |
| RR-21 | Edit a PO/SO-generated Cash Transaction | Only Paid Amount, Description and Cash Category are enabled; changing Paid Amount adds a visible adjustment history row and recalculates the selected account once | |
| RR-22 | Open View on PO, SO and another document module, then click every input/dropdown/grid editor | Every form control is disabled/read-only; closing View restores controls for the next Add/Edit modal | |
| RR-23 | Open Vendor Debt Report | The report contains only confirmed-PO obligation, paid and remaining debt columns; manual cash transactions are not included | |
| RR-24 | Switch to Vietnamese and open View Purchase Order | The modal title reads `Xem Đơn Mua Hàng`; no `View Purchase Order` or `Customer / Warehouse` text remains | |
| RR-25 | Open Cash Transaction and inspect the initial sort on grids that contain Created At | Created At is sorted Descending before any user action; the newest record is first | |
| RR-26 | Edit either Debit or Credit generated by a Material Export | Only Description and Cash Category are enabled; Cash Account and Paid Amount are disabled and Cash Account is not required when saving | |
| RR-27 | Pay one confirmed SO in full, reload the SO list and Cash Transaction list | Payment status is Paid; exactly one Debit transaction is linked to the SO and Paid Amount equals the SO total | |
| RR-28 | Reopen the paid SO, change its Cash Account and save | The CashTransaction Id/Number and row count stay unchanged; the old account loses the receipt and the new account receives it exactly once | |
| RR-29 | Open the SO payment popup in EN and VI | The popup shows separate Order Total, Paid and Remaining cards, live-formatted Paid Amount, one Cash Account selector and a Description box without mixed-language UI | |
| RR-30 | Search Warranty Lookup and inspect Sold Date, Warranty End, Supplier Warranty End and Movement Date | Dates show `dd/MM/yyyy`; movement timestamp uses Vietnam time and no `GMT+0700`, `Indochina Time` or raw JavaScript Date appears | |
| RR-31 | Select a serial, then click each supported Movement History row | A new tab opens the actual source module and automatically opens that exact record in View mode (not the parent PO/SO substitute) | |
| RR-32 | Log out, log in again, and open `/` while authenticated | Both routes land on Operations Overview; seven current KPI cards and the three recent-activity grids render without Console/API errors | |
| RR-33 | Open Cash Transaction List | The transaction grid is visible and still grouped/aggregated; the three page-level cards Total Debit, Total Credit and Total Balance do not exist | |
| RR-34 | Confirm a Material Export containing serial cost 30 from one source PO | Exactly one active Credit is created with Amount/PaidAmount 30, Customer from the export, category `Phân bổ công trình`, description `Phân bổ công trình cho {CustomerName}`, and empty Vendor/Cash Account | |
| RR-35 | Inspect Cash Transactions and Cash Account balances after RR-34 | There is no active Debit whose description starts `Warehouse offset - Material export`; every Cash Account balance is unchanged | |
| RR-36 | Confirm the same Material Export a second time or double-click Confirm | The second operation is rejected safely; the export stays Confirmed and the project-cost transaction count remains one per source PO | |
| RR-37 | Open Customer Profit Report and select the RR-34 customer | Only Customer-linked paid transactions appear; no Vendor transaction with the same name is merged into the report | |
| RR-38 | For one customer with actual receipts 40 and Material Export project costs 30 | Summary and grid totals show Actual Received 40, Project Cost 30 and Profit 10 | |
| RR-39 | On Dashboard, verify normal loading and then rerun while blocking exactly one `/api/Dashboard/*` request in DevTools | Normal run removes `v-cloak`; blocked panel shows Retry while all other successful cards/grids remain visible | |
| RR-40 | Hard reload Dashboard twice with Disable cache turned off | Dashboard script URL contains a version query, returns 200, and no stale blank page or boot-error panel appears | |
| RR-41 | Switch EN → VI → EN on Dashboard, Cash Transaction List and Customer Profit Report | All static/dynamic labels, Retry buttons, grid columns and summaries follow the selected language; business data remains unchanged | |
| RR-42 | Open Customer Profit Report after a normal reload with browser cache enabled | The filter label is `Partner`/`Đối Tác`, the Partner dropdown renders, and Actual Received, Project Cost and Profit all contain formatted numbers | |
| RR-43 | In Stock Report note the available quantity for one serial-tracked product/batch, then select the same warehouse/product/batch in a new SO line | `SL còn lại` equals the Stock Report quantity exactly; it must not show the original inbound quantity when sold/exported serials no longer remain | |
| RR-44 | Select serials in the SO line until reaching the displayed available quantity, then try one additional serial | The displayed quantity can be reserved; the additional serial is rejected by both UI and backend without changing stock | |
| RR-45 | Inspect the newly reseeded demo database before modifying data | There are 8 customers, 6 vendors, 4 physical warehouses, 18 products, 18 POs, 13 SOs, 4 confirmed Material Exports and no negative stock group or duplicate internal serial | |

For RR-03 through RR-08 and RR-27 through RR-28, record request URL, HTTP status, sanitized response body, source document Id and CashTransaction Id before and after the action. Treat an error envelope with HTTP 200, a success toast after a failed request, or a changed transaction Id during an in-place update as High severity. Treat duplicate obligations/payments, lost PaidAmount or partial commits as Critical.
