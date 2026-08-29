const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('confirmed purchase and sales returns create opposite debt adjustments and cancellation requires net-zero refunds', () => {
    const service = read('Core/Application/Features/CashTransactionManager/ReturnFinancialService.cs');
    const purchase = read('Core/Application/Features/PurchaseReturnManager/Commands/UpdatePurchaseReturn.cs');
    const sales = read('Core/Application/Features/SalesReturnManager/Commands/UpdateSalesReturn.cs');

    assert.match(service, /nameof\(PurchaseReturn\)[\s\S]{0,500}CashTransactionType\.Debit/);
    assert.match(service, /nameof\(SalesReturn\)[\s\S]{0,500}CashTransactionType\.Credit/);
    assert.match(service, /nextAmount - previousAmount/);
    assert.match(service, /Math\.Abs\(netPaid\) > 0\.000001m/);
    assert.match(purchase, /EnsureCanDeactivateAsync\(nameof\(PurchaseReturn\)/);
    assert.match(sales, /EnsureCanDeactivateAsync\(nameof\(SalesReturn\)/);
    assert.match(sales, /ValidateSalesReturnReversalAsync/);
});

test('return debt adjustments flow into debt reports and dashboard balances with refund signs', () => {
    const debt = read('Core/Application/Features/CashTransactionManager/Queries/GetDebtReport.cs');
    const dashboard = read('Core/Application/Features/DashboardManager/Queries/GetCardsDashboard.cs');

    assert.match(debt, /nameof\(PurchaseReturn\), -1/);
    assert.match(debt, /nameof\(SalesReturn\), -1/);
    assert.match(dashboard, /salesReturnAmount/);
    assert.match(dashboard, /purchaseReturnAmount/);
    assert.match(dashboard, /CustomerCredit/);
    assert.match(dashboard, /VendorCredit/);
});

test('non-draft return and inventory documents cannot be hard-deleted', () => {
    for (const file of [
        'Core/Application/Features/PurchaseReturnManager/Commands/DeletePurchaseReturn.cs',
        'Core/Application/Features/SalesReturnManager/Commands/DeleteSalesReturn.cs',
        'Core/Application/Features/TransferOutManager/Commands/DeleteTransferOut.cs',
        'Core/Application/Features/TransferInManager/Commands/DeleteTransferIn.cs',
        'Core/Application/Features/ScrappingManager/Commands/DeleteScrapping.cs'
    ]) {
        assert.match(read(file), /Status[^\n]*Draft|Draft[^\n]*Status/, file);
    }
});
