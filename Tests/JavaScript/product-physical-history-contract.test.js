const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('product physical and serial mode cannot change after purchase or sales document history', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/ProductManager/ProductOpeningStockService.cs'), 'utf8');

    assert.match(source, /_purchaseOrderItemRepository[\s\S]{0,160}ProductId == productId/);
    assert.match(source, /_salesOrderItemRepository[\s\S]{0,160}ProductId == productId/);
});
