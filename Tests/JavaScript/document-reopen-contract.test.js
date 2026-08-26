const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('confirmed business documents can return to Draft without editing headers in the same request', () => {
    const contracts = [
        ['Core/Application/Features/PurchaseOrderManager/Commands/UpdatePurchaseOrder.cs', 'PurchaseOrderStatus'],
        ['Core/Application/Features/SalesOrderManager/Commands/UpdateSalesOrder.cs', 'SalesOrderStatus'],
        ['Core/Application/Features/PurchaseReturnManager/Commands/UpdatePurchaseReturn.cs', 'PurchaseReturnStatus'],
        ['Core/Application/Features/SalesReturnManager/Commands/UpdateSalesReturn.cs', 'SalesReturnStatus'],
        ['Core/Application/Features/TransferOutManager/Commands/UpdateTransferOut.cs', 'TransferStatus'],
        ['Core/Application/Features/TransferInManager/Commands/UpdateTransferIn.cs', 'TransferStatus'],
        ['Core/Application/Features/ScrappingManager/Commands/UpdateScrapping.cs', 'ScrappingStatus'],
        ['Core/Application/Features/StockCountManager/Commands/UpdateStockCount.cs', 'StockCountStatus']
    ];

    for (const [file, statusType] of contracts) {
        const source = read(file);
        assert.match(source, new RegExp(`${statusType}\\.Draft[\\s\\S]{0,100}${statusType}\\.Cancelled`), file);
        assert.match(source, /headerChanged/, file);
    }
});

test('reopening inventory documents releases confirmed serial movements', () => {
    const inventory = read('Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.cs');
    assert.match(inventory, /status is InventoryTransactionStatus\.Cancelled or InventoryTransactionStatus\.Draft/);
    assert.match(inventory, /alreadyConfirmedIds\.Contains\(childId\)[\s\S]{0,160}ReleaseInventoryTransactionSerialsAsync/);
});

test('PO, SO and Material Export remove only unpaid cash effects when reopening', () => {
    const purchase = read('Core/Application/Features/PurchaseOrderManager/PurchaseOrderService.cs');
    const sales = read('Core/Application/Features/SalesOrderManager/SalesOrderService.cs');
    const materialExport = read('Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs');

    assert.match(purchase, /OrderStatus == PurchaseOrderStatus\.Draft[\s\S]{0,700}ValidateCancellationAsync[\s\S]{0,700}DeleteUnpaidObligationAsync/);
    assert.match(sales, /OrderStatus == SalesOrderStatus\.Draft[\s\S]{0,700}ValidateCancellationAsync[\s\S]{0,700}DeleteUnpaidReceivableAsync/);
    assert.match(materialExport, /requestedStatus is MaterialExportStatus\.Draft or MaterialExportStatus\.Cancelled/);
    assert.match(materialExport, /hasPayment[\s\S]{0,250}không thể chuyển/i);
    assert.match(materialExport, /line\.Status = requestedStatus == MaterialExportStatus\.Draft/);
});

test('stock report carries and displays product group', () => {
    const query = read('Core/Application/Features/InventoryTransactionManager/Queries/GetInventoryStockList.cs');
    const page = read('Presentation/ASPNET/FrontEnd/Pages/StockReports/StockReportList.cshtml.js');

    assert.match(query, /ProductGroupId/);
    assert.match(query, /ProductGroupName/);
    assert.match(page, /field:\s*'productGroupName',\s*headerText:\s*'Product Group'/);
    assert.match(page, /columns:\s*\['warehouseName',\s*'productGroupName',\s*'productName'\]/);
});
