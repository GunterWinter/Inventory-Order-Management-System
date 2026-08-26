const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const resolver = fs.readFileSync(path.resolve(
    __dirname,
    '../../Core/Application/Features/InventoryTransactionManager/InventoryCostResolver.cs'), 'utf8');

test('material export FIFO is isolated from the shared weighted resolver', () => {
    assert.match(resolver, /ResolveMaterialExportFifoAsync\(/);
    assert.match(resolver, /ResolveWeightedAsync\(/);
    assert.match(resolver, /OrderBy\(x\s*=>\s*x\.CreatedAtUtc\)\s*\.ThenBy\(x\s*=>\s*x\.Id\)/s);
});

test('material export FIFO removes purchase-linked outflows from their source lot', () => {
    assert.match(resolver, /row\.ModuleName\s*==\s*nameof\(PurchaseReturn\)/);
    assert.match(resolver, /row\.ModuleName\s*==\s*"CostAllocation"/);
    assert.match(resolver, /layer\.PurchaseOrderItemId\s*==\s*sourcePurchaseItemId/);
});
