const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadManager() {
    const document = { readyState: 'loading', addEventListener() { } };
    const window = {
        document,
        NumberFormatManager: { parseLocaleNumber: value => Number(String(value).replace(/,/g, '')) },
        DateFormatManager: { formatForApiDate: value => value },
        StorageManager: { getUserId: () => 'user-1' },
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
    return window.ExcelImportManager._test;
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
