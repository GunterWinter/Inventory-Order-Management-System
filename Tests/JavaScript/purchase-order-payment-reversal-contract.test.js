const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('PO payment reversal is a linked full negative payment and recalculates the fund', () => {
    const command = read('Core/Application/Features/PurchaseOrderManager/Commands/ReversePurchaseOrderPayment.cs');
    const reversalService = read('Core/Application/Features/CashTransactionManager/PaymentReversalService.cs');
    const entity = read('Core/Domain/Entities/CashTransactionPayment.cs');
    const configuration = read('Infrastructure/Infrastructure/DataAccessManager/EFCore/Configurations/CashTransactionPaymentConfiguration.cs');

    assert.match(entity, /ReversalOfPaymentId/);
    assert.match(configuration, /UX_CashTransactionPayment_ActiveReversal/);
    assert.match(command, /_service\.ReverseAsync\([\s\S]*nameof\(Domain\.Entities\.PurchaseOrder\)/);
    assert.match(reversalService, /Amount = -original\.Amount/);
    assert.match(reversalService, /ReversalOfPaymentId = original\.Id/);
    assert.match(reversalService, /RecalculateAsync\(original\.CashAccountId/);
    assert.match(reversalService, /SupportedModules[\s\S]*nameof\(SalesOrder\)[\s\S]*nameof\(PurchaseReturn\)[\s\S]*nameof\(SalesReturn\)/);
});

test('PO can cancel only after net payment history is zero and UI exposes each reversible installment', () => {
    const service = read('Core/Application/Features/PurchaseOrderManager/PurchaseOrderService.cs');
    const salesService = read('Core/Application/Features/SalesOrderManager/SalesOrderService.cs');
    const history = read('Core/Application/Features/PurchaseOrderManager/Queries/GetPurchaseOrderPaymentHistory.cs');
    const page = read('Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js');

    assert.match(service, /netPaidAmount[\s\S]{0,320}SumAsync\(x => x\.Amount/);
    assert.match(service, /if \(netPaidAmount > 0\.000001m\)/);
    assert.match(salesService, /netPaidAmount[\s\S]{0,320}SumAsync\(x => x\.Amount/);
    assert.match(history, /payment\.CanReverse = payment\.Amount > 0m/);
    assert.match(page, /data-reverse-payment-id/);
    assert.match(page, /\/PurchaseOrder\/ReversePurchaseOrderPayment/);
});
