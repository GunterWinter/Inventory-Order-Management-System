const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            vendorListLookupData: [],
            taxListLookupData: [],
            purchaseOrderStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            warehouseListLookupData: [],
            purchaseOrderItemHistoryData: [],
            paymentStatusLookupData: [],
            cashAccountListData: [],
            cashCategoryListData: [],
            customerListLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            orderDate: '',
            description: '',
            vendorId: null,
            orderStatus: '0',
            errors: {
                orderDate: '',
                vendorId: '',
                orderStatus: '',
                description: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            subTotalAmount: '0',
            taxAmount: '0',
            totalAmount: '0',
            isViewMode: false,
            costAllocationSelectedItems: [],
            costAllocationCashAccountId: null,
            costAllocationCashCategoryId: null,
            isCostAllocationSubmitting: false,
            costAllocationErrors: {
                cashAccountId: ''
            }
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const orderDateRef = Vue.ref(null);
        const numberRef = Vue.ref(null);
        const vendorIdRef = Vue.ref(null);
        const orderStatusRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const costAllocationModalRef = Vue.ref(null);
        const costAllocationCashAccountIdRef = Vue.ref(null);
        const costAllocationCashCategoryIdRef = Vue.ref(null);
        const costAllocationPreviewGridRef = Vue.ref(null);

        const toDateTicks = (value) => value ? new Date(value).getTime() : 0;
        const getAllSecondaryRows = () => {
            const rowsById = new Map();
            const addRows = rows => (rows ?? []).forEach((row, index) => {
                const key = row?.id ?? `row-${index}-${row?.productId ?? ''}`;
                rowsById.set(key, row);
            });
            addRows(state.secondaryData);
            addRows(secondaryGrid?.obj?.getCurrentViewRecords?.());
            const changes = secondaryGrid?.obj?.getBatchChanges?.();
            addRows(changes?.addedRecords);
            addRows(changes?.changedRecords);
            (changes?.deletedRecords ?? []).forEach(row => rowsById.delete(row?.id));
            return [...rowsById.values()];
        };
        const getSelectedProductIds = (currentRowId = null) => new Set(
            getAllSecondaryRows()
                .filter(item => item.id !== currentRowId && item.productId)
                .map(item => item.productId)
        );
        const getSelectableProductOptions = (currentRow = {}) => {
            const selectedProductIds = getSelectedProductIds(currentRow.id ?? null);
            const currentProductId = currentRow.productId ?? null;

            return state.productListLookupData.filter(product =>
                product.id === currentProductId || !selectedProductIds.has(product.id)
            );
        };
        const getPurchaseOrderItemAmounts = (row, overrides = {}) => {
            const quantity = Number(overrides.quantity ?? row?.quantity ?? 0) || 0;
            const unitPrice = Number(overrides.unitPrice ?? row?.unitPrice ?? 0) || 0;
            const taxId = overrides.taxId ?? row?.taxId ?? null;
            const taxPercentage = Number(state.taxListLookupData.find(tax => tax.id === taxId)?.percentage ?? 0) || 0;
            const total = quantity * unitPrice;
            const taxAmount = total * taxPercentage / 100;

            return { quantity, unitPrice, taxId, total, taxAmount, afterTaxAmount: total + taxAmount };
        };
        const applyPurchaseOrderItemAmounts = (row, overrides = {}) => {
            if (!row) return null;
            const amounts = getPurchaseOrderItemAmounts(row, overrides);
            Object.assign(row, amounts);
            requestAnimationFrame(() => refreshPurchaseOrderSummaryFromItems());
            return amounts;
        };
        const applyPurchaseOrderProductDefaults = (row, productId, resetQuantity = true) => {
            const product = state.productListLookupData.find(item => item.id === productId);
            if (!row || !product) return null;

            const quantity = resetQuantity ? 1 : (Number(row.quantity) || 1);
            const unitPrice = Number(product.unitPrice ?? product.costPrice ?? 0) || 0;
            const warehouseId = product.physical === false ? null : (product.defaultWarehouseId ?? null);
            const defaults = {
                productId: product.id,
                productReferenceCode: product.referenceCode ?? '',
                productNumber: product.number ?? '',
                warehouseId,
                warehouseName: warehouseId ? (product.defaultWarehouseName ?? '') : '',
                supplierWarrantyMonths: product.defaultWarrantyMonths ?? 6,
                summary: product.description ?? '',
                manufacturerSerialNumbers: Number(product.serialTrackingMode ?? 0) === 2
                    ? (row.manufacturerSerialNumbers ?? [])
                    : null
            };
            Object.assign(row, defaults);
            applyPurchaseOrderItemAmounts(row, { unitPrice, quantity });
            return { ...defaults, quantity: row.quantity, unitPrice: row.unitPrice, total: row.total, taxAmount: row.taxAmount, afterTaxAmount: row.afterTaxAmount };
        };
        const writePurchaseOrderBatchFields = (row, values) => {
            if (!secondaryGrid?.obj || !row || !values) return;
            const rowIndex = secondaryGrid.obj.getRowIndexByPrimaryKey(row.id);
            if (rowIndex == null || rowIndex < 0) return;

            Object.entries(values).forEach(([field, value]) => {
                if (field === 'productId' || !secondaryGrid.obj.getColumnByField(field)) return;
                secondaryGrid.obj.updateCell(rowIndex, field, value);
            });
        };
        const refreshPurchaseOrderItemAmountCells = (editorElement, row) => {
            const grid = secondaryGrid?.obj;
            const tableRow = editorElement?.closest?.('tr');
            if (!grid || !tableRow || !row) return;

            ['total', 'taxAmount', 'afterTaxAmount'].forEach(field => {
                const cellIndex = grid.getColumnIndexByField(field);
                if (cellIndex >= 0 && tableRow.cells[cellIndex]) {
                    tableRow.cells[cellIndex].textContent = NumberFormatManager.formatToLocale(row[field] ?? 0);
                }
            });
        };
        const refreshPurchaseOrderSummaryFromItems = () => {
            const rows = secondaryGrid?.obj?.getCurrentViewRecords?.() ?? state.secondaryData ?? [];
            const totals = rows.reduce((result, row) => {
                const amounts = getPurchaseOrderItemAmounts(row);
                result.beforeTax += amounts.total;
                result.tax += amounts.taxAmount;
                result.afterTax += amounts.afterTaxAmount;
                return result;
            }, { beforeTax: 0, tax: 0, afterTax: 0 });
            state.subTotalAmount = NumberFormatManager.formatToLocale(totals.beforeTax);
            state.taxAmount = NumberFormatManager.formatToLocale(totals.tax);
            state.totalAmount = NumberFormatManager.formatToLocale(totals.afterTax);
        };
        const validateForm = function () {
            state.errors.orderDate = '';
            state.errors.vendorId = '';
            state.errors.orderStatus = '';

            let isValid = true;

            if (!state.orderDate) {
                state.errors.orderDate = 'Order date is required.';
                isValid = false;
            }
            if (!state.vendorId) {
                state.errors.vendorId = 'Vendor is required.';
                isValid = false;
            }
            if (state.orderStatus === null || state.orderStatus === undefined || state.orderStatus === '') {
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
            state.vendorId = null;
            state.orderStatus = '0';
            state.errors = {
                orderDate: '',
                vendorId: '',
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
                    const response = await AxiosManager.get('/PurchaseOrder/GetPurchaseOrderList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (orderDate, description, orderStatus, vendorId, createdById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
                        orderDate, description, orderStatus, vendorId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, orderDate, description, orderStatus, vendorId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrder/UpdatePurchaseOrder', {
                        id, orderDate, description, orderStatus, vendorId, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrder/DeletePurchaseOrder', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getVendorListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Vendor/GetVendorList', {});
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
            getPurchaseOrderStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/PurchaseOrder/GetPurchaseOrderStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (purchaseOrderId) => {
                try {
                    const response = await AxiosManager.get('/PurchaseOrderItem/GetPurchaseOrderItemByPurchaseOrderIdList?purchaseOrderId=' + purchaseOrderId, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (unitPrice, quantity, summary, productId, warehouseId, supplierWarrantyMonths, taxId, purchaseOrderId, createdById, manufacturerSerialNumbers) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrderItem/CreatePurchaseOrderItem', {
                        unitPrice, quantity, summary, productId, warehouseId, supplierWarrantyMonths, taxId, purchaseOrderId, createdById, manufacturerSerialNumbers
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, unitPrice, quantity, summary, productId, warehouseId, supplierWarrantyMonths, taxId, purchaseOrderId, updatedById, manufacturerSerialNumbers) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrderItem/UpdatePurchaseOrderItem', {
                        id, unitPrice, quantity, summary, productId, warehouseId, supplierWarrantyMonths, taxId, purchaseOrderId, updatedById, manufacturerSerialNumbers
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrderItem/DeletePurchaseOrderItem', {
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
            getPurchaseOrderItemHistoryData: async () => {
                try {
                    const response = await AxiosManager.get('/PurchaseOrderItem/GetPurchaseOrderItemList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getPaymentStatusLookup: async () => {
                try {
                    const response = await AxiosManager.get('/CashTransaction/GetPaymentStatusLookup?sourceModule=PurchaseOrder', {});
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
            createCashTransaction: async (data) => {
                try {
                    const response = await AxiosManager.post('/CashTransaction/CreateCashTransaction', data);
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateCashTransaction: async (data) => {
                try {
                    const response = await AxiosManager.post('/CashTransaction/UpdateCashTransaction', data);
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
            getCustomerListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Customer/GetCustomerList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            allocatePurchaseOrderCosts: async (purchaseOrderId, cashAccountId, cashCategoryId, items, createdById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrder/AllocatePurchaseOrderCosts', {
                        purchaseOrderId, cashAccountId, cashCategoryId, items, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getCostAllocationsByPurchaseOrderId: async (purchaseOrderId) => {
                try {
                    const response = await AxiosManager.get(`/PurchaseOrder/GetCostAllocationsByPurchaseOrderId?purchaseOrderId=${purchaseOrderId}`, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            payPurchaseOrder: async (data) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrder/PayPurchaseOrder', data);
                    return response;
                } catch (error) {
                    throw error;
                }
            }
        };

        const methods = {
            populateVendorListLookupData: async () => {
                const response = await services.getVendorListLookupData();
                state.vendorListLookupData = response?.data?.content?.data;
            },
            quickAddVendor: async () => {
                if (typeof QuickAddHelper === 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Quick Add is unavailable' });
                    return null;
                }
                return await QuickAddHelper.complexQuickAddVendor({
                    dropdownObj: vendorListLookup.obj,
                    refreshLookup: methods.populateVendorListLookupData,
                    refreshLookups: [methods.populateWarehouseListLookupData],
                    state,
                    stateKey: 'vendorId',
                    lookupKey: 'vendorListLookupData'
                });
            },
            populateTaxListLookupData: async () => {
                const response = await services.getTaxListLookupData();
                state.taxListLookupData = response?.data?.content?.data;
            },
            populatePurchaseOrderStatusListLookupData: async () => {
                const response = await services.getPurchaseOrderStatusListLookupData();
                const allData = response?.data?.content?.data ?? [];
                state.purchaseOrderStatusListLookupData = allData;
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
                                paymentStatusText = 'Paid';
                                paymentStatusClass = 'paid';
                            } else if (payment.paidAmount > 0) {
                                paymentStatusText = 'Partially Paid';
                                paymentStatusClass = 'unpaid';
                            } else {
                                paymentStatusText = 'Unpaid';
                                paymentStatusClass = 'unpaid';
                            }
                        } else {
                            paymentStatusText = 'Unpaid';
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
                        cashTransactionAmount: payment?.amount ?? null,
                        cashTransactionPaidAmount: payment?.paidAmount ?? null,
                        cashTransactionDescription: payment?.description ?? null,
                        cashTransactionIsSplit: payment?.isSplit ?? false
                    };
                });
            },
            populateSecondaryData: async (purchaseOrderId) => {
                try {
                    const response = await services.getSecondaryData(purchaseOrderId);
                    const items = response?.data?.content?.data ?? [];
                    state.secondaryData = items.map(item => ({
                        ...item,
                        manufacturerSerialNumbers: Array.isArray(item.manufacturerSerialNumbers)
                            ? item.manufacturerSerialNumbers
                            : (typeof item.manufacturerSerialNumbers === 'string' && item.manufacturerSerialNumbers
                                ? item.manufacturerSerialNumbers.split(',').map(x => x.trim()).filter(Boolean) : []),
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    }));
                    requestAnimationFrame(() => refreshPurchaseOrderSummaryFromItems());
                } catch (error) {
                    console.error('Không thể tải lại danh sách hàng hóa của đơn mua hàng.', error);
                    throw error;
                }
            },
            verifySecondaryDataPersisted: async (expectedItems, knownPersistedItems = null) => {
                if (!state.id) return true;
                let persistedItems = knownPersistedItems;
                if (!Array.isArray(persistedItems)) {
                    const response = await services.getSecondaryData(state.id);
                    persistedItems = response?.data?.content?.data ?? [];
                }
                const sameNumber = (left, right) => Number(left ?? 0) === Number(right ?? 0);
                const matches = expected => persistedItems.some(item => {
                    if (expected?.id && item.id !== expected.id) return false;
                    return item.productId === expected?.productId
                        && (item.warehouseId ?? null) === (expected?.warehouseId ?? null)
                        && item.taxId === expected?.taxId
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
            populatePurchaseOrderItemHistoryData: async () => {
                const response = await services.getPurchaseOrderItemHistoryData();
                state.purchaseOrderItemHistoryData = response?.data?.content?.data.map(item => ({
                    ...item,
                    createdAtUtc: item.createdAtUtc ? DateFormatManager.parseServerDate(item.createdAtUtc) : null
                })) ?? [];
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
            refreshPaymentSummary: async (id) => {
                refreshPurchaseOrderSummaryFromItems();
            },
            handleFormSubmit: async () => {
                state.isSubmitting = true;

                if (secondaryGrid.obj && typeof GridInteractionManager !== 'undefined') {
                    const itemChangesSaved = await GridInteractionManager.save(secondaryGrid.obj);
                    if (!itemChangesSaved) {
                        state.isSubmitting = false;
                        Swal.fire({
                            icon: 'warning',
                            title: 'Chưa lưu được hàng hóa',
                            text: 'Vui lòng kiểm tra dòng đang sửa trước khi lưu đơn mua hàng.',
                            confirmButtonText: 'Đồng ý'
                        });
                        return;
                    }
                } else if (secondaryGrid.obj && secondaryGrid.obj.isEdit) {
                    secondaryGrid.obj.endEdit();
                }

                if (!state.deleteMode && state.id && secondaryGrid.obj) {
                    const expectedItems = secondaryGrid.obj.getCurrentViewRecords?.() ?? state.secondaryData ?? [];
                    let itemsPersisted = false;
                    try {
                        itemsPersisted = await methods.verifySecondaryDataPersisted(expectedItems);
                    } catch (error) {
                        console.error('Không thể xác minh danh sách hàng hóa đã lưu.', error);
                    }
                    if (!itemsPersisted) {
                        state.isSubmitting = false;
                        Swal.fire({
                            icon: 'error',
                            title: 'Chưa lưu được hàng hóa',
                            text: 'Danh sách trên màn hình chưa khớp với dữ liệu đã lưu. Đơn mua hàng chưa được cập nhật; vui lòng lưu lại danh sách hàng hóa.',
                            confirmButtonText: 'Đồng ý'
                        });
                        return;
                    }
                }

                if (!validateForm()) {
                    state.isSubmitting = false;
                    return;
                }

                if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.orderStatus))) {
                    state.isSubmitting = false;
                    return;
                }

                try {
                    const response = state.id === ''
                        ? await services.createMainData(state.orderDate, state.description, state.orderStatus, state.vendorId, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.orderDate, state.description, state.orderStatus, state.vendorId, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Edit Purchase Order';
                            state.id = response?.data?.content?.data.id ?? '';
                            state.number = response?.data?.content?.data.number ?? '';
                            state.orderDate = response?.data?.content?.data.orderDate ? DateFormatManager.parseBusinessDate(response.data.content.data.orderDate) : null;
                            state.description = response?.data?.content?.data.description ?? '';
                            state.vendorId = response?.data?.content?.data.vendorId ?? '';
                            state.orderStatus = String(response?.data?.content?.data.orderStatus ?? '');
                            state.showComplexDiv = true;

                            await methods.refreshPaymentSummary(state.id);
                            await methods.populateSecondaryData(state.id);
                            secondaryGrid.refresh();

                            Swal.fire({ icon: 'success', title: 'Save Successful', timer: 1000, showConfirmButton: false });
                        } else {
                            Swal.fire({
                                icon: 'success',
                                title: 'Delete Successful',
                                text: 'The purchase order has been deleted.',
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
                            title: state.deleteMode ? 'Delete Failed' : 'Save Failed',
                            text: response.data.message ?? 'Please check your data.',
                            confirmButtonText: 'Try Again'
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'An error occurred',
                        text: error.response?.data?.message ?? 'Please try again.',
                        confirmButtonText: 'OK'
                    });
                } finally {
                    state.isSubmitting = false;
                }
            },
            onMainModalHidden: () => {
                state.errors.orderDate = '';
                state.errors.vendorId = '';
                state.errors.orderStatus = '';
                state.isViewMode = false;
            },
            populateCustomerListLookupData: async () => {
                const response = await services.getCustomerListLookupData();
                state.customerListLookupData = response?.data?.content?.data ?? [];
            },
            handleCostAllocationSubmit: async () => {

                // End any pending edit in the preview grid
                if (costAllocationPreviewGrid.obj && costAllocationPreviewGrid.obj.isEdit) {
                    costAllocationPreviewGrid.obj.endEdit();
                    await new Promise(r => setTimeout(r, 150));
                }

                const gridData = costAllocationPreviewGrid.obj ? costAllocationPreviewGrid.obj.dataSource : [];
                if (!gridData || gridData.length === 0) {
                    Swal.fire({ icon: 'warning', title: 'No products selected', text: 'Select at least one product to allocate.' });
                    return;
                }

                // Validate quantities
                const byPoItem = {};
                for (const row of gridData) {
                    if (row.allocateQuantity < 0) {
                        Swal.fire({ icon: 'warning', title: 'Invalid quantity', text: 'Allocation quantity cannot be negative.' });
                        return;
                    }

                    if (!byPoItem[row.poItemId]) {
                        const poItem = state.secondaryData.find(x => x.id === row.poItemId);
                        byPoItem[row.poItemId] = {
                            total: 0,
                            maxQty: poItem ? poItem.quantity : 0,
                            name: ''
                        };
                    }
                    byPoItem[row.poItemId].total += (row.allocateQuantity || 0);
                    const product = state.productListLookupData.find(p => p.id === row.productId);
                    byPoItem[row.poItemId].name = product?.name || '';
                }

                for (const [poItemId, info] of Object.entries(byPoItem)) {
                    if (info.total > info.maxQty) {
                        const translate = window.UiLocalization?.translateText ?? (value => value);
                        Swal.fire({ icon: 'warning', title: 'Allocation exceeds purchase quantity', text: `${translate('Product')} "${info.name}" ${translate('has total allocation')} ${info.total}, ${translate('exceeding purchased quantity')} ${info.maxQty}.` });
                        return;
                    }
                }

                // Validate: if allocateQuantity > 0, must have a customerId
                for (const row of gridData) {
                    if ((row.allocateQuantity || 0) > 0 && !row.customerId) {
                        const product = state.productListLookupData.find(p => p.id === row.productId);
                        const translate = window.UiLocalization?.translateText ?? (value => value);
                        Swal.fire({ icon: 'warning', title: 'Customer is required', text: `${translate('Product')} "${product?.name || ''}" ${translate('has a positive allocation but no customer')}.` });
                        return;
                    }
                }

                state.isCostAllocationSubmitting = true;
                try {
                    // Only send rows that have a customer and quantity > 0
                    const items = gridData
                        .filter(row => row.customerId && (row.allocateQuantity || 0) > 0)
                        .map(row => ({
                            purchaseOrderItemId: row.poItemId,
                            customerId: row.customerId,
                            quantity: row.allocateQuantity,
                            unitPrice: row.allocateUnitPrice
                        }));
                    const response = await services.allocatePurchaseOrderCosts(
                        state.id,
                        null,
                        state.costAllocationCashCategoryId ?? methods.resolveCashCategoryId('Mua hàng'),
                        items,
                        StorageManager.getUserId()
                    );

                    if (response.data.code === 200) {
                        costAllocationModal.obj.hide();

                        await methods.populateSecondaryData(state.id);
                        secondaryGrid.refresh();

                        Swal.fire({
                            icon: 'success',
                            title: 'Allocation saved',
                            html: 'One unpaid vendor obligation was created or updated.<br/>Open Cash Transactions?',
                            showCancelButton: true,
                            confirmButtonText: 'Open Cash Transactions',
                            cancelButtonText: 'Close'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/CashTransactions/CashTransactionList';
                            }
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Allocation failed',
                            text: response.data.message ?? 'Check the allocation data and try again.'
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'An error occurred',
                        text: error.response?.data?.message ?? 'The cost allocation could not be saved.'
                    });
                } finally {
                    state.isCostAllocationSubmitting = false;
                }
            },
            openCostAllocationModal: async () => {
                try {
                    const purchaseOrder = state.mainData.find(x => x.id === state.id);
                    if ((purchaseOrder?.cashTransactionPaidAmount ?? 0) > 0) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Allocation is locked',
                            text: 'A partially or fully paid purchase order cannot be reallocated.'
                        });
                        return;
                    }
                    Swal.fire({ title: 'Loading...', allowOutsideClick: false });
                    Swal.showLoading();

                    const response = await services.getCostAllocationsByPurchaseOrderId(state.id);
                    const allAllocations = response?.data?.content?.data || [];
                    const customerAllocations = allAllocations.filter(x => x.customerId !== null);

                    const prefillCashAccountId = response?.data?.content?.cashAccountId || null;
                    const prefillCashCategoryId = response?.data?.content?.cashCategoryId
                        || methods.resolveCashCategoryId('Mua hàng');

                    // Calculate total allocated IN BACKEND for each PO item
                    const backendAllocByItem = {};
                    customerAllocations.forEach(alloc => {
                        if (!backendAllocByItem[alloc.purchaseOrderItemId]) backendAllocByItem[alloc.purchaseOrderItemId] = 0;
                        backendAllocByItem[alloc.purchaseOrderItemId] += (alloc.quantity || 0);
                    });

                    let previewData = [];
                    if (customerAllocations.length > 0) {
                        previewData = customerAllocations.map((alloc, idx) => {
                            const poItem = state.secondaryData.find(x => x.id === alloc.purchaseOrderItemId);
                            const calcPrice = poItem ? ((poItem.afterTaxAmount || 0) / (poItem.quantity > 0 ? poItem.quantity : 1)) : alloc.unitPrice;
                            return {
                                id: alloc.id,
                                poItemId: alloc.purchaseOrderItemId,
                                productId: poItem ? poItem.productId : '',
                                warehouseId: poItem ? poItem.warehouseId : '',
                                remainingQuantity: 0,
                                customerId: alloc.customerId,
                                allocateQuantity: alloc.quantity,
                                allocateUnitPrice: calcPrice,
                                allocateTotal: alloc.quantity * calcPrice
                            };
                        });
                    }

                    // Ensure every PO item has at least one row, even if empty, so the user can clone it
                    const poItems = state.secondaryData.filter(x => (x.quantity || 0) > 0);
                    for (const item of poItems) {
                        const hasRow = previewData.some(x => x.poItemId === item.id);
                        if (!hasRow) {
                            const calcPrice = (item.afterTaxAmount || 0) / (item.quantity > 0 ? item.quantity : 1);
                            previewData.push({
                                id: `alloc_def_${item.id}_${Date.now()}`,
                                poItemId: item.id,
                                productId: item.productId,
                                warehouseId: item.warehouseId,
                                remainingQuantity: 0,
                                customerId: null,
                                allocateQuantity: 0,
                                allocateUnitPrice: calcPrice,
                                allocateTotal: 0
                            });
                        }
                    }

                    // Calculate dynamic remaining quantity for each PO item
                    const totalAllocByItem = {};
                    previewData.forEach(row => {
                        if (!totalAllocByItem[row.poItemId]) totalAllocByItem[row.poItemId] = 0;
                        totalAllocByItem[row.poItemId] += (row.allocateQuantity || 0);
                    });

                    previewData.forEach(row => {
                        const poItem = state.secondaryData.find(x => x.id === row.poItemId);
                        row.remainingQuantity = Math.max(0, Number(poItem?.quantity || 0) - (totalAllocByItem[row.poItemId] || 0));
                    });

                    // Reset state
                    state.costAllocationCashAccountId = prefillCashAccountId;
                    state.costAllocationCashCategoryId = prefillCashCategoryId;
                    state.costAllocationErrors.cashAccountId = '';

                    costAllocationPreviewGrid.createOrRefresh(previewData);

                    if (costAllocationCashAccountLookup.obj) {
                        costAllocationCashAccountLookup.obj.value = prefillCashAccountId;
                    }
                    if (costAllocationCashCategoryLookup.obj) {
                        costAllocationCashCategoryLookup.obj.value = prefillCashCategoryId;
                    }

                    Swal.close();
                    costAllocationModal.obj.show();
                } catch (error) {
                    Swal.fire({ icon: 'error', title: 'Error', text: 'Allocation data could not be loaded.' });
                }
            }
        };

        const vendorListLookup = {
            obj: null,
            create: () => {
                if (state.vendorListLookupData && Array.isArray(state.vendorListLookupData)) {
                    vendorListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.vendorListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Vendor',
                        filterBarPlaceholder: 'Search',
                        sortOrder: 'Ascending',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.vendorListLookupData, query);
                        },
                        change: (e) => {
                            state.vendorId = e.value;
                        }
                    });
                    vendorListLookup.obj.appendTo(vendorIdRef.value);
                }
            },
            refresh: () => {
                if (vendorListLookup.obj) {
                    vendorListLookup.obj.value = state.vendorId;
                }
            }
        };

        const purchaseOrderStatusListLookup = {
            obj: null,
            create: () => {
                if (state.purchaseOrderStatusListLookupData && Array.isArray(state.purchaseOrderStatusListLookupData)) {
                    purchaseOrderStatusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.purchaseOrderStatusListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Status',
                        value: state.orderStatus,
                        change: (e) => {
                            state.orderStatus = e.value;
                        }
                    });
                    purchaseOrderStatusListLookup.obj.appendTo(orderStatusRef.value);
                }
            },
            refresh: () => {
                if (purchaseOrderStatusListLookup.obj) {
                    purchaseOrderStatusListLookup.obj.value = state.orderStatus;
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
            () => state.vendorId,
            (newVal, oldVal) => {
                vendorListLookup.refresh();
                state.errors.vendorId = '';
            }
        );

        Vue.watch(
            () => state.orderStatus,
            (newVal, oldVal) => {
                purchaseOrderStatusListLookup.refresh();
                state.errors.orderStatus = '';

                // Filter Draft out of dropdown when status > 0
                StatusDropdownHelper.applyToDropdown(
                    purchaseOrderStatusListLookup.obj,
                    state.purchaseOrderStatusListLookupData,
                    newVal
                );

                // Enable QuickExport only when Confirmed (status=2)
                if (typeof secondaryGrid !== 'undefined' && secondaryGrid.obj) {
                    try {
                        const isConfirmed = String(newVal) === '2';
                        secondaryGrid.obj.toolbarModule.enableItems(['QuickExportCustom'], isConfirmed);
                    } catch (e) { }
                }
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
                    detailTemplate: '#detailtemplate',
                    detailDataBound: async (e) => {
                        let detailGrid = new ej.grids.Grid({
                            dataSource: [],
                            columns: [
                                { field: 'purchaseOrderItem.product.name', headerText: 'Product', width: 150 },
                                {
                                    field: 'warehouse.name',
                                    headerText: 'Kho',
                                    width: 150,
                                    valueAccessor: (field, row) => row.warehouse?.name ?? row.purchaseOrderItem?.warehouse?.name ?? ''
                                },
                                { field: 'customer.name', headerText: 'Customer', width: 150 },
                                { field: 'quantity', headerText: 'Quantity', width: 100, format: 'N0' },
                                { field: 'unitPrice', headerText: 'Unit Price', width: 120, format: 'N0' },
                                { field: 'amount', headerText: 'Amount', width: 120, format: 'N0', valueAccessor: (field, row) => row.amount ?? ((row.quantity || 0) * (row.unitPrice || 0)) }
                            ]
                        });

                        let destElement = e.detailElement.querySelector('.allocation-detail-grid');
                        if (destElement) {
                            detailGrid.appendTo(destElement);
                            try {
                                const response = await axios.get('/api/purchase-order/GetCostAllocationsByPurchaseOrderId?purchaseOrderId=' + e.data.id);
                                if (response?.data?.content?.data) {
                                    let allocData = response.data.content.data;
                                    allocData.forEach(x => {
                                        if (!x.customer) {
                                            x.customer = { name: '' };
                                        }
                                        if (!x.purchaseOrderItem) {
                                            x.purchaseOrderItem = { product: { name: 'N/A' }, warehouse: { name: 'N/A' } };
                                        }
                                    });
                                    detailGrid.dataSource = allocData;
                                }
                            } catch (err) {
                                console.error('Error loading detail row:', err);
                            }
                        }
                    },
                    allowGrouping: true,
                    groupSettings: { columns: ['vendorName'] },
                    allowTextWrap: true,
                    allowResizing: true,
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
                        { field: 'vendorName', headerText: 'Vendor', width: 200, minWidth: 200 },
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
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'View', tooltipText: 'View details', prefixIcon: 'e-eye', id: 'ViewCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'In PDF', tooltipText: 'In PDF', id: 'PrintPDFCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        mainGrid.obj.autoFitColumns(['number', 'orderDate', 'vendorName', 'orderStatusName', 'afterTaxAmount', 'createdAtUtc', 'paymentStatusText']);

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
                                await showPaymentPopup(
                                    rowData.id,
                                    rowData.number,
                                    rowData.afterTaxAmount ?? 0,
                                    rowData.cashTransactionId,
                                    rowData.cashTransactionStatus,
                                    rowData.cashTransactionCashAccountId,
                                    rowData.cashTransactionPaidAmount,
                                    rowData.cashTransactionDescription,
                                    rowData.cashTransactionDate,
                                    rowData.cashTransactionIsSplit
                                );
                            });
                        });
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        const count = mainGrid.obj.getSelectedRecords().length;
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'PrintPDFCustom'], count === 1);
                        mainGrid.obj.toolbarModule.enableItems(['DeleteCustom'], count > 0);
                    },
                    rowDeselected: () => {
                        const count = mainGrid.obj.getSelectedRecords().length;
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'PrintPDFCustom'], count === 1);
                        mainGrid.obj.toolbarModule.enableItems(['DeleteCustom'], count > 0);
                    },
                    recordDoubleClick: async (args) => {
                        if (args.rowData) {
                            const selectedRecord = args.rowData;
                            state.isViewMode = true;
                            state.deleteMode = false;
                            state.mainTitle = 'View Purchase Order';
                            state.id = selectedRecord.id ?? '';
                            state.number = selectedRecord.number ?? '';
                            state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                            state.description = selectedRecord.description ?? '';
                            state.vendorId = selectedRecord.vendorId ?? '';
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
                            state.deleteMode = false;
                            state.isViewMode = false;
                            state.mainTitle = 'Add Purchase Order';
                            resetFormState();
                            state.secondaryData = [];
                            secondaryGrid.refresh();
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            state.isViewMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Purchase Order';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.vendorId = selectedRecord.vendorId ?? '';
                                state.orderStatus = String(selectedRecord.orderStatus ?? '');
                                state.showComplexDiv = true;

                                await methods.populateSecondaryData(selectedRecord.id);
                                if (secondaryGrid.obj) {
                                    secondaryGrid.obj.clearSelection();
                                }
                                secondaryGrid.refresh();

                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'ViewCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.isViewMode = true;
                                state.deleteMode = false;
                                state.mainTitle = 'View Purchase Order';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.vendorId = selectedRecord.vendorId ?? '';
                                state.orderStatus = String(selectedRecord.orderStatus ?? '');
                                state.showComplexDiv = true;

                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            const confirmation = await Swal.fire({
                                icon: 'warning',
                                title: 'Bạn có chắc chắn muốn xóa?',
                                text: `${selected.length} dòng đã chọn sẽ bị xóa.`,
                                showCancelButton: true,
                                confirmButtonText: 'Xóa',
                                cancelButtonText: 'Hủy',
                                heightAuto: false
                            });
                            if (!confirmation.isConfirmed) return;
                            for (const record of selected) {
                                await services.deleteMainData(record.id, StorageManager.getUserId());
                            }
                            mainGrid.obj.clearSelection();
                            await methods.populateMainData();
                            mainGrid.refresh();
                        }



                        if (args.item.id === 'PrintPDFCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                window.open('/PurchaseOrders/PurchaseOrderPdf?id=' + (selectedRecord.id ?? ''), '_blank');
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
        let taxObj;
        let numberObj;
        let summaryObj;
        let supplierWarrantyObj;

        const getSerialTrackingMode = (productId) => Number(state.productListLookupData.find(p => p.id === productId)?.serialTrackingMode ?? 0);
        const isManufacturerSerialProduct = (productId) => {
            const product = state.productListLookupData.find(p => p.id === productId);
            return product?.physical === true && getSerialTrackingMode(productId) === 2;
        };
        const editManufacturerSerials = async (rowData, refreshQuantity) => {
            if (!isManufacturerSerialProduct(rowData.productId)) return;
            const serials = [...(rowData.manufacturerSerialNumbers ?? [])];
            const result = await Swal.fire({
                title: 'Manufacturer serial numbers',
                html: '<div id="manufacturer-serial-list" class="text-start"></div><button type="button" id="manufacturer-serial-add" class="btn btn-outline-primary btn-sm mt-2">Add serial</button>',
                showCancelButton: true, confirmButtonText: 'Apply',
                didOpen: () => {
                    const list = document.getElementById('manufacturer-serial-list');
                    const render = () => {
                        list.innerHTML = serials.map((value, index) => `<div class="input-group mb-1"><input class="form-control manufacturer-serial" value="${String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><button type="button" class="btn btn-outline-danger manufacturer-serial-delete" data-index="${index}">Delete</button></div>`).join('');
                        list.querySelectorAll('.manufacturer-serial').forEach((input, i) => input.addEventListener('input', e => serials[i] = e.target.value));
                        list.querySelectorAll('.manufacturer-serial-delete').forEach(button => button.addEventListener('click', () => { serials.splice(Number(button.dataset.index), 1); render(); }));
                    };
                    document.getElementById('manufacturer-serial-add').addEventListener('click', () => { serials.push(''); render(); });
                    render();
                },
                preConfirm: () => {
                    const normalized = serials.map(x => String(x).trim());
                    if (normalized.some(x => !x)) { Swal.showValidationMessage('Serial numbers cannot be empty.'); return false; }
                    if (new Set(normalized.map(x => x.toLowerCase())).size !== normalized.length) { Swal.showValidationMessage('Serial numbers must be unique.'); return false; }
                    if (!normalized.length) { Swal.showValidationMessage('Add at least one serial number.'); return false; }
                    return normalized;
                }
            });
            if (result.isConfirmed) {
                rowData.manufacturerSerialNumbers = result.value;
                rowData.quantity = result.value.length;
                if (refreshQuantity && quantityObj) { quantityObj.value = rowData.quantity; quantityObj.readonly = true; quantityObj.dataBind(); }
            }
        };

        const secondaryGrid = {
            obj: null,
            create: async (dataSource) => {
                const allowEdit = !state.isViewMode;
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
                            validationRules: { required: [true, 'Vui lòng chọn hàng hóa.'] },
                            disableHtmlEncode: false,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data[field]);
                                return product ? `${product.name}` : '';
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    let productElem = document.createElement('input');
                                    return productElem;
                                },
                                read: () => {
                                    return productObj.value;
                                },
                                destroy: () => {
                                    productObj.destroy();
                                },
                                write: (args) => {
                                    const productOptions = getSelectableProductOptions(args.rowData);
                                    productObj = new ej.dropdowns.DropDownList({
                                        dataSource: productOptions,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.productId,
                                        change: (e) => {
                                            const selectedProduct = productOptions.find(item => item.id === e.value)
                                                ?? state.productListLookupData.find(item => item.id === e.value);
                                            if (selectedProduct) {
                                                const defaults = applyPurchaseOrderProductDefaults(args.rowData, selectedProduct.id, true);
                                                requestAnimationFrame(() => writePurchaseOrderBatchFields(args.rowData, defaults));
                                                if (warehouseObj) {
                                                    warehouseObj.value = args.rowData.warehouseId;
                                                    warehouseObj.dataBind();
                                                }
                                                if (numberObj) {
                                                    numberObj.value = args.rowData.productNumber;
                                                }
                                                if (priceObj) {
                                                    priceObj.value = args.rowData.unitPrice;
                                                }
                                                if (summaryObj) {
                                                    summaryObj.value = args.rowData.summary;
                                                }
                                                if (quantityObj) {
                                                    quantityObj.value = args.rowData.quantity;
                                                }
                                                refreshPurchaseOrderItemAmountCells(args.element, args.rowData);
                                                if (supplierWarrantyObj) {
                                                    supplierWarrantyObj.value = args.rowData.supplierWarrantyMonths;
                                                }
                                            }
                                        },
                                        placeholder: 'Select Product',
                                        floatLabelType: 'Never'
                                    });
                                    productObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'warehouseId',
                            headerText: 'Kho',
                            width: 180,
                            validationRules: { required: false },
                            valueAccessor: (field, data, column) => {
                                const warehouse = state.warehouseListLookupData.find(item => item.id === data[field]);
                                return warehouse ? warehouse.name : (data.warehouseName ?? '');
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    let warehouseElem = document.createElement('input');
                                    return warehouseElem;
                                },
                                read: () => {
                                    return warehouseObj.value || null;
                                },
                                destroy: () => {
                                    if (warehouseObj) {
                                        warehouseObj.destroy();
                                        warehouseObj = null;
                                    }
                                },
                                write: (args) => {
                                    const selectedProduct = state.productListLookupData?.find(p => p.id === args.rowData.productId);
                                    warehouseObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.warehouseListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.warehouseId ?? null,
                                        allowFiltering: true,
                                        showClearButton: true,
                                        placeholder: 'Select Warehouse',
                                        change: (e) => {
                                            const selectedWarehouse = state.warehouseListLookupData.find(item => item.id === e.value);
                                            args.rowData.warehouseId = e.value || null;
                                            args.rowData.warehouseName = selectedWarehouse?.name ?? '';
                                        },
                                        floatLabelType: 'Never'
                                    });
                                    warehouseObj.enabled = selectedProduct?.physical !== false;
                                    warehouseObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'supplierWarrantyMonths',
                            headerText: 'Supplier Warranty (Months)',
                            width: 200,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let supplierWarrantyElem = document.createElement('input');
                                    return supplierWarrantyElem;
                                },
                                read: () => {
                                    return supplierWarrantyObj?.value ?? 6;
                                },
                                destroy: () => {
                                    if (supplierWarrantyObj) {
                                        supplierWarrantyObj.destroy();
                                        supplierWarrantyObj = null;
                                    }
                                },
                                write: (args) => {
                                    supplierWarrantyObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.supplierWarrantyMonths ?? 6,
                                        format: 'n0',
                                        decimals: 0,
                                        min: 0,
                                        step: 1,
                                        placeholder: 'Warranty Months'
                                    });
                                    supplierWarrantyObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'unitPrice',
                            headerText: 'Unit Price',
                            width: 200,
                            validationRules: {
                                required: true,
                                custom: [(args) => Number(args.value) > 0, 'Đơn giá phải lớn hơn 0.']
                            },
                            type: 'number', format: 'N0', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let priceElem = document.createElement('input');
                                    return priceElem;
                                },
                                read: () => {
                                    return priceObj.value;
                                },
                                destroy: () => {
                                    priceObj.destroy();
                                },
                                write: (args) => {
                                    priceObj = new ej.inputs.NumericTextBox({
                                        format: 'n0',
                                        decimals: 0,
                                        step: 1000,
                                        validateDecimalOnType: false,
                                        value: args.rowData.unitPrice ?? 0,
                                        change: (e) => {
                                            applyPurchaseOrderItemAmounts(args.rowData, { unitPrice: e.value });
                                            refreshPurchaseOrderItemAmountCells(args.element, args.rowData);
                                        }
                                    });
                                    priceObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'manufacturerSerialNumbers',
                            headerText: 'Manufacturer Serials',
                            width: 220,
                            valueAccessor: (field, data) => (data.manufacturerSerialNumbers || []).join(', '),
                            edit: {
                                create: () => { const el = document.createElement('button'); el.type = 'button'; el.className = 'btn btn-outline-primary btn-sm'; el.textContent = 'Edit serials'; return el; },
                                read: () => '',
                                write: (args) => {
                                    const button = args.element;
                                    const enabled = isManufacturerSerialProduct(args.rowData.productId);
                                    button.disabled = !enabled;
                                    button.textContent = enabled ? 'Edit serials' : 'Not applicable';
                                    button.addEventListener('click', () => editManufacturerSerials(args.rowData, true));
                                }
                            }
                        },
                        {
                            field: 'quantity',
                            headerText: 'Quantity',
                            width: 200,
                            validationRules: {
                                required: true,
                                custom: [(args) => {
                                    return args['value'] > 0;
                                }, 'Value must be greater than zero.']
                            },
                            type: 'number', format: 'N0', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let quantityElem = document.createElement('input');
                                    return quantityElem;
                                },
                                read: () => {
                                    return quantityObj.value;
                                },
                                destroy: () => {
                                    quantityObj.destroy();
                                },
                                write: (args) => {
                                    quantityObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.quantity ?? 0,
                                        min: 0,
                                        format: 'n0',
                                        decimals: 0,
                                        validateDecimalOnType: true,
                                        change: (e) => {
                                            applyPurchaseOrderItemAmounts(args.rowData, { quantity: e.value });
                                            refreshPurchaseOrderItemAmountCells(args.element, args.rowData);
                                        }
                                    });
                                    if (isManufacturerSerialProduct(args.rowData.productId)) {
                                        quantityObj.readonly = true;
                                    }
                                    quantityObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'total',
                            headerText: 'Total',
                            width: 200,
                            allowEditing: false,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data) => getPurchaseOrderItemAmounts(data).total
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
                                        placeholder: 'Select Tax',
                                        change: (e) => {
                                            applyPurchaseOrderItemAmounts(args.rowData, { taxId: e.value });
                                            refreshPurchaseOrderItemAmountCells(args.element, args.rowData);
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
                            allowEditing: false,
                            width: 160,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data) => getPurchaseOrderItemAmounts(data).taxAmount
                        },
                        {
                            field: 'afterTaxAmount',
                            headerText: 'Total Amount',
                            allowEditing: false,
                            width: 170,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data) => getPurchaseOrderItemAmounts(data).afterTaxAmount
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
                            field: 'allocatedQuantity',
                            headerText: 'Allocated Quantity',
                            allowEditing: false,
                            width: 100,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data, column) => {
                                return data.allocatedQuantity || 0;
                            }
                        },
                        {
                            field: 'remainingQuantity',
                            headerText: 'Remaining Quantity',
                            allowEditing: false,
                            width: 100,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data, column) => {
                                return Math.max(0, Number(data.quantity || 0) - Number(data.allocatedQuantity || 0));
                            }
                        },
                    ],
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Delete', 'Update', 'Cancel',
                        { type: 'Separator' },
                        { text: 'Cost Allocation', tooltipText: 'Allocate selected product costs to customers', prefixIcon: 'e-export', id: 'CostAllocateCustom' },
                        { type: 'Separator' },
                        { text: 'Add Warehouse', tooltipText: 'Quick Add Warehouse', prefixIcon: 'e-plus', id: 'QuickAddWarehouseBtn' },
                        { text: 'Add Product', tooltipText: 'Quick Add Product', prefixIcon: 'e-plus', id: 'QuickAddProductBtn' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        if (!state.isViewMode) {
                            try {
                                const isConfirmed = String(state.orderStatus) === '2';
                                secondaryGrid.obj.toolbarModule.enableItems(['CostAllocateCustom'], isConfirmed);
                            } catch (e) { }
                        }
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'SecondaryGrid_add') {
                            // EJ2's built-in toolbar dispatch can be skipped when the grid is
                            // wrapped by the async Batch persistence lifecycle. Add explicitly so
                            // the button always creates an editable spreadsheet row.
                            args.cancel = true;
                            const temporaryId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            secondaryGrid.obj.addRecord({
                                id: temporaryId,
                                purchaseOrderId: state.id,
                                productId: null,
                                warehouseId: null,
                                supplierWarrantyMonths: 6,
                                unitPrice: 0,
                                quantity: 1,
                                total: 0,
                                taxId: null,
                                taxAmount: 0,
                                afterTaxAmount: 0,
                                manufacturerSerialNumbers: [],
                                summary: ''
                            }, 0);
                            requestAnimationFrame(() => secondaryGrid.obj.editCell(0, 'productId'));
                            return;
                        }

                        if (args.item.id === 'SecondaryGrid_excelexport') {
                            secondaryGrid.obj.excelExport();
                        }

                        if (args.item.id === 'CostAllocateCustom') {
                            if (String(state.orderStatus) !== '2') {
                                Swal.fire({ icon: 'warning', title: 'Cost allocation is unavailable', text: 'A purchase order can only be allocated after it is confirmed.' });
                                return;
                            }
                            methods.openCostAllocationModal();
                        }

                        if (args.item.id === 'QuickAddWarehouseBtn') {
                            const created = await QuickAddHelper.simpleQuickAdd({
                                title: 'Quick Add Warehouse',
                                apiUrl: '/Warehouse/CreateWarehouse',
                                dropdownObj: null,
                                refreshLookup: methods.populateWarehouseListLookupData,
                                state: state,
                                stateKey: null,
                                lookupKey: 'warehouseListLookupData'
                            });
                            if (created && warehouseObj && warehouseObj.isDestroyed !== true) {
                                warehouseObj.dataSource = state.warehouseListLookupData;
                                warehouseObj.dataBind();
                                warehouseObj.value = created.id;
                                warehouseObj.dataBind();
                            }
                        }

                        if (args.item.id === 'QuickAddProductBtn') {
                            if (typeof QuickAddHelper === 'undefined') {
                                Swal.fire({ icon: 'error', title: 'Quick Add is unavailable' });
                                return;
                            }
                            const created = await QuickAddHelper.complexQuickAddProduct({
                                refreshLookup: methods.populateProductListLookupData,
                                refreshLookups: [methods.populateWarehouseListLookupData],
                                state: state,
                                lookupKey: 'productListLookupData'
                            });
                            if (created && productObj && productObj.isDestroyed !== true) {
                                productObj.dataSource = state.productListLookupData;
                                productObj.dataBind();
                                productObj.value = created.id;
                                productObj.dataBind();
                            }
                        }
                    },
                    cellSave: (args) => {
                        const field = args.columnName ?? args.column?.field;
                        if (field === 'productId') {
                            const defaults = applyPurchaseOrderProductDefaults(args.rowData, args.value, true);
                            requestAnimationFrame(() => writePurchaseOrderBatchFields(args.rowData, defaults));
                            requestAnimationFrame(() => refreshPurchaseOrderSummaryFromItems());
                            return;
                        }
                        if (!['quantity', 'unitPrice', 'taxId'].includes(field)) return;
                        applyPurchaseOrderItemAmounts(args.rowData, { [field]: args.value });
                        requestAnimationFrame(() => {
                            refreshPurchaseOrderItemAmountCells(args.cell, args.rowData);
                            refreshPurchaseOrderSummaryFromItems();
                        });
                    },
                    actionBegin: (args) => {
                        if (args.requestType !== 'save') {
                            return;
                        }

                        const data = args.data ?? {};
                        applyPurchaseOrderItemAmounts(data);
                        if (!data.productId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn hàng hóa trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        const selectedProduct = state.productListLookupData?.find(p => p.id === data.productId);
                        if (selectedProduct?.physical !== false && !data.warehouseId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn kho cho hàng hóa vật lý trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        if (!data.taxId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn thuế trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }

                        if (!data.quantity || Number(data.quantity) <= 0) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Missing Required Information',
                                text: 'Quantity must be greater than zero.',
                                confirmButtonText: 'OK'
                            });
                            return;
                        }

                        if (getSelectedProductIds(data.id ?? null).has(data.productId)) {
                            args.cancel = true;
                            const productName = state.productListLookupData?.find(p => p.id === data.productId)?.name ?? 'Hàng hóa này';
                            Swal.fire({
                                icon: 'warning',
                                title: 'Hàng hóa bị trùng',
                                text: `${productName} đã có trong đơn mua hàng. Mỗi hàng hóa chỉ được xuất hiện một lần trong một PO.`,
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }
                        if (!Number.isFinite(Number(data.unitPrice)) || Number(data.unitPrice) <= 0) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Đơn giá phải lớn hơn 0 trước khi lưu.',
                                confirmButtonText: 'Đồng ý'
                            });
                            return;
                        }
                        const mode2 = selectedProduct?.physical === true && Number(selectedProduct.serialTrackingMode ?? 0) === 2;
                        if (mode2) {
                            const serials = (data.manufacturerSerialNumbers ?? args.rowData?.manufacturerSerialNumbers ?? []).map(x => String(x).trim()).filter(Boolean);
                            if (!serials.length || new Set(serials.map(x => x.toLowerCase())).size !== serials.length || serials.length !== Number(data.quantity)) {
                                args.cancel = true;
                                Swal.fire({ icon: 'warning', title: 'Invalid serial numbers', text: 'Enter unique, non-empty manufacturer serial numbers; quantity must equal the serial count.' });
                                return;
                            }
                            data.manufacturerSerialNumbers = serials;
                            data.quantity = serials.length;
                        } else {
                            data.manufacturerSerialNumbers = null;
                        }
                    },
                    actionComplete: async (args) => {
                        const refreshAfterAction = args.managedBatch !== true;
                        if (args.requestType === 'save' && args.action === 'add') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            try {
                                const manufacturerSerialNumbers = Array.isArray(data?.manufacturerSerialNumbers) && data.manufacturerSerialNumbers.length
                                    ? data.manufacturerSerialNumbers
                                    : null;
                                const response = await services.createSecondaryData(data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.supplierWarrantyMonths, data?.taxId, purchaseOrderId, userId, manufacturerSerialNumbers);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Không thể lưu hàng hóa.');
                                data.__persistedId = response?.data?.content?.data?.id ?? null;
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();
                                    Swal.fire({ icon: 'success', title: 'Lưu hàng hóa thành công', timer: 1200, showConfirmButton: false });
                                }
                            } catch (error) {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Lưu hàng hóa thất bại',
                                    text: error.response?.data?.message ?? error.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                    confirmButtonText: 'Đồng ý'
                                });
                                throw error;
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            try {
                                const manufacturerSerialNumbers = Array.isArray(data?.manufacturerSerialNumbers) && data.manufacturerSerialNumbers.length
                                    ? data.manufacturerSerialNumbers
                                    : null;
                                const response = await services.updateSecondaryData(data?.id, data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.supplierWarrantyMonths, data?.taxId, purchaseOrderId, userId, manufacturerSerialNumbers);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Không thể cập nhật hàng hóa.');
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();
                                    Swal.fire({ icon: 'success', title: 'Cập nhật hàng hóa thành công', timer: 1200, showConfirmButton: false });
                                }
                            } catch (error) {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Cập nhật hàng hóa thất bại',
                                    text: error.response?.data?.message ?? error.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                    confirmButtonText: 'Đồng ý'
                                });
                                throw error;
                            }
                        }
                        if (args.requestType === 'delete') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data[0];

                            if (!data?.id || String(data.id).startsWith('new-')) {
                                state.secondaryData = state.secondaryData.filter(item => item.id !== data?.id);
                                requestAnimationFrame(() => refreshPurchaseOrderSummaryFromItems());
                                return;
                            }

                            try {
                                const response = await services.deleteSecondaryData(data?.id, userId);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Không thể xóa hàng hóa này.');
                                if (response?.data?.code === 200) {
                                    if (refreshAfterAction) {
                                        await methods.populateSecondaryData(purchaseOrderId);
                                        secondaryGrid.refresh();
                                        Swal.fire({
                                            icon: 'success',
                                            title: 'Xóa hàng hóa thành công',
                                            timer: 2000,
                                            showConfirmButton: false
                                        });
                                    }
                                } else {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Xóa hàng hóa thất bại',
                                        text: response?.data?.message ?? 'Không thể xóa hàng hóa này.',
                                        confirmButtonText: 'Đồng ý'
                                    });
                                }
                            } catch (error) {
                                if (refreshAfterAction) {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();
                                }

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Xóa hàng hóa thất bại',
                                    text: error.response?.data?.message ?? 'Không thể xóa hàng hóa này.',
                                    confirmButtonText: 'Đồng ý'
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
                if (typeof GridInteractionManager !== 'undefined') {
                    GridInteractionManager.track(secondaryGrid.obj, {
                        afterPersist: async (changes) => {
                            await methods.populateSecondaryData(state.id);

                            const persistedItems = state.secondaryData ?? [];
                            const addedRows = (changes.addedRecords ?? []).map(row => ({
                                ...row,
                                id: row.__persistedId ?? null
                            }));
                            const savedRows = [...addedRows, ...(changes.changedRecords ?? [])];
                            const savedRowsPersisted = await methods.verifySecondaryDataPersisted(savedRows, persistedItems);
                            const undeletedRow = (changes.deletedRecords ?? []).find(row => row?.id && persistedItems.some(item => item.id === row.id));

                            if (!savedRowsPersisted || undeletedRow) {
                                const error = new Error('Backend chưa xác nhận đầy đủ thay đổi hàng hóa. Đơn mua hàng chưa được lưu.');
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Chưa lưu được hàng hóa',
                                    text: error.message,
                                    confirmButtonText: 'Đồng ý'
                                });
                                throw error;
                            }

                            secondaryGrid.refresh();
                            await methods.populateMainData();
                            mainGrid.refresh();
                            await methods.refreshPaymentSummary(state.id);
                            Swal.fire({ icon: 'success', title: 'Lưu danh sách hàng hóa thành công', timer: 1200, showConfirmButton: false });
                        }
                    });
                }
                secondaryGrid.obj.appendTo(secondaryGridRef.value);
            },
            refresh: () => {
                const allowEdit = !state.isViewMode;
                secondaryGrid.obj.setProperties({
                    dataSource: state.secondaryData,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showConfirmDialog: false, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Delete', 'Update', 'Cancel',
                        { type: 'Separator' },
                        { text: 'Cost Allocation', tooltipText: 'Allocate selected product costs to customers', prefixIcon: 'e-export', id: 'CostAllocateCustom' },
                        { type: 'Separator' },
                        { text: 'Add Warehouse', tooltipText: 'Quick Add Warehouse', prefixIcon: 'e-plus', id: 'QuickAddWarehouseBtn' },
                        { text: 'Add Product', tooltipText: 'Quick Add Product', prefixIcon: 'e-plus', id: 'QuickAddProductBtn' }
                    ]
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

        const costAllocationModal = {
            obj: null,
            create: () => {
                costAllocationModal.obj = new bootstrap.Modal(costAllocationModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });

                // Restore scroll on parent modal when this modal closes
                costAllocationModalRef.value.addEventListener('hidden.bs.modal', () => {
                    if (document.querySelector('.modal.show')) {
                        document.body.classList.add('modal-open');
                        document.body.style.overflow = 'hidden';
                    }
                });
            }
        };

        const costAllocationCashAccountLookup = {
            obj: null,
            create: () => {
                if (state.cashAccountListData && Array.isArray(state.cashAccountListData)) {
                    costAllocationCashAccountLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.cashAccountListData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Cash Account',
                        filterBarPlaceholder: 'Search...',
                        sortOrder: 'Ascending',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.cashAccountListData, query);
                        },
                        change: (e) => {
                            state.costAllocationCashAccountId = e.value;
                            state.costAllocationErrors.cashAccountId = '';
                        }
                    });
                    costAllocationCashAccountLookup.obj.appendTo(costAllocationCashAccountIdRef.value);
                }
            }
        };

        const costAllocationCashCategoryLookup = {
            obj: null,
            create: () => {
                if (state.cashCategoryListData && Array.isArray(state.cashCategoryListData)) {
                    costAllocationCashCategoryLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.cashCategoryListData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Category (Optional)',
                        filterBarPlaceholder: 'Search...',
                        sortOrder: 'Ascending',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.cashCategoryListData, query);
                        },
                        change: (e) => {
                            state.costAllocationCashCategoryId = e.value;
                        }
                    });
                    costAllocationCashCategoryLookup.obj.appendTo(costAllocationCashCategoryIdRef.value);
                }
            }
        };

        const costAllocationPreviewGrid = {
            obj: null,
            createOrRefresh: (dataSource) => {
                if (costAllocationPreviewGrid.obj) {
                    costAllocationPreviewGrid.obj.dataSource = dataSource;
                    costAllocationPreviewGrid.obj.refresh();
                    return;
                }

                let allocQtyObj = null;
                let allocPriceObj = null;
                let customerDropObj = null;
                let customerEditorRow = null;

                costAllocationPreviewGrid.obj = new ej.grids.Grid({
                    height: 350,
                    dataSource: dataSource,
                    allowSelection: true,
                    allowSorting: false,
                    allowFiltering: false,
                    allowPaging: false,
                    gridLines: 'Horizontal',
                    editSettings: { allowEditing: true, allowAdding: true, allowDeleting: true, mode: 'Batch' },
                    toolbar: [
                        { text: 'Add Split Row', tooltipText: 'Select a row to split', prefixIcon: 'e-add', id: 'splitRowBtn' },
                        'Delete',
                        { type: 'Separator' },
                        { text: 'Add Customer', tooltipText: 'Quick Add Customer', prefixIcon: 'e-plus', id: 'quickAddAllocationCustomerBtn' }
                    ],
                    toolbarClick: async (args) => {
                        if (args.item.id === 'splitRowBtn') {
                            const selectedRecords = costAllocationPreviewGrid.obj.getSelectedRecords();
                            if (selectedRecords.length === 0) {
                                Swal.fire({ icon: 'info', title: 'No row selected', text: 'Select one product row before adding another allocation.' });
                                return;
                            }
                            if (costAllocationPreviewGrid.obj.isEdit) {
                                costAllocationPreviewGrid.obj.endEdit();
                            }
                            const record = selectedRecords[0];
                            const newRecord = {
                                ...record,
                                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                                customerId: null,
                                allocateQuantity: 0,
                                allocateTotal: 0
                            };
                            const ds = costAllocationPreviewGrid.obj.dataSource;
                            const idx = ds.findIndex(x => x.id === record.id);
                            ds.splice(idx + 1, 0, newRecord);
                            costAllocationPreviewGrid.obj.refresh();
                        }

                        if (args.item.id === 'quickAddAllocationCustomerBtn') {
                            if (typeof QuickAddHelper === 'undefined') {
                                Swal.fire({ icon: 'error', title: 'Quick Add is unavailable' });
                                return;
                            }

                            const selectedRecord = costAllocationPreviewGrid.obj.getSelectedRecords()[0] ?? customerEditorRow;
                            const created = await QuickAddHelper.complexQuickAddCustomer({
                                refreshLookup: methods.populateCustomerListLookupData,
                                refreshLookups: [methods.populateWarehouseListLookupData],
                                state,
                                lookupKey: 'customerListLookupData'
                            });
                            if (!created) return;

                            if (customerDropObj && customerDropObj.isDestroyed !== true) {
                                customerDropObj.dataSource = state.customerListLookupData;
                                customerDropObj.dataBind();
                                customerDropObj.value = created.id;
                                customerDropObj.dataBind();
                            }

                            const targetRecord = customerEditorRow ?? selectedRecord;
                            const actualRow = targetRecord
                                ? costAllocationPreviewGrid.obj.dataSource.find(x => x.id === targetRecord.id)
                                : null;
                            if (actualRow) {
                                actualRow.customerId = created.id;
                            }
                            if (!costAllocationPreviewGrid.obj.isEdit) {
                                costAllocationPreviewGrid.obj.refresh();
                            }
                        }
                    },
                    columns: [
                        { field: 'id', isPrimaryKey: true, visible: false },
                        { field: 'poItemId', visible: false },
                        {
                            field: 'productId',
                            headerText: 'Product',
                            allowEditing: false,
                            width: 180,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data[field]);
                                return product ? product.name : '';
                            }
                        },
                        {
                            field: 'warehouseId',
                            headerText: 'Warehouse',
                            allowEditing: false,
                            width: 140,
                            valueAccessor: (field, data) => state.warehouseListLookupData.find(item => item.id === data[field])?.name ?? ''
                        },
                        { field: 'remainingQuantity', headerText: 'Remaining', width: 80, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
                        {
                            field: 'customerId',
                            headerText: 'Customer',
                            editType: 'dropdownedit',
                            width: 180,
                            valueAccessor: (field, data, column) => {
                                if (!data.customerId) return '';
                                const customer = state.customerListLookupData.find(item => item.id === data.customerId);
                                return customer ? customer.name : '';
                            },
                            edit: {
                                create: () => {
                                    const elem = document.createElement('input');
                                    return elem;
                                },
                                read: () => {
                                    return customerDropObj ? customerDropObj.value : null;
                                },
                                destroy: () => {
                                    if (customerDropObj) customerDropObj.destroy();
                                    customerDropObj = null;
                                    customerEditorRow = null;
                                },
                                write: (args) => {
                                    customerEditorRow = args.rowData;
                                    customerDropObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.customerListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        placeholder: 'Select Customer',
                                        value: args.rowData.customerId || '',
                                        allowFiltering: true,
                                        filterBarPlaceholder: 'Search',
                                        filtering: (e) => {
                                            e.preventDefaultAction = true;
                                            let query = new ej.data.Query();
                                            if (e.text !== '') {
                                                query = query.where('name', 'contains', e.text, true);
                                            }
                                            e.updateData(state.customerListLookupData, query);
                                        },
                                        change: (e) => {
                                            if (args.rowData) {
                                                args.rowData.customerId = e.value || null;
                                                if (costAllocationPreviewGrid.obj) {
                                                    const actualRow = costAllocationPreviewGrid.obj.dataSource.find(x => x.id === args.rowData.id);
                                                    if (actualRow) {
                                                        actualRow.customerId = e.value || null;
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    customerDropObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'allocateQuantity',
                            headerText: 'Allocation Quantity',
                            width: 100,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    const elem = document.createElement('input');
                                    return elem;
                                },
                                read: () => {
                                    return allocQtyObj ? allocQtyObj.value : 0;
                                },
                                destroy: () => {
                                    if (allocQtyObj) allocQtyObj.destroy();
                                },
                                write: (args) => {
                                    const maxAllowable = (args.rowData.allocateQuantity || 0) + (args.rowData.remainingQuantity || 0);
                                    allocQtyObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.allocateQuantity,
                                        min: 0,
                                        max: maxAllowable,
                                        format: 'n0',
                                        decimals: 0,
                                        validateDecimalOnType: true,
                                        change: (e) => {
                                            if (args.rowData) {
                                                const oldQty = args.rowData.allocateQuantity || 0;
                                                const newQty = e.value || 0;
                                                const diff = newQty - oldQty;

                                                args.rowData.allocateQuantity = newQty;
                                                const newTotal = newQty * (args.rowData.allocateUnitPrice || 0);
                                                args.rowData.allocateTotal = newTotal;

                                                if (costAllocationPreviewGrid.obj) {
                                                    const rows = costAllocationPreviewGrid.obj.dataSource.filter(x => x.poItemId === args.rowData.poItemId);
                                                    rows.forEach(r => {
                                                        r.remainingQuantity -= diff;
                                                        if (r.id === args.rowData.id) {
                                                            r.allocateQuantity = newQty;
                                                            r.allocateTotal = newTotal;
                                                        }
                                                    });

                                                    // Update UI for remainingQuantity and allocateTotal cells
                                                    const allTrs = costAllocationPreviewGrid.obj.getContentTable().querySelectorAll('.e-row');
                                                    const remainingCellIdx = costAllocationPreviewGrid.obj.getColumnIndexByField('remainingQuantity');
                                                    const totalCellIdx = costAllocationPreviewGrid.obj.getColumnIndexByField('allocateTotal');

                                                    allTrs.forEach(tr => {
                                                        const rowData = costAllocationPreviewGrid.obj.getRowInfo(tr).rowData;
                                                        if (rowData && rowData.poItemId === args.rowData.poItemId) {
                                                            if (remainingCellIdx !== -1 && tr.cells[remainingCellIdx]) {
                                                                tr.cells[remainingCellIdx].innerText = Intl.NumberFormat('en-US').format(rowData.remainingQuantity);
                                                            }
                                                        }
                                                    });
                                                }

                                                const tr = args.element.closest('tr');
                                                if (tr && costAllocationPreviewGrid.obj) {
                                                    const cellIndex = costAllocationPreviewGrid.obj.getColumnIndexByField('allocateTotal');
                                                    if (cellIndex !== -1 && tr.cells[cellIndex]) {
                                                        tr.cells[cellIndex].innerText = Intl.NumberFormat('en-US').format(newTotal);
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    allocQtyObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'allocateUnitPrice',
                            headerText: 'Unit Price',
                            width: 130,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    const elem = document.createElement('input');
                                    return elem;
                                },
                                read: () => {
                                    return allocPriceObj ? allocPriceObj.value : 0;
                                },
                                destroy: () => {
                                    if (allocPriceObj) allocPriceObj.destroy();
                                },
                                write: (args) => {
                                    allocPriceObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.allocateUnitPrice,
                                        min: 0,
                                        format: 'N0',
                                        change: (e) => {
                                            if (args.rowData) {
                                                args.rowData.allocateUnitPrice = e.value;
                                                const newTotal = (args.rowData.allocateQuantity || 0) * (e.value || 0);
                                                args.rowData.allocateTotal = newTotal;

                                                if (costAllocationPreviewGrid.obj) {
                                                    const actualRow = costAllocationPreviewGrid.obj.dataSource.find(x => x.id === args.rowData.id);
                                                    if (actualRow) {
                                                        actualRow.allocateUnitPrice = e.value;
                                                        actualRow.allocateTotal = newTotal;
                                                    }
                                                }

                                                const tr = args.element.closest('tr');
                                                if (tr && costAllocationPreviewGrid.obj) {
                                                    const cellIndex = costAllocationPreviewGrid.obj.getColumnIndexByField('allocateTotal');
                                                    if (cellIndex !== -1 && tr.cells[cellIndex]) {
                                                        tr.cells[cellIndex].innerText = Intl.NumberFormat('en-US').format(newTotal);
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    allocPriceObj.appendTo(args.element);
                                }
                            }
                        },
                        { field: 'allocateTotal', headerText: 'Total', width: 130, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
                    ],
                    cellSave: (args) => {
                        // Recalculate total after cell save
                        const row = args.rowData;
                        if (row) {
                            row.allocateTotal = (row.allocateQuantity || 0) * (row.allocateUnitPrice || 0);
                        }
                    }
                });
                costAllocationPreviewGrid.obj.appendTo(costAllocationPreviewGridRef.value);
            }
        };

        const showPaymentPopup = async (
            orderId,
            orderNumber,
            totalAmount,
            existingTransactionId = null,
            existingStatus = null,
            existingCashAccountId = null,
            existingPaidAmount = null,
            existingDescription = null,
            existingTransactionDate = null,
            isSplit = false) => {
            const resolveMoneyAmount = (value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }

                const parsedValue = NumberFormatManager.parseLocaleNumber(value);
                return parsedValue ?? 0;
            };
            const totalAmountValue = resolveMoneyAmount(totalAmount);
            const paidAmountValue = resolveMoneyAmount(existingPaidAmount);
            const remainingAmountValue = Math.max(0, totalAmountValue - paidAmountValue);
            const displayAmount = NumberFormatManager.formatToLocale(0, 0, 0);
            const now = new Date();
            const defaultPaymentDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
                .toISOString().slice(0, 10);
            const displayDescription = existingDescription ?? `Payment for order ${orderNumber}`;
            const accountOptions = state.cashAccountListData
                .map(a => `<option value="${a.id}" ${a.id === existingCashAccountId ? 'selected' : ''}>${a.name}</option>`)
                .join('');
            const accountIsLocked = Boolean(existingCashAccountId);
            const accountHelpText = accountIsLocked
                ? '<div class="form-text"></div>'
                : '';
            const statusHtml = ``; // Status is auto-calculated by backend now
            const descHtml = isSplit
                ? `<div class="mb-3"><label class="form-label fw-bold">Description</label><input id="swal-desc" class="form-control" value="${displayDescription}" disabled></div>`
                : `<div class="mb-3"><label class="form-label fw-bold">Description</label><input id="swal-desc" class="form-control" value="${displayDescription}"></div>`;
            const result = await Swal.fire({
                title: `Payment ${orderNumber}`,
                html: `
                    <div class="mb-3"><label class="form-label fw-bold">Cash Account</label><select id="swal-account" class="form-select" ${accountIsLocked ? 'disabled' : ''}>${accountOptions}</select>${accountHelpText}</div>
                    <div class="mb-3"><label class="form-label fw-bold">Total Amount</label><input class="form-control" value="${NumberFormatManager.formatToLocale(totalAmountValue)}" disabled></div>
                    <div class="mb-3"><label class="form-label fw-bold">Paid Amount</label><input class="form-control" value="${NumberFormatManager.formatToLocale(paidAmountValue)}" disabled></div>
                    <div class="mb-3"><label class="form-label fw-bold">Remaining Amount</label><input class="form-control" value="${NumberFormatManager.formatToLocale(remainingAmountValue)}" disabled></div>
                    <div class="mb-3"><label class="form-label fw-bold">Payment Date</label><input id="swal-payment-date" type="date" class="form-control" value="${defaultPaymentDate}"></div>
                    <div class="mb-3"><label class="form-label fw-bold">Payment This Time</label><input id="swal-amount" class="form-control" data-number-format="true" inputmode="numeric" value="${displayAmount}"></div>
                    ${descHtml}
                `,
                showCancelButton: true,
                confirmButtonText: 'Save',
                cancelButtonText: 'Cancel',
                focusConfirm: false,
                didOpen: () => {
                    NumberFormatManager.bindNumericInput(document.getElementById('swal-amount'));
                },
                preConfirm: () => {
                    const accountId = document.getElementById('swal-account').value;
                    const parsedAmount = NumberFormatManager.parseLocaleNumber(document.getElementById('swal-amount').value) ?? 0;
                    if (!accountId) {
                        Swal.showValidationMessage('Select a payment account.');
                        return false;
                    }
                    const paymentDate = document.getElementById('swal-payment-date').value;
                    if (parsedAmount <= 0) {
                        Swal.showValidationMessage('Payment amount must be greater than zero.');
                        return false;
                    }
                    if (parsedAmount > remainingAmountValue) {
                        Swal.showValidationMessage('Payment amount cannot exceed the remaining amount.');
                        return false;
                    }
                    if (!paymentDate) {
                        Swal.showValidationMessage('Payment date is required.');
                        return false;
                    }
                    return {
                        cashAccountId: accountId,
                        paymentAmount: parsedAmount,
                        paymentDate,
                        description: document.getElementById('swal-desc').value
                    };
                }
            });

            if (result.isConfirmed && result.value) {
                try {
                    const payload = {
                        purchaseOrderId: orderId,
                        paymentAmount: result.value.paymentAmount,
                        cashAccountId: result.value.cashAccountId,
                        paymentDate: result.value.paymentDate,
                        description: result.value.description,
                        updatedById: StorageManager.getUserId()
                    };

                    const response = await services.payPurchaseOrder(payload);
                    const paymentSummary = response?.data?.content?.data ?? response?.data?.content;
                    if (response?.data?.code !== 200 || paymentSummary?.success !== true) {
                        throw new Error(response?.data?.message ?? 'The payment was not saved.');
                    }

                    const currentRecord = state.mainData.find(item => item.id === orderId);
                    if (currentRecord) {
                        currentRecord.cashTransactionAmount = paymentSummary.amount;
                        currentRecord.cashTransactionPaidAmount = paymentSummary.paidAmount;
                        currentRecord.cashTransactionStatus = paymentSummary.status;
                        currentRecord.cashTransactionCashAccountId = paymentSummary.cashAccountId;
                    }

                    await methods.populateMainData();
                    mainGrid.refresh();
                    Swal.fire({ icon: 'success', title: 'Payment successful', timer: 1000, showConfirmButton: false });
                } catch (err) {
                    Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? err.message ?? 'Please try again.' });
                }
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['PurchaseOrders']);
                await SecurityManager.validateToken();

                await methods.populateCashAccountList();
                await methods.populateCashCategoryList();
                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);
                await methods.populateVendorListLookupData();
                vendorListLookup.create();
                await methods.populateTaxListLookupData();
                await methods.populatePurchaseOrderStatusListLookupData();
                purchaseOrderStatusListLookup.create();
                orderDatePicker.create();
                numberText.create();
                await methods.populateProductListLookupData();
                await methods.populateWarehouseListLookupData();
                await methods.populatePurchaseOrderItemHistoryData();
                await secondaryGrid.create(state.secondaryData);

                await methods.populateCustomerListLookupData();
                costAllocationModal.create();
                costAllocationCashAccountLookup.create();
                costAllocationCashCategoryLookup.create();
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
                        state.mainTitle = 'View Purchase Order';
                        state.id = selectedRecord.id ?? '';
                        state.number = selectedRecord.number ?? '';
                        state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                        state.description = selectedRecord.description ?? '';
                        state.vendorId = selectedRecord.vendorId ?? '';
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
            vendorIdRef,
            orderStatusRef,
            secondaryGridRef,
            costAllocationModalRef,
            costAllocationCashAccountIdRef,
            costAllocationCashCategoryIdRef,
            costAllocationPreviewGridRef,
            state,
            methods,
            handler: {
                handleSubmit: methods.handleFormSubmit,
                handleCostAllocationSubmit: methods.handleCostAllocationSubmit,
                quickAddVendor: methods.quickAddVendor
            }
        };
    }
};

Vue.createApp(App).mount('#app');
