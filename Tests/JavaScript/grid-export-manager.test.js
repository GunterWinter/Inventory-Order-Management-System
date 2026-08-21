const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadManager(initialLocale = 'en') {
    const localeState = { value: initialLocale };
    const document = {
        readyState: 'loading',
        addEventListener() { },
        querySelector() { return { textContent: 'Finance Report' }; }
    };
    const translations = { Amount: 'Số tiền', Number: 'Số chứng từ' };
    const window = {
        console,
        alert() { },
        UiLocalization: {
            getLocale: () => localeState.value,
            translateText(value, locale) {
                if (locale === 'vi') return translations[value] ?? value;
                const english = Object.entries(translations).find(([, vietnamese]) => vietnamese === value)?.[0];
                return english ?? value;
            }
        }
    };
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/grid-export-manager.js'), 'utf8');
    vm.runInNewContext(source, { window, document, console, MutationObserver: class { observe() { } } });
    return Object.assign(window.GridExportManager, {
        setLocale: locale => { localeState.value = locale; }
    });
}

test('Excel export removes technical and action columns', () => {
    const manager = loadManager();
    const columns = manager.getExportColumns({ columns: [
        { type: 'checkbox' },
        { field: 'id', headerText: 'Id' },
        { field: 'number', headerText: 'Number' },
        { field: 'amount', headerText: 'Amount', type: 'number' },
        { field: 'secret', visible: false },
        { field: 'actions', commands: [{}] }
    ] });
    assert.deepEqual(JSON.parse(JSON.stringify(columns)).map(column => column.field), ['number', 'amount']);
});

test('Excel export requests every filtered page and preserves caller options', async () => {
    const manager = loadManager();
    let properties;
    const ok = await manager.exportExcel({ columns: [{ field: 'number', headerText: 'Number' }] },
        { fileName: 'custom.xlsx' },
        value => { properties = value; });
    assert.equal(ok, true);
    assert.equal(properties.exportType, 'AllPages');
    assert.equal(properties.fileName, 'custom.xlsx');
});

test('Excel export derives headers from the original grid header in the active locale', () => {
    const manager = loadManager('vi');
    const grid = { columns: [
        { field: 'amount', headerText: 'Số tiền', __originalHeaderText: 'Amount', type: 'number' }
    ] };

    assert.equal(manager.getExportColumns(grid)[0].headerText, 'Số tiền');
    manager.setLocale('en');
    assert.equal(manager.getExportColumns(grid)[0].headerText, 'Amount');
});

test('Excel export resolves localized columns when export is invoked', async () => {
    const manager = loadManager('en');
    const grid = { columns: [{ field: 'number', headerText: 'Number', __originalHeaderText: 'Number' }] };
    let properties;

    manager.setLocale('vi');
    const ok = await manager.exportExcel(grid, {}, value => { properties = value; });

    assert.equal(ok, true);
    assert.equal(properties.columns[0].headerText, 'Số chứng từ');
});
