const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const pickerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/product-serial-picker.js'
);

function loadPicker() {
    const warnings = [];
    const window = {};
    const Swal = { fire: options => warnings.push(options) };
    vm.runInNewContext(fs.readFileSync(pickerPath, 'utf8'), {
        window,
        document: {},
        Swal,
        URLSearchParams,
        console
    });
    return { picker: window.ProductSerialPicker, warnings };
}

test('cell blur does not validate but explicit batch save validates product quantity warehouse and serial', () => {
    const { picker, warnings } = loadPicker();
    const products = [{ id: 'serial-product', physical: true, serialTrackingMode: 1 }];
    const options = {
        productListGetter: () => products,
        warehouseField: 'warehouseId',
        quantityField: 'movement',
        allowEmptySelection: false
    };

    assert.equal(picker.validateGridSave({ requestType: 'save', data: {} }, options), true);
    assert.equal(warnings.length, 0);

    const missingProduct = { requestType: 'save', managedBatch: true, data: {} };
    assert.equal(picker.validateGridSave(missingProduct, options), false);
    assert.match(warnings.at(-1).text, /hàng hóa/i);

    const missingWarehouse = { requestType: 'save', managedBatch: true, data: { productId: 'serial-product', movement: 1 } };
    assert.equal(picker.validateGridSave(missingWarehouse, options), false);
    assert.match(warnings.at(-1).text, /kho hàng/i);

    const missingQuantity = { requestType: 'save', managedBatch: true, data: { productId: 'serial-product', warehouseId: 'warehouse-1', movement: 0 } };
    assert.equal(picker.validateGridSave(missingQuantity, options), false);
    assert.match(warnings.at(-1).text, /lớn hơn 0/i);

    const missingSerial = { requestType: 'save', managedBatch: true, data: { productId: 'serial-product', warehouseId: 'warehouse-1', movement: 1 } };
    assert.equal(picker.validateGridSave(missingSerial, options), false);
    assert.match(warnings.at(-1).text, /serial/i);

    const valid = { requestType: 'save', managedBatch: true, data: { productId: 'serial-product', warehouseId: 'warehouse-1', movement: 99, productSerialIds: ['serial-1', 'serial-2'] } };
    assert.equal(picker.validateGridSave(valid, options), true);
    assert.equal(valid.data.movement, 2);
});

test('serial column formats object payloads without object Object', () => {
    const { picker } = loadPicker();
    const column = picker.createGridColumn({});

    assert.equal(column.valueAccessor('productSerialNumbers', {
        productSerialNumbers: [{ internalSerialNumber: 'INT-001' }, { manufacturerSerialNumber: 'NSX-002' }]
    }), 'INT-001, NSX-002');
    assert.doesNotMatch(column.valueAccessor('productSerialNumbers', {
        productSerialNumbers: { internalSerialNumber: 'INT-003' }
    }), /\[object Object\]/);
});
