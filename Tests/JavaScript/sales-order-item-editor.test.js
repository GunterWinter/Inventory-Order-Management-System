const assert = require('node:assert/strict');
const test = require('node:test');
const editor = require('../../Presentation/ASPNET/wwwroot/lib/indotalent/sales-order-item-editor.js');

const products = [
    { id: 'in-stock', name: 'Có tồn', physical: true, unitPrice: 120, costPrice: 80 },
    { id: 'out-of-stock', name: 'Hết tồn', physical: true, unitPrice: 150, costPrice: 90 },
    { id: 'service', name: 'Dịch vụ', physical: false, unitPrice: 200, costPrice: 100 }
];
const stocks = [
    { productId: 'in-stock', warehouseId: 'warehouse-a', warehouseName: 'Kho A', stock: 5 },
    { productId: 'in-stock', warehouseId: 'warehouse-b', warehouseName: 'Kho B', stock: 0 },
    { productId: 'out-of-stock', warehouseId: 'warehouse-a', warehouseName: 'Kho A', stock: 2 },
    { productId: 'out-of-stock', warehouseId: 'warehouse-a', warehouseName: 'Kho A', stock: -2 }
];

test('lookup chỉ trả hàng vật lý còn tồn và sản phẩm phi vật lý', () => {
    const result = editor.getSelectableProducts({ products, stockData: stocks, selectedProductIds: [], currentRow: {} });
    assert.deepEqual(result.map(item => item.id), ['in-stock', 'service']);
});

test('kho được tổng hợp theo sản phẩm và chỉ giữ kho có tồn dương', () => {
    const result = editor.getAvailableWarehouses(stocks, { id: 'in-stock' });
    assert.deepEqual(result, [{ id: 'warehouse-a', name: 'Kho A', availableStock: 5 }]);
});

test('giá mặc định là giá bán, loại xuất nội bộ dùng giá vốn', () => {
    assert.equal(editor.resolveUnitPrice(products[0], null), 120);
    assert.equal(editor.resolveUnitPrice(products[0], { value: '1' }), 120);
    assert.equal(editor.resolveUnitPrice(products[0], { id: '2' }), 80);
});

test('chọn hàng tạo đầy đủ dữ liệu dòng và không tự chọn kho hết tồn', () => {
    const warehouses = editor.getAvailableWarehouses(stocks, 'in-stock');
    const result = editor.buildProductSelection({
        rowData: { quantity: 0, warehouseId: 'warehouse-b' },
        product: products[0],
        warehouseOptions: warehouses,
        salesType: null
    });

    assert.equal(result.productId, 'in-stock');
    assert.equal(result.warehouseId, null);
    assert.equal(result.unitPrice, 120);
    assert.equal(result.quantity, 1);
    assert.equal(result.total, 120);
});

test('chọn hàng với loại xuất nội bộ tự điền giá vốn', () => {
    const result = editor.buildProductSelection({
        rowData: {},
        product: products[0],
        warehouseOptions: editor.getAvailableWarehouses(stocks, 'in-stock'),
        salesType: '2'
    });

    assert.equal(result.unitPrice, 80);
    assert.equal(result.total, 80);
});

test('serial được chuẩn hóa thành id và chuỗi hiển thị primitive, không thành object', () => {
    const result = editor.normalizeSerialSelection([
        { id: 'serial-1', internalSerialNumber: 'SN-001' },
        { id: 'serial-1', internalSerialNumber: 'SN-001' },
        { id: 'serial-2', internalSerialNumber: 'SN-002' }
    ]);
    assert.deepEqual(result.ids, ['serial-1', 'serial-2']);
    assert.equal(result.numbers, 'SN-001, SN-002');
    assert.equal(result.quantity, 2);
});
