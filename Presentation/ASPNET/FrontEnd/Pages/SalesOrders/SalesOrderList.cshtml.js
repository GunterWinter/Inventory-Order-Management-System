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

        const normalizeBatchNumber = (value) => (value ?? '').toString().trim();
        const toDateTicks = (value) => value ? new Date(value).getTime() : 0;
        const formatQuantity = (value) => NumberFormatManager.formatToLocale(value ?? 0);
        const getErrorMessage = (error, defaultMsg = 'Please try again.') => {
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
        const getBatchSelectionKey = (warehouseId, batchNumber) => `${warehouseId ?? ''}::${normalizeBatchNumber(batchNumber)}`;
        const findWarehouseNameById = (warehouseId) => state.warehouseListLookupData.find(item => item.id === warehouseId)?.name ?? '';
        const getSelectedProductIds = (currentRowId = null) => new Set(
            state.secondaryData
                .filter(item => item.id !== currentRowId && item.productId)
                .map(item => item.productId)
        );
        const getAvailableWarehouseOptions = (productId) => {
            if (!productId) {
                return [];
            }

            const grouped = new Map();
            state.inventoryStockData
                .filter(item =>
                    item.productId === productId &&
                    item.warehouseId &&
                    normalizeBatchNumber(item.batchNumber) !== '' &&
                    Number(item.stock ?? 0) > 0
                )
                .forEach(item => {
                    const warehouseId = item.warehouseId;
                    const current = grouped.get(warehouseId) ?? {
                        id: warehouseId,
                        name: item.warehouseName ?? findWarehouseNameById(warehouseId),
                        availableStock: 0
                    };

                    current.availableStock += Number(item.stock ?? 0);
                    grouped.set(warehouseId, current);
                });

            return [...grouped.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
        };
        const getSelectableProductOptions = (currentRow = {}) => {
            const selectedProductIds = getSelectedProductIds(currentRow.id ?? null);
            const currentProductId = currentRow.productId ?? null;

            return state.productListLookupData.filter(product =>
                product.id === currentProductId ||
                (!selectedProductIds.has(product.id) && getAvailableWarehouseOptions(product.id).length > 0)
            );
        };
        const isSerialTrackedProduct = (productId) => {
            const product = state.productListLookupData.find(item => item.id === productId);
            return product?.physical === true && Number(product?.serialTrackingMode ?? 0) === 1;
        };
        const clearSerialSelection = (rowData) => {
            rowData.productSerialIds = [];
            rowData.productSerialNumbers = '';
        };
        const applySerialSelection = (rowData, selectedSerials) => {
            if (!selectedSerials) {
                return;
            }

            rowData.productSerialIds = selectedSerials.map(item => item.id);
            rowData.productSerialNumbers = selectedSerials.map(item => item.internalSerialNumber).join(', ');
            rowData.quantity = selectedSerials.length;
        };
        const getAvailableBatchOptions = (productId, warehouseId) => {
            if (!productId) {
                return [];
            }

            const filterWarehouseId = warehouseId ?? null;
            const grouped = new Map();

            state.inventoryStockData
                .filter(item =>
                    item.productId === productId &&
                    (!filterWarehouseId || item.warehouseId === filterWarehouseId) &&
                    item.warehouseId &&
                    normalizeBatchNumber(item.batchNumber) !== '' &&
                    Number(item.stock ?? 0) > 0
                )
                .forEach(item => {
                    const batchNumber = normalizeBatchNumber(item.batchNumber);
                    const selectionKey = getBatchSelectionKey(item.warehouseId, batchNumber);
                    const current = grouped.get(selectionKey) ?? {
                        selectionKey,
                        batchNumber,
                        remainingQty: 0,
                        warehouseId: item.warehouseId,
                        warehouseName: item.warehouseName ?? findWarehouseNameById(item.warehouseId),
                        firstReceivedDate: null
                    };

                    current.remainingQty += Number(item.stock ?? 0);

                    grouped.set(selectionKey, current);
                });

            return [...grouped.values()]
                .sort((a, b) => {
                    const warehouseCompare = (a.warehouseName ?? '').localeCompare(b.warehouseName ?? '');
                    return warehouseCompare !== 0 ? warehouseCompare : a.batchNumber.localeCompare(b.batchNumber);
                })
                .map(item => ({
                    selectionKey: item.selectionKey,
                    batchNumber: item.batchNumber,
                    warehouseId: item.warehouseId,
                    warehouseName: item.warehouseName,
                    remainingQty: item.remainingQty,
                    displayText: `${item.batchNumber} (${item.warehouseName || 'Warehouse'} - ${formatQuantity(item.remainingQty)})`
                }));
        };
        const getSuggestedBatchOption = (productId, warehouseId) => getAvailableBatchOptions(productId, warehouseId)[0] ?? null;
        const getRemainingQtyForBatch = (productId, batchNumber, warehouseId) => {
            const options = getAvailableBatchOptions(productId, warehouseId);
            const normalizedBatchNumber = normalizeBatchNumber(batchNumber);

            if (normalizedBatchNumber !== '') {
                return options.find(item => item.batchNumber === normalizedBatchNumber)?.remainingQty ?? 0;
            }

            return options[0]?.remainingQty ?? 0;
        };
        const enrichSalesOrderItem = (item) => ({
            ...item,
            batchNumber: normalizeBatchNumber(item.batchNumber),
            availableBatchQty: getRemainingQtyForBatch(item.productId, item.batchNumber, item.warehouseId)
        });
        const syncSecondaryAvailability = () => {
            state.secondaryData = state.secondaryData.map(enrichSalesOrderItem);
            if (secondaryGrid.obj) {
                secondaryGrid.refresh();
            }
        };
        const refreshAvailableBatchQtyCell = (editorElement, value) => {
            if (availableBatchQtyObj) {
                availableBatchQtyObj.value = Number(value ?? 0);
                availableBatchQtyObj.dataBind();
            }

            const rowElement = editorElement?.closest?.('tr');
            const visibleColumns = secondaryGrid.obj?.getVisibleColumns?.() ?? [];
            const columnIndex = visibleColumns.findIndex(column => column.field === 'availableBatchQty');

            if (rowElement && columnIndex >= 0) {
                const cell = rowElement.cells[columnIndex];
                if (cell && !cell.querySelector('input')) {
                    cell.textContent = formatQuantity(value);
                }
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
            state.orderStatus = null;
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
                        orderDate, description, orderStatus, customerId, salesType: Number(salesType ?? 1), createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, orderDate, description, orderStatus, customerId, salesType, updatedById) => {
                try {
                    const response = await AxiosManager.post('/SalesOrder/UpdateSalesOrder', {
                        id, orderDate, description, orderStatus, customerId, salesType: Number(salesType ?? 1), updatedById
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
            createSecondaryData: async (unitPrice, quantity, summary, productId, warehouseId, batchNumber, warrantyMonths, taxId, salesOrderId, createdById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/SalesOrderItem/CreateSalesOrderItem', {
                        unitPrice, quantity, summary, productId, warehouseId, batchNumber, warrantyMonths, taxId, salesOrderId, createdById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, unitPrice, quantity, summary, productId, warehouseId, batchNumber, warrantyMonths, taxId, salesOrderId, updatedById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/SalesOrderItem/UpdateSalesOrderItem', {
                        id, unitPrice, quantity, summary, productId, warehouseId, batchNumber, warrantyMonths, taxId, salesOrderId, updatedById, productSerialIds
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
            }
        };

        const methods = {
            populateCustomerListLookupData: async () => {
                const response = await services.getCustomerListLookupData();
                state.customerListLookupData = response?.data?.content?.data;
            },
            populateTaxListLookupData: async () => {
                const response = await services.getTaxListLookupData();
                state.taxListLookupData = response?.data?.content?.data;
            },
            populateSalesOrderStatusListLookupData: async () => {
                const response = await services.getSalesOrderStatusListLookupData();
                state.salesOrderStatusListLookupData = response?.data?.content?.data;
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
                    return {
                        ...item,
                        orderDate: DateFormatManager.parseBusinessDate(item.orderDate),
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        paymentStatusText: payment ? (payment.status === 2 ? 'Paid' : 'Unpaid') : (item.orderStatus === 2 ? 'Unpaid' : ''),
                        paymentStatusClass: payment ? (payment.status === 2 ? 'paid' : 'unpaid') : (item.orderStatus === 2 ? 'unpaid' : 'none'),
                        cashTransactionId: payment?.cashTransactionId ?? null,
                        cashTransactionDate: payment?.transactionDate ?? null,
                        cashTransactionStatus: payment?.status ?? null,
                        cashTransactionCashAccountId: payment?.cashAccountId ?? null,
                        cashTransactionCashCategoryId: payment?.cashCategoryId ?? null,
                        cashTransactionAmount: payment?.amount ?? null,
                        cashTransactionDescription: payment?.description ?? null
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
            ensureDraftCashTransactionForConfirmedOrder: async (orderId, orderNumber, totalAmount) => {
                if (String(state.orderStatus) !== '2' || !orderId) {
                    return;
                }

                const existingPayment = state.paymentStatusLookupData.find(p => p.sourceModuleId === orderId);
                if (existingPayment?.status === 2) {
                    return;
                }

                const payload = {
                    transactionDate: existingPayment?.transactionDate ?? new Date().toISOString(),
                    transactionType: 0,
                    status: 0,
                    amount: methods.resolvePaymentAmount(totalAmount),
                    description: existingPayment?.description ?? `Thu tiền đơn ${orderNumber}`,
                    cashAccountId: existingPayment?.cashAccountId ?? null,
                    cashCategoryId: existingPayment?.cashCategoryId ?? methods.resolveCashCategoryId('Bán hàng'),
                    customerId: state.mainData.find(o => o.id === orderId)?.customerId ?? state.customerId ?? null,
                    sourceModule: 'SalesOrder',
                    sourceModuleId: orderId,
                    sourceModuleNumber: orderNumber
                };

                if (existingPayment?.cashTransactionId) {
                    payload.id = existingPayment.cashTransactionId;
                    payload.updatedById = StorageManager.getUserId();
                    await services.updateCashTransaction(payload);
                } else {
                    payload.createdById = StorageManager.getUserId();
                    await services.createCashTransaction(payload);
                }

                await methods.populateMainData();
                mainGrid.refresh();
            },
            refreshInventoryAvailability: async () => {
                await methods.populateInventoryStockData();
            },
            refreshPaymentSummary: async (id) => {
                const record = state.mainData.find(item => item.id === id);
                if (record) {
                    state.subTotalAmount = NumberFormatManager.formatToLocale(record.beforeTaxAmount ?? 0);
                    state.taxAmount = NumberFormatManager.formatToLocale(record.taxAmount ?? 0);
                    state.totalAmount = NumberFormatManager.formatToLocale(record.afterTaxAmount ?? 0);
                }
            },
            onSalesTypeChanged: async (newSalesType) => {
                const isInternal = String(newSalesType) === '2' || Number(newSalesType) === 2;

                if (state.secondaryData && Array.isArray(state.secondaryData) && state.secondaryData.length > 0) {
                    for (const item of state.secondaryData) {
                        const product = state.productListLookupData?.find(p => p.id === item.productId);
                        if (product) {
                            const targetUnitPrice = isInternal
                                ? (product.costPrice ?? product.unitPrice ?? 0)
                                : (product.unitPrice ?? 0);

                            item.unitPrice = targetUnitPrice;
                            item.total = targetUnitPrice * (item.quantity ?? 0);

                            const tax = state.taxListLookupData?.find(t => t.id === item.taxId);
                            const taxPercentage = tax ? (tax.percentage ?? 0) : (item.taxPercentage ?? 0);
                            item.taxAmount = (item.total * taxPercentage) / 100;
                            item.afterTaxAmount = item.total + item.taxAmount;

                            if (state.id && item.id) {
                                try {
                                    await services.updateSecondaryData(
                                        item.id,
                                        item.unitPrice,
                                        item.quantity,
                                        item.summary,
                                        item.productId,
                                        item.warehouseId,
                                        item.batchNumber,
                                        item.warrantyMonths,
                                        item.taxId,
                                        state.id,
                                        StorageManager.getUserId(),
                                        item.productSerialIds ?? []
                                    );
                                } catch (err) {
                                    console.error('Update SalesOrderItem price error:', err);
                                }
                            }
                        }
                    }

                    if (secondaryGrid.obj) {
                        secondaryGrid.refresh();
                    }
                }

                if (secondaryGrid.obj && secondaryGrid.obj.isEdit && priceObj && selectedProduct) {
                    const targetPrice = isInternal
                        ? (selectedProduct.costPrice ?? selectedProduct.unitPrice ?? 0)
                        : (selectedProduct.unitPrice ?? 0);

                    priceObj.value = targetPrice;
                    if (quantityObj && totalObj) {
                        totalObj.value = targetPrice * (quantityObj.value ?? 0);
                    }
                }

                if (state.id) {
                    await methods.populateSecondaryData(state.id);
                    await methods.populateMainData();
                    if (mainGrid.obj) mainGrid.refresh();
                } else {
                    let subTotal = 0;
                    let taxTotal = 0;
                    let grandTotal = 0;
                    state.secondaryData.forEach(item => {
                        subTotal += item.total ?? 0;
                        taxTotal += item.taxAmount ?? 0;
                        grandTotal += item.afterTaxAmount ?? 0;
                    });
                    state.subTotalAmount = NumberFormatManager.formatToLocale(subTotal);
                    state.taxAmount = NumberFormatManager.formatToLocale(taxTotal);
                    state.totalAmount = NumberFormatManager.formatToLocale(grandTotal);
                }
            },
            handleFormSubmit: async () => {
                state.isSubmitting = true;
                await new Promise(resolve => setTimeout(resolve, 200));

                if (secondaryGrid.obj && secondaryGrid.obj.isEdit) {
                    secondaryGrid.obj.endEdit();
                    await new Promise(resolve => setTimeout(resolve, 150));
                    if (secondaryGrid.obj && secondaryGrid.obj.isEdit) {
                        state.isSubmitting = false;
                        Swal.fire({
                            icon: 'warning',
                            title: 'Dòng sản phẩm chưa hoàn tất',
                            text: 'Vui lòng điền đầy đủ các trường bắt buộc (Hàng hóa, Kho hàng, Thuế, Số lượng) trên dòng đang chỉnh sửa trước khi lưu đơn hàng.',
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
                        ? await services.createMainData(state.orderDate, state.description, state.orderStatus, state.customerId, state.salesType, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.orderDate, state.description, state.orderStatus, state.customerId, state.salesType, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Edit Sales Order';
                            state.id = response?.data?.content?.data.id ?? '';
                            state.number = response?.data?.content?.data.number ?? '';
                            state.orderDate = response?.data?.content?.data.orderDate ? DateFormatManager.parseBusinessDate(response.data.content.data.orderDate) : null;
                            state.description = response?.data?.content?.data.description ?? '';
                            state.customerId = response?.data?.content?.data.customerId ?? '';
                            state.salesType = response?.data?.content?.data.salesType ?? 1;
                            state.orderStatus = String(response?.data?.content?.data.orderStatus ?? '');
                            state.showComplexDiv = true;

                            await methods.refreshInventoryAvailability();
                            await methods.refreshPaymentSummary(state.id);

                            Swal.fire({ icon: 'success', title: 'Save Successful', timer: 1000, showConfirmButton: false });
                        } else {
                            Swal.fire({
                                icon: 'success',
                                title: 'Delete Successful',
                                text: 'Form will be closed...',
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
                    console.error('SalesOrder handleFormSubmit error:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'An Error Occurred',
                        text: getErrorMessage(error, 'Please try again.'),
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
            }
        };

        const customerListLookup = {
            obj: null,
            create: () => {
                if (state.customerListLookupData && Array.isArray(state.customerListLookupData)) {
                    customerListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.customerListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select a Customer',
                        filterBarPlaceholder: 'Search',
                        sortOrder: 'Ascending',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.customerListLookupData, query);
                        },
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
                        placeholder: 'Chọn loại xuất',
                        change: async (e) => {
                            if (state.salesType !== e.value) {
                                state.salesType = e.value;
                                await methods.onSalesTypeChanged(e.value);
                            }
                        }
                    });
                    salesTypeListLookup.obj.appendTo(salesTypeRef.value);
                }
            },
            refresh: () => {
                if (salesTypeListLookup.obj) {
                    salesTypeListLookup.obj.value = state.salesType != null ? String(state.salesType) : '1';
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
                        placeholder: 'Select an Order Status',
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
            
                // --- INJECTED CODE: Lock form if not Draft ---
                const isReadOnly = newVal > 0;
                if (typeof customerListLookup !== 'undefined' && customerListLookup.obj) customerListLookup.obj.enabled = !isReadOnly;
                if (typeof salesTypeListLookup !== 'undefined' && salesTypeListLookup.obj) salesTypeListLookup.obj.enabled = !isReadOnly;
                if (typeof orderDatePicker !== 'undefined' && orderDatePicker.obj) orderDatePicker.obj.enabled = !isReadOnly;
                if (typeof numberText !== 'undefined' && numberText.obj) numberText.obj.enabled = !isReadOnly;
                
                if (typeof secondaryGrid !== 'undefined' && secondaryGrid.obj) {
                    secondaryGrid.obj.editSettings.allowEditing = !isReadOnly;
                    secondaryGrid.obj.editSettings.allowAdding = !isReadOnly;
                    secondaryGrid.obj.editSettings.allowDeleting = !isReadOnly;
                    
                    // Toggle grid toolbar buttons if the toolbar module exists
                    try {
                        secondaryGrid.obj.toolbarModule.enableItems(['Add', 'Edit', 'Delete', 'Update', 'Cancel'], !isReadOnly);
                    } catch(e) { }
                }
                // --- END INJECTED CODE ---
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
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        {
                            field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false
                        },
                        { field: 'number', headerText: 'Number', width: 150, minWidth: 150 },
                        { field: 'orderDate', headerText: 'SO Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'customerName', headerText: 'Customer', width: 200, minWidth: 200 },
                        { field: 'salesTypeName', headerText: 'Loại xuất', width: 140, minWidth: 140 },
                        { field: 'orderStatusName', headerText: 'Status', width: 150, minWidth: 150 },
                        { field: 'afterTaxAmount', headerText: 'Total Amount', width: 150, minWidth: 150, format: 'N0' },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, minWidth: 150, format: 'yyyy-MM-dd HH:mm' },
                        {
                            field: 'paymentStatusText',
                            headerText: '',
                            width: 150,
                            minWidth: 150,
                            textAlign: 'Center',
                            allowFiltering: false,
                            allowSorting: false,
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
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'Print PDF', tooltipText: 'Print PDF', id: 'PrintPDFCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        mainGrid.obj.autoFitColumns(['number', 'orderDate', 'customerName', 'salesTypeName', 'orderStatusName', 'afterTaxAmount', 'createdAtUtc', 'paymentStatusText']);

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
                                    NumberFormatManager.formatToLocale(rowData.afterTaxAmount ?? 0),
                                    rowData.cashTransactionId,
                                    rowData.cashTransactionStatus,
                                    rowData.cashTransactionCashAccountId,
                                    rowData.cashTransactionAmount,
                                    rowData.cashTransactionDescription,
                                    rowData.cashTransactionCashCategoryId,
                                    rowData.cashTransactionDate
                                );
                            });
                        });
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom', 'PrintPDFCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom', 'PrintPDFCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        }
                    },
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            mainGrid.obj.clearSelection();
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Sales Order';
                            resetFormState();
                            state.secondaryData = [];
                            secondaryGrid.refresh();
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                await methods.refreshInventoryAvailability();
                                state.mainTitle = 'Edit Sales Order';
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
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                await methods.refreshInventoryAvailability();
                                state.mainTitle = 'Delete Sales Order?';
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
                                window.open('/SalesOrders/SalesOrderPdf?id=' + (selectedRecord.id ?? ''), '_blank');
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
        let batchObj;
        let availableBatchQtyObj;
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
            create: async (dataSource) => {
                const allowEdit = !state.isViewMode;
                secondaryGrid.obj = new ej.grids.Grid({
                    height: 400,
                    dataSource: dataSource,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showDeleteConfirmDialog: true, mode: 'Normal', allowEditOnDblClick: allowEdit },
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
                    selectionSettings: { persistSelection: true, type: 'Single' },
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
                                    const resolveSelectedProduct = (valueOrItem) => {
                                        if (!valueOrItem) {
                                            return null;
                                        }

                                        if (valueOrItem.id) {
                                            return valueOrItem;
                                        }

                                        return productOptions.find(item => item.id === valueOrItem)
                                            ?? state.productListLookupData.find(item => item.id === valueOrItem);
                                    };
                                    const applyProductSelection = (selectedProduct) => {
                                        if (selectedProduct) {
                                            const warehouseOptions = getAvailableWarehouseOptions(selectedProduct.id);
                                            const defaultWarehouseId = selectedProduct.defaultWarehouseId ?? null;
                                            const defaultWarehouseHasStock = defaultWarehouseId && warehouseOptions.some(item => item.id === defaultWarehouseId);
                                            let selectedWarehouseId = defaultWarehouseHasStock ? defaultWarehouseId : null;
                                            let batchOptions = getAvailableBatchOptions(selectedProduct.id, selectedWarehouseId);
                                            let suggestedBatch = getSuggestedBatchOption(selectedProduct.id, selectedWarehouseId);

                                            if (!selectedWarehouseId && suggestedBatch?.warehouseId) {
                                                selectedWarehouseId = suggestedBatch.warehouseId;
                                                batchOptions = getAvailableBatchOptions(selectedProduct.id, selectedWarehouseId);
                                                suggestedBatch = getSuggestedBatchOption(selectedProduct.id, selectedWarehouseId);
                                            }

                                            args.rowData.productId = selectedProduct.id;
                                            args.rowData.productReferenceCode = selectedProduct.referenceCode;
                                            args.rowData.warehouseId = selectedWarehouseId;
                                            args.rowData.warehouseName = warehouseOptions.find(item => item.id === selectedWarehouseId)?.name ?? suggestedBatch?.warehouseName ?? '';
                                            args.rowData.batchNumber = suggestedBatch?.batchNumber ?? '';
                                            args.rowData.availableBatchQty = suggestedBatch?.remainingQty ?? 0;
                                            args.rowData.warrantyMonths = selectedProduct.defaultWarrantyMonths ?? null;
                                            clearSerialSelection(args.rowData);
                                            if (productObj) {
                                                productObj.value = selectedProduct.id;
                                                productObj.dataBind();
                                            }
                                            if (warehouseObj) {
                                                warehouseObj.dataSource = warehouseOptions;
                                                warehouseObj.value = selectedWarehouseId;
                                                warehouseObj.dataBind();
                                            }
                                            refreshAvailableBatchQtyCell(args.element, args.rowData.availableBatchQty);
                                            const defaultPrice = (String(state.salesType) === '2' || Number(state.salesType) === 2)
                                                ? (selectedProduct.costPrice ?? selectedProduct.unitPrice ?? null)
                                                : (selectedProduct.unitPrice ?? null);
                                            if (numberObj) {
                                                numberObj.value = selectedProduct.number;
                                            }
                                            if (priceObj) {
                                                priceObj.value = defaultPrice;
                                            }
                                            if (summaryObj) {
                                                summaryObj.value = selectedProduct.description;
                                            }
                                            if (warrantyObj) {
                                                warrantyObj.value = args.rowData.warrantyMonths;
                                            }
                                            if (quantityObj) {
                                                quantityObj.value = 1;
                                                const total = (defaultPrice ?? 0) * quantityObj.value;
                                                if (totalObj) {
                                                    totalObj.value = total;
                                                }
                                            }
                                            if (batchObj) {
                                                batchObj.dataSource = batchOptions;
                                                batchObj.value = suggestedBatch?.selectionKey ?? null;
                                                batchObj.text = args.rowData.batchNumber;
                                                batchObj.dataBind();
                                            }
                                        }
                                    };

                                    productObj = new ej.dropdowns.DropDownList({
                                        dataSource: productOptions,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.productId,
                                        select: (e) => {
                                            applyProductSelection(resolveSelectedProduct(e.itemData ?? e.value));
                                        },
                                        change: (e) => {
                                            applyProductSelection(resolveSelectedProduct(e.value));
                                        },
                                        placeholder: 'Select a Product',
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
                            validationRules: { required: true },
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
                                    return warehouseObj?._pendingValue ?? warehouseObj?.value ?? null;
                                },
                                destroy: () => {
                                    if (warehouseObj) {
                                        warehouseObj.destroy();
                                        warehouseObj = null;
                                    }
                                },
                                write: (args) => {
                                    warehouseObj = new ej.dropdowns.DropDownList({
                                        dataSource: getAvailableWarehouseOptions(args.rowData.productId),
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.warehouseId ?? null,
                                        allowFiltering: true,
                                        showClearButton: false,
                                        placeholder: 'Select a Warehouse',
                                        change: (e) => {
                                            const selectedWarehouse = state.warehouseListLookupData.find(item => item.id === e.value);
                                            args.rowData.warehouseId = e.value || null;
                                            args.rowData.warehouseName = selectedWarehouse?.name ?? '';
                                            // Re-filter batch options by new warehouse
                                            const batchOptions = getAvailableBatchOptions(args.rowData.productId, args.rowData.warehouseId);
                                            const suggestedBatch = batchOptions[0] ?? null;
                                            args.rowData.batchNumber = suggestedBatch?.batchNumber ?? '';
                                            args.rowData.availableBatchQty = suggestedBatch?.remainingQty ?? 0;
                                            clearSerialSelection(args.rowData);
                                            refreshAvailableBatchQtyCell(args.element, args.rowData.availableBatchQty);
                                            if (batchObj) {
                                                batchObj.dataSource = batchOptions;
                                                batchObj.value = suggestedBatch?.selectionKey ?? null;
                                                batchObj.text = args.rowData.batchNumber;
                                                batchObj.dataBind();
                                            }
                                        },
                                        floatLabelType: 'Never'
                                    });
                                    warehouseObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'batchNumber',
                            headerText: 'Batch Number',
                            width: 180,
                            validationRules: { required: true },
                            edit: {
                                create: () => {
                                    let batchElem = document.createElement('input');
                                    return batchElem;
                                },
                                read: () => {
                                    return batchObj?.itemData?.batchNumber ?? normalizeBatchNumber(batchObj?.text ?? batchObj?.value);
                                },
                                destroy: () => {
                                    if (batchObj) {
                                        batchObj.destroy();
                                    }
                                },
                                write: (args) => {
                                    const batchOptions = getAvailableBatchOptions(args.rowData.productId, args.rowData.warehouseId);
                                    const suggestedBatch = getSuggestedBatchOption(args.rowData.productId, args.rowData.warehouseId);
                                    const initialBatchOption = batchOptions.find(item =>
                                        item.batchNumber === normalizeBatchNumber(args.rowData.batchNumber) &&
                                        (!args.rowData.warehouseId || item.warehouseId === args.rowData.warehouseId)
                                    ) ?? suggestedBatch;
                                    const getCurrentBatchOptions = () => Array.isArray(batchObj?.dataSource)
                                        ? batchObj.dataSource
                                        : getAvailableBatchOptions(args.rowData.productId, args.rowData.warehouseId);
                                    const syncBatchSelection = (selectionValue, selectedItem = null) => {
                                        const currentBatchOptions = getCurrentBatchOptions();
                                        const selectedBatch = selectedItem ??
                                            currentBatchOptions.find(item => item.selectionKey === selectionValue) ??
                                            currentBatchOptions.find(item => item.batchNumber === normalizeBatchNumber(selectionValue));

                                        const previousBatchNumber = args.rowData.batchNumber;
                                        const previousWarehouseId = args.rowData.warehouseId;
                                        args.rowData.batchNumber = selectedBatch?.batchNumber ?? '';
                                        args.rowData.warehouseId = selectedBatch?.warehouseId ?? args.rowData.warehouseId ?? null;
                                        args.rowData.warehouseName = selectedBatch?.warehouseName ?? args.rowData.warehouseName ?? '';
                                        args.rowData.availableBatchQty = selectedBatch?.remainingQty ?? 0;
                                        if (previousBatchNumber !== args.rowData.batchNumber || previousWarehouseId !== args.rowData.warehouseId) {
                                            clearSerialSelection(args.rowData);
                                        }
                                        refreshAvailableBatchQtyCell(args.element, args.rowData.availableBatchQty);

                                        if (warehouseObj && selectedBatch?.warehouseId) {
                                            warehouseObj.dataSource = getAvailableWarehouseOptions(args.rowData.productId);
                                            warehouseObj.value = selectedBatch.warehouseId;
                                            warehouseObj.dataBind();
                                        }
                                    };

                                    batchObj = new ej.dropdowns.DropDownList({
                                        dataSource: batchOptions,
                                        fields: { value: 'selectionKey', text: 'batchNumber' },
                                        value: initialBatchOption?.selectionKey ?? null,
                                        allowFiltering: true,
                                        showClearButton: false,
                                        itemTemplate: '<span>${batchNumber}</span>',
                                        placeholder: batchOptions.length ? 'Suggested FIFO batch' : 'No batch with stock',
                                        select: (e) => {
                                            syncBatchSelection(e.itemData?.selectionKey ?? e.itemData?.value, e.itemData);
                                        },
                                        change: (e) => {
                                            syncBatchSelection(e.value, e.itemData);
                                        }
                                    });
                                    syncBatchSelection(initialBatchOption?.selectionKey ?? null, initialBatchOption);
                                    batchObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'availableBatchQty',
                            headerText: 'Remaining Qty',
                            allowEditing: true,
                            width: 170,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            edit: {
                                create: () => {
                                    let availableBatchQtyElem = document.createElement('input');
                                    return availableBatchQtyElem;
                                },
                                read: () => {
                                    return availableBatchQtyObj?.value ?? 0;
                                },
                                destroy: () => {
                                    if (availableBatchQtyObj) {
                                        availableBatchQtyObj.destroy();
                                        availableBatchQtyObj = null;
                                    }
                                },
                                write: (args) => {
                                    availableBatchQtyObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.availableBatchQty ?? 0,
                                        format: 'N0',
                                        decimals: 2,
                                        readonly: true
                                    });
                                    availableBatchQtyObj.appendTo(args.element);
                                }
                            }
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
                                        placeholder: 'Enter Warranty Months'
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
                                            if (quantityObj && totalObj) {
                                                const total = e.value * quantityObj.value;
                                                totalObj.value = total;
                                            }
                                        }
                                    });
                                    priceObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'productSerialNumbers',
                            headerText: 'Device Code',
                            width: 220,
                            valueAccessor: (field, data) => data.productSerialNumbers || (data.productSerialIds?.length ? `${data.productSerialIds.length} serial` : ''),
                            edit: {
                                create: () => {
                                    const wrapper = document.createElement('div');
                                    wrapper.className = 'd-flex gap-2 align-items-center';
                                    wrapper.innerHTML = '<button type="button" class="btn btn-outline-primary btn-sm">Select Device Code</button><span class="text-muted serial-count"></span>';
                                    return wrapper;
                                },
                                read: () => {
                                    return '';
                                },
                                write: (args) => {
                                    const button = args.element.querySelector('button');
                                    const label = args.element.querySelector('.serial-count');
                                    const refreshLabel = () => {
                                        const count = args.rowData.productSerialIds?.length ?? 0;
                                        //label.textContent = count ? `${count} mã` : '';
                                    };

                                    refreshLabel();
                                    button.addEventListener('click', async () => {
                                        if (!isSerialTrackedProduct(args.rowData.productId)) {
                                            Swal.fire({
                                                icon: 'info',
                                                title: 'No serial tracking',
                                                text: 'This product does not use device serial tracking.'
                                            });
                                            return;
                                        }
                                        if (!args.rowData.productId || !args.rowData.warehouseId || !args.rowData.batchNumber) {
                                            Swal.fire({ icon: 'warning', title: 'Missing Data', text: 'Please select product, warehouse and batch first.' });
                                            return;
                                        }

                                        const selectedSerials = await ProductSerialPicker.open({
                                            productId: args.rowData.productId,
                                            warehouseId: args.rowData.warehouseId,
                                            batchNumber: args.rowData.batchNumber,
                                            moduleName: 'DeliveryOrder',
                                            moduleId: state.id,
                                            moduleItemId: args.rowData.id,
                                            selectedIds: args.rowData.productSerialIds ?? []
                                        });

                                        applySerialSelection(args.rowData, selectedSerials);
                                        if (quantityObj) {
                                            quantityObj.value = args.rowData.quantity ?? 0;
                                            quantityObj.readonly = true;
                                            quantityObj.dataBind();
                                        }
                                        if (priceObj && totalObj) {
                                            totalObj.value = (priceObj.value ?? 0) * (args.rowData.quantity ?? 0);
                                        }
                                        refreshLabel();
                                    });
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
                                }, 'Must be a positive number and not zero']
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
                                        readonly: isSerialTrackedProduct(args.rowData.productId),
                                        format: 'n0',
                                        decimals: 0,
                                        validateDecimalOnType: true,
                                        change: (e) => {
                                            if (priceObj && totalObj) {
                                                const total = e.value * priceObj.value;
                                                totalObj.value = total;
                                            }
                                        }
                                    });
                                    quantityObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'total',
                            headerText: 'Subtotal',
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
                                        placeholder: 'Select Tax',
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
                            headerText: 'Ref Code',
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
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () { },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], true);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], true);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['Edit'], false);
                        }
                    },
                    rowSelecting: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length) {
                            secondaryGrid.obj.clearSelection();
                        }
                    },
                    toolbarClick: (args) => {
                        if (args.item.id === 'SecondaryGrid_excelexport') {
                            secondaryGrid.obj.excelExport();
                        }
                    },
                    actionBegin: (args) => {
                        if (args.requestType !== 'save') {
                            return;
                        }

                        const data = args.data ?? {};
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

                        if (!data.warehouseId) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'warning',
                                title: 'Thiếu thông tin bắt buộc',
                                text: 'Vui lòng chọn Kho Hàng trước khi lưu.',
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
                                    title: 'Save Failed',
                                    text: 'Làm ơn chọn số seri thiết bị trước khi lưu.',
                                    confirmButtonText: 'OK'
                                });
                                return;
                            }

                            data.quantity = selectedSerialCount;
                        }

                        const quantity = Number(data.quantity ?? 0);
                        const availableBatchQty = Number(data.availableBatchQty ?? 0);
                        const currentRow = state.secondaryData.find(item => item.id === data.id);
                        const currentQuantity = args.action === 'edit'
                            && currentRow?.productId === data.productId
                            && currentRow?.warehouseId === data.warehouseId
                            && normalizeBatchNumber(currentRow?.batchNumber) === normalizeBatchNumber(data.batchNumber)
                            ? Number(currentRow.quantity ?? 0)
                            : 0;
                        const maxQuantity = availableBatchQty + currentQuantity;

                        if (!isSerialTracked && quantity > maxQuantity) {
                            args.cancel = true;
                            Swal.fire({
                                icon: 'error',
                                title: 'Save Failed',
                                text: `Quantity must not exceed remaining stock (${formatQuantity(maxQuantity)}).`,
                                confirmButtonText: 'OK'
                            });
                        }
                    },
                    actionComplete: async (args) => {
                        if (args.requestType === 'save' && args.action === 'add') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            try {
                                const response = await services.createSecondaryData(data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.batchNumber, data?.warrantyMonths, data?.taxId, salesOrderId, userId, data?.productSerialIds ?? []);
                                if (response?.data?.code === 200) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Save Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Save Failed',
                                        text: response?.data?.message ?? 'Unable to save item.',
                                        confirmButtonText: 'OK'
                                    });
                                }
                            } catch (error) {
                                console.error('Create SalesOrderItem error:', error);
                                await methods.populateSecondaryData(salesOrderId);
                                secondaryGrid.refresh();

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Save Failed',
                                    text: getErrorMessage(error, 'Unable to save item.'),
                                    confirmButtonText: 'OK'
                                });
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            try {
                                const response = await services.updateSecondaryData(data?.id, data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.batchNumber, data?.warrantyMonths, data?.taxId, salesOrderId, userId, data?.productSerialIds ?? []);
                                if (response?.data?.code === 200) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Save Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Save Failed',
                                        text: response?.data?.message ?? 'Unable to update item.',
                                        confirmButtonText: 'OK'
                                    });
                                }
                            } catch (error) {
                                console.error('Update SalesOrderItem error:', error);
                                await methods.populateSecondaryData(salesOrderId);
                                secondaryGrid.refresh();

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Save Failed',
                                    text: getErrorMessage(error, 'Unable to update item.'),
                                    confirmButtonText: 'OK'
                                });
                            }
                        }
                        if (args.requestType === 'delete') {
                            const salesOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data[0];

                            try {
                                const response = await services.deleteSecondaryData(data?.id, userId);
                                if (response?.data?.code === 200) {
                                    await methods.refreshInventoryAvailability();
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Delete Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    await methods.populateSecondaryData(salesOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Delete Failed',
                                        text: response?.data?.message ?? 'Unable to delete this item.',
                                        confirmButtonText: 'OK'
                                    });
                                }
                            } catch (error) {
                                await methods.populateSecondaryData(salesOrderId);
                                secondaryGrid.refresh();

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Delete Failed',
                                    text: getErrorMessage(error, 'Unable to delete this item.'),
                                    confirmButtonText: 'OK'
                                });
                            }
                        }

                        await methods.populateMainData();
                        mainGrid.refresh();
                        await methods.refreshPaymentSummary(state.id);
                    }
                });
                secondaryGrid.obj.appendTo(secondaryGridRef.value);
            },
            refresh: () => {
                secondaryGrid.obj.setProperties({ dataSource: state.secondaryData });
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

        const showPaymentPopup = async (
            orderId,
            orderNumber,
            totalAmount,
            existingTransactionId = null,
            existingStatus = null,
            existingCashAccountId = null,
            existingAmount = null,
            existingDescription = null,
            existingCashCategoryId = null,
            existingTransactionDate = null) => {
            const isReadOnly = existingStatus === 2;
            const totalAmountValue = typeof totalAmount === 'number' ? totalAmount : (NumberFormatManager.parseLocaleNumber(totalAmount) ?? 0);
            const displayAmount = existingAmount !== null && existingAmount !== undefined
                ? NumberFormatManager.formatToLocale(existingAmount)
                : NumberFormatManager.formatToLocale(totalAmountValue);
            const displayDescription = existingDescription ?? `Thu tiền đơn ${orderNumber}`;
            const accountOptions = state.cashAccountListData
                .map(a => `<option value="${a.id}" ${a.id === existingCashAccountId ? 'selected' : ''}>${a.name}</option>`)
                .join('');
            const defaultCashCategoryId = existingCashCategoryId ?? methods.resolveCashCategoryId('Bán hàng') ?? '';
            const statusHtml = isReadOnly
                ? `<div class="mb-3"><label class="form-label fw-bold">Status</label><select class="form-select" disabled><option selected>Paid</option></select></div>`
                : `<div class="mb-3"><label class="form-label fw-bold">Status</label><select id="swal-payment-status" class="form-select"><option value="0" ${existingStatus === 0 ? 'selected' : ''}>Draft</option><option value="2" ${existingStatus === 2 ? 'selected' : ''}>Paid</option></select></div>`;
            const result = await Swal.fire({
                title: `Payment ${orderNumber}`,
                html: `
                    <div class="mb-3"><label class="form-label fw-bold">Account</label><select id="swal-account" class="form-select" ${isReadOnly ? 'disabled' : ''}>${accountOptions}</select></div>
                    <div class="mb-3"><label class="form-label fw-bold">Amount</label><input id="swal-amount" class="form-control" value="${displayAmount}" ${isReadOnly ? 'disabled' : ''}></div>
                    <div class="mb-3"><label class="form-label fw-bold">Description</label><input id="swal-desc" class="form-control" value="${displayDescription}"></div>
                    ${statusHtml}
                `,
                showCancelButton: true,
                confirmButtonText: 'Save',
                cancelButtonText: 'Cancel',
                focusConfirm: false,
                preConfirm: () => {
                    const accountId = document.getElementById('swal-account').value;
                    const categoryId = defaultCashCategoryId;
                    const rawAmountValue = document.getElementById('swal-amount').value ?? '0';
                    const parsedAmount = NumberFormatManager.parseLocaleNumber(rawAmountValue) ?? 0;
                    const status = isReadOnly ? existingStatus : parseInt(document.getElementById('swal-payment-status').value);
                    if (status === 2 && !accountId) {
                        Swal.showValidationMessage('Please select a payment account.');
                        return false;
                    }
                    return {
                        cashAccountId: accountId || null,
                        cashCategoryId: categoryId || null,
                        // Category auto-set to 'Bán hàng'
                        amount: isReadOnly && existingAmount !== null && existingAmount !== undefined ? existingAmount : parsedAmount,
                        description: document.getElementById('swal-desc').value,
                        status
                    };
                }
            });

            if (result.isConfirmed && result.value) {
                try {
                    const payload = {
                        transactionDate: existingTransactionDate ?? new Date().toISOString(),
                        transactionType: 0,
                        status: result.value.status,
                        amount: result.value.amount,
                        description: result.value.description,
                        cashAccountId: result.value.cashAccountId,
                        cashCategoryId: result.value.cashCategoryId ?? null,
                        customerId: state.mainData.find(o => o.id === orderId)?.customerId ?? null,
                        sourceModule: 'SalesOrder',
                        sourceModuleId: orderId,
                        sourceModuleNumber: orderNumber,
                        createdById: StorageManager.getUserId()
                    };
                    if (existingTransactionId) {
                        payload.id = existingTransactionId;
                        payload.updatedById = StorageManager.getUserId();
                        delete payload.createdById;
                        await services.updateCashTransaction(payload);
                    } else {
                        await services.createCashTransaction(payload);
                    }
                    await methods.populateMainData();
                    mainGrid.refresh();
                    if (result.value.status === 2) {
                        Swal.fire({ icon: 'success', title: 'Payment Successful', timer: 1000, showConfirmButton: false });
                    } else {
                        Swal.fire({ icon: 'success', title: 'Save Successful', timer: 1000, showConfirmButton: false });
                    }
                } catch (err) {
                    console.error('Payment Modal error:', err);
                    Swal.fire({ icon: 'error', title: 'Error', text: getErrorMessage(err, 'Please try again.') });
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
                await methods.populateInventoryStockData();
                await secondaryGrid.create(state.secondaryData);
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
                        state.mainTitle = 'View Sales Order';
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
                handleSubmit: methods.handleFormSubmit
            }
        };
    }
};

Vue.createApp(App).mount('#app');
