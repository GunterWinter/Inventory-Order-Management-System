const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const resolver = fs.readFileSync(path.resolve(
    __dirname,
    '../../Core/Application/Features/InventoryTransactionManager/InventoryCostResolver.cs'), 'utf8');

test('document FIFO is isolated from the shared weighted resolver and ordered by business date', () => {
    assert.match(resolver, /ResolveFifoAsync\(/);
    assert.match(resolver, /ResolveWeightedAsync\(/);
    assert.match(resolver, /\(x\.MovementDate \?\? x\.CreatedAtUtc\) < nextBusinessDate/);
    assert.match(resolver, /OrderBy\(x\s*=>\s*x\.MovementDate \?\? x\.CreatedAtUtc\)\s*\.ThenBy\(x\s*=>\s*x\.CreatedAtUtc\)\s*\.ThenBy\(x\s*=>\s*x\.Id\)/s);
    assert.match(resolver, /IReadOnlyList<InventoryCostSlice> Slices/);
});

test('material export FIFO removes purchase-linked outflows from their source lot', () => {
    assert.match(resolver, /row\.ModuleName\s*==\s*nameof\(PurchaseReturn\)/);
    assert.match(resolver, /row\.ModuleName\s*==\s*"CostAllocation"/);
    assert.match(resolver, /layer\.PurchaseOrderItemId\s*==\s*sourcePurchaseItemId/);
});

test('confirmed material exports freeze exact FIFO or serial allocations', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/MaterialExportManager/Commands/UpdateMaterialExport.cs'), 'utf8');
    const costing = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/InventoryTransactionManager/InventoryTransactionService.Costing.cs'), 'utf8');

    assert.match(source, /ResolveFifoAsync\([\s\S]{0,220}entity\.ExportDate[\s\S]{0,100}line\.Id/);
    assert.match(source, /ReplaceFifoCostAllocationsAsync\(/);
    assert.match(source, /ReplaceSerialCostAllocationsAsync\(/);
    assert.match(source, /DeleteCostAllocationsAsync\(/);
    assert.match(costing, /_serialMovementRepository\.GetQuery\(\)[\s\S]{0,160}_inventoryTransactionRepository\.GetQuery\(\)/);
});

test('opening stock uses the first day of its month and corrections retain that effective date', () => {
    const source = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/ProductManager/ProductOpeningStockService.cs'), 'utf8');

    assert.match(source, /firstHistory\?\.MovementDate\?\.Date\s*\?\? new DateTime\(now\.Year, now\.Month, 1\)/);
    assert.match(source, /CountDate = effectiveDate/);
    assert.match(source, /MovementDate = effectiveDate/);
});

test('serial picker and material export expose exact frozen cost evidence in the UI', () => {
    const serialQuery = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/ProductSerialManager/Queries/GetProductSerialPickerList.cs'), 'utf8');
    const serialPicker = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/product-serial-picker.js'), 'utf8');
    const materialExport = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml.js'), 'utf8');

    assert.match(serialQuery, /public decimal\? UnitCost/);
    assert.match(serialQuery, /UnitCost = x\.UnitCost/);
    assert.match(serialPicker, /Tổng giá vốn:[^`]*\$\{formatCost\(total\)\}/);
    assert.match(materialExport, /item\.costAllocations\.reduce\([\s\S]{0,120}allocation\.total/);
    assert.match(materialExport, /InventoryCostLayerViewer\.show\(args\.rowData\?\.costAllocations/);
});

test('sales UI keeps frozen COGS and profit while returns keep exact source cost layers', () => {
    const salesOrder = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/SalesOrders/SalesOrderList.cshtml.js'), 'utf8');
    const salesReturn = fs.readFileSync(path.resolve(
        __dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/SalesReturns/SalesReturnList.cshtml.js'), 'utf8');

    assert.match(salesOrder, /field:\s*'cogsAmount'/);
    assert.match(salesOrder, /field:\s*'profitAmount'/);
    assert.doesNotMatch(salesOrder, /field:\s*'averageCost'|InventoryCostLayerViewer\.show/);
    assert.match(salesReturn, /InventoryCostLayerViewer\.select\(args\.rowData\.costLayers/);
    assert.match(salesReturn, /costLayerSelections:\s*selected\.selections/);
    assert.match(salesReturn, /productSerialIds, costLayers/);
    assert.match(salesReturn, /Math\.abs\(selectedQuantity - Number\(args\.data\.movement/);
});

test('inventory profit report reads frozen sale COGS instead of resolving current stock cost', () => {
    const report = fs.readFileSync(path.resolve(
        __dirname,
        '../../Core/Application/Features/SalesOrderItemManager/Queries/GetInventoryProfitReport.cs'), 'utf8');

    assert.match(report, /var totalCost = item\.CogsAmount \?\? 0m/);
    assert.match(report, /var profit = item\.ProfitAmount \?\? 0m/);
    assert.match(report, /CostSource = costSourceLookup/);
    assert.doesNotMatch(report, /ResolveAsync\(/);
});
