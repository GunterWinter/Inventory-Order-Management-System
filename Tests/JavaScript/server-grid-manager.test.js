const assert = require('node:assert/strict');
const test = require('node:test');
const ServerGridManager = require('../../Presentation/ASPNET/wwwroot/lib/indotalent/server-grid-manager.js');

test('server grid query clamps pages and carries search plus stable sort state', () => {
    const query = new URLSearchParams(ServerGridManager.buildQuery({
        skip: 400,
        take: 500,
        search: [{ key: 'PO-2026' }],
        sorted: [{ name: 'number', direction: 'Descending' }]
    }).slice(1));

    assert.equal(query.get('page'), '3');
    assert.equal(query.get('pageSize'), '200');
    assert.equal(query.get('search'), 'PO-2026');
    assert.equal(query.get('sortField'), 'number');
    assert.equal(query.get('sortDirection'), 'Descending');
});

test('server grid query carries Syncfusion object search state', () => {
    const query = new URLSearchParams(ServerGridManager.buildQuery({
        search: { key: 'BROWSER ALLOCATION' }
    }).slice(1));

    assert.equal(query.get('search'), 'BROWSER ALLOCATION');
});

test('server grid unwrap keeps the server total while transforming only the current page', () => {
    const source = { data: { content: { totalCount: 1_000_000, data: [{ id: 'a' }, { id: 'b' }] } } };
    const result = ServerGridManager.unwrap(source, item => ({ ...item, mapped: true }));

    assert.equal(result.count, 1_000_000);
    assert.deepEqual(result.result, [{ id: 'a', mapped: true }, { id: 'b', mapped: true }]);
});
