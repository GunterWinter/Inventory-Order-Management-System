const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const source = fs.readFileSync(path.resolve(
    __dirname,
    '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js'
), 'utf8');

test('Purchase Order bulk delete blocks non-draft rows with a Vietnamese Swal', () => {
    assert.match(source, /selected\.some\(record\s*=>\s*String\(record\.orderStatus/);
    assert.match(source, /title:\s*'Không thể xóa đơn mua hàng'/);
    assert.match(source, /Chỉ đơn mua hàng Nháp mới được xóa\. Đơn đã xác nhận phải dùng chức năng Hủy\./);
});

test('Purchase Order bulk delete surfaces a stale backend rejection instead of only logging it', () => {
    assert.match(source, /catch\s*\(error\)[\s\S]*?error\.response\?\.data\?\.message/);
});
