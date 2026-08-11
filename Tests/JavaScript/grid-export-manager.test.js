const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadManager() {
    const document = {
        readyState: 'loading',
        addEventListener() { },
        querySelector() { return { textContent: 'Finance Report' }; }
    };
    const window = { console, alert() { } };
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/wwwroot/lib/indotalent/grid-export-manager.js'), 'utf8');
    vm.runInNewContext(source, { window, document, console, MutationObserver: class { observe() { } } });
    return window.GridExportManager;
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
