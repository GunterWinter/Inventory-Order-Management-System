const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../..', relative), 'utf8');

test('demo reset rejects every database outside the isolated UI prefix', () => {
    const source = read('Infrastructure/Infrastructure/DataAccessManager/EFCore/DI.cs');

    assert.match(source, /\^WHMS_UiRegression_\[A-Za-z0-9_\]\+\$/);
    assert.match(source, /if \(!DisposableDatabaseName\.IsMatch\(databaseName\)\)[\s\S]{0,250}throw new InvalidOperationException/);
    assert.match(source, /DisposableDatabaseName\.IsMatch\(databaseName\)[\s\S]{0,350}EnsureDeleted\(\)/);
});

test('application DI ignores nested feature details and framework interfaces implemented by records', () => {
    const source = read('Core/Application/DependencyInjection.cs');

    assert.match(source, /type\.IsClass && !type\.IsAbstract && !type\.IsNested/);
    assert.match(source, /serviceInterface\.Assembly == assembly/);
});

test('inventory cost backfill apply requires the exact database name and bypasses web startup', () => {
    const source = read('Presentation/ASPNET/Program.cs');

    assert.match(source, /inventoryCostBackfillMode is not \("dry-run" or "apply"\)/);
    assert.match(source, /InventoryCostBackfill:ConfirmDatabase.*!= databaseName/s);
    assert.match(source, /Refusing inventory cost backfill/);
    assert.match(source, /RunAsync\(inventoryCostBackfillMode == "apply"\)[\s\S]*?return;[\s\S]*?app\.RegisterBackEndBuilder/);
});
