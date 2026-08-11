const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDateFormatManager(initialLocale = 'vi') {
    let locale = initialLocale;
    const listeners = new Map();

    function Grid() {
        this.columns = [];
    }
    Grid.prototype.appendTo = function () {};

    function DatePicker(options = {}) {
        Object.assign(this, options);
    }
    DatePicker.prototype.appendTo = function () {};

    const document = {
        addEventListener() {},
        querySelectorAll() { return []; }
    };
    const window = {
        document,
        UiLocalization: { getLocale: () => locale },
        ej: { grids: { Grid }, calendars: { DatePicker } },
        addEventListener(name, handler) { listeners.set(name, handler); }
    };
    window.window = window;

    const context = vm.createContext({ window, Intl, Date, console });
    const source = fs.readFileSync(path.join(
        __dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/date-format-manager.js'
    ), 'utf8');
    vm.runInContext(source, context);

    return {
        manager: window.DateFormatManager,
        Grid,
        DatePicker,
        setLocale(value) {
            locale = value;
            listeners.get('ui:languagechanged')?.();
        }
    };
}

test('hiển thị ngày Việt Nam theo dd/MM/yyyy nhưng API vẫn dùng yyyy-MM-dd', () => {
    const { manager } = loadDateFormatManager('vi');

    assert.equal(manager.formatToLocale('2026-08-11'), '11/08/2026');
    assert.equal(manager.formatForApiDate(new Date(2026, 7, 11)), '2026-08-11');
    assert.equal(manager.datePickerOptions().format, 'dd/MM/yyyy');
});

test('grid và DatePicker tự chuẩn hóa format theo ngôn ngữ hiện tại', () => {
    const runtime = loadDateFormatManager('vi');
    const grid = new runtime.Grid();
    grid.columns = [
        { field: 'orderDate', format: 'yyyy-MM-dd' },
        { field: 'createdAtUtc', format: 'yyyy-MM-dd HH:mm' }
    ];
    grid.appendTo({});

    assert.equal(grid.columns[0].format, 'dd/MM/yyyy');
    assert.equal(grid.columns[1].format, 'dd/MM/yyyy HH:mm');

    const picker = new runtime.DatePicker({ format: 'yyyy-MM-dd', locale: 'en-US' });
    picker.appendTo({});
    assert.equal(picker.format, 'dd/MM/yyyy');
    assert.equal(picker.locale, 'vi');

    runtime.setLocale('en');
    assert.equal(runtime.manager.datePickerOptions().format, 'MM/dd/yyyy');
});
