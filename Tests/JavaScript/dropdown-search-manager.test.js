const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const search = require('../../Presentation/ASPNET/wwwroot/lib/indotalent/dropdown-search-manager.js');

const products = [
    { id: 'product-1', name: 'D\u00e2y \u0111i\u1ec7n Tr\u1ea7n Ph\u00fa' },
    { id: 'product-2', name: '\u1ed0ng n\u01b0\u1edbc B\u00ecnh Minh' },
    { id: 'product-3', name: 'D\u00e2y c\u00e1p m\u1ea1ng' }
];

test('filters by displayed text using contains, case-insensitive and accent-insensitive matching', () => {
    assert.deepEqual(search.filterItems(products, 'DAY DIEN', 'name').map(item => item.id), ['product-1']);
    assert.deepEqual(search.filterItems(products, 'binh minh', 'name').map(item => item.id), ['product-2']);
    assert.deepEqual(search.filterItems(products, 'C\u00c1P', 'name').map(item => item.id), ['product-3']);
});

test('supports custom display fields and primitive option lists', () => {
    const statuses = [{ value: 'Draft', label: 'Nh\u00e1p' }, { value: 'Confirmed', label: '\u0110\u00e3 x\u00e1c nh\u1eadn' }];
    assert.deepEqual(search.filterItems(statuses, 'xac nhan', 'label').map(item => item.value), ['Confirmed']);
    assert.deepEqual(search.filterItems(['Ti\u1ec1n m\u1eb7t', 'Ng\u00e2n h\u00e0ng'], 'ngan', item => item), ['Ng\u00e2n h\u00e0ng']);
});

test('clearing the keyword restores the exact current eligible source', () => {
    assert.strictEqual(search.filterItems(products, '', 'name'), products);
    assert.strictEqual(search.filterItems(products, '   ', 'name'), products);
});

test('filtering handler resolves a dynamic source at search time', () => {
    let eligibleProducts = products.slice(0, 2);
    let updatedProducts = null;
    let updatedFields = null;
    const handler = search.createFilteringHandler(() => eligibleProducts, { textField: 'name' });

    handler({ text: 'day dien', updateData: (value, _query, fields) => { updatedProducts = value; updatedFields = fields; } });
    assert.deepEqual(updatedProducts.map(item => item.id), ['product-1']);
    assert.deepEqual(updatedFields, { text: 'name', value: 'id' });

    eligibleProducts = products.slice(1);
    handler({ text: '', updateData: value => { updatedProducts = value; } });
    assert.strictEqual(updatedProducts, eligibleProducts);
});

test('Syncfusion filtering receives the already matched display rows without a second query filter', () => {
    class Query {
        where(...args) { this.whereArgs = args; return this; }
    }
    globalThis.ej = { data: { Query } };
    try {
        let update = null;
        const handler = search.createFilteringHandler(products, { textField: 'name' });
        handler({
            text: 'DAY DIEN',
            updateData: (source, query, fields) => { update = { source, query, fields }; }
        });
        assert.deepEqual(update.source.map(item => item.id), ['product-1']);
        assert.equal(update.query.whereArgs, undefined);
        assert.deepEqual(update.fields, { text: 'name', value: 'id' });
    } finally {
        delete globalThis.ej;
    }
});

test('filtering handler uses the replaced eligible source and restores it when the keyword is cleared', () => {
    let eligibleProducts = products.slice(0, 2);
    const handler = search.createFilteringHandler(() => eligibleProducts, { textField: 'name' });
    let updatedProducts = null;

    eligibleProducts = [products[1], { id: 'product-4', name: 'Máy bơm Tân Tiến' }];
    handler({ text: 'tan tien', updateData: value => { updatedProducts = value; } });
    assert.deepEqual(updatedProducts.map(item => item.id), ['product-4']);

    handler({ text: '', updateData: value => { updatedProducts = value; } });
    assert.strictEqual(updatedProducts, eligibleProducts);
    assert.equal(updatedProducts.some(item => item.id === 'product-1'), false);
});

test('filtering handler restores a popup closed by Syncfusion list refresh', () => {
    let scheduled = null;
    globalThis.requestAnimationFrame = callback => { scheduled = callback; };
    try {
        const popup = { classList: { contains: () => false } };
        const input = { value: '', focus() { this.focused = true; } };
        const dropdown = { popupObj: { element: popup }, filterInput: input, showPopup() { this.opened = true; } };
        search.createFilteringHandler(products, { textField: 'name', instance: () => dropdown })({
            text: 'day dien',
            updateData() { }
        });
        scheduled();
        assert.equal(dropdown.opened, true);
        assert.equal(input.value, 'day dien');
        assert.equal(input.focused, true);
    } finally {
        delete globalThis.requestAnimationFrame;
    }
});

test('grid editor filtering keeps the dropdown alive and hides only non-matching rows', () => {
    const item = textContent => ({
        textContent,
        hidden: false,
        style: {},
        setAttribute(name, value) { this[name] = value; }
    });
    const rows = [item('Dây điện Trần Phú'), item('Ống nước Bình Minh')];
    const dropdown = { liCollections: rows };
    search.createFilteringHandler(products, {
        textField: 'name', instance: () => dropdown, preserveEditor: true
    })({ text: 'day dien', updateData() { throw new Error('must not rebuild the grid editor'); } });
    assert.equal(rows[0].hidden, false);
    assert.equal(rows[1].hidden, true);
    assert.equal(rows[1].style.display, 'none');
});

test('PO and SO product editors filter the live eligible source and PO refreshes after Quick Add', () => {
    const pageFiles = [
        'PurchaseOrders/PurchaseOrderList.cshtml.js',
        'SalesOrders/SalesOrderList.cshtml.js'
    ];

    pageFiles.forEach(relativeFile => {
        const source = fs.readFileSync(path.resolve(__dirname,
            `../../Presentation/ASPNET/FrontEnd/Pages/${relativeFile}`), 'utf8');
        assert.match(source,
            /filtering:\s*DropdownSearchManager\.createFilteringHandler\(getCurrentProductOptions/,
            `${relativeFile} must filter the current eligible products by display name.`);
        assert.match(source, /dataSource:\s*productOptions/);
    });
    const poSource = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js'), 'utf8');
    assert.match(poSource, /productObj\.dataSource\s*=\s*getSelectableProductOptions\(productEditorRow\)/,
        'Purchase Order Quick Add must refresh the active product editor data source.');
});

test('PO Add opens the product editor by the new temporary row id instead of a fixed row index', () => {
    const poSource = fs.readFileSync(
        path.join(__dirname, '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js'),
        'utf8'
    );

    assert.match(poSource, /getRowIndexByPrimaryKey\?\.\(temporaryId\)/);
    assert.match(poSource, /editNewPurchaseOrderProductCell\(temporaryId\)/);
    assert.doesNotMatch(poSource, /secondaryGrid\.obj\.editCell\(0,\s*['"]productId['"]\)/);
});

test('PO vendor and SO customer Quick Add lookups filter against the refreshed live source', () => {
    const poSource = fs.readFileSync(
        path.join(__dirname, '../../Presentation/ASPNET/FrontEnd/Pages/PurchaseOrders/PurchaseOrderList.cshtml.js'),
        'utf8'
    );
    const soSource = fs.readFileSync(
        path.join(__dirname, '../../Presentation/ASPNET/FrontEnd/Pages/SalesOrders/SalesOrderList.cshtml.js'),
        'utf8'
    );

    assert.match(poSource, /createFilteringHandler\(\s*\(\) => vendorListLookup\.searchSource/);
    assert.match(soSource, /createFilteringHandler\(\s*\(\) => customerListLookup\.searchSource/);
});

test('global Syncfusion integration enables search and preserves a custom source callback', () => {
    function DropDownList(options = {}) { Object.assign(this, options); }
    DropDownList.prototype.appendTo = function (host) { this.host = host; };
    DropDownList.prototype.dataBind = function () { this.bound = true; };

    const listeners = {};
    const context = {
        document: { querySelectorAll: () => [], documentElement: { lang: 'vi' } },
        ej: { dropdowns: { DropDownList } },
        UiLocalization: { getLocale: () => 'vi' },
        addEventListener: (name, handler) => { listeners[name] = handler; }
    };
    search.initialize(context);

    const customSource = products.slice(0, 2);
    const dropdown = new DropDownList({
        dataSource: products,
        fields: { value: 'id', text: 'name' },
        allowFiltering: false,
        filtering(event) { event.updateData(customSource, { legacy: true }); }
    });
    dropdown.appendTo('#host');

    assert.equal(dropdown.allowFiltering, true);
    assert.equal(dropdown.filterType, 'Contains');
    assert.equal(dropdown.filterBarPlaceholder, 'T\u00ecm ki\u1ebfm');
    let filtered;
    dropdown.filtering({ text: 'day dien', updateData: value => { filtered = value; } });
    assert.deepEqual(filtered.map(item => item.id), ['product-1']);

    context.UiLocalization.getLocale = () => 'en';
    listeners['ui:languagechanged']();
    assert.equal(dropdown.filterBarPlaceholder, 'Search');
    assert.equal(dropdown.bound, true);
});

test('native select enhancement keeps value, disabled state, focus and refreshed options', async () => {
    let observedMutations = null;
    let fakeDocument = null;
    function DropDownList(options = {}) { Object.assign(this, options); }
    DropDownList.prototype.appendTo = function (host) {
        this.host = host;
        host.ej2_instances = [this];
    };
    DropDownList.prototype.dataBind = function () {
        this.boundValue = this.value;
        if (this.dropFocusOnBind && fakeDocument) fakeDocument.activeElement = null;
    };
    DropDownList.prototype.destroy = function () { this.destroyed = true; };

    const listeners = {};
    let dispatchedChange = null;
    class MutationObserver {
        constructor(callback) { observedMutations = callback; }
        observe() { }
    }
    const host = {
        setAttribute() { },
        contains: element => element === host,
        focus: () => { fakeDocument.activeElement = host; },
        remove() { this.removed = true; }
    };
    fakeDocument = {
        querySelectorAll: () => [],
        documentElement: { lang: 'vi' },
        activeElement: null,
        createElement: () => host
    };
    const context = {
        document: fakeDocument,
        ej: { dropdowns: { DropDownList } },
        UiLocalization: { getLocale: () => 'vi' },
        Event: class Event { constructor(type) { this.type = type; } },
        MutationObserver,
        addEventListener() { }
    };
    const attributes = new Map();
    const select = {
        tagName: 'SELECT',
        dataset: {},
        style: { display: '' },
        hidden: false,
        multiple: false,
        disabled: false,
        value: 'cash',
        options: [
            { value: '', textContent: 'Ch\u1ecdn lo\u1ea1i', disabled: false },
            { value: 'cash', textContent: 'Ti\u1ec1n m\u1eb7t', disabled: false },
            { value: 'bank', textContent: 'Ng\u00e2n h\u00e0ng', disabled: false }
        ],
        matches: selector => selector === 'select[data-searchable-dropdown]',
        closest: selector => selector === 'select[data-searchable-dropdown]' ? select : null,
        contains: element => element === select,
        focus: () => { fakeDocument.activeElement = select; },
        getAttribute: name => attributes.get(name) ?? null,
        setAttribute: (name, value) => attributes.set(name, value),
        removeAttribute: name => attributes.delete(name),
        insertAdjacentElement: (_position, element) => { select.insertedHost = element; },
        addEventListener: (name, handler) => { listeners[name] = handler; },
        removeEventListener: name => { delete listeners[name]; },
        dispatchEvent: event => {
            dispatchedChange = event.type;
            listeners[event.type]?.(event);
        }
    };

    search.initialize(context);
    const dropdown = search.enhanceNativeSelect(select, context);
    assert.equal(dropdown.allowFiltering, true);
    assert.equal(dropdown.value, 'cash');
    assert.strictEqual(select.insertedHost, host);
    assert.equal(select.hidden, true);
    assert.equal(select.style.display, 'none');
    assert.equal(attributes.get('aria-hidden'), 'true');
    assert.equal(attributes.get('tabindex'), '-1');

    dropdown.change({ value: 'bank', isInteracted: true });
    assert.equal(select.value, 'bank');
    assert.equal(dispatchedChange, 'change');

    select.value = 'cash';
    listeners.change();
    assert.equal(dropdown.boundValue, 'cash');

    select.options.push({ value: 'wallet', textContent: 'Ví điện tử', disabled: false });
    dropdown.dropFocusOnBind = true;
    select.disabled = true;
    select.value = 'wallet';
    fakeDocument.activeElement = host;
    observedMutations([{ type: 'childList', target: select, addedNodes: [], removedNodes: [] }]);
    await Promise.resolve();

    assert.equal(dropdown.value, 'wallet');
    assert.equal(dropdown.enabled, false);
    assert.equal(dropdown.dataSource.some(item => item.value === 'wallet'), true);
    assert.strictEqual(fakeDocument.activeElement, host);

    search.destroyNativeSelect(select);
    assert.equal(dropdown.destroyed, true);
    assert.equal(host.removed, true);
    assert.equal(select.hidden, false);
    assert.equal(select.style.display, '');
    assert.equal(attributes.has('aria-hidden'), false);
    assert.equal(attributes.has('tabindex'), false);
});

test('Material Export product editor uses native filtering', () => {
    const source = fs.readFileSync(path.resolve(__dirname,
        '../../Presentation/ASPNET/FrontEnd/Pages/MaterialExports/MaterialExportList.cshtml.js'), 'utf8');

    assert.match(source, /dataSource:\s*state\.productListLookupData[\s\S]*?allowFiltering:\s*true/);
});
