const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const managerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/grid-interaction-manager.js'
);

function loadManager(requestAnimationFrame = callback => callback(), windowOverrides = {}, documentOverrides = {}) {
    const document = {
        readyState: 'loading',
        addEventListener() { },
        querySelectorAll: () => [],
        ...documentOverrides
    };
    const window = {
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame,
        ...windowOverrides
    };
    vm.runInNewContext(fs.readFileSync(managerPath, 'utf8'), {
        window,
        document,
        console,
        setTimeout,
        clearTimeout
    });
    return window.GridInteractionManager;
}

function loadInteractiveManager() {
    function PopupComponent(options = {}) {
        Object.assign(this, options);
    }
    PopupComponent.prototype.appendTo = function (host) {
        this.host = host;
    };

    const document = {
        readyState: 'loading',
        addEventListener() { },
        querySelector() { return null; }
    };
    const window = {
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: callback => callback(),
        ej: {
            calendars: { DatePicker: PopupComponent },
            dropdowns: { DropDownList: PopupComponent }
        }
    };
    vm.runInNewContext(fs.readFileSync(managerPath, 'utf8'), {
        window,
        document,
        console,
        setTimeout,
        clearTimeout
    });
    return { manager: window.GridInteractionManager, PopupComponent };
}

function createBatchGrid({ invalid = false, persistFails = false } = {}) {
    let changes = { addedRecords: [], changedRecords: [], deletedRecords: [] };
    const calls = [];
    const reopenedEditors = [];
    const grid = {
        isEdit: true,
        editSettings: { mode: 'Batch' },
        getCurrentViewRecords: () => [],
        getBatchChanges: () => changes,
        endEdit() {
            throw new Error('Batch save must commit with saveCell(), not endEdit().');
        },
        editModule: {
            formObj: { validate: () => true },
            saveCell() {
                setTimeout(() => {
                    changes = {
                        addedRecords: [{ id: 'new-1', productId: 'product-1', warehouseId: 'warehouse-1', quantity: 2, unitPrice: 100 }],
                        changedRecords: [],
                        deletedRecords: []
                    };
                    grid.isEdit = false;
                }, 15);
            },
            batchSave() {
                const batchChanges = changes;
                const beforeArgs = { batchChanges, cancel: false };
                grid.beforeBatchSave?.(beforeArgs);
                if (beforeArgs.cancel) return;

                // Syncfusion clears its client batch buffer before the async page CRUD
                // callback has completed. The manager must still wait for that callback.
                changes = { addedRecords: [], changedRecords: [], deletedRecords: [] };
                setTimeout(() => grid.actionComplete({ requestType: 'batchsave', batchChanges }), 10);
            }
        },
        getRowIndexByPrimaryKey: id => id === 'new-1' ? 0 : -1,
        editCell: (rowIndex, field) => reopenedEditors.push([rowIndex, field]),
        actionBegin(args) {
            if (invalid && args.requestType === 'save') {
                args.cancel = true;
                args.invalidField = 'taxId';
                args.validationFeedback = Promise.resolve();
            }
        },
        async actionComplete(args) {
            if (args.requestType !== 'save') return;
            await new Promise(resolve => setTimeout(resolve, 25));
            if (persistFails) throw new Error('Item API failed.');
            calls.push(`${args.action}:${args.data.productId}`);
        }
    };
    const stageQuantityChange = () => {
        grid.isEdit = false;
        changes = {
            addedRecords: [],
            changedRecords: [{ id: 'item-1', productId: 'product-1', warehouseId: 'warehouse-1', quantity: 3, unitPrice: 100 }],
            deletedRecords: []
        };
    };
    return { grid, calls, reopenedEditors, stageQuantityChange };
}

test('save commits the active cell and waits for lowercase batchsave CRUD completion', async () => {
    const manager = loadManager();
    const { grid, calls } = createBatchGrid();
    let afterPersistCompleted = false;
    manager.track(grid, {
        afterPersist: async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            afterPersistCompleted = true;
        }
    });

    const saved = await manager.save(grid);

    assert.equal(saved, true);
    assert.deepEqual(calls, ['add:product-1']);
    assert.equal(afterPersistCompleted, true);
});

test('save blocks the parent document when item validation cancels batchsave', async () => {
    const manager = loadManager();
    const { grid, calls, reopenedEditors } = createBatchGrid({ invalid: true });
    manager.track(grid);

    const saved = await manager.save(grid);

    assert.equal(saved, false);
    assert.deepEqual(calls, []);
    assert.deepEqual(reopenedEditors, [[0, 'taxId']]);
});

test('save blocks the parent document when asynchronous item persistence fails', async () => {
    const manager = loadManager();
    const { grid, calls } = createBatchGrid({ persistFails: true });
    manager.track(grid);

    const saved = await manager.save(grid);

    assert.equal(saved, false);
    assert.deepEqual(calls, []);
});

test('hidden empty Batch grid does not block creating the parent document', async () => {
    const manager = loadManager();
    const grid = {
        isEdit: false,
        editSettings: { mode: 'Batch' },
        getCurrentViewRecords: () => [],
        getBatchChanges() {
            throw new TypeError("Cannot read properties of undefined (reading 'getRows')");
        },
        endEdit() { }
    };
    manager.track(grid);

    assert.equal(await manager.save(grid), true);
});

test('Syncfusion Update toolbar persists changes captured by beforeBatchSave', async () => {
    const manager = loadManager();
    const { grid, calls, stageQuantityChange } = createBatchGrid();
    manager.track(grid);
    stageQuantityChange();

    grid.editModule.batchSave();
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.deepEqual(calls, ['edit:product-1']);
});

test('product selection renders the lookup name instead of its UUID', () => {
    const manager = loadManager();
    const editorData = { id: 'new-1', productId: null, unitPrice: 0 };
    const actualData = { id: 'new-1', productId: null, unitPrice: 0 };
    const addedRecord = { id: 'new-1', productId: null, unitPrice: 0 };
    const priceCell = { textContent: '', contains: () => false, querySelector: () => null };
    const productCell = { textContent: '', contains: () => false, querySelector: () => null };
    const rowElement = {};
    const editorElement = { closest: selector => selector === 'tr' ? rowElement : null };
    const grid = {
        getRows: () => [rowElement],
        getRowsObject: () => [{ data: actualData }],
        getBatchChanges: () => ({ addedRecords: [addedRecord], changedRecords: [], deletedRecords: [] }),
        getColumnByField: field => field === 'productId'
            ? { field, valueAccessor: (_, data) => data.productId === 'product-1' ? 'Dây điện 2.5mm' : '' }
            : { field },
        getColumnIndexByField: field => field === 'productId' ? 0 : 1,
        getCellFromIndex: (rowIndex, columnIndex) => columnIndex === 0 ? productCell : priceCell
    };

    const rowIndex = manager.syncBatchRowValues(grid, {
        rowData: editorData,
        editorElement,
        values: { productId: 'product-1', unitPrice: 345000 },
        formatters: { unitPrice: value => `formatted:${value}` }
    });

    assert.equal(rowIndex, 0);
    assert.equal(editorData.productId, 'product-1');
    assert.equal(actualData.productId, 'product-1');
    assert.equal(actualData.unitPrice, 345000);
    assert.equal(addedRecord.productId, 'product-1');
    assert.equal(addedRecord.unitPrice, 345000);
    assert.equal(priceCell.textContent, 'formatted:345000');
    assert.equal(productCell.textContent, 'Dây điện 2.5mm');
});

test('main grid delegates plain and additive row clicks to native multiple selection', () => {
    const manager = loadManager();
    let clears = 0;
    const enabled = [];
    const grid = {
        editSettings: { mode: 'Normal' },
        selectionSettings: { checkboxOnly: true, persistSelection: true },
        setProperties(properties) { this.selectionSettings = properties.selectionSettings; },
        clearSelection() { clears += 1; },
        rowSelecting() { grid.clearSelection(); },
        getSelectedRecords: () => [{ id: 1 }, { id: 2 }],
        toolbarModule: { enableItems: (items, value) => enabled.push([items[0], value]) }
    };

    manager.configureRowSelection(grid);
    grid.rowSelected({});

    assert.equal(grid.selectionSettings.checkboxOnly, false);
    assert.equal(grid.selectionSettings.enableSimpleMultiRowSelection, false);
    assert.equal(grid.rowSelecting, undefined);
    assert.equal(clears, 0);
    assert.deepEqual(enabled, [['EditCustom', false], ['DeleteCustom', true]]);
});

test('main grid clears deleted records from persisted selection after reload', () => {
    const manager = loadManager();
    let dataBound;
    let cleared = 0;
    const grid = {
        editSettings: { mode: 'Normal' },
        dataSource: [{ id: 'live' }],
        columns: [{ field: 'id', isPrimaryKey: true }],
        setProperties() { },
        addEventListener: (name, handler) => { if (name === 'dataBound') dataBound = handler; },
        getSelectedRecords: () => [{ id: 'deleted' }],
        clearSelection: () => { cleared += 1; }
    };

    manager.configureRowSelection(grid);
    dataBound();

    assert.equal(cleared, 1);
});

test('batch configuration defers required rules until final save and preserves read-only mode', () => {
    const manager = loadManager();
    const grid = {
        columns: [{ field: 'productId', validationRules: { required: true } }],
        editSettings: { mode: 'Batch', allowEditing: false, allowAdding: false, allowDeleting: false },
        selectionSettings: {},
        toolbar: ['Add']
    };

    manager.configureBatch(grid);

    assert.equal(Object.keys(grid.columns[0].validationRules).length, 0);
    assert.equal(grid.editSettings.allowEditing, false);
    assert.equal(grid.editSettings.allowAdding, false);
    assert.equal(grid.editSettings.allowDeleting, false);
});

test('Enter inside interactive Quick Add stays with SweetAlert and does not save the parent batch', () => {
    const input = {};
    const popup = {
        querySelector: selector => selector.includes('.qa-form') ? input : null,
        contains: target => target === input
    };
    const manager = loadManager(undefined, { Swal: { isVisible: () => true } }, {
        querySelector: selector => selector === '.swal2-popup' ? popup : null
    });
    const handlers = {};
    const root = {
        addEventListener: (name, handler) => { handlers[name] = handler; }
    };
    let prevented = false;

    manager.wireKeyboard(root);
    handlers.keydown({
        key: 'Enter',
        target: input,
        preventDefault: () => { prevented = true; },
        stopImmediatePropagation() { }
    });

    assert.equal(prevented, false);
});

test('Enter closes a passive validation warning without reaching or closing the document modal', () => {
    let closed = 0;
    const popup = { querySelector: () => null, contains: () => false };
    const manager = loadManager(undefined, {
        Swal: { isVisible: () => true, close: () => { closed += 1; } }
    }, {
        querySelector: selector => selector === '.swal2-popup' ? popup : null
    });
    const handlers = {};
    const root = { addEventListener: (name, handler) => { handlers[name] = handler; } };
    let prevented = 0;
    let stopped = 0;

    manager.wireKeyboard(root);
    handlers.keydown({
        key: 'Enter',
        target: { closest: () => null },
        preventDefault: () => { prevented += 1; },
        stopImmediatePropagation: () => { stopped += 1; }
    });

    assert.equal(prevented, 1);
    assert.equal(stopped, 1);
    assert.equal(closed, 1);
});

test('automatic grid setup leaves grouped rows and user collapse state untouched', () => {
    let collapseCalls = 0;
    let expandCalls = 0;
    const actionComplete = () => {};
    const grid = {
        groupSettings: { columns: ['warehouseName'] },
        actionComplete,
        selectionSettings: {},
        groupModule: {
            collapseAll: () => { collapseCalls += 1; },
            expandAll: () => { expandCalls += 1; }
        }
    };
    const element = { id: 'MainGrid', dataset: {}, ej2_instances: [grid] };
    const manager = loadManager(undefined, {}, {
        querySelectorAll: selector => selector === '.e-grid' ? [element] : []
    });

    manager.autoConfigure();

    assert.equal(collapseCalls, 0);
    assert.equal(expandCalls, 0);
    assert.equal(grid.actionComplete, actionComplete);
});

test('modal date and Item popups are raised above the Bootstrap dialog', () => {
    const { PopupComponent } = loadInteractiveManager();
    const host = { closest: selector => selector.includes('.modal') ? {} : null };
    const popup = new PopupComponent({ zIndex: 1000 });

    popup.appendTo(host);

    assert.equal(popup.zIndex, 2000);
    assert.equal(popup.host, host);
});

test('grids recalculate their layout after a hidden document modal is shown', () => {
    const { manager } = loadInteractiveManager();
    let refreshCalls = 0;
    const modal = {
        querySelectorAll: () => [{
            ej2_instances: [{ refresh: () => { refreshCalls += 1; } }]
        }]
    };

    manager.refreshModalGrids(modal);

    assert.equal(refreshCalls, 1);
});
