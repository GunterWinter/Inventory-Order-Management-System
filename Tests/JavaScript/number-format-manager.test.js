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

function loadInteractiveManager() {
    const listeners = {};
    class FakeInput {
        constructor() {
            this.dataset = {};
            this.value = '';
            this.selectionStart = 0;
            this.selectionEnd = 0;
        }

        addEventListener() { }
        setSelectionRange(start, end) {
            this.selectionStart = start;
            this.selectionEnd = end;
        }
    }

    class NumericTextBox {
        constructor(options = {}) {
            Object.assign(this, options);
            this.element = new FakeInput();
            this.element.value = options.value == null ? '' : String(options.value);
        }

        appendTo() { }
        setProperties(properties) { Object.assign(this, properties); }
        inputHandler() { }
        keyPressHandler() { }
        changeHandler() { }
        focusHandler() { }
        focusOutHandler() { this.value = 12; }
    }

    const document = {
        activeElement: null,
        addEventListener(name, handler) {
            if (!listeners[name]) listeners[name] = [];
            listeners[name].push(handler);
        }
    };
    const window = { ej: { inputs: { NumericTextBox } } };
    vm.runInNewContext(fs.readFileSync(managerPath, 'utf8'), {
        window,
        document,
        Intl,
        HTMLInputElement: FakeInput,
        setTimeout,
        queueMicrotask,
        requestAnimationFrame: callback => callback()
    });
    return { manager: window.NumberFormatManager, NumericTextBox, listeners, document };
}

test('parses Vietnamese grouping and decimal quantities without changing their scale', () => {
    const manager = loadManager();

    assert.equal(manager.parseLocaleNumber('345.000'), 345000);
    assert.equal(manager.parseLocaleNumber('1.234.567'), 1234567);
    assert.equal(manager.parseLocaleNumber('5,5'), 5.5);
    assert.equal(manager.parseLocaleNumber('5.5'), 55);
    assert.equal(manager.parseLocaleNumber('200.000,25'), 200000.25);
    assert.equal(manager.formatToLocale(12350.231), '12.350,231');
});

test('uses only the comma as the Vietnamese decimal separator', () => {
    const manager = loadManager();

    assert.equal(manager.parseLocaleNumber('2.000000'), 2000000);
    assert.equal(manager.formatEditableValue('2.000000'), '2.000.000');
    assert.equal(manager.normalizeNumberString('12.322,'), '12322.');
    assert.equal(manager.formatEditableValue('12322,'), '12.322,');
    assert.equal(manager.parseLocaleNumber('2,1234567'), 2.123456);
    assert.equal(manager.formatToLocale(2.25), '2,25');
});

test('formats accounting money with Vietnamese grouping and a decimal comma', () => {
    const manager = loadManager();

    assert.equal(manager.formatMoneyToLocale(10000000), '10.000.000');
    assert.equal(manager.formatMoneyToLocale(12350.231), '12.350,231');
});

test('handles negative, empty and six-digit Vietnamese decimals', () => {
    const manager = loadManager();

    assert.equal(manager.parseLocaleNumber('1.234'), 1234);
    assert.equal(manager.parseLocaleNumber('1.234,56'), 1234.56);
    assert.equal(manager.parseLocaleNumber('0,25'), 0.25);
    assert.equal(manager.parseLocaleNumber('-1.234,5'), -1234.5);
    assert.equal(manager.parseLocaleNumber('2,1234567'), 2.123456);
    assert.equal(manager.parseLocaleNumber(12.5), 12.5);
    assert.equal(manager.parseLocaleNumber(''), null);
    assert.equal(manager.parseLocaleNumber('không phải số'), null);
});

test('explicit numeric policies distinguish money decimals and integers', () => {
    const manager = loadManager();
    const money = {};
    const integer = {};

    manager.configureNumericTextBox(money, { kind: manager.numericKind.money, step: 0.01 });
    manager.configureNumericTextBox(integer, { kind: manager.numericKind.integer, min: 0 });

    assert.equal(money.format, 'n6');
    assert.equal(money.decimals, 6);
    assert.equal(money.step, 0.01);
    assert.equal(integer.format, 'n0');
    assert.equal(integer.decimals, 0);
    assert.equal(integer.validateDecimalOnType, true);
    assert.equal(manager.createGridValueAccessor(manager.numericKind.money)('amount', { amount: 1234.5 }), '1.234,5');
});

test('grid reads the latest Vietnamese decimal after blur even when Syncfusion overwrites its value', () => {
    const { manager, NumericTextBox, listeners, document } = loadInteractiveManager();
    const numeric = new NumericTextBox({ numericKind: 'decimal', value: 1 });
    numeric.appendTo();
    document.activeElement = numeric.element;
    numeric.element.value = '1,2';
    numeric.element.selectionStart = numeric.element.value.length;
    numeric.element.selectionEnd = numeric.element.value.length;

    listeners.input.forEach(handler => handler({ target: numeric.element }));
    listeners.blur.forEach(handler => handler({ target: numeric.element }));
    numeric.focusOutHandler({ target: numeric.element });

    assert.equal(manager.readNumericTextBoxValue(numeric), 1.2);
});

test('grid reads the stored locale value after Syncfusion consumes blur state', () => {
    const { manager, NumericTextBox, listeners, document } = loadInteractiveManager();
    const numeric = new NumericTextBox({ numericKind: 'decimal', value: 0, decimals: 6 });
    numeric.appendTo();
    document.activeElement = numeric.element;
    numeric.element.value = '2,123456';
    numeric.element.selectionStart = numeric.element.value.length;
    numeric.element.selectionEnd = numeric.element.value.length;

    listeners.input.forEach(handler => handler({ target: numeric.element }));
    listeners.blur.forEach(handler => handler({ target: numeric.element }));
    numeric.focusOutHandler({ target: numeric.element });
    numeric.value = 2123456;

    assert.equal(manager.readNumericTextBoxValue(numeric), 2.123456);
});
