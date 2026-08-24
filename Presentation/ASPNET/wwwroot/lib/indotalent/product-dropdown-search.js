(function (root, factory) {
    'use strict';

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.ProductDropdownSearch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const normalizeText = value => {
        const text = String(value ?? '');
        const decomposed = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
        return decomposed
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .trim();
    };

    const filterByName = (products, searchText) => {
        const source = Array.isArray(products) ? products : [];
        const normalizedSearchText = normalizeText(searchText);
        if (!normalizedSearchText) return source;

        return source.filter(product => normalizeText(product?.name).includes(normalizedSearchText));
    };

    const createFilteringHandler = products => event => {
        event.preventDefaultAction = true;
        event.updateData(filterByName(products, event.text));
    };

    return {
        normalizeText,
        filterByName,
        createFilteringHandler
    };
});
