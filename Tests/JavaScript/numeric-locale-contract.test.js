const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pagesRoot = path.resolve(__dirname, '../../Presentation/ASPNET/FrontEnd/Pages');

function collectPageScripts(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collectPageScripts(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

function collectNumericTextBoxOptions(source) {
    const marker = 'new ej.inputs.NumericTextBox(';
    const blocks = [];
    let start = source.indexOf(marker);
    while (start >= 0) {
        const append = source.indexOf('.appendTo(', start);
        blocks.push(source.slice(start, append >= 0 ? append : start + 2000));
        start = source.indexOf(marker, start + marker.length);
    }
    return blocks;
}

function loadUiLocalization() {
    const window = { navigator: { language: 'vi-VN' } };
    const document = { title: '', readyState: 'loading', addEventListener() { } };
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/ui-localization.js'), 'utf8');
    vm.runInNewContext(source, { window, document });
    return window.UiLocalization;
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

test('purchase and sales editors keep six-decimal money values and six-decimal quantities', () => {
    const purchase = fs.readFileSync(path.join(pagesRoot, 'PurchaseOrders/PurchaseOrderList.cshtml.js'), 'utf8');
    const sales = fs.readFileSync(path.join(pagesRoot, 'SalesOrders/SalesOrderList.cshtml.js'), 'utf8');

    for (const source of [purchase, sales]) {
        assert.match(source, /numericKind:\s*'money'/);
        assert.match(source, /NumberFormatManager\.roundMoney\(/);
        assert.match(source, /numericKind:\s*isSerialTrackedProduct[\s\S]{0,100}'decimal'/);
        assert.match(source, /decimals:\s*isSerialTrackedProduct[\s\S]{0,100}:\s*6/);
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
    assert.match(source, /ReplaceFifoCostAllocationsAsync\([\s\S]{0,180}costResolution\.Slices/);
});

test('every application NumericTextBox declares its money decimal or integer policy', () => {
    const violations = [];
    collectPageScripts(pagesRoot).forEach(file => {
        const source = fs.readFileSync(file, 'utf8');
        collectNumericTextBoxOptions(source).forEach((block, index) => {
            if (!/numericKind\s*:/.test(block)) {
                violations.push(`${path.relative(pagesRoot, file)} NumericTextBox #${index + 1}`);
            }
            if (/numericKind\s*:\s*['"]money['"]/.test(block) && !/decimals\s*:\s*6/.test(block)) {
                violations.push(`${path.relative(pagesRoot, file)} money NumericTextBox #${index + 1} is not six-decimal`);
            }
        });
    });

    assert.deepEqual(violations, []);
});

test('purchase cost allocation preserves decimal quantities and source pre-tax money', () => {
    const source = fs.readFileSync(path.join(pagesRoot, 'PurchaseOrders/PurchaseOrderList.cshtml.js'), 'utf8');
    const allocationStart = source.indexOf("field: 'allocateQuantity'");
    const allocationEnd = source.indexOf('cellSave:', allocationStart);
    const allocation = source.slice(allocationStart, allocationEnd);

    assert.match(allocation, /numericKind:\s*isSerialTrackedProduct\(args\.rowData\.productId\)\s*\?\s*'integer'\s*:\s*'decimal'/);
    assert.match(allocation, /NumberFormatManager\.readNumericTextBoxValue\(allocQtyObj\)/);
    assert.match(allocation, /field:\s*'allocateUnitPrice'[\s\S]{0,220}numericKind:\s*'money'[\s\S]{0,120}allowEditing:\s*false/);
    assert.match(allocation, /field:\s*'allocateTotal'[\s\S]{0,180}numericKind:\s*'money'/);
    assert.match(source, /allocateUnitPrice:\s*(?:poItem|item)\?\.unitPrice\s*\?\?\s*alloc\.unitPrice|allocateUnitPrice:\s*item\.unitPrice\s*\?\?\s*0/);
    assert.doesNotMatch(source, /afterTaxAmount[\s\S]{0,100}quantity[\s\S]{0,100}allocateUnitPrice/);
});

test('all purchase allocation errors and actions are localized without changing English mode', () => {
    const localizationSource = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/ui-localization.js'), 'utf8');
    const backendSource = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/PurchaseOrderManager/Commands/AllocatePurchaseOrderCosts.cs'), 'utf8');
    const localization = loadUiLocalization();
    const paidWarning = 'A partially or fully paid purchase order cannot be reallocated.';

    assert.equal(localization.translateText(paidWarning), 'Không thể phân bổ lại đơn mua hàng đã thanh toán một phần hoặc toàn bộ.');
    assert.equal(localization.translateText(paidWarning, 'en'), paidWarning);
    assert.equal(localization.translateText('Processing...'), 'Đang xử lý...');
    assert.equal(localization.translateText('Open Cash Transactions'), 'Mở Giao Dịch Thu Chi');

    const staticErrors = [...backendSource.matchAll(/InvalidOperationException\(\s*"([^"]+)"/g)]
        .map(match => match[1]);
    assert.ok(staticErrors.length >= 7);
    staticErrors.forEach(message => assert.notEqual(localization.translateText(message), message, message));
    assert.equal(localization.translateText('Purchase order was not found: PO-001'), 'Không tìm thấy đơn mua hàng: PO-001');
    assert.equal(localization.translateText('Allocated quantity exceeds purchased quantity for Dây điện.'), 'Số lượng phân bổ vượt quá số lượng đã mua của Dây điện.');
    assert.equal(localization.translateText('Not enough in-stock serials for Máy khoan.'), 'Không đủ serial đang tồn kho cho Máy khoan.');
    assert.match(localizationSource, /'Open Cash Transactions\?':\s*'Mở Giao Dịch Thu Chi\?'/);
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

test('Quick Add keeps Vietnamese grouped money visible and sends a parsed canonical number', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/quick-add-helper.js'), 'utf8');

    assert.match(source, /id="qa-p-costprice"[^>]*type="text"[^>]*inputmode="decimal"[^>]*data-number-format="true"[^>]*data-numeric-kind="money"/);
    assert.match(source, /id="qa-p-unitprice"[^>]*type="text"[^>]*inputmode="decimal"[^>]*data-number-format="true"[^>]*data-numeric-kind="money"/);
    assert.match(source, /costPriceRaw[\s\S]{0,200}NumberFormatManager\.readInputValue\(costPriceInput\)/);
    assert.match(source, /unitPriceRaw[\s\S]{0,200}NumberFormatManager\.readInputValue\(unitPriceInput\)/);
    assert.match(source, /formatMoneyToLocale\(parsed\)/);
    assert.doesNotMatch(source, /id="qa-p-(?:costprice|unitprice)"[^>]*type="number"/);
});

test('database calculations retain six decimals while money rendering stays at two', () => {
    const accountingMath = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Domain/Common/AccountingMath.cs'), 'utf8');
    const dataContext = fs.readFileSync(path.resolve(
        __dirname,
        '../../Infrastructure/Infrastructure/DataAccessManager/EFCore/Contexts/DataContext.cs'), 'utf8');
    const numberManager = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/number-format-manager.js'), 'utf8');

    assert.match(accountingMath, /RoundMoney\(decimal value\)\s*=>\s*decimal\.Round\(value,\s*6,/);
    assert.match(accountingMath, /RoundVnd\(decimal value\)\s*=>\s*RoundMoney\(value\)/);
    assert.match(dataContext, /Properties<decimal>\(\)\.HavePrecision\(19,\s*6\)/);
    assert.match(dataContext, /Properties<decimal\?>\(\)\.HavePrecision\(19,\s*6\)/);
    assert.match(numberManager, /const MONEY_FRACTION_DIGITS = 2/);
    assert.match(numberManager, /const factor = 10 \*\* MAX_FRACTION_DIGITS/);
    assert.match(numberManager, /numericTextBox\.decimals = MAX_FRACTION_DIGITS/);
});

test('plain money save paths read the preserved six-decimal value', () => {
    const cashView = fs.readFileSync(path.join(
        pagesRoot, 'CashTransactions/CashTransactionList.cshtml'), 'utf8');
    const cashScript = fs.readFileSync(path.join(
        pagesRoot, 'CashTransactions/CashTransactionList.cshtml.js'), 'utf8');
    const purchase = fs.readFileSync(path.join(
        pagesRoot, 'PurchaseOrders/PurchaseOrderList.cshtml.js'), 'utf8');
    const sales = fs.readFileSync(path.join(
        pagesRoot, 'SalesOrders/SalesOrderList.cshtml.js'), 'utf8');

    assert.match(cashView, /data-number-format="true"\s+data-numeric-kind="money"/);
    assert.match(cashScript, /row\.amountValue\s*=\s*NumberFormatManager\.readInputValue/);
    assert.match(cashScript, /amount:\s*Number\(row\.amountValue\)/);
    for (const source of [purchase, sales]) {
        assert.match(source, /id="swal-amount"[^>]*data-number-format="true"[^>]*data-numeric-kind="money"/);
        assert.match(source, /NumberFormatManager\.readInputValue\(document\.getElementById\('swal-amount'\)\)/);
    }
});
