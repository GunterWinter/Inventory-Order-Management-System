const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('debt and inventory transaction report grids declare real date columns', () => {
    const debt = read('Presentation/ASPNET/FrontEnd/Pages/VendorDebtReports/VendorDebtReportList.cshtml.js');
    const inventory = read('Presentation/ASPNET/FrontEnd/Pages/TransactionReports/TransactionReportList.cshtml.js');

    assert.match(debt, /field: 'documentDate'[\s\S]{0,100}type: 'date'[\s\S]{0,80}format: 'yyyy-MM-dd'/);
    assert.match(inventory, /field: 'movementDate'[\s\S]{0,100}type: 'date'[\s\S]{0,80}format: 'yyyy-MM-dd'/);
    assert.match(inventory, /field: 'createdAtUtc'[\s\S]{0,100}type: 'date'[\s\S]{0,80}format: 'yyyy-MM-dd HH:mm'/);
});
