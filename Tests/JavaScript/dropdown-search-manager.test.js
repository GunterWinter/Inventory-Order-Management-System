const assert = require('node:assert/strict');
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
    const handler = search.createFilteringHandler(() => eligibleProducts, { textField: 'name' });

    handler({ text: 'day dien', updateData: value => { updatedProducts = value; } });
    assert.deepEqual(updatedProducts.map(item => item.id), ['product-1']);

    eligibleProducts = products.slice(1);
    handler({ text: '', updateData: value => { updatedProducts = value; } });
    assert.strictEqual(updatedProducts, eligibleProducts);
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

test('native select enhancement keeps the original value and change contract', () => {
    function DropDownList(options = {}) { Object.assign(this, options); }
    DropDownList.prototype.appendTo = function (host) {
        this.host = host;
        host.ej2_instances = [this];
    };
    DropDownList.prototype.dataBind = function () { this.boundValue = this.value; };
    DropDownList.prototype.destroy = function () { this.destroyed = true; };

    const listeners = {};
    let dispatchedChange = null;
    const context = {
        document: { querySelectorAll: () => [], documentElement: { lang: 'vi' } },
        ej: { dropdowns: { DropDownList } },
        UiLocalization: { getLocale: () => 'vi' },
        Event: class Event { constructor(type) { this.type = type; } },
        addEventListener() { }
    };
    const select = {
        tagName: 'SELECT',
        dataset: {},
        multiple: false,
        disabled: false,
        value: 'cash',
        options: [
            { value: '', textContent: 'Ch\u1ecdn lo\u1ea1i', disabled: false },
            { value: 'cash', textContent: 'Ti\u1ec1n m\u1eb7t', disabled: false },
            { value: 'bank', textContent: 'Ng\u00e2n h\u00e0ng', disabled: false }
        ],
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

    dropdown.change({ value: 'bank', isInteracted: true });
    assert.equal(select.value, 'bank');
    assert.equal(dispatchedChange, 'change');

    select.value = 'cash';
    listeners.change();
    assert.equal(dropdown.boundValue, 'cash');
});
