const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadOpeningStockWarehouseDisplay() {
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/Products/ProductList.cshtml.js'), 'utf8');
    const context = vm.createContext({
        Vue: {
            createApp() {
                return { mount() { } };
            }
        }
    });

    vm.runInContext(`${source}\nglobalThis.__getOpeningStockWarehouseDisplay = getOpeningStockWarehouseDisplay;`, context);
    return context.__getOpeningStockWarehouseDisplay;
}

test('opening stock warehouse column displays its warehouse name instead of the quantity', () => {
    const display = loadOpeningStockWarehouseDisplay();

    assert.equal(display({
        openingStockQuantity: 0,
        openingStockWarehouseName: 'Kho công ty',
        defaultWarehouseName: 'Kho khác',
        hasOpeningStockHistory: true
    }), 'Kho công ty');
});

test('opening stock warehouse column falls back to the default warehouse for legacy history rows', () => {
    const display = loadOpeningStockWarehouseDisplay();

    assert.equal(display({
        openingStockQuantity: 1,
        openingStockWarehouseName: '',
        defaultWarehouseName: 'Kho công ty',
        hasOpeningStockHistory: true
    }), 'Kho công ty');
    assert.equal(display({
        openingStockQuantity: 0,
        openingStockWarehouseName: '',
        defaultWarehouseName: 'Kho công ty',
        hasOpeningStockHistory: false
    }), '');
});

test('product grid keeps the native checkbox filter and local datasource behavior', () => {
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/Products/ProductList.cshtml.js'), 'utf8');

    assert.match(source, /filterSettings:\s*\{ type: 'CheckBox' \}/);
    assert.doesNotMatch(source, /dataStateChange:\s*async args/);
});
