const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const managerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/number-format-manager.js'
);

function loadManager() {
    const document = { addEventListener() { } };
    const window = {};
    vm.runInNewContext(fs.readFileSync(managerPath, 'utf8'), {
        window,
        document,
        Intl,
        setTimeout,
        queueMicrotask,
        requestAnimationFrame: callback => callback()
    });
    return window.NumberFormatManager;
}

test('parses Vietnamese grouping and decimal quantities without changing their scale', () => {
    const manager = loadManager();

    assert.equal(manager.parseLocaleNumber('345.000'), 345000);
    assert.equal(manager.parseLocaleNumber('1.234.567'), 1234567);
    assert.equal(manager.parseLocaleNumber('5,5'), 5.5);
    assert.equal(manager.parseLocaleNumber('5.5'), 5.5);
});

test('preserves Syncfusion n6 edit values used by opening stock and quantities', () => {
    const manager = loadManager();

    assert.equal(manager.parseLocaleNumber('2.000000'), 2);
    assert.equal(manager.formatEditableValue('2.000000'), '2,000000');
    assert.equal(manager.formatToLocale(2.25), '2,25');
});
