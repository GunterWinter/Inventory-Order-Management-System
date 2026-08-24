const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            customerListLookupData: [],
            taxListLookupData: [],
            salesOrderStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            warehouseListLookupData: [],
            inventoryStockData: [],
            inventoryAvailabilityReady: false,
            paymentStatusLookupData: [],
            cashAccountListData: [],
            cashCategoryListData: [],
            mainTitle: null,
            id: '',
            number: '',
            orderDate: '',
            description: '',
            customerId: null,
            salesType: 1,
            orderStatus: null,
            salesTypeListLookupData: [],
            errors: {
                orderDate: '',
                customerId: '',
                salesType: '',
                orderStatus: '',
                description: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            subTotalAmount: '0',
            taxAmount: '0',
            totalAmount: '0',
            isViewMode: false
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const orderDateRef = Vue.ref(null);
        const numberRef = Vue.ref(null);
        const customerIdRef = Vue.ref(null);
        const salesTypeRef = Vue.ref(null);
        const orderStatusRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);

        const toDateTicks = (value) => value ? new Date(value).getTime() : 0;
        const formatQuantity = (value) => NumberFormatManager.formatToLocale(value ?? 0);
        const getErrorMessage = (error, defaultMsg = 'Vui lòng thử lại.') => {
            if (!error) return defaultMsg;
            if (typeof error === 'string') return error;
            console.error('SalesOrder Error detail:', error);
            const responseData = error.response?.data;
            if (responseData) {
                if (typeof responseData === 'string') return responseData;
                if (responseData.message) return responseData.message;
                if (responseData.detail) return responseData.detail;
                if (responseData.title) return responseData.title;
                if (responseData.errors && typeof responseData.errors === 'object') {
                    const messages = [];
                    for (const key in responseData.errors) {
                        if (Array.isArray(responseData.errors[key])) {
                            messages.push(`${key}: ${responseData.errors[key].join(', ')}`);
                        } else if (typeof responseData.errors[key] === 'string') {
                            messages.push(`${key}: ${responseData.errors[key]}`);
                        }
                    }
                    if (messages.length > 0) return messages.join('\n');
                }
            }
            if (error.message) return error.message;
            return defaultMsg;
        };
        const normalizeLookupId = value => SalesOrderItemEditor.normalizeId(value);
        const getAllSecondaryRows = () => {
            const rowsById = new Map();
            const addRows = rows => (rows ?? []).forEach((row, index) => {
                const key = normalizeLookupId(row?.id) ?? `row-${index}-${normalizeLookupId(row?.productId) ?? ''}`;
                rowsById.set(key, row);
            });
            addRows(state.secondaryData);
            addRows(secondaryGrid?.obj?.getCurrentViewRecords?.());
            addRows(secondaryGrid?.obj?.getRowsObject?.().map(row => row.data));
            const changes = secondaryGrid?.obj?.getBatchChanges?.();
            addRows(changes?.addedRecords);
            addRows(changes?.changedRecords);
            (changes?.deletedRecords ?? []).forEach(row => rowsById.delete(normalizeLookupId(row?.id)));
            return [...rowsById.values()];
        };
        const getSelectedProductIds = (currentRowId = null) => {
            const normalizedCurrentRowId = normalizeLookupId(currentRowId);
            return new Set(getAllSecondaryRows()
                .filter(item => normalizeLookupId(item.id) !== normalizedCurrentRowId && item.productId)
                .map(item => normalizeLookupId(item.productId))
            );
        };
        const getAvailableWarehouseOptions = productId => SalesOrderItemEditor.getAvailableWarehouses(
            state.inventoryStockData,
            normalizeLookupId(productId),
            state.warehouseListLookupData
        );
        const getAvailableStock = (productId, warehouseId) => state.inventoryStockData
            .filter(item =>
                normalizeLookupId(item.productId) === normalizeLookupId(productId) &&
                normalizeLookupId(item.warehouseId) === normalizeLookupId(warehouseId)
            )
            .reduce((total, item) => total + Number(item.stock ?? 0), 0);
        const updateEditorRowCell = (element, field, value) => {
            const row = element?.closest?.('tr');
            const rowIndex = row && secondaryGrid.obj ? secondaryGrid.obj.getRows().indexOf(row) : -1;
            if (rowIndex >= 0) secondaryGrid.obj.updateCell(rowIndex, field, value);
        };
        const getSalesOrderItemAmounts = (row, overrides = {}) => {
            const productId = normalizeLookupId(overrides.productId ?? row?.productId);
            const serialIds = overrides.productSerialIds ?? row?.productSerialIds ?? [];
            const quantity = isSerialTrackedProduct(productId) && serialIds.length > 0
                ? serialIds.length
                : Number(overrides.quantity ?? row?.quantity ?? 0) || 0;
            const unitPrice = Number(overrides.unitPrice ?? row?.unitPrice ?? 0) || 0;
            const taxId = normalizeLookupId(overrides.taxId ?? row?.taxId);
            const taxPercentage = Number(state.taxListLookupData.find(item =>
                normalizeLookupId(item.id) === taxId)?.percentage ?? 0) || 0;
            const total = quantity * unitPrice;
            const taxAmount = total * taxPercentage / 100;
            return { quantity, unitPrice, taxId, total, taxAmount, afterTaxAmount: total + taxAmount };
        };
        const applySalesOrderItemAmounts = (row, overrides = {}) => {
            if (!row) return null;
            const amounts = getSalesOrderItemAmounts(row, overrides);
            Object.assign(row, amounts);
            return amounts;
        };
        const applySalesOrderProductDefaults = (row, productId) => {
            const normalizedProductId = normalizeLookupId(productId);
            const product = state.productListLookupData.find(item => normalizeLookupId(item.id) === normalizedProductId);
            if (!row || !product) return null;

            const selection = SalesOrderItemEditor.buildProductSelection({
                rowData: row,
                product,
                warehouseOptions: getAvailableWarehouseOptions(normalizedProductId),
                salesType: state.salesType
            });
            const { serialTracked, productChanged, ...values } = selection;
            values.availableStock = getAvailableStock(values.productId, values.warehouseId);
            Object.assign(row, values);
            if (productChanged) clearSerialSelection(row);
            applySalesOrderItemAmounts(row);
            return { ...values, total: row.total, taxAmount: row.taxAmount, afterTaxAmount: row.afterTaxAmount, serialTracked };
        };
        const writeSalesOrderBatchFields = (row, values, editorElement = null) => {
            const grid = secondaryGrid?.obj;
            if (!grid || !row || !values) return;
            const numberFormatter = value => NumberFormatManager.formatToLocale(value ?? 0);
            const moneyFormatter = value => NumberFormatManager.formatMoneyToLocale(value ?? 0);
            GridInteractionManager.syncBatchRowValues(grid, {
                rowData: row,
                editorElement,
                values,
                formatters: {
                    warehouseId: (value, data) => data.warehouseName ?? '',
                    availableStock: numberFormatter,
                    unitPrice: moneyFormatter,
                    quantity: numberFormatter,
                    total: moneyFormatter,
                    taxAmount: moneyFormatter,
                    afterTaxAmount: moneyFormatter
                }
            });
        };
        const editNewSalesOrderProductCell = (temporaryId, attempt = 0) => {
            const grid = secondaryGrid?.obj;
            if (!grid || grid.isDestroyed) return;
            const rowIndex = grid.getRowIndexByPrimaryKey?.(temporaryId) ?? -1;
            const rowElement = rowIndex >= 0
                ? (grid.getRowByIndex?.(rowIndex) ?? grid.getRows?.()[rowIndex])
                : null;
            if (rowIndex >= 0 && rowElement) {
                grid.editCell(rowIndex, 'productId');
                return;
            }
            if (attempt < 8) {
                requestAnimationFrame(() => editNewSalesOrderProductCell(temporaryId, attempt + 1));
            }
        };
        const getSelectableProductOptions = (currentRow = {}) => {
            const selectedProductIds = getSelectedProductIds(currentRow.id ?? null);
            return SalesOrderItemEditor.getSelectableProducts({
                products: state.productListLookupData,
                stockData: state.inventoryStockData,
                warehouseData: state.warehouseListLookupData,
                selectedProductIds,
                currentRow
            });
        };
        const isSerialTrackedProduct = (productId) => {
            const normalizedProductId = normalizeLookupId(productId);
            const product = state.productListLookupData.find(item => normalizeLookupId(item.id) === normalizedProductId);
            return product?.physical === true && Number(product?.serialTrackingMode ?? 0) !== 0;
        };
        const clearSerialSelection = (rowData) => {
            rowData.productSerialIds = [];
            rowData.productSerialNumbers = '';
        };
        const applySerialSelection = (rowData, selectedSerials) => {
            if (selectedSerials === null) return null;
            const selection = SalesOrderItemEditor.normalizeSerialSelection(selectedSerials);
            rowData.productSerialIds = selection.ids;
            rowData.productSerialNumbers = selection.numbers;
            rowData.quantity = selection.quantity;
            const amounts = applySalesOrderItemAmounts(rowData);
            return {
                productSerialIds: selection.ids,
                productSerialNumbers: selection.numbers,
                ...amounts
            };
        };
        const enrichSalesOrderItem = (item) => ({
            ...item,
            productId: normalizeLookupId(item.productId),
            warehouseId: normalizeLookupId(item.warehouseId),
            taxId: normalizeLookupId(item.taxId),
            availableStock: getAvailableStock(item.productId, item.warehouseId),
            productSerialIds: Array.isArray(item.productSerialIds)
                ? item.productSerialIds.map(normalizeLookupId).filter(Boolean)
                : [],
            productSerialNumbers: typeof item.productSerialNumbers === 'string'
                ? item.productSerialNumbers
                : ''
        });
        const syncSecondaryAvailability = () => {
            state.secondaryData = state.secondaryData.map(enrichSalesOrderItem);
            if (secondaryGrid.obj) {
                secondaryGrid.refresh();
            }
        };

        const validateForm = function () {
            state.errors.orderDate = '';
            state.errors.customerId = '';
            state.errors.orderStatus = '';

            let isValid = true;

            if (!state.orderDate) {
                state.errors.orderDate = 'Order date is required.';
                isValid = false;
            }
            if (!state.customerId) {
                state.errors.customerId = 'Customer is required.';
                isValid = false;
            }
            if (!state.orderStatus) {
                state.errors.orderStatus = 'Order status is required.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.orderDate = '';
            state.description = '';
            state.customerId = null;
            state.salesType = 1;
            state.orderStatus = '0';
            state.errors = {
                orderDate: '',
                customerId: '',
                salesType: '',
                orderStatus: '',
                description: ''
            };
            state.secondaryData = [];
            state.subTotalAmount = '0';
            state.taxAmount = '0';
            state.totalAmount = '0';
            state.showComplexDiv = false;
        };

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesOrder/GetSalesOrderList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (orderDate, description, orderStatus, customerId, salesType, createdById) => {
                try {
                    const response = await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
                        orderDate, description, orderStatus, customerId, salesType: Number(normalizeLookupId(salesType) ?? 1), createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, orderDate, description, orderStatus, customerId, salesType, updatedById) => {
                try {
                    const response = await AxiosManager.post('/SalesOrder/UpdateSalesOrder', {
                        id, orderDate, description, orderStatus, customerId, salesType: Number(normalizeLookupId(salesType) ?? 1), updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSalesTypeListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesOrder/GetSalesTypeList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/SalesOrder/DeleteSalesOrder', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getCustomerListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Customer/GetCustomerList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getTaxListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Tax/GetTaxList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSalesOrderStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesOrder/GetSalesOrderStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (salesOrderId) => {
                try {
                    const response = await AxiosManager.get('/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=' + salesOrderId, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (unitPrice, quantity, summary, productId, warehouseId, warrantyMonths, taxId, salesOrderId, createdById, productSerialIds) => {
                try {
                    if (productSerialIds?.length) quantity = productSerialIds.length;
                    const response = await AxiosManager.post('/SalesOrderItem/CreateSalesOrderItem', {
                        unitPrice, quantity, summary, productId, warehouseId, warrantyMonths, taxId, salesOrderId, createdById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, unitPrice, quantity, summary, productId, warehouseId, warrantyMonths, taxId, salesOrderId, updatedById, productSerialIds) => {
                try {
                    if (productSerialIds?.length) quantity = productSerialIds.length;
                    const response = await AxiosManager.post('/SalesOrderItem/UpdateSalesOrderItem', {
                        id, unitPrice, quantity, summary, productId, warehouseId, warrantyMonths, taxId, salesOrderId, updatedById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/SalesOrderItem/DeleteSalesOrderItem', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getProductListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Product/GetProductList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getWarehouseListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Warehouse/GetWarehouseList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getInventoryStockData: async () => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getPaymentStatusLookup: async () => {
                try {
                    const response = await AxiosManager.get('/CashTransaction/GetPaymentStatusLookup?sourceModule=SalesOrder', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getCashAccountList: async () => {
                try {
                    const response = await AxiosManager.get('/CashAccount/GetCashAccountList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getCashCategoryList: async () => {
                try {
                    const response = await AxiosManager.get('/CashCategory/GetCashCategoryList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            upsertSalesOrderPayment: async (data) => {
                return await AxiosManager.post('/SalesOrder/UpsertSalesOrderPayment', data);
            }
        };

        const methods = {
            populateCustomerListLookupData: async () => {
                const response = await services.getCustomerListLookupData();
                state.customerListLookupData = response?.data?.content?.data;
            },
            quickAddCustomer: async () => {
                if (typeof QuickAddHelper === 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Quick Add is unavailable' });
                    return null;
                }
                const created = await QuickAddHelper.complexQuickAddCustomer({
                    dropdownObj: customerListLookup.obj,
                    refreshLookup: methods.populateCustomerListLookupData,
                    refreshLookups: [methods.populateWarehouseListLookupData],
                    state,
                    stateKey: 'customerId',
                    lookupKey: 'customerListLookupData'
                });
                if (created) {
                    const currentSource = Array.isArray(customerListLookup.obj?.dataSource)
                        ? [...customerListLookup.obj.dataSource]
                        : [...(state.customerListLookupData ?? [])];
                    if (!currentSource.some(item => item.id === created.id)) {
                        currentSource.push(created.data ?? created);
                    }
                    currentSource.sort((left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? '')));
                    customerListLookup.searchSource = currentSource;
                    state.customerListLookupData = currentSource;
                    if (customerListLookup.obj && customerListLookup.obj.isDestroyed !== true) {
                        customerListLookup.obj.dataSource = currentSource;
                        customerListLookup.obj.dataBind();
                    }
                }
                return created;
            },
            populateTaxListLookupData: async () => {
                const response = await services.getTaxListLookupData();
                state.taxListLookupData = response?.data?.content?.data;
            },
            populateSalesOrderStatusListLookupData: async () => {
                const response = await services.getSalesOrderStatusListLookupData();
                const allData = response?.data?.content?.data ?? [];
                state.salesOrderStatusListLookupData = allData;
            },
            populateSalesTypeListLookupData: async () => {
                const response = await services.getSalesTypeListLookupData();
                state.salesTypeListLookupData = response?.data?.content?.data;
            },
            populateMainData: async () => {
                const response = await services.getMainData();
                const paymentResponse = await services.getPaymentStatusLookup();
                state.paymentStatusLookupData = paymentResponse?.data?.content?.data ?? [];
                const paymentMap = new Map(state.paymentStatusLookupData.map(p => [p.sourceModuleId, p]));
                state.mainData = response?.data?.content?.data.map(item => {
                    const payment = paymentMap.get(item.id);
                    const isConfirmed = item.orderStatus === 2;
                    let paymentStatusText = '';
                    let paymentStatusClass = 'none';
                    if (isConfirmed) {
                        if (payment) {
                            if (payment.paidAmount >= payment.amount && payment.amount > 0) {
                                paymentStatusText = 'Đã thanh toán';
                                paymentStatusClass = 'paid';
                            } else if (payment.paidAmount > 0) {
                                paymentStatusText = 'Còn nợ';
                                paymentStatusClass = 'unpaid';
                            } else {
                                paymentStatusText = 'Chưa thanh toán';
                                paymentStatusClass = 'unpaid';
                            }
                        } else {
                            paymentStatusText = 'Chưa thanh toán';
                            paymentStatusClass = 'unpaid';
                        }
                    }
                    return {
                        ...item,
                        orderDate: DateFormatManager.parseBusinessDate(item.orderDate),
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        orderStatusName: item.orderStatusName,
                        paymentStatusText: paymentStatusText,
                        paymentStatusClass: paymentStatusClass,
                        cashTransactionId: payment?.cashTransactionId ?? null,
                        cashTransactionDate: payment?.transactionDate ?? null,
                        cashTransactionStatus: payment?.status ?? null,
                        cashTransactionCashAccountId: payment?.cashAccountId ?? null,
                        cashTransactionCashCategoryId: payment?.cashCategoryId ?? null,
                        cashTransactionAmount: payment?.amount ?? null,
                        cashTransactionPaidAmount: payment?.paidAmount ?? null,
                        cashTransactionDescription: payment?.description ?? null,
                        cashTransactionIsSplit: payment?.isSplit ?? false
                    };
                });
            },
            populateSecondaryData: async (salesOrderId) => {
                try {
                    const response = await services.getSecondaryData(salesOrderId);
                    state.secondaryData = response?.data?.content?.data.map(item => ({
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    })).map(enrichSalesOrderItem);
                    methods.refreshPaymentSummary(salesOrderId);
                } catch (error) {
                    state.secondaryData = [];
                }
            },
            verifySecondaryDataPersisted: async (expectedItems, knownPersistedItems = null) => {
                if (!state.id) return true;
                let persistedItems = knownPersistedItems;
                if (!Array.isArray(persistedItems)) {
                    const response = await services.getSecondaryData(state.id);
                    persistedItems = response?.data?.content?.data ?? [];
                }
                const sameId = (left, right) => normalizeLookupId(left) === normalizeLookupId(right);
                const sameNumber = (left, right) => Number(left ?? 0) === Number(right ?? 0);
                const matches = expected => persistedItems.some(item => {
                    if (expected?.id && !sameId(item.id, expected.id)) return false;
                    return sameId(item.productId, expected?.productId)
                        && sameId(item.warehouseId, expected?.warehouseId)
                        && sameId(item.taxId, expected?.taxId)
                        && sameNumber(item.quantity, expected?.quantity)
                        && sameNumber(item.unitPrice, expected?.unitPrice);
                });
                return (expectedItems ?? []).every(matches);
            },
            populateProductListLookupData: async () => {
                const response = await services.getProductListLookupData();
                state.productListLookupData = response?.data?.content?.data;
            },
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data?.filter(item => item.systemWarehouse === false) ?? [];
            },
            populateInventoryStockData: async () => {
                const response = await services.getInventoryStockData();
                state.inventoryStockData = response?.data?.content?.data ?? [];
                state.inventoryAvailabilityReady = true;
                syncSecondaryAvailability();
            },
            populateCashAccountList: async () => {
                const response = await services.getCashAccountList();
                state.cashAccountListData = response?.data?.content?.data ?? [];
            },
            populateCashCategoryList: async () => {
                const response = await services.getCashCategoryList();
                state.cashCategoryListData = response?.data?.content?.data ?? [];
            },
            resolveCashCategoryId: (categoryName) => {
                return state.cashCategoryListData.find(item => item.name === categoryName)?.id ?? null;
            },
            resolvePaymentAmount: (value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }

                return NumberFormatManager.parseLocaleNumber(value) ?? 0;
            },
            refreshInventoryAvailability: async () => {
                await methods.populateInventoryStockData();
            },
            ensureInventoryAvailability: async () => {
                try {
                    await methods.refreshInventoryAvailability();
                    return true;
                } catch (error) {
                    state.inventoryAvailabilityReady = false;
                    secondaryGrid.refresh();
                    console.error('Unable to load inventory availability:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Không thể tải tồn kho',
                        text: 'Chưa thể sửa chi tiết đơn bán hàng. Vui lòng thử lại sau.',
                        confirmButtonText: 'Đồng ý'
                    });
                    return false;
                }
            },
            refreshPaymentSummary: async (id) => {
                const record = state.mainData.find(item => item.id === id);
                if (record) {
                    state.subTotalAmount = NumberFormatManager.formatMoneyToLocale(record.beforeTaxAmount ?? 0);
                    state.taxAmount = NumberFormatManager.formatMoneyToLocale(record.taxAmount ?? 0);
                    state.totalAmount = NumberFormatManager.formatMoneyToLocale(record.afterTaxAmount ?? 0);
                }
            },
            onSalesTypeChanged: async (newSalesType) => {
                const normalizedSalesType = normalizeLookupId(newSalesType) ?? '1';
                state.salesType = normalizedSalesType;
                const rowObjects = secondaryGrid.obj?.getRowsObject?.() ?? [];
                const rows = rowObjects.length > 0
                    ? rowObjects.map(row => row.data)
                    : state.secondaryData;

                rows.forEach((item, rowIndex) => {
                    const product = state.productListLookupData.find(candidate =>
                        normalizeLookupId(candidate.id) === normalizeLookupId(item.productId));
                    if (!product) return;

                    item.unitPrice = SalesOrderItemEditor.resolveUnitPrice(product, normalizedSalesType);
                    item.total = item.unitPrice * Number(item.quantity ?? 0);
                    const tax = state.taxListLookupData.find(candidate =>
                        normalizeLookupId(candidate.id) === normalizeLookupId(item.taxId));
                    const taxPercentage = Number(tax?.percentage ?? item.taxPercentage ?? 0);
                    item.taxAmount = item.total * taxPercentage / 100;
                    item.afterTaxAmount = item.total + item.taxAmount;

                    if (secondaryGrid.obj && rowIndex < secondaryGrid.obj.getRows().length) {
                        secondaryGrid.obj.updateCell(rowIndex, 'unitPrice', item.unitPrice);
                        secondaryGrid.obj.updateCell(rowIndex, 'total', item.total);
                        secondaryGrid.obj.updateCell(rowIndex, 'taxAmount', item.taxAmount);
                        secondaryGrid.obj.updateCell(rowIndex, 'afterTaxAmount', item.afterTaxAmount);
                    }
                });

                const activeProductId = normalizeLookupId(productObj?.value);
                const activeProduct = state.productListLookupData.find(product => normalizeLookupId(product.id) === activeProductId);
                if (secondaryGrid.obj?.isEdit && priceObj && activeProduct) {
                    const targetPrice = SalesOrderItemEditor.resolveUnitPrice(activeProduct, normalizedSalesType);

                    priceObj.value = targetPrice;
                    priceObj.dataBind();
                    if (quantityObj && totalObj) {
                        totalObj.value = targetPrice * (quantityObj.value ?? 0);
                        totalObj.dataBind();
                    }
                }

                const subTotal = rows.reduce((total, item) => total + Number(item.total ?? 0), 0);
                const taxTotal = rows.reduce((total, item) => total + Number(item.taxAmount ?? 0), 0);
                const grandTotal = rows.reduce((total, item) => total + Number(item.afterTaxAmount ?? 0), 0);
                state.subTotalAmount = NumberFormatManager.formatMoneyToLocale(subTotal);
                state.taxAmount = NumberFormatManager.formatMoneyToLocale(taxTotal);
                state.totalAmount = NumberFormatManager.formatMoneyToLocale(grandTotal);
            },
            handleFormSubmit: async () => {
                state.isSubmitting = true;
                try {
                    await new Promise(resolve => setTimeout(resolve, 200));

                    if (secondaryGrid.obj && !(await GridInteractionManager.save(secondaryGrid.obj))) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Dòng sản phẩm chưa hoàn tất',
                            text: 'Vui lòng hoàn tất sản phẩm, kho, thuế, số lượng hoặc mã thiết bị trước khi lưu đơn hàng.',
                            confirmButtonText: 'Đồng ý'
                        });
                        return;
                    }

                    if (!validateForm()) {
                        return;
                    }

                    if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.orderStatus))) {
                        return;
                    }

                    const response = state.id === ''
                        ? await services.createMainData(state.orderDate, state.description, state.orderStatus, state.customerId, state.salesType, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.orderDate, state.description, state.orderStatus, state.customerId, state.salesType, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        if (!state.deleteMode) {
                            const savedOrder = response?.data?.content?.data;
                            state.mainTitle = 'Sửa đơn bán hàng';
                            state.id = savedOrder?.id ?? '';
                            state.number = savedOrder?.number ?? '';
                            state.orderDate = savedOrder?.orderDate ? DateFormatManager.parseBusinessDate(savedOrder.orderDate) : null;
                            state.description = savedOrder?.description ?? '';
                            state.customerId = savedOrder?.customerId ?? '';
                            state.salesType = savedOrder?.salesType ?? 1;
                            state.orderStatus = String(savedOrder?.orderStatus ?? '0');
                            state.showComplexDiv = true;

                            if (!state.id) {
                                throw new Error('API đã lưu nhưng không trả về mã đơn bán hàng.');
                            }

                            await Vue.nextTick();

                            try {
                                await methods.refreshInventoryAvailability();
                            } catch (refreshError) {
                                console.error('Unable to refresh SO inventory lookup after save:', refreshError);
                            }

                            try {
                                await methods.populateMainData();
                                mainGrid.refresh();
                                await methods.refreshPaymentSummary(state.id);
                            } catch (refreshError) {
                                console.error('Unable to refresh SO main grid after save:', refreshError);
                            }

                            Swal.fire({ icon: 'success', title: 'Lưu thành công', timer: 1000, showConfirmButton: false });
                        } else {
                            try {
                                await methods.populateMainData();
                                mainGrid.refresh();
                            } catch (refreshError) {
                                console.error('Unable to refresh SO main grid after delete:', refreshError);
                            }

                            Swal.fire({
                                icon: 'success',
                                title: 'Xóa thành công',
                                text: 'Đơn hàng đã được xóa...',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            setTimeout(() => {
                                mainModal.obj.hide();
                                resetFormState();
                            }, 2000);
                        }

                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: state.deleteMode ? 'Xóa thất bại' : 'Lưu thất bại',
                            text: response.data.message ?? 'Vui lòng kiểm tra dữ liệu.',
                            confirmButtonText: 'Thử lại'
                        });
                    }
                } catch (error) {
                    console.error('SalesOrder handleFormSubmit error:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Có lỗi xảy ra',
                        text: getErrorMessage(error, 'Vui lòng thử lại.'),
                        confirmButtonText: 'OK'
                    });
                } finally {
                    state.isSubmitting = false;
                }
            },
            onMainModalHidden: () => {
                state.errors.orderDate = '';
                state.errors.customerId = '';
                state.errors.salesType = '';
                state.errors.orderStatus = '';
                state.isViewMode = false;
            }
        };

        const customerListLookup = {
            obj: null,
            searchSource: [],
            create: () => {
                if (state.customerListLookupData && Array.isArray(state.customerListLookupData)) {
                    customerListLookup.searchSource = [...state.customerListLookupData]
                        .sort((left, right) => String(left?.name ?? '').localeCompare(String(right?.name ?? '')));
                    customerListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: customerListLookup.searchSource,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn khách hàng',
                        filterBarPlaceholder: 'Search',
                        allowFiltering: true,
                        filtering: DropdownSearchManager.createFilteringHandler(
                            () => customerListLookup.searchSource,
                            { textField: 'name' }
                        ),
                        change: (e) => {
                            state.customerId = e.value;
                        }
                    });
                    customerListLookup.obj.appendTo(customerIdRef.value);
                }
            },
            refresh: () => {
                if (customerListLookup.obj) {
                    customerListLookup.obj.value = state.customerId;
                }
            }
        };

        const salesTypeListLookup = {
            obj: null,
            create: () => {
                if (state.salesTypeListLookupData && Array.isArray(state.salesTypeListLookupData)) {
                    salesTypeListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.salesTypeListLookupData,
                        fields: { value: 'id', text: 'name' },
                        value: normalizeLookupId(state.salesType) ?? '1',
                        placeholder: 'Chọn loại xuất',
                        change: async (e) => {
                            const selectedSalesType = normalizeLookupId(e.value) ?? '1';
                            if (normalizeLookupId(state.salesType) !== selectedSalesType) {
                                await methods.onSalesTypeChanged(selectedSalesType);
                            }
                        }
                    });
                    salesTypeListLookup.obj.appendTo(salesTypeRef.value);
                }
            },
            refresh: () => {
                if (salesTypeListLookup.obj) {
                    salesTypeListLookup.obj.value = normalizeLookupId(state.salesType) ?? '1';
                    salesTypeListLookup.obj.dataBind();
                }
            }
        };

        const salesOrderStatusListLookup = {
            obj: null,
            create: () => {
                if (state.salesOrderStatusListLookupData && Array.isArray(state.salesOrderStatusListLookupData)) {
                    salesOrderStatusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.salesOrderStatusListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn trạng thái',
                        change: (e) => {
                            state.orderStatus = e.value;
                        }
                    });
                    salesOrderStatusListLookup.obj.appendTo(orderStatusRef.value);
                }
            },
            refresh: () => {
                if (salesOrderStatusListLookup.obj) {
                    salesOrderStatusListLookup.obj.value = state.orderStatus;
                }
            }
        };

        const orderDatePicker = {
            obj: null,
            create: () => {
                orderDatePicker.obj = new ej.calendars.DatePicker({
                    format: 'yyyy-MM-dd',
                    locale: DateFormatManager.syncfusionDateLocale,
                    value: state.orderDate ? DateFormatManager.parseBusinessDate(state.orderDate) : null,
                    change: (e) => {
                        state.orderDate = e.value;
                    }
                });
                orderDatePicker.obj.appendTo(orderDateRef.value);
            },
            refresh: () => {
                if (orderDatePicker.obj) {
                    orderDatePicker.obj.value = state.orderDate ? DateFormatManager.parseBusinessDate(state.orderDate) : null;
                }
            }
        };

        const numberText = {
            obj: null,
            create: () => {
                numberText.obj = new ej.inputs.TextBox({
                    placeholder: '[auto]',
                    readonly: true
                });
                numberText.obj.appendTo(numberRef.value);
            }
        };

        Vue.watch(
            () => state.orderDate,
            (newVal, oldVal) => {
                orderDatePicker.refresh();
                state.errors.orderDate = '';
            }
        );

        Vue.watch(
            () => state.customerId,
            (newVal, oldVal) => {
                customerListLookup.refresh();
                state.errors.customerId = '';
            }
        );

        Vue.watch(
            () => state.salesType,
            (newVal, oldVal) => {
                salesTypeListLookup.refresh();
                state.errors.salesType = '';
            }
        );

        Vue.watch(
            () => state.orderStatus,
            (newVal, oldVal) => {
                salesOrderStatusListLookup.refresh();
                state.errors.orderStatus = '';

                // Filter Draft out of dropdown when status > 0
                StatusDropdownHelper.applyToDropdown(
                    salesOrderStatusListLookup.obj,
                    state.salesOrderStatusListLookupData,
                    newVal
                );


            }
        );

        const mainGrid = {
            obj: null,
            create: async (dataSource) => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '240px',
                    dataSource: dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: true,
                    groupSettings: { columns: ['customerName'] },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowFreezing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Multiple', checkboxOnly: true },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        {
                            field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false
                        },
                        { field: 'number', headerText: 'Number', width: 150, minWidth: 150 },
                        { field: 'orderDate', headerText: 'Order Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'customerName', headerText: 'Customer', width: 200, minWidth: 200 },
                        { field: 'salesTypeName', headerText: 'Sales Type', width: 140, minWidth: 140 },
                        { field: 'orderStatusName', headerText: 'Status', width: 150, minWidth: 150 },
                        { field: 'afterTaxAmount', headerText: 'Total Amount', width: 150, minWidth: 150, format: 'N0' },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, minWidth: 150, format: 'yyyy-MM-dd HH:mm' },
                        {
                            field: 'paymentStatusText',
                            headerText: 'Payment',
                            width: 150,
                            minWidth: 150,
                            textAlign: 'Center',
                            allowFiltering: true,
                            allowSorting: true,
                            showColumnMenu: false,
                            disableHtmlEncode: false,
                            template: '<button type="button" class="payment-status-action payment-status-action-${paymentStatusClass}">${paymentStatusText}</button>'
                        }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Thêm', tooltipText: 'Thêm', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Sửa', tooltipText: 'Sửa', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Xem', tooltipText: 'Xem chi tiết', prefixIcon: 'e-eye', id: 'ViewCustom' },
                        { text: 'Xóa', tooltipText: 'Xóa', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'In PDF', tooltipText: 'In PDF', id: 'PrintPDFCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        window.requestAnimationFrame(() => {
                            if (!mainGrid.obj?.element?.isConnected) return;
                            mainGrid.obj.toolbarModule?.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], false);

                            const paymentActions = mainGrid.obj.element.querySelectorAll('.payment-status-action');
                            paymentActions.forEach(paymentAction => {
                                paymentAction.addEventListener('mousedown', e => e.stopPropagation());
                                paymentAction.addEventListener('click', async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const row = paymentAction.closest('tr');
                                    if (!row) return;
                                    const rowData = mainGrid.obj.getRowInfo(row).rowData;
                                    if (!rowData) return;
                                    await showPaymentPopup(rowData);
                                });
                            });
                        });
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        }
                    },
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            mainGrid.obj.clearSelection();
                        }
                    },
                    recordDoubleClick: async (args) => {
                        if (args.rowData) {
                            const selectedRecord = args.rowData;
                            state.isViewMode = true;
                            state.deleteMode = false;
                            state.mainTitle = 'Xem \u0111\u01a1n b\u00e1n h\u00e0ng';
                            state.id = selectedRecord.id ?? '';
                            state.number = selectedRecord.number ?? '';
                            state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                            state.description = selectedRecord.description ?? '';
                            state.customerId = selectedRecord.customerId ?? '';
                            state.salesType = selectedRecord.salesType ?? 1;
                            state.orderStatus = String(selectedRecord.orderStatus ?? '');
                            state.showComplexDiv = true;

                            await methods.populateSecondaryData(selectedRecord.id);
                            secondaryGrid.refresh();
                            mainModal.obj.show();
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            if (!(await methods.ensureInventoryAvailability())) return;
                            state.deleteMode = false;
                            state.isViewMode = false;
                            state.mainTitle = 'Thêm đơn bán hàng';
                            resetFormState();
                            state.secondaryData = [];
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            state.isViewMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                if (!(await methods.ensureInventoryAvailability())) return;
                                state.mainTitle = 'Sửa đơn bán hàng';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
                                state.salesType = selectedRecord.salesType ?? 1;
                                state.orderStatus = String(selectedRecord.orderStatus ?? '');
                                state.showComplexDiv = true;

                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();

                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'ViewCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.isViewMode = true;
                                state.deleteMode = false;
                                state.mainTitle = 'Xem đơn bán hàng';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
                                state.salesType = selectedRecord.salesType ?? 1;
                                state.orderStatus = String(selectedRecord.orderStatus ?? '');
                                state.showComplexDiv = true;

                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords(); if (!selected.length) return;
                            const result = await Swal.fire({ icon: 'warning', title: 'Xác nhận xóa', text: `Bạn có chắc chắn muốn xóa ${selected.length} đơn bán hàng đã chọn không?`, showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy', heightAuto: false }); if (!result.isConfirmed) return;
                            for (const record of selected) await services.deleteMainData(record.id, StorageManager.getUserId()); await methods.populateMainData(); mainGrid.refresh(); Swal.fire({ icon: 'success', title: 'Đã xóa', text: `Đã xóa ${selected.length} đơn bán hàng.`, heightAuto: false }); return;
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                await methods.refreshInventoryAvailability();
                                state.mainTitle = 'Xóa đơn bán hàng?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
                                state.salesType = selectedRecord.salesType ?? 1;
                                state.orderStatus = String(selectedRecord.orderStatus ?? '');
                                state.showComplexDiv = false;

                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();

                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'PrintPDFCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                window.open('/SalesOrders/SalesOrderPdf?id=' + encodeURIComponent(selectedRecord.id ?? ''), '_blank', 'noopener');
                            }
                        }
                    }
                });

                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => {
                mainGrid.obj.setProperties({ dataSource: state.mainData });
            }
        };

        let productObj;
        let warehouseObj;
        let priceObj;
        let quantityObj;
        let totalObj;
        let taxObj;
        let numberObj;
        let summaryObj;
        let warrantyObj;
        let taxAmountObj;
        let afterTaxAmountObj;
        let cogsObj;
        let profitObj;

        const secondaryGrid = {
            obj: null,
            syncSerialPickerRows: () => {
                if (!secondaryGrid.obj?.element) return;
                secondaryGrid.obj.getRows().forEach(row => {
                    const rowData = secondaryGrid.obj.getRowInfo(row).rowData;
                    const button = row.querySelector('.so-serial-picker');
                    const label = row.querySelector('.so-serial-picker-label');
                    if (!rowData || !button || !label) return;
                    const serialEnabled = isSerialTrackedProduct(normalizeLookupId(rowData.productId));
                    button.disabled = state.isViewMode || !state.inventoryAvailabilityReady || !serialEnabled;
                    button.title = serialEnabled ? '' : 'Sản phẩm không theo dõi serial';
                    const count = Array.isArray(rowData.productSerialIds) ? rowData.productSerialIds.length : 0;
                    label.textContent = count > 0 ? `${count} mã đã chọn` : '';
                    label.title = typeof rowData.productSerialNumbers === 'string' ? rowData.productSerialNumbers : '';
                });
            },
            handleSerialPickerClick: async (event) => {
                const button = event.target.closest('.so-serial-picker');
                if (!button || button.disabled) return;
                event.preventDefault();
                event.stopPropagation();
                const row = button.closest('tr');
                const rowData = row ? secondaryGrid.obj.getRowInfo(row).rowData : null;
                if (!rowData) return;

                const productId = normalizeLookupId(rowData.productId);
                const warehouseId = normalizeLookupId(rowData.warehouseId);
                if (!productId || !warehouseId) {
                    await Swal.fire({
                        icon: 'warning',
                        title: 'Thiếu thông tin',
                        text: 'Vui lòng chọn sản phẩm và kho trước khi chọn mã thiết bị.',
                        confirmButtonText: 'Đồng ý'
                    });
                    return;
                }

                const selectedSerials = await ProductSerialPicker.open({
                    productId,
                    warehouseId,
                    moduleName: 'SalesOrder',
                    moduleId: state.id,
                    moduleItemId: normalizeLookupId(rowData.id),
                    selectedIds: Array.isArray(rowData.productSerialIds) ? rowData.productSerialIds : []
                });
                const serialValues = applySerialSelection(rowData, selectedSerials);
                if (!serialValues) return;
                writeSalesOrderBatchFields(rowData, serialValues);
                const rowIndex = secondaryGrid.obj.getRows().indexOf(row);
                if (rowIndex >= 0) {
                    ['quantity', 'total', 'taxAmount', 'afterTaxAmount'].forEach(field =>
                        secondaryGrid.obj.updateCell(rowIndex, field, serialValues[field]));
                }
                secondaryGrid.syncSerialPickerRows();
            },
            create: async (dataSource) => {
                const allowEdit = !state.isViewMode && state.inventoryAvailabilityReady;
                secondaryGrid.obj = new ej.grids.Grid({
                    height: 400,
                    dataSource: dataSource,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showConfirmDialog: false, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
                    allowFiltering: false,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: false,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: false,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'productName', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Multiple' },
                    autoFit: false,
                    showColumnMenu: false,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        {
                            field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false
                        },
                        {
                            field: 'productId',
                            headerText: 'Product',
                            width: 250,
                            validationRules: { required: true },
                            disableHtmlEncode: false,
                            valueAccessor: (field, data, column) => {
                                const productId = normalizeLookupId(data[field]);
                                const product = state.productListLookupData.find(item => normalizeLookupId(item.id) === productId);
                                return product ? `${product.name}` : '';
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    let productElem = document.createElement('input');
                                    return productElem;
                                },
                                read: () => {
                                    return normalizeLookupId(productObj?.value);
                                },
                                destroy: () => {
                                    if (productObj) {
                                        productObj.destroy();
                                        productObj = null;
                                    }
                                },
                                write: (args) => {
                                    const getCurrentProductOptions = () => getSelectableProductOptions(args.rowData);
                                    const productOptions = getCurrentProductOptions();
                                    const resolveSelectedProduct = (valueOrItem) => {
                                        if (!valueOrItem) {
                                            return null;
                                        }

                                        if (valueOrItem.id) {
                                            return valueOrItem;
                                        }

                                        const productId = normalizeLookupId(valueOrItem);
                                        return getCurrentProductOptions().find(item => normalizeLookupId(item.id) === productId)
                                            ?? state.productListLookupData.find(item => normalizeLookupId(item.id) === productId);
                                    };
                                    const applyProductSelection = (selectedProduct) => {
                                        if (selectedProduct) {
                                            const warehouseOptions = getAvailableWarehouseOptions(selectedProduct.id);
                                            const selection = SalesOrderItemEditor.buildProductSelection({
                                                rowData: args.rowData,
                                                product: selectedProduct,
                                                warehouseOptions,
                                                salesType: state.salesType
                                            });
                                            const { serialTracked, productChanged, ...rowValues } = selection;
                                            rowValues.availableStock = getAvailableStock(rowValues.productId, rowValues.warehouseId);
                                            Object.assign(args.rowData, rowValues);
                                            if (productChanged) clearSerialSelection(args.rowData);
                                            Object.assign(rowValues, applySalesOrderItemAmounts(args.rowData));
                                            writeSalesOrderBatchFields(args.rowData, { ...rowValues, serialTracked }, args.element);
                                            if (productObj) {
                                                productObj.value = selection.productId;
                                                productObj.dataBind();
                                            }
                                            if (warehouseObj) {
                                                warehouseObj.dataSource = warehouseOptions;
                                                warehouseObj.value = selection.warehouseId;
                                                warehouseObj.enabled = selectedProduct.physical !== false;
                                                warehouseObj.dataBind();
                                            }
                                            if (numberObj) {
                                                numberObj.value = selectedProduct.number;
                                                numberObj.dataBind();
                                            }
                                            if (priceObj) {
                                                priceObj.value = selection.unitPrice;
                                                priceObj.dataBind();
                                            }
                                            if (summaryObj) {
                                                summaryObj.value = selectedProduct.description;
                                                summaryObj.dataBind();
                                            }
                                            if (warrantyObj) {
                                                warrantyObj.value = selection.warrantyMonths;
                                                warrantyObj.dataBind();
                                            }
                                            if (quantityObj) {
                                                quantityObj.value = selection.quantity;
                                                quantityObj.readonly = serialTracked;
                                                quantityObj.dataBind();
                                                if (totalObj) {
                                                    totalObj.value = selection.total;
                                                    totalObj.dataBind();
                                                }
                                            }

                                        }
                                    };

                                    productObj = new ej.dropdowns.DropDownList({
                                        dataSource: productOptions,
                                        fields: { value: 'id', text: 'name' },
                                        value: normalizeLookupId(args.rowData.productId),
                                        allowFiltering: true,
                                        filtering: DropdownSearchManager.createFilteringHandler(getCurrentProductOptions, {
                                            textField: 'name', instance: () => productObj, preserveEditor: true
                                        }),
                                        filterBarPlaceholder: 'Tìm hàng hóa',
                                        change: (e) => {
                                            applyProductSelection(resolveSelectedProduct(e.itemData ?? e.value));
                                        },
                                        placeholder: 'Chọn sản phẩm',
                                        floatLabelType: 'Never'
                                    });
                                    productObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'warehouseId',
                            headerText: 'Warehouse',
                            width: 180,
                            validationRules: { required: false },
                            valueAccessor: (field, data, column) => {
                                const warehouseId = normalizeLookupId(data[field]);
                                const warehouse = state.warehouseListLookupData.find(item => normalizeLookupId(item.id) === warehouseId);
                                return warehouse ? warehouse.name : (data.warehouseName ?? '');
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    let warehouseElem = document.createElement('input');
                                    return warehouseElem;
                                },
                                read: () => {
                                    return normalizeLookupId(warehouseObj?._pendingValue ?? warehouseObj?.value);
                                },
                                destroy: () => {
                                    if (warehouseObj) {
                                        warehouseObj.destroy();
                                        warehouseObj = null;
                                    }
                                },
                                write: (args) => {
                                    const productId = normalizeLookupId(args.rowData.productId);
                                    const product = state.productListLookupData.find(item => normalizeLookupId(item.id) === productId);
                                    const warehouseOptions = product?.physical === false ? [] : getAvailableWarehouseOptions(productId);
                                    const currentWarehouseId = normalizeLookupId(args.rowData.warehouseId);
                                    const selectedWarehouseId = warehouseOptions.some(item => item.id === currentWarehouseId)
                                        ? currentWarehouseId
                                        : null;
                                    if (product?.physical === false) {
                                        args.rowData.warehouseId = null;
                                        args.rowData.warehouseName = '';
                                    } else if (!selectedWarehouseId) {
                                        args.rowData.warehouseId = null;
                                        args.rowData.warehouseName = '';
                                    }
                                    warehouseObj = new ej.dropdowns.DropDownList({
                                        dataSource: warehouseOptions,
                                        fields: { value: 'id', text: 'name' },
                                        value: selectedWarehouseId,
                                        allowFiltering: true,
                                        showClearButton: true,
                                        enabled: product?.physical !== false,
                                        placeholder: 'Chọn kho',
                                        change: (e) => {
                                            const warehouseId = normalizeLookupId(e.value);
                                            const selectedWarehouse = warehouseOptions.find(item => item.id === warehouseId);
                                            args.rowData.warehouseId = selectedWarehouse ? warehouseId : null;
                                            args.rowData.warehouseName = selectedWarehouse?.name ?? '';
                                            args.rowData.availableStock = getAvailableStock(args.rowData.productId, args.rowData.warehouseId);
                                            updateEditorRowCell(args.element, 'availableStock', args.rowData.availableStock);
                                            clearSerialSelection(args.rowData);
                                        },
                                        floatLabelType: 'Never'
                                    });
                                    warehouseObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'availableStock',
                            headerText: 'Tồn khả dụng',
                            width: 150,
                            allowEditing: false,
                            textAlign: 'Right',
                            valueAccessor: (field, data) => formatQuantity(data[field] ?? 0)
                        },
                        {
                            field: 'warrantyMonths',
                            headerText: 'Warranty Months',
                            width: 180,
                            type: 'number',
                            format: 'N0',
                            validationRules: { required: true },
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let warrantyElem = document.createElement('input');
                                    return warrantyElem;
                                },
                                read: () => {
                                    return warrantyObj?.value ?? null;
                                },
                                destroy: () => {
                                    if (warrantyObj) {
                                        warrantyObj.destroy();
                                        warrantyObj = null;
                                    }
                                },
                                write: (args) => {
                                    warrantyObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.warrantyMonths ?? null,
                                        format: 'n0',
                                        min: 0,
                                        decimals: 0,
                                        validateDecimalOnType: false,
                                        placeholder: 'Nhập số tháng BH'
                                    });
                                    warrantyObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'unitPrice',
                            headerText: 'Unit Price',
                            width: 200, validationRules: { required: true }, type: 'number', format: 'N0', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let priceElem = document.createElement('input');
                                    return priceElem;
                                },
                                read: () => {
                                    return Number(priceObj?.value ?? 0);
                                },
                                destroy: () => {
                                    if (priceObj) {
                                        priceObj.destroy();
                                        priceObj = null;
                                    }
                                },
                                write: (args) => {
                                    const product = state.productListLookupData.find(item =>
                                        normalizeLookupId(item.id) === normalizeLookupId(args.rowData.productId));
                                    const initialPrice = args.rowData.unitPrice ?? SalesOrderItemEditor.resolveUnitPrice(product, state.salesType);
                                    args.rowData.unitPrice = Number(initialPrice ?? 0);
                                    priceObj = new ej.inputs.NumericTextBox({
                                        format: 'n0',
                                        decimals: 0,
                                        step: 1000,
                                        validateDecimalOnType: false,
                                        value: args.rowData.unitPrice,
                                        change: (e) => {
                                            args.rowData.unitPrice = Number(e.value ?? 0);
                                            args.rowData.total = args.rowData.unitPrice * Number(args.rowData.quantity ?? quantityObj?.value ?? 0);
                                            updateEditorRowCell(args.element, 'total', args.rowData.total);
                                            if (totalObj) {
                                                const total = args.rowData.total;
                                                totalObj.value = total;
                                                totalObj.dataBind();
                                            }
                                        }
                                    });
                                    priceObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'productSerialNumbers',
                            headerText: 'Serial Numbers',
                            width: 220,
                            allowEditing: false,
                            valueAccessor: (field, data) => typeof data.productSerialNumbers === 'string'
                                ? data.productSerialNumbers
                                : '',
                            template: '<div class="d-flex gap-2 align-items-center"><button type="button" class="btn btn-outline-primary btn-sm so-serial-picker">Chọn mã thiết bị</button><span class="text-muted small text-truncate so-serial-picker-label" style="max-width:120px"></span></div>'
                        },
                        {
                            field: 'quantity',
                            headerText: 'Quantity',
                            width: 200,
                            // Validate the completed row in actionBegin. Cell-level validation
                            // fires too early while the user is still choosing product/warehouse.
                            validationRules: { required: false },
                            type: 'number', format: 'N6', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let quantityElem = document.createElement('input');
                                    return quantityElem;
                                },
                                read: () => {
                                    return Number(quantityObj?.value ?? 0);
                                },
                                destroy: () => {
                                    if (quantityObj) {
                                        quantityObj.destroy();
                                        quantityObj = null;
                                    }
                                },
                                write: (args) => {
                                    quantityObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.quantity ?? 0,
                                        readonly: isSerialTrackedProduct(args.rowData.productId),
                                        format: 'n6',
                                        decimals: 6,
                                        validateDecimalOnType: false,
                                        change: (e) => {
                                            args.rowData.quantity = Number(e.value ?? 0);
                                            args.rowData.total = args.rowData.quantity * Number(args.rowData.unitPrice ?? priceObj?.value ?? 0);
                                            updateEditorRowCell(args.element, 'total', args.rowData.total);
                                            if (totalObj) {
                                                const total = args.rowData.total;
                                                totalObj.value = total;
                                                totalObj.dataBind();
                                            }
                                        }
                                    });
                                    quantityObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'total',
                            headerText: 'Total',
                            width: 200, validationRules: { required: false }, type: 'number', format: 'N0', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let totalElem = document.createElement('input');
                                    return totalElem;
                                },
                                read: () => {
                                    return totalObj.value;
                                },
                                destroy: () => {
                                    totalObj.destroy();
                                },
                                write: (args) => {
                                    totalObj = new ej.inputs.NumericTextBox({
                                        format: 'n0',
                                        decimals: 0,
                                        value: args.rowData.total ?? 0,
                                        readonly: true
                                    });
                                    totalObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'taxId',
                            headerText: 'Tax',
                            width: 180,
                            validationRules: { required: true },
                            valueAccessor: (field, data, column) => {
                                const tax = state.taxListLookupData.find(item => item.id === data[field]);
                                return tax ? tax.name : (data.taxName ?? '');
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    let taxElem = document.createElement('input');
                                    return taxElem;
                                },
                                read: () => {
                                    return taxObj?.value ?? null;
                                },
                                destroy: () => {
                                    if (taxObj) {
                                        taxObj.destroy();
                                        taxObj = null;
                                    }
                                },
                                write: (args) => {
                                    taxObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.taxListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.taxId ?? null,
                                        placeholder: 'Chọn thuế',
                                        change: (e) => {
                                            const taxId = normalizeLookupId(e.value);
                                            const tax = state.taxListLookupData.find(item => normalizeLookupId(item.id) === taxId);
                                            const total = Number(args.rowData.total ?? 0);
                                            const taxPercentage = Number(tax?.percentage ?? 0);
                                            args.rowData.taxId = taxId;
                                            args.rowData.taxName = tax?.name ?? '';
                                            args.rowData.taxPercentage = taxPercentage;
                                            args.rowData.taxAmount = total * taxPercentage / 100;
                                            args.rowData.afterTaxAmount = total + args.rowData.taxAmount;
                                            updateEditorRowCell(args.element, 'taxAmount', args.rowData.taxAmount);
                                            updateEditorRowCell(args.element, 'afterTaxAmount', args.rowData.afterTaxAmount);
                                        },
                                        floatLabelType: 'Never'
                                    });
                                    taxObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'taxAmount',
                            headerText: 'Tax Amount',
                            allowEditing: true,
                            width: 160,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let taxAmountElem = document.createElement('input');
                                    return taxAmountElem;
                                },
                                read: () => {
                                    return taxAmountObj?.value ?? 0;
                                },
                                destroy: () => {
                                    if (taxAmountObj) {
                                        taxAmountObj.destroy();
                                        taxAmountObj = null;
                                    }
                                },
                                write: (args) => {
                                    taxAmountObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.taxAmount ?? 0,
                                        format: 'N0',
                                        decimals: 0,
                                        readonly: true
                                    });
                                    taxAmountObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'afterTaxAmount',
                            headerText: 'Total Amount',
                            allowEditing: true,
                            width: 170,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let afterTaxAmountElem = document.createElement('input');
                                    return afterTaxAmountElem;
                                },
                                read: () => {
                                    return afterTaxAmountObj?.value ?? 0;
                                },
                                destroy: () => {
                                    if (afterTaxAmountObj) {
                                        afterTaxAmountObj.destroy();
                                        afterTaxAmountObj = null;
                                    }
                                },
                                write: (args) => {
                                    afterTaxAmountObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.afterTaxAmount ?? 0,
                                        format: 'N0',
                                        decimals: 0,
                                        readonly: true
                                    });
                                    afterTaxAmountObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'productNumber',
                            headerText: 'Product Number',
                            allowEditing: false,
                            width: 180,
                            edit: {
                                create: () => {
                                    let numberElem = document.createElement('input');
                                    return numberElem;
                                },
                                read: () => {
                                    return numberObj.value;
                                },
                                destroy: () => {
                                    numberObj.destroy();
                                },
                                write: (args) => {
                                    numberObj = new ej.inputs.TextBox();
                                    numberObj.value = args.rowData.productNumber;
                                    numberObj.readonly = true;
                                    numberObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'productReferenceCode',
                            headerText: 'Reference Code',
                            allowEditing: false,
                            width: 160,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data.productId);
                                return data.productReferenceCode ?? product?.referenceCode ?? '';
                            }
                        },
                        {
                            field: 'summary',
                            headerText: 'Summary',
                            width: 200,
                            edit: {
                                create: () => {
                                    let summaryElem = document.createElement('input');
                                    return summaryElem;
                                },
                                read: () => {
                                    return summaryObj.value;
                                },
                                destroy: () => {
                                    summaryObj.destroy();
                                },
                                write: (args) => {
                                    summaryObj = new ej.inputs.TextBox();
                                    summaryObj.value = args.rowData.summary;
                                    summaryObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'cogsAmount',
                            headerText: 'COGS',
                            allowEditing: true,
                            width: 160,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let cogsElem = document.createElement('input');
                                    return cogsElem;
                                },
                                read: () => {
                                    return cogsObj?.value ?? 0;
                                },
                                destroy: () => {
                                    if (cogsObj) {
                                        cogsObj.destroy();
                                        cogsObj = null;
                                    }
                                },
                                write: (args) => {
                                    cogsObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.cogsAmount ?? 0,
                                        format: 'N0',
                                        decimals: 0,
                                        readonly: true
                                    });
                                    cogsObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'profitAmount',
                            headerText: 'Profit',
                            allowEditing: true,
                            width: 160,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let profitElem = document.createElement('input');
                                    return profitElem;
                                },
                                read: () => {
                                    return profitObj?.value ?? 0;
                                },
                                destroy: () => {
                                    if (profitObj) {
                                        profitObj.destroy();
                                        profitObj = null;
                                    }
                                },
                                write: (args) => {
                                    profitObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.profitAmount ?? 0,
                                        format: 'N0',
                                        decimals: 0,
                                        readonly: true
                                    });
                                    profitObj.appendTo(args.element);
                                }
                            }
                        },
                    ],
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Delete', 'Update', 'Cancel'
                    ],
                    beforeDataBound: () => { },
                    dataBound: () => secondaryGrid.syncSerialPickerRows(),
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                        } else {
                        }
                    },
                    rowDeselected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                        } else {
                        }
                    },
                    rowSelecting: () => { },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'SecondaryGrid_add') {
                            args.cancel = true;
                            const temporaryId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            secondaryGrid.obj.addRecord({
                                id: temporaryId,
                                salesOrderId: state.id,
                                productId: null,
                                warehouseId: null,
                                warrantyMonths: 0,
                                unitPrice: 0,
                                quantity: 1,
                                total: 0,
                                taxId: null,
                                taxAmount: 0,
                                afterTaxAmount: 0,
                                productSerialIds: [],
                                productSerialNumbers: '',
                                summary: ''
                            }, 0);
                            requestAnimationFrame(() => editNewSalesOrderProductCell(temporaryId));
                            return;
                        }

                        if (args.item.id === 'SecondaryGrid_excelexport') {
                            secondaryGrid.obj.excelExport();
                        }

                    },
                    cellSave: (args) => {
                        const field = args.columnName ?? args.column?.field;
                        if (field === 'productId') {
                            const values = applySalesOrderProductDefaults(args.rowData, args.value);
                            if (!values) return;
                            requestAnimationFrame(() => writeSalesOrderBatchFields(args.rowData, values));
                            requestAnimationFrame(() => secondaryGrid.syncSerialPickerRows());
                            return;
                        }

                        if (!['quantity', 'unitPrice', 'taxId'].includes(field)) return;
                        const value = field === 'taxId' ? normalizeLookupId(args.value) : Number(args.value ?? 0);
                        const amounts = applySalesOrderItemAmounts(args.rowData, { [field]: value });
                        requestAnimationFrame(() => writeSalesOrderBatchFields(args.rowData, amounts));
                    },
                    actionBegin: (args) => {
                        const requestType = String(args.requestType ?? '').toLowerCase();
                        if (requestType === 'add' || requestType === 'batchadd') {
                            const defaults = {
                                warrantyMonths: 0,
                                unitPrice: 0,
                                quantity: 1,
                                total: 0,
                                taxAmount: 0,
                                afterTaxAmount: 0,
                                cogsAmount: 0,
                                profitAmount: 0,
                                productSerialIds: [],
                                productSerialNumbers: ''
                            };
                            args.data = Object.assign(args.data ?? {}, defaults);
                            args.defaultData = Object.assign(args.defaultData ?? {}, defaults);
                            return;
                        }

                        if (requestType !== 'save' || args.managedBatch !== true) {
                            return;
                        }

                        const data = args.data ?? {};
                        data.productId = normalizeLookupId(data.productId);
                        data.warehouseId = normalizeLookupId(data.warehouseId);
                        data.taxId = normalizeLookupId(data.taxId);
                        data.productSerialIds = Array.isArray(data.productSerialIds)
                            ? data.productSerialIds.map(normalizeLookupId).filter(Boolean)
                            : [];
                        data.productSerialNumbers = typeof data.productSerialNumbers === 'string'
                            ? data.productSerialNumbers
                            : '';
                        data.unitPrice = Number(data.unitPrice ?? 0);
                        data.quantity = Number(data.quantity ?? 0);
                        applySalesOrderItemAmounts(data);
                        if (!data.productId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn Hàng Hóa trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        const selectedProduct = state.productListLookupData.find(item =>
                            normalizeLookupId(item.id) === data.productId);
                        if (selectedProduct?.physical !== false && !data.warehouseId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn Kho Hàng trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        if (!data.quantity || Number(data.quantity) <= 0) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Số lượng phải lớn hơn 0.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        if (!data.taxId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn Thuế trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        const isSerialTracked = isSerialTrackedProduct(data.productId);

                        if (isSerialTracked) {
                            // Sync serial data from rowData (where the picker stored it)
                            const editedRow = secondaryGrid.obj?.getRowObjectFromUID?.(args.row?.getAttribute?.('data-uid'));
                            const rowData = args.rowData ?? {};
                            if (rowData.productSerialIds?.length) {
                                data.productSerialIds = rowData.productSerialIds;
                                data.productSerialNumbers = rowData.productSerialNumbers;
                            }

                            const selectedSerialCount = data.productSerialIds?.length ?? 0;
                            if (selectedSerialCount === 0) {
                                args.cancel = true;
                                Swal.fire({
                                    icon: 'warning',
                                    title: 'Lưu thất bại',
                                    text: 'Làm ơn chọn số seri thiết bị trước khi lưu.',
                                    confirmButtonText: 'OK'
                                });
                                return;
                            }

                            data.quantity = selectedSerialCount;
                        }

                        const quantity = Number(data.quantity ?? 0);
                        const maxQuantity = getAvailableStock(data.productId, data.warehouseId);

                        if (selectedProduct?.physical !== false && !isSerialTracked && quantity > maxQuantity) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'error',
                                title: 'Lưu thất bại',
                                text: `Số lượng không được vượt quá tồn khả dụng (${formatQuantity(maxQuantity)}).`,
                                confirmButtonText: 'Đồng ý'
                            });
                        }
                    },
                    actionComplete: async (args) => {
                        const requestType = String(args.requestType ?? '').toLowerCase();
                        const refreshAfterAction = args.managedBatch !== true;
                        if (requestType === 'batchadd') {
                            const rowData = args.data ?? args.rowData;
                            if (rowData) {
                                rowData.warrantyMonths ??= 0;
                                rowData.unitPrice ??= 0;
                                rowData.quantity = Number(rowData.quantity ?? 1) || 1;
                                rowData.total ??= 0;
                                rowData.productSerialIds = [];
                                rowData.productSerialNumbers = '';
                            }
                            return;
                        }

                        if (args.requestType === 'save' && args.action === 'add') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;
                            if (data?.productSerialIds?.length) {
                                data.quantity = data.productSerialIds.length;
                                applySalesOrderItemAmounts(data);
                            }

                            try {
                                const response = await services.createSecondaryData(data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.warrantyMonths, data?.taxId, salesOrderId, userId, data?.productSerialIds ?? []);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to create sales order item.');
                                data.__persistedId = response?.data?.content?.data?.id ?? null;
                                if (refreshAfterAction) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Lưu thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                }
                            } catch (error) {
                                console.error('Create SalesOrderItem error:', error);
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();
                                }

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Lưu thất bại',
                                    text: getErrorMessage(error, 'Không thể lưu.'),
                                    confirmButtonText: 'OK'
                                });
                                throw error;
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;
                            if (data?.productSerialIds?.length) {
                                data.quantity = data.productSerialIds.length;
                                applySalesOrderItemAmounts(data);
                            }

                            try {
                                const response = await services.updateSecondaryData(data?.id, data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.warrantyMonths, data?.taxId, salesOrderId, userId, data?.productSerialIds ?? []);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to update sales order item.');
                                if (refreshAfterAction) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Lưu thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                }
                            } catch (error) {
                                console.error('Update SalesOrderItem error:', error);
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();
                                }

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Lưu thất bại',
                                    text: getErrorMessage(error, 'Không thể cập nhật.'),
                                    confirmButtonText: 'OK'
                                });
                                throw error;
                            }
                        }
                        if (args.requestType === 'delete') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data[0];

                            if (!data?.id || String(data.id).startsWith('new-')) {
                                return;
                            }

                            try {
                                const response = await services.deleteSecondaryData(data?.id, userId);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to delete sales order item.');
                                if (refreshAfterAction) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Xóa thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                }
                            } catch (error) {
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();
                                }

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Xóa thất bại',
                                    text: getErrorMessage(error, 'Không thể xóa mục này.'),
                                    confirmButtonText: 'OK'
                                });
                                throw error;
                            }
                        }

                        if (refreshAfterAction) {
                            await methods.populateMainData();
                            mainGrid.refresh();
                            await methods.refreshPaymentSummary(state.id);
                        }
                    }
                });
                secondaryGrid.obj.appendTo(secondaryGridRef.value);
                secondaryGrid.obj.element.addEventListener('click', secondaryGrid.handleSerialPickerClick);
                GridInteractionManager.configureBatch(secondaryGrid.obj, {
                    afterPersist: async changes => {
                        await methods.populateSecondaryData(state.id);

                        const persistedItems = state.secondaryData ?? [];
                        const addedRows = (changes.addedRecords ?? []).map(row => ({
                            ...row,
                            id: row.__persistedId ?? null
                        }));
                        const savedRows = [...addedRows, ...(changes.changedRecords ?? [])];
                        const savedRowsPersisted = await methods.verifySecondaryDataPersisted(savedRows, persistedItems);
                        const undeletedRow = (changes.deletedRecords ?? []).find(row => row?.id
                            && !String(row.id).startsWith('new-')
                            && persistedItems.some(item => normalizeLookupId(item.id) === normalizeLookupId(row.id)));

                        if (!savedRowsPersisted || undeletedRow) {
                            const error = new Error('Backend has not confirmed every Sales Order item change. The item list was not saved.');
                            Swal.fire({
                                icon: 'error',
                                title: 'Unable to save items',
                                text: error.message,
                                confirmButtonText: 'OK'
                            });
                            throw error;
                        }

                        await methods.refreshInventoryAvailability();
                        secondaryGrid.refresh();
                        await methods.populateMainData();
                        mainGrid.refresh();
                        await methods.refreshPaymentSummary(state.id);
                        Swal.fire({ icon: 'success', title: 'Lưu danh sách hàng hóa thành công', timer: 1200, showConfirmButton: false });
                    }
                });
                secondaryGrid.obj.element.dataset.batchManaged = 'true';
            },
            refresh: () => {
                if (!secondaryGrid.obj) return;
                const allowEdit = !state.isViewMode && state.inventoryAvailabilityReady;
                secondaryGrid.obj.setProperties({
                    dataSource: state.secondaryData,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showConfirmDialog: false, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
                    toolbar: allowEdit ? [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Delete', 'Update', 'Cancel'
                    ] : ['ExcelExport']
                });
            }
        };

        const mainModal = {
            obj: null,
            create: () => {
                mainModal.obj = new bootstrap.Modal(mainModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });
            }
        };

        const escapeHtml = value => `${value ?? ''}`
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');

        const showPaymentPopup = async (order) => {
            const isVietnamese = window.UiLocalization?.getLocale?.() !== 'en';
            const text = (vi, en) => isVietnamese ? vi : en;
            const orderId = order.id;
            const orderNumber = order.number;
            const totalAmountValue = methods.resolvePaymentAmount(order.afterTaxAmount);
            const paidAmountValue = methods.resolvePaymentAmount(order.cashTransactionPaidAmount);
            const remainingAmountValue = Math.max(0, totalAmountValue - paidAmountValue);
            const displayDescription = order.cashTransactionDescription
                ?? text(`Thanh toán đơn bán hàng ${orderNumber}`, `Sales order payment ${orderNumber}`);
            const accountOptions = state.cashAccountListData
                .map(a => `<option value="${escapeHtml(a.id)}" ${a.id === order.cashTransactionCashAccountId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`)
                .join('');
            const defaultCashCategoryId = order.cashTransactionCashCategoryId ?? methods.resolveCashCategoryId('Bán hàng') ?? '';
            const statusKey = paidAmountValue >= totalAmountValue && totalAmountValue > 0
                ? 'Paid'
                : (paidAmountValue > 0 ? 'Partially Paid' : 'Unpaid');
            const statusText = statusKey === 'Paid'
                ? text('Đã thanh toán', 'Paid')
                : (statusKey === 'Partially Paid'
                    ? text('Thanh toán một phần', 'Partially Paid')
                    : text('Chưa thanh toán', 'Unpaid'));
            const result = await Swal.fire({
                title: text(`Thanh toán đơn bán hàng ${orderNumber}`, `Sales Order Payment ${orderNumber}`),
                width: 680,
                customClass: { popup: 'sales-order-payment-popup' },
                html: `
                    <div class="text-left">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="text-muted font-weight-semibold">${text('Trạng thái hiện tại', 'Current Status')}</span>
                            <span class="badge ${statusKey === 'Paid' ? 'bg-success' : (statusKey === 'Partially Paid' ? 'bg-warning text-dark' : 'bg-secondary')}">${statusText}</span>
                        </div>
                        <div class="row mx-n1 mb-4">
                            <div class="col-12 col-sm-4 px-1 mb-2 mb-sm-0"><div class="payment-summary-box"><div class="small text-muted">${text('Tổng tiền đơn hàng', 'Order Total')}</div><div class="font-weight-bold mt-2">${NumberFormatManager.formatMoneyToLocale(totalAmountValue)}</div></div></div>
                            <div class="col-12 col-sm-4 px-1 mb-2 mb-sm-0"><div class="payment-summary-box"><div class="small text-muted">${text('Đã thanh toán', 'Paid')}</div><div class="font-weight-bold text-success mt-2">${NumberFormatManager.formatMoneyToLocale(paidAmountValue)}</div></div></div>
                            <div class="col-12 col-sm-4 px-1"><div class="payment-summary-box"><div class="small text-muted">${text('Còn lại', 'Remaining')}</div><div class="font-weight-bold text-danger mt-2">${NumberFormatManager.formatMoneyToLocale(remainingAmountValue)}</div></div></div>
                        </div>
                        <div class="payment-form-card">
                            <div class="form-group mb-3">
                                <label for="swal-account" class="d-block font-weight-bold mb-2">${text('Tài khoản quỹ', 'Cash Account')}</label>
                                <select id="swal-account" class="form-control" data-searchable-dropdown><option value="">${text('Chọn tài khoản quỹ', 'Select Cash Account')}</option>${accountOptions}</select>
                            </div>
                            <div class="form-group mb-3">
                                <label for="swal-amount" class="d-block font-weight-bold mb-2">${text('Thanh toán lần này', 'Payment This Time')}</label>
                                <input id="swal-amount" class="form-control" inputmode="numeric" data-number-format="true" value="${NumberFormatManager.formatMoneyToLocale(remainingAmountValue)}">
                            </div>
                            <div class="form-group mb-0">
                                <label for="swal-desc" class="d-block font-weight-bold mb-2">${text('Diễn giải', 'Description')}</label>
                                <textarea id="swal-desc" class="form-control" rows="2">${escapeHtml(displayDescription)}</textarea>
                            </div>
                        </div>
                    </div>
                `,
                showCancelButton: true,
                confirmButtonText: text('Lưu thanh toán', 'Save Payment'),
                cancelButtonText: text('Hủy', 'Cancel'),
                focusConfirm: false,
                didOpen: () => {
                    NumberFormatManager.bindNumericInput(document.getElementById('swal-amount'));
                },
                preConfirm: () => {
                    const accountId = document.getElementById('swal-account').value;
                    const categoryId = defaultCashCategoryId;
                    const rawAmountValue = document.getElementById('swal-amount').value ?? '0';
                    const parsedAmount = NumberFormatManager.parseLocaleNumber(rawAmountValue) ?? 0;
                    if (!accountId) {
                        Swal.showValidationMessage(text('Vui lòng chọn tài khoản quỹ.', 'Select a cash account.'));
                        return false;
                    }
                    if (parsedAmount <= 0) {
                        Swal.showValidationMessage(text('Số tiền thanh toán phải lớn hơn 0.', 'Payment amount must be greater than zero.'));
                        return false;
                    }
                    if (parsedAmount > remainingAmountValue) {
                        Swal.showValidationMessage(text('Số tiền thanh toán không được vượt quá số tiền còn lại.', 'Payment amount cannot exceed the remaining amount.'));
                        return false;
                    }
                    return {
                        cashAccountId: accountId || null,
                        cashCategoryId: categoryId || null,
                        amount: parsedAmount,
                        description: document.getElementById('swal-desc').value
                    };
                }
            });

            if (result.isConfirmed && result.value) {
                try {
                    const payload = {
                        salesOrderId: orderId,
                        paymentAmount: result.value.amount,
                        description: result.value.description,
                        cashAccountId: result.value.cashAccountId,
                        cashCategoryId: result.value.cashCategoryId ?? null,
                        paymentDate: new Date().toISOString(),
                        updatedById: StorageManager.getUserId()
                    };
                    const response = await services.upsertSalesOrderPayment(payload);
                    if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Payment could not be saved.');
                    await methods.populateMainData();
                    mainGrid.refresh();
                    const savedStatus = response?.data?.content?.status;
                    Swal.fire({
                        icon: 'success',
                        title: savedStatus === 'Paid' ? 'Payment Completed' : 'Payment Saved',
                        timer: 1200,
                        showConfirmButton: false
                    });
                } catch (err) {
                    console.error('Payment Modal error:', err);
                    Swal.fire({ icon: 'error', title: 'Payment Failed', text: getErrorMessage(err, 'Please try again.') });
                }
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['SalesOrders']);
                await SecurityManager.validateToken();

                await methods.populateCashAccountList();
                await methods.populateCashCategoryList();
                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);
                await methods.populateCustomerListLookupData();
                customerListLookup.create();
                await methods.populateSalesTypeListLookupData();
                salesTypeListLookup.create();
                await methods.populateTaxListLookupData();
                await methods.populateSalesOrderStatusListLookupData();
                salesOrderStatusListLookup.create();
                orderDatePicker.create();
                numberText.create();
                await methods.populateProductListLookupData();
                await methods.populateWarehouseListLookupData();
                await secondaryGrid.create(state.secondaryData);
                try {
                    await methods.populateInventoryStockData();
                } catch (inventoryError) {
                    state.inventoryAvailabilityReady = false;
                    console.error('Unable to initialize inventory availability:', inventoryError);
                    secondaryGrid.refresh();
                }
            } catch (e) {
                console.error('page init error:', e);
            } finally {
                const urlParams = new URLSearchParams(window.location.search);
                const viewMode = urlParams.get('viewMode') === 'true';
                const viewId = urlParams.get('id');

                if (viewMode && viewId) {
                    state.isViewMode = true;
                    const selectedRecord = state.mainData.find(x => x.id === viewId);
                    if (selectedRecord) {
                        state.mainTitle = 'Xem đơn bán hàng';
                        state.id = selectedRecord.id ?? '';
                        state.number = selectedRecord.number ?? '';
                        state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                        state.description = selectedRecord.description ?? '';
                        state.customerId = selectedRecord.customerId ?? '';
                        state.salesType = selectedRecord.salesType ?? 1;
                        state.orderStatus = String(selectedRecord.orderStatus ?? '');
                        state.showComplexDiv = true;

                        await methods.populateSecondaryData(selectedRecord.id);
                        secondaryGrid.refresh();
                        mainModal.obj.show();
                    }
                }
            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', methods.onMainModalHidden);
        });

        return {
            mainGridRef,
            mainModalRef,
            orderDateRef,
            numberRef,
            customerIdRef,
            salesTypeRef,
            orderStatusRef,
            secondaryGridRef,
            state,
            methods,
            handler: {
                handleSubmit: methods.handleFormSubmit,
                quickAddCustomer: methods.quickAddCustomer
            }
        };
    }
};

const mountSalesOrderApp = () => Vue.createApp(App).mount('#app');
if (window.SalesOrderItemEditor) {
    mountSalesOrderApp();
} else {
    const editorScript = document.createElement('script');
    editorScript.src = '/lib/indotalent/sales-order-item-editor.js?v=20260810-so-item-fix';
    editorScript.onload = mountSalesOrderApp;
    editorScript.onerror = () => console.error('Không thể tải logic chỉnh sửa chi tiết đơn bán hàng.');
    document.head.appendChild(editorScript);
}
