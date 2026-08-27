const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('cash category report starts from every active category and keeps zero totals', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/CashTransactionManager/Queries/GetCashCategorySummary.cs'), 'utf8');

    assert.match(source, /Set<CashCategory>\(\)[\s\S]{0,100}ApplyIsDeletedFilter\(false\)/);
    assert.match(source, /categories\.Select\(category/);
    assert.match(source, /ReceiptAmount = activities[\s\S]{0,180}ExpenseAmount = activities/);
});
