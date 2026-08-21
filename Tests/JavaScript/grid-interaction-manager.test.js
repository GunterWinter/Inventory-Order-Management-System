const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const managerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/grid-interaction-manager.js'
);

function loadManager(requestAnimationFrame = callback => callback()) {
    const document = {
        readyState: 'loading',
        addEventListener() { }
    };
    const window = {
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame
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
                        addedRecords: [{ productId: 'product-1', warehouseId: 'warehouse-1', quantity: 2, unitPrice: 100 }],
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
        actionBegin(args) {
            if (invalid && args.requestType === 'save') args.cancel = true;
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
    return { grid, calls, stageQuantityChange };
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
    const { grid, calls } = createBatchGrid({ invalid: true });
    manager.track(grid);

    const saved = await manager.save(grid);

    assert.equal(saved, false);
    assert.deepEqual(calls, []);
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

test('product selection synchronizes a detached Batch editor row immediately', () => {
    const manager = loadManager();
    const editorData = { id: 'new-1', productId: null, unitPrice: 0 };
    const actualData = { id: 'new-1', productId: null, unitPrice: 0 };
    const addedRecord = { id: 'new-1', productId: null, unitPrice: 0 };
    const priceCell = { textContent: '', contains: () => false, querySelector: () => null };
    const productCell = { textContent: '', contains: element => element === editorElement, querySelector: () => ({}) };
    const rowElement = {};
    const editorElement = { closest: selector => selector === 'tr' ? rowElement : null };
    const grid = {
        getRows: () => [rowElement],
        getRowsObject: () => [{ data: actualData }],
        getBatchChanges: () => ({ addedRecords: [addedRecord], changedRecords: [], deletedRecords: [] }),
        getColumnByField: field => ({ field }),
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
    assert.equal(productCell.textContent, '');
});

test('grouped grid collapses after every data bind without re-entrant loops', () => {
    const manager = loadManager();
    let collapseCalls = 0;
    const grid = {
        groupSettings: { columns: ['customerName'] },
        groupModule: {
            collapseAll: () => {
                collapseCalls += 1;
                manager.collapseGroupsOnDataBound(grid);
            }
        }
    };

    manager.collapseGroupsOnDataBound(grid);
    assert.equal(collapseCalls, 1);

    manager.collapseGroupsOnDataBound(grid);
    assert.equal(collapseCalls, 2);

    manager.collapseGroupsOnFirstLoad(grid);
    assert.equal(collapseCalls, 3);
});

test('grouped grid waits until Syncfusion row objects have matching DOM rows', () => {
    const animationFrames = [];
    const manager = loadManager(callback => animationFrames.push(callback));
    let collapseCalls = 0;
    let rowElement = null;
    const grid = {
        element: { isConnected: true },
        groupSettings: { columns: ['customerName'] },
        getRowsObject: () => [{ isDataRow: true, uid: 'row-1' }],
        getRowElementByUID: () => rowElement,
        groupModule: { collapseAll: () => { collapseCalls += 1; } }
    };

    manager.collapseGroupsOnDataBound(grid);
    animationFrames.shift()();
    assert.equal(collapseCalls, 0);

    rowElement = { style: {} };
    animationFrames.shift()();
    assert.equal(collapseCalls, 1);
    animationFrames.shift()();
});

test('queued group collapse is discarded when the grid is ungrouped', () => {
    const animationFrames = [];
    const manager = loadManager(callback => animationFrames.push(callback));
    let collapseCalls = 0;
    const grid = {
        groupSettings: { columns: ['customerName'] },
        groupModule: { collapseAll: () => { collapseCalls += 1; } }
    };

    manager.collapseGroupsOnDataBound(grid);
    grid.groupSettings.columns = [];
    animationFrames.shift()();

    assert.equal(collapseCalls, 0);
});

test('group collapse retries the known Syncfusion transient row-style failure', () => {
    const animationFrames = [];
    const manager = loadManager(callback => animationFrames.push(callback));
    let collapseCalls = 0;
    const grid = {
        groupSettings: { columns: ['customerName'] },
        groupModule: {
            collapseAll: () => {
                collapseCalls += 1;
                if (collapseCalls === 1) {
                    const error = new TypeError("Cannot read properties of null (reading 'style')");
                    error.stack = `${error.stack}\nGroup.updateVisibleexpandCollapseRows`;
                    throw error;
                }
            }
        }
    };

    manager.collapseGroupsOnDataBound(grid);
    animationFrames.shift()();
    animationFrames.shift()();
    animationFrames.shift()();

    assert.equal(collapseCalls, 2);
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
