const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const vietnameseHeaders = {
    'Name': 'Tên',
    'Description': 'Mô tả',
    'Transaction Type': 'Loại giao dịch',
    'Amount': 'Số tiền',
    'Number': 'Số',
    'Ref Code': 'Mã tham khảo',
    'Email Address': 'Địa chỉ email',
    'Id': 'ID',
    'Customer Group': 'Nhóm khách hàng',
    'Customer Category': 'Danh mục khách hàng',
    'Opening Stock': 'Tồn kho nhập lần đầu',
    'Warehouse': 'Kho',
    'Product': 'Hàng hóa',
    'Product Serial IDs': 'ID serial hàng hóa'
};

function loadManager(initialLocale = 'en') {
    const localeState = { value: initialLocale };
    const document = { readyState: 'loading', addEventListener() { } };
    const window = {
        document,
        NumberFormatManager: { parseLocaleNumber: value => Number(String(value).replace(/,/g, '')) },
        DateFormatManager: { formatForApiDate: value => value },
        StorageManager: { getUserId: () => 'user-1' },
        UiLocalization: {
            getLocale: () => localeState.value,
            translateText(value, locale) {
                if (locale === 'vi') return vietnameseHeaders[value] ?? value;
                const english = Object.entries(vietnameseHeaders).find(([, vietnamese]) => vietnamese === value)?.[0];
                return english ?? value;
            }
        },
        addEventListener() { },
        location: { pathname: '/none' },
        console
    };
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/excel-import-manager.js'), 'utf8');
    vm.runInNewContext(source, {
        window,
        document,
        console,
        StorageManager: window.StorageManager,
        FileReader: class { }
    });
    return Object.assign(window.ExcelImportManager._test, {
        setLocale: locale => { localeState.value = locale; }
    });
}

test('Excel import accepts Vietnamese and English boolean values', () => {
    const manager = loadManager();
    assert.equal(manager.parseBoolean('Có'), true);
    assert.equal(manager.parseBoolean('Đúng'), true);
    assert.equal(manager.parseBoolean('yes'), true);
    assert.equal(manager.parseBoolean('không'), false);
});

test('Excel import builds typed payloads without leaking client-only keys', () => {
    const manager = loadManager();
    const payload = manager.buildPayload({ columns: [
        { header: 'Document Key', key: 'documentKey', required: true, clientOnly: true },
        { header: 'Amount', key: 'amount', required: true, type: 'number' },
        { header: 'Serials', key: 'serials', type: 'list' }
    ] }, {
        'Document Key *': 'DOC-1',
        'Amount *': '1,250',
        Serials: 'A-1; A-2'
    }, {}, 2);
    assert.equal(payload.documentKey, 'DOC-1');
    assert.equal(payload.amount, 1250);
    assert.deepEqual(JSON.parse(JSON.stringify(payload.serials)), ['A-1', 'A-2']);
    assert.equal(payload.createdById, 'user-1');
});

test('Excel import accepts Vietnamese headers and enum values', async () => {
    const manager = loadManager();
    const transactionTypes = await manager.fetchLookup('transactionTypes');
    const payload = manager.buildPayload({ columns: [
        { header: 'Transaction Type', key: 'transactionType', required: true, lookup: 'transactionTypes' },
        { header: 'Amount', key: 'amount', required: true, type: 'number' },
        { header: 'Description', key: 'description' }
    ] }, {
        'Loại giao dịch *': 'Thu',
        'Số tiền *': '1,250',
        'Diễn giải': 'Thu khách hàng'
    }, { transactionTypes }, 2);

    assert.equal(payload.transactionType, 0);
    assert.equal(payload.amount, 1250);
    assert.equal(payload.description, 'Thu khách hàng');
});

function makeLookup(manager, data) {
    const index = new Map();
    data.forEach(item => [item.id, item.name, item.number, item.referenceCode]
        .filter(value => value != null && value !== '')
        .forEach(value => index.set(manager.normalizeKey(value), item)));
    return { data, index };
}

test('Excel lookup normalization keeps Vietnamese letters and accents distinct', () => {
    const manager = loadManager();
    assert.equal(manager.normalizeKey('Đá'), 'đá');
    assert.equal(manager.normalizeKey('Đá'), 'đá');
    assert.equal(manager.normalizeKey(' ĐÁ '), 'đá');
    assert.notEqual(manager.normalizeKey('Đá'), manager.normalizeKey('Da'));

    const customerGroups = makeLookup(manager, [
        { id: 'group-stone', name: 'Đá' },
        { id: 'group-ascii', name: 'Da' }
    ]);
    const customerCategories = makeLookup(manager, [{ id: 'category-1', name: 'Mặc định' }]);
    const payload = manager.buildPayload(manager.pageConfigs.customers, {
        'Customer Group *': 'Đá',
        'Customer Category *': 'Mặc định',
        'Name *': 'Công trình Đá'
    }, { customerGroups, customerCategories }, 2);

    assert.equal(payload.customerGroupId, 'group-stone');
    assert.equal(payload.street, '');
    assert.equal(payload.city, '');
    assert.equal(payload.emailAddress, '');
});

test('Excel import applies defaults before lookup and type conversion including enum id zero', () => {
    const manager = loadManager();
    const serialTrackingModes = makeLookup(manager, [
        { id: 0, name: 'None' },
        { id: 1, name: 'Internal Auto' }
    ]);
    const payload = manager.buildPayload({ columns: [
        { header: 'Serial Tracking Mode', key: 'serialTrackingMode', lookup: 'serialTrackingModes', defaultValue: 0 },
        { header: 'Quantity', key: 'quantity', type: 'number', defaultValue: 1 },
        { header: 'Opening Stock', key: 'openingStockQuantity', type: 'number', defaultValue: 0 },
        { header: 'Physical Product', key: 'physical', type: 'boolean', defaultValue: true }
    ] }, {}, { serialTrackingModes }, 2);

    assert.equal(payload.serialTrackingMode, 0);
    assert.equal(payload.quantity, 1);
    assert.equal(payload.openingStockQuantity, 0);
    assert.equal(payload.physical, true);
});

test('Excel headers are generated in the selected locale and imported bilingually', () => {
    const manager = loadManager('en');
    assert.deepEqual(
        JSON.parse(JSON.stringify(manager.getTemplateHeaders([
            { header: 'Name', required: true },
            { header: 'Opening Stock' }
        ], 'vi'))),
        ['Tên *', 'Tồn kho nhập lần đầu']
    );
    assert.deepEqual(
        JSON.parse(JSON.stringify(manager.getLookupHeaders('vi'))),
        ['Tên', 'Số', 'Mã tham khảo', 'Địa chỉ email', 'ID']
    );

    const columns = [
        { header: 'Name', key: 'name', required: true },
        { header: 'Amount', key: 'amount', required: true, type: 'number' }
    ];
    const viPayload = manager.buildPayload({ columns }, { 'Tên *': 'A', 'Số tiền *': '10' }, {}, 2);
    manager.setLocale('vi');
    const enPayload = manager.buildPayload({ columns }, { 'Name *': 'B', 'Amount *': '20' }, {}, 3);

    assert.equal(viPayload.name, 'A');
    assert.equal(viPayload.amount, 10);
    assert.equal(enPayload.name, 'B');
    assert.equal(enPayload.amount, 20);
});

test('Excel page contracts match forms, defaults, and draft-only import rules', () => {
    const manager = loadManager();
    const configs = manager.pageConfigs;
    assert.equal(Object.keys(configs).length, 26);

    const requiredKeys = columns => Array.from(columns).filter(column => column.required).map(column => column.key);
    const expectedContracts = {
        productgroups: { main: ['name'] },
        vendorgroups: { main: ['name'] },
        vendorcategories: { main: ['name'] },
        customergroups: { main: ['name'] },
        customercategories: { main: ['name'] },
        warehouses: { main: ['name'] },
        cashaccounts: { main: ['name', 'accountType'] },
        cashcategories: { main: ['name'] },
        cashtransactions: {
            main: ['transactionDate', 'transactionType', 'amount', 'documentKey'],
            nested: ['documentKey', 'customerId', 'amount']
        },
        taxs: { main: ['name', 'percentage'] },
        products: { main: ['name', 'productGroupId', 'unitMeasureName'] },
        vendors: { main: ['vendorGroupId', 'vendorCategoryId', 'name'] },
        customers: { main: ['customerGroupId', 'customerCategoryId', 'name'] },
        customercontacts: { main: ['customerId', 'name', 'jobTitle', 'phoneNumber', 'emailAddress'] },
        vendorcontacts: { main: ['vendorId', 'name', 'jobTitle', 'phoneNumber', 'emailAddress'] },
        todos: { main: ['name'] },
        todoitems: { main: ['todoId', 'name'] },
        salesorders: {
            main: ['documentKey', 'orderDate', 'customerId'],
            items: ['documentKey', 'productId', 'quantity', 'unitPrice', 'taxId']
        },
        purchaseorders: {
            main: ['documentKey', 'orderDate', 'vendorId'],
            items: ['documentKey', 'productId', 'quantity', 'unitPrice', 'taxId']
        },
        purchasereturns: {
            main: ['documentKey', 'returnDate', 'purchaseOrderId'],
            items: ['documentKey', 'productId', 'warehouseId', 'movement']
        },
        salesreturns: {
            main: ['documentKey', 'returnDate', 'salesOrderId'],
            items: ['documentKey', 'productId', 'warehouseId', 'movement']
        },
        transferouts: {
            main: ['transferReleaseDate', 'warehouseFromId', 'warehouseToId', 'documentKey'],
            items: ['documentKey', 'productId', 'movement']
        },
        transferins: {
            main: ['documentKey', 'transferReceiveDate', 'transferOutId'],
            items: ['documentKey', 'productId', 'movement']
        },
        scrappings: {
            main: ['scrappingDate', 'warehouseId', 'documentKey'],
            items: ['documentKey', 'productId', 'movement']
        },
        stockcounts: {
            main: ['countDate', 'warehouseId', 'documentKey'],
            items: ['documentKey', 'productId', 'qtySCCount']
        },
        materialexports: {
            main: ['documentKey', 'materialExportDate', 'warehouseId', 'customerId'],
            items: ['documentKey', 'productId', 'movement']
        }
    };

    Object.entries(expectedContracts).forEach(([name, expected]) => {
        const config = configs[name];
        assert.ok(config, `Missing Excel config: ${name}`);
        assert.deepEqual(requiredKeys(config.columns), expected.main, `${name} main required fields drifted`);
        if (expected.items) {
            assert.deepEqual(requiredKeys(config.itemColumns), expected.items, `${name} item required fields drifted`);
        }
        if (expected.nested) {
            assert.deepEqual(requiredKeys(config.nestedColumns), expected.nested, `${name} nested required fields drifted`);
        }
    });

    assert.equal(configs.customercontacts.columns.find(column => column.key === 'emailAddress').required, true);
    assert.equal(configs.vendorcontacts.columns.find(column => column.key === 'emailAddress').required, true);
    assert.equal(configs.cashaccounts.columns.find(column => column.key === 'accountType').required, true);
    assert.equal(configs.cashtransactions.columns.find(column => column.key === 'cashAccountId').required, undefined);

    const productColumns = configs.products.columns;
    assert.equal(productColumns.find(column => column.key === 'unitPrice').required, undefined);
    assert.equal(productColumns.find(column => column.key === 'unitMeasureName').required, true);
    assert.equal(productColumns.find(column => column.key === 'physical').defaultValue, true);
    assert.equal(productColumns.find(column => column.key === 'serialTrackingMode').defaultValue, 0);
    assert.equal(productColumns.find(column => column.key === 'openingStockQuantity').defaultValue, 0);

    assert.equal(configs.salesorders.columns.find(column => column.key === 'salesType').defaultValue, 1);
    assert.equal(configs.salesorders.itemColumns.find(column => column.key === 'taxId').required, true);
    assert.equal(configs.purchaseorders.itemColumns.find(column => column.key === 'taxId').required, true);
    assert.equal(configs.purchaseorders.itemColumns.find(column => column.key === 'supplierWarrantyMonths').defaultValue, 6);
    assert.equal(configs.salesorders.itemColumns.find(column => column.key === 'warehouseId').requiredWhen, 'physicalProduct');
    assert.equal(configs.purchaseorders.itemColumns.find(column => column.key === 'warehouseId').requiredWhen, 'physicalProduct');

    ['purchasereturns', 'salesreturns', 'transferouts', 'transferins', 'scrappings', 'stockcounts']
        .forEach(name => assert.equal(configs[name].columns.some(column => column.key === 'status'), false));
    ['salesorders', 'purchasereturns', 'salesreturns', 'transferouts', 'transferins', 'scrappings', 'stockcounts', 'materialexports']
        .forEach(name => assert.equal(configs[name].itemColumns.some(column => column.key === 'productSerialIds'), true));
});

test('Excel item validation enforces physical warehouses and serial counts', () => {
    const manager = loadManager();
    const products = makeLookup(manager, [
        { id: 'serial-product', name: 'Serial product', physical: true, serialTrackingMode: 1 },
        { id: 'service', name: 'Service', physical: false, serialTrackingMode: 0 }
    ]);
    const warehouses = makeLookup(manager, [{ id: 'warehouse-1', name: 'Main' }]);
    const taxes = makeLookup(manager, [{ id: 'tax-1', name: 'VAT' }]);
    const config = { columns: manager.pageConfigs.salesorders.itemColumns };
    const base = {
        'Document Key *': 'SO-1',
        'Product *': 'Serial product',
        'Warehouse': 'Main',
        'Quantity *': 2,
        'Unit Price *': 100,
        'Tax *': 'VAT'
    };

    assert.throws(
        () => manager.buildPayload(config, base, { products, warehouses, taxes }, 2),
        /count must match/
    );
    const serialPayload = manager.buildPayload(config, {
        ...base,
        'Product Serial IDs': 'serial-1; serial-2'
    }, { products, warehouses, taxes }, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(serialPayload.productSerialIds)), ['serial-1', 'serial-2']);

    assert.throws(() => manager.buildPayload(config, {
        ...base,
        Warehouse: ''
    }, { products, warehouses, taxes }, 2), /required for physical products/);

    const servicePayload = manager.buildPayload(config, {
        ...base,
        'Product *': 'Service',
        Warehouse: ''
    }, { products, warehouses, taxes }, 2);
    assert.equal(servicePayload.warehouseId, null);
    assert.deepEqual(JSON.parse(JSON.stringify(servicePayload.productSerialIds)), []);
});

test('Product Excel validation applies opening-stock rules', async () => {
    const manager = loadManager();
    const serialTrackingModes = await manager.fetchLookup('serialTrackingModes');
    const productGroups = makeLookup(manager, [{ id: 'group-1', name: 'General' }]);
    const warehouses = makeLookup(manager, [{ id: 'warehouse-1', name: 'Main' }]);
    const lookups = { serialTrackingModes, productGroups, warehouses };
    const config = manager.pageConfigs.products;
    const required = { 'Name *': 'Product A', 'Product Group *': 'General', 'Unit Measure *': 'PCS' };

    const defaults = manager.buildPayload(config, required, lookups, 2);
    config.validate(defaults, 2);
    assert.equal(defaults.physical, true);
    assert.equal(defaults.serialTrackingMode, 0);
    assert.equal(defaults.openingStockQuantity, 0);

    const opening = manager.buildPayload(config, {
        ...required,
        'Cost Price': 0,
        'Default Warehouse': 'Main',
        'Opening Stock': 2.5
    }, lookups, 3);
    config.validate(opening, 3);
    assert.equal(opening.openingStockQuantity, 2.5);

    const internalAuto = manager.buildPayload(config, {
        ...required,
        'Cost Price': 0,
        'Default Warehouse': 'Main',
        'Serial Tracking Mode': 'Internal Auto',
        'Internal Serial Fixed Code': 'AUTO',
        'Opening Stock': 1.5
    }, lookups, 4);
    assert.throws(() => config.validate(internalAuto, 4), /whole number/);

    const manufacturer = manager.buildPayload(config, {
        ...required,
        'Cost Price': 0,
        'Default Warehouse': 'Main',
        'Serial Tracking Mode': 'Manufacturer Serial',
        'Opening Stock': 1
    }, lookups, 5);
    assert.throws(() => config.validate(manufacturer, 5), /purchase order/);

    const missingCost = manager.buildPayload(config, {
        ...required,
        'Default Warehouse': 'Main',
        'Opening Stock': 1
    }, lookups, 6);
    assert.throws(() => config.validate(missingCost, 6), /Cost Price.*required/);
});

test('Tax Excel validation accepts zero and rejects values outside 0-100', () => {
    const { validate } = loadManager().pageConfigs.taxs;
    assert.doesNotThrow(() => validate({ percentage: 0 }, 2));
    assert.doesNotThrow(() => validate({ percentage: 100 }, 2));
    assert.throws(() => validate({ percentage: -1 }, 2), /between 0 and 100/);
    assert.throws(() => validate({ percentage: 101 }, 2), /between 0 and 100/);
});
