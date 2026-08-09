const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const managerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/grid-interaction-manager.js'
);

function loadManager() {
    const document = {
        readyState: 'loading',
        addEventListener() { }
    };
    const window = {
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: callback => callback()
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

test('grouped grid collapses only after group caption rows are rendered', () => {
    const manager = loadManager();
    let rendered = false;
    let collapseCalls = 0;
    const grid = {
        element: {
            querySelector: selector => rendered && selector === '.e-groupcaptionrow' ? {} : null
        },
        groupModule: {
            collapseAll: () => { collapseCalls += 1; }
        }
    };

    manager.collapseGroupsOnFirstLoad(grid);
    assert.equal(collapseCalls, 0);

    rendered = true;
    manager.collapseGroupsOnFirstLoad(grid);
    manager.collapseGroupsOnFirstLoad(grid);

    assert.equal(collapseCalls, 1);
});
