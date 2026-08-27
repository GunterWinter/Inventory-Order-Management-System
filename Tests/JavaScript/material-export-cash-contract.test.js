const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('Material Export records project cost from frozen inventory allocations, never cash', () => {
    const command = read('Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs');
    const report = read('Core/Application/Features/CashTransactionManager/Queries/GetCustomerProfitReport.cs');

    assert.doesNotMatch(command, /CashTransaction|CashCategory|CreateProjectCostTransaction/);
    assert.match(report, /Set<MaterialExportItem>/);
    assert.match(report, /ProjectCost = group\.Sum/);
});

test('manual cash transaction accepts an empty account only after the exact warning', () => {
    const create = read('Core/Application/Features/CashTransactionManager/Commands/CreateCashTransaction.cs');
    const update = read('Core/Application/Features/CashTransactionManager/Commands/UpdateCashTransaction.cs');
    const page = read('Presentation/ASPNET/FrontEnd/Pages/CashTransactions/CashTransactionList.cshtml.js');

    assert.doesNotMatch(create, /RuleFor\(x => x\.CashAccountId\)/);
    assert.match(update, /!string\.IsNullOrWhiteSpace\(entity\.SourceModule\)[\s\S]{0,140}string\.IsNullOrWhiteSpace\(request\.CashAccountId\)/);
    assert.match(page, /Nếu để trống tài khoản quỹ thì chỉ biết chi\/thu của giao dịch/);
});
