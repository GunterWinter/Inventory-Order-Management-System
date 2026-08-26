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

test('serial picker exposes the editor context and Material Export syncs IDs, text and quantity into batch data', () => {
    const pickerSource = fs.readFileSync(pickerPath, 'utf8');
    const materialExportSource = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml.js'
    ), 'utf8');

    assert.match(pickerSource, /options\.onSelectionApplied\?\.\(\{/);
    assert.match(pickerSource, /editorElement:\s*args\.element/);
    assert.match(pickerSource, /rowIndex:\s*stableRowIndex/);
    assert.match(pickerSource, /read:\s*\(\)\s*=>\s*activeRowData\?\.productSerialNumbers/);
    assert.ok(
        pickerSource.indexOf('options.onSelectionApplied?.({') < pickerSource.indexOf('quantityObj.value ='),
        'batch synchronization callback must run before an optional NumericTextBox update'
    );
    assert.match(materialExportSource, /gridGetter:\s*\(\)\s*=>\s*secondaryGrid\.obj/);
    assert.match(materialExportSource, /onSelectionApplied:\s*\(\{\s*rowData,\s*editorElement,\s*rowIndex,\s*rowUid,\s*serialIds,\s*serialNumbers,\s*quantity\s*\}\)/);
    assert.match(materialExportSource, /GridInteractionManager\.syncBatchRowValues\(secondaryGrid\.obj/);
    assert.match(materialExportSource, /productSerialIds:\s*\[\.\.\.serialIds\]/);
    assert.match(materialExportSource, /productSerialNumbers:\s*serialNumbers/);
    assert.match(materialExportSource, /movement:\s*quantity/);
    assert.match(materialExportSource, /productSerialIds:\s*\[\],\s*\n\s*productSerialNumbers:\s*'',\s*\n\s*movement:\s*1/);
    assert.doesNotMatch(materialExportSource, /close:\s*function\s*\(\)\s*\{\s*requestAnimationFrame/);
    assert.doesNotMatch(materialExportSource, /requestAnimationFrame\(\(\)\s*=>\s*\{\s*const rowIndex[^}]+updateCell\(rowIndex,\s*'productSerialNumbers'/s);
});

test('shared serial picker writes selection to the batch row and scopes Return serials to the exact source line', () => {
    const pickerSource = fs.readFileSync(pickerPath, 'utf8');
    const purchaseReturnSource = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseReturns/PurchaseReturnList.cshtml.js'
    ), 'utf8');
    const salesReturnSource = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/SalesReturns/SalesReturnList.cshtml.js'
    ), 'utf8');

    assert.match(pickerSource, /GridInteractionManager\.syncBatchRowValues\(grid/);
    assert.match(pickerSource, /sourceItemId:\s*options\.sourceItemIdGetter\?\.\(args\.rowData\)/);
    assert.match(purchaseReturnSource, /sourceItemIdGetter:\s*rowData\s*=>\s*rowData\.sourceItemId/);
    assert.match(salesReturnSource, /sourceItemIdGetter:\s*rowData\s*=>\s*rowData\.sourceItemId/);
});

test('Purchase Order manufacturer serial Apply updates quantity and batch fields with Vietnamese validation', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js'
    ), 'utf8');

    assert.match(source, /quantity:\s*result\.value\.length/);
    assert.match(source, /writePurchaseOrderBatchFields\(rowData,\s*values,\s*editorElement\)/);
    assert.match(source, /Serial nhà sản xuất không hợp lệ/);
    assert.doesNotMatch(source, /Invalid serial numbers/);
});
