const assert = require('node:assert/strict');
const test = require('node:test');
const search = require('../../Presentation/ASPNET/wwwroot/lib/indotalent/product-dropdown-search.js');

const products = [
    { id: 'product-1', name: 'Dây điện Trần Phú' },
    { id: 'product-2', name: 'Ống nước Bình Minh' },
    { id: 'product-3', name: 'Dây cáp mạng' }
];

test('tìm hàng hóa theo chuỗi con, không phân biệt hoa thường và dấu tiếng Việt', () => {
    assert.deepEqual(
        search.filterByName(products, 'DAY DIEN').map(item => item.id),
        ['product-1']
    );
    assert.deepEqual(
        search.filterByName(products, 'binh minh').map(item => item.id),
        ['product-2']
    );
    assert.deepEqual(
        search.filterByName(products, 'cáp').map(item => item.id),
        ['product-3']
    );
});

test('xóa nội dung tìm kiếm khôi phục đúng danh sách hàng hóa hợp lệ ban đầu', () => {
    assert.strictEqual(search.filterByName(products, ''), products);
    assert.strictEqual(search.filterByName(products, '   '), products);
});

test('filtering handler chỉ cập nhật từ danh sách được truyền vào', () => {
    let prevented = false;
    let updatedProducts = null;
    const handler = search.createFilteringHandler(products.slice(0, 2));

    handler({
        text: 'day dien',
        set preventDefaultAction(value) { prevented = value; },
        updateData(value) { updatedProducts = value; }
    });

    assert.equal(prevented, true);
    assert.deepEqual(updatedProducts.map(item => item.id), ['product-1']);
});
