const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pagesRoot = path.resolve(__dirname, '../../Presentation/ASPNET/FrontEnd/Pages');

function collectPageScripts(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectPageScripts(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

test('menu page scripts do not bypass the Vietnamese number manager', () => {
    const violations = [];
    collectPageScripts(pagesRoot).forEach(file => {
        const source = fs.readFileSync(file, 'utf8');
        const relative = path.relative(pagesRoot, file);
        if (/Intl\.NumberFormat\(\s*['"]en-US['"]/.test(source)) violations.push(`${relative}: en-US number format`);
        if (/\.toLocaleString\(/.test(source)) violations.push(`${relative}: direct toLocaleString`);
        if (/\.toFixed\(/.test(source)) violations.push(`${relative}: direct toFixed`);
        if (/parseFloat\(/.test(source)) violations.push(`${relative}: direct parseFloat`);
    });

    assert.deepEqual(violations, []);
});

test('purchase and sales editors explicitly preserve Vietnamese decimal values', () => {
    const purchase = fs.readFileSync(path.join(pagesRoot, 'PurchaseOrders/PurchaseOrderList.cshtml.js'), 'utf8');
    const sales = fs.readFileSync(path.join(pagesRoot, 'SalesOrders/SalesOrderList.cshtml.js'), 'utf8');

    for (const source of [purchase, sales]) {
        assert.match(source, /numericKind:\s*'money'/);
        assert.match(source, /format:\s*'n6'/);
        assert.match(source, /decimals:\s*6/);
        assert.match(source, /NumberFormatManager\.parseLocaleNumber\(/);
        assert.match(source, /NumberFormatManager\.readNumericTextBoxValue\(priceObj\)/);
        assert.doesNotMatch(source, /priceEditorValue\s*=\s*Number\(priceEditorValue\s*\?\?/);
    }
});

test('material export persists six-decimal FIFO summary and exact slice total', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs'), 'utf8');

    assert.match(source, /ResolveFifoAsync\(\s*line\.ProductId,\s*entity\.WarehouseId,\s*movement,\s*entity\.ExportDate,\s*line\.Id,\s*ct\)/s);
    assert.match(source, /line\.UnitCost\s*=\s*costResolution\.UnitCost/);
    assert.match(source, /totalProjectCost\s*\+=\s*costResolution\.TotalCost/);
    assert.match(source, /ReplaceFifoCostAllocationsAsync\([\s\S]{0,180}costResolution\.Slices/);
});

test('purchase return carries the source product serial policy instead of forcing serial tracking', () => {
    const source = fs.readFileSync(path.join(pagesRoot, 'PurchaseReturns/PurchaseReturnList.cshtml.js'), 'utf8');

    assert.match(source, /physical:\s*item\.physical\s*===\s*true/);
    assert.match(source, /serialTrackingMode:\s*Number\(item\.serialTrackingMode\s*\?\?\s*0\)/);
    assert.doesNotMatch(source, /physical:\s*true,\s*\r?\n\s*serialTrackingMode:\s*1/);
});

test('document quantity editors read the latest locale value through the shared manager', () => {
    const files = [
        'PurchaseOrders/PurchaseOrderList.cshtml.js',
        'SalesOrders/SalesOrderList.cshtml.js',
        'PurchaseReturns/PurchaseReturnList.cshtml.js',
        'SalesReturns/SalesReturnList.cshtml.js',
        'MaterialExports/MaterialExportList.cshtml.js',
        'Scrappings/ScrappingList.cshtml.js',
        'StockCounts/StockCountList.cshtml.js',
        'TransferIns/TransferInList.cshtml.js',
        'TransferOuts/TransferOutList.cshtml.js'
    ];

    for (const file of files) {
        const source = fs.readFileSync(path.join(pagesRoot, file), 'utf8');
        assert.match(source, /NumberFormatManager\.readNumericTextBoxValue\(/, file);
    }
});

test('inventory movement editors distinguish serial integers from non-serial decimals', () => {
    for (const file of [
        'MaterialExports/MaterialExportList.cshtml.js',
        'Scrappings/ScrappingList.cshtml.js',
        'StockCounts/StockCountList.cshtml.js',
        'TransferIns/TransferInList.cshtml.js',
        'TransferOuts/TransferOutList.cshtml.js'
    ]) {
        const source = fs.readFileSync(path.join(pagesRoot, file), 'utf8');
        assert.match(source, /numericKind:\s*serialTracked\s*\?\s*'integer'\s*:\s*'decimal'/, file);
        assert.match(source, /decimals:\s*serialTracked\s*\?\s*0\s*:\s*6/, file);
    }
});
