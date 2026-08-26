const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('Return availability stays attached to the exact confirmed source line', () => {
    const purchase = read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.PurchaseReturn.cs');
    const sales = read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.SalesReturn.cs');
    const createPurchase = read('Core/Application/Features/PurchaseReturnManager/Commands/CreatePurchaseReturn.cs');
    const createSales = read('Core/Application/Features/SalesReturnManager/Commands/CreateSalesReturn.cs');

    assert.match(purchase, /OrderStatus == PurchaseOrderStatus\.Confirmed/);
    assert.match(purchase, /Math\.Min\(source\.SourceQuantity - previous, stock - draftReserved\)/);
    assert.match(purchase, /PurchaseOrderItemId == source\.SourceItemId/);
    assert.match(sales, /OrderStatus == SalesOrderStatus\.Confirmed/);
    assert.match(sales, /source\.SourceQuantity - previous/);
    assert.match(sales, /SalesOrderItemId == source\.SourceItemId/);
    assert.doesNotMatch(createPurchase, /CreateAsync\(transaction/);
    assert.doesNotMatch(createSales, /CreateAsync\(transaction/);
});

test('Stock Count releases old serial movements before changing the product', () => {
    const stockCount = read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.StockCount.cs');
    const stockCountPage = read('Presentation/ASPNET/FrontEnd/Pages/StockCounts/StockCountList.cshtml.js');
    const releaseIndex = stockCount.indexOf('ReleaseInventoryTransactionSerialsAsync(');
    const productAssignmentIndex = stockCount.indexOf('child.ProductId = productId;', releaseIndex);

    assert.notEqual(releaseIndex, -1);
    assert.notEqual(productAssignmentIndex, -1);
    assert.ok(releaseIndex < productAssignmentIndex);
    assert.match(read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.cs'),
        /transactionIds\.Contains\(x\.InventoryTransactionId!\)[\s\S]*?x\.ReversedAtUtc == null/);
    assert.match(stockCountPage, /productSerialIds:\s*\[\],\s*productSerialNumbers:\s*''/s);
});

test('Stock Count preserves its snapshot and records missing serials reversibly', () => {
    const inventory = read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.cs');
    const serials = read('Core/Application/Features/ProductSerialManager/ProductSerialService.cs');
    const status = read('Core/Domain/Enums/StockCountStatus.cs');

    assert.match(inventory, /QtySCSys \?\?= GetStock/);
    assert.match(inventory, /QtySCDelta = transaction\.QtySCCount - transaction\.QtySCSys/);
    assert.match(serials, /Status = ProductSerialStatus\.Missing,\s*PreviousStatus = serial\.Status/s);
    assert.match(status, /Description\("Đã lưu trữ"\)/);
});
