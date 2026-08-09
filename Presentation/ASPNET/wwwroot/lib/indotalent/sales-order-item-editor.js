(function (root, factory) {
    'use strict';

    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SalesOrderItemEditor = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const normalizeId = value => {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'object') {
            return normalizeId(value.id ?? value.value ?? value.key ?? null);
        }
        return String(value);
    };

    const resolveUnitPrice = (product, salesType) => {
        if (!product) return 0;
        const normalizedSalesType = Number(normalizeId(salesType) ?? 1);
        const price = normalizedSalesType === 2
            ? (product.costPrice ?? product.unitPrice ?? 0)
            : (product.unitPrice ?? 0);
        return Number(price) || 0;
    };

    const getAvailableWarehouses = (stockData, productId, warehouseData = []) => {
        const normalizedProductId = normalizeId(productId);
        if (!normalizedProductId) return [];

        const warehouseNames = new Map((warehouseData ?? []).map(item => [normalizeId(item.id), item.name ?? '']));
        const grouped = new Map();

        (stockData ?? [])
            .filter(item => normalizeId(item.productId) === normalizedProductId && normalizeId(item.warehouseId))
            .forEach(item => {
                const warehouseId = normalizeId(item.warehouseId);
                const current = grouped.get(warehouseId) ?? {
                    id: warehouseId,
                    name: item.warehouseName ?? warehouseNames.get(warehouseId) ?? '',
                    availableStock: 0
                };
                current.availableStock += Number(item.stock ?? 0);
                grouped.set(warehouseId, current);
            });

        return [...grouped.values()]
            .filter(item => item.availableStock > 0)
            .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
    };

    const getSelectableProducts = ({ products, stockData, warehouseData, selectedProductIds, currentRow }) => {
        const selected = new Set([...(selectedProductIds ?? [])].map(normalizeId).filter(Boolean));
        const currentProductId = normalizeId(currentRow?.productId);
        const hasPersistedRow = !!normalizeId(currentRow?.id);

        return (products ?? []).filter(product => {
            const productId = normalizeId(product.id);
            const isPersistedCurrentProduct = hasPersistedRow && productId === currentProductId;
            const isAvailableForSale = product.physical === false
                || getAvailableWarehouses(stockData, productId, warehouseData).length > 0;

            return isPersistedCurrentProduct || (!selected.has(productId) && isAvailableForSale);
        });
    };

    const buildProductSelection = ({ rowData = {}, product, warehouseOptions = [], salesType }) => {
        if (!product) return null;

        const productId = normalizeId(product.id);
        const previousProductId = normalizeId(rowData.productId);
        const currentWarehouseId = normalizeId(rowData.warehouseId);
        const defaultWarehouseId = normalizeId(product.defaultWarehouseId);
        const hasWarehouse = warehouseId => !!warehouseId
            && warehouseOptions.some(item => normalizeId(item.id) === warehouseId);
        const warehouseId = product.physical === false
            ? null
            : previousProductId === productId && hasWarehouse(currentWarehouseId)
                ? currentWarehouseId
                : hasWarehouse(defaultWarehouseId)
                    ? defaultWarehouseId
                    : null;
        const warehouse = warehouseOptions.find(item => normalizeId(item.id) === warehouseId);
        const serialTracked = product.physical === true && Number(product.serialTrackingMode ?? 0) !== 0;
        const previousQuantity = Number(rowData.quantity ?? 0);
        const quantity = serialTracked
            ? 0
            : previousProductId === productId && previousQuantity > 0
                ? previousQuantity
                : 1;
        const unitPrice = resolveUnitPrice(product, salesType);

        return {
            productId,
            productName: product.name ?? '',
            productNumber: product.number ?? '',
            productReferenceCode: product.referenceCode ?? '',
            warehouseId,
            warehouseName: warehouse?.name ?? '',
            warrantyMonths: Number(product.defaultWarrantyMonths ?? 0),
            unitPrice,
            quantity,
            total: unitPrice * quantity,
            summary: product.description ?? '',
            serialTracked,
            productChanged: previousProductId !== productId
        };
    };

    const normalizeSerialSelection = selectedSerials => {
        const unique = new Map();
        for (const serial of selectedSerials ?? []) {
            const id = normalizeId(serial?.id);
            if (!id || unique.has(id)) continue;
            unique.set(id, serial);
        }

        const serials = [...unique.values()];
        return {
            ids: serials.map(item => normalizeId(item.id)),
            numbers: serials
                .map(item => item.internalSerialNumber ?? item.manufacturerSerialNumber ?? '')
                .filter(Boolean)
                .join(', '),
            quantity: serials.length
        };
    };

    return {
        normalizeId,
        resolveUnitPrice,
        getAvailableWarehouses,
        getSelectableProducts,
        buildProductSelection,
        normalizeSerialSelection
    };
});
