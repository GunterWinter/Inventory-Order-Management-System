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

        const normalizeBatchNumber = (value) => (value ?? '').toString().trim();
        const toDateTicks = (value) => value ? new Date(value).getTime() : 0;
        const getSelectedProductIds = (currentRowId = null) => new Set(
            state.secondaryData
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
        const getHistoricalBatchOptions = (productId) => {
            if (!productId) {
                return [];
            }

            const options = [];
            const registered = new Set();

            state.purchaseOrderItemHistoryData
                .filter(item => item.productId === productId && normalizeBatchNumber(item.batchNumber) !== '')
                .sort((a, b) => toDateTicks(b.createdAtUtc) - toDateTicks(a.createdAtUtc))
                .forEach(item => {
                    const batchNumber = normalizeBatchNumber(item.batchNumber);
                    if (registered.has(batchNumber)) {
                        return;
                    }

                    registered.add(batchNumber);
                    options.push({
                        batchNumber,
                        displayText: batchNumber
                    });
                });

            return options;
        };
        const getCurrentPoBatch = () => {
            for (const item of state.secondaryData) {
                const batch = normalizeBatchNumber(item.batchNumber);
                if (batch !== '') return batch;
            }
            return '';
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
            createSecondaryData: async (unitPrice, quantity, summary, productId, warehouseId, batchNumber, supplierWarrantyMonths, taxId, purchaseOrderId, createdById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrderItem/CreatePurchaseOrderItem', {
                        unitPrice, quantity, summary, productId, warehouseId, batchNumber, supplierWarrantyMonths, taxId, purchaseOrderId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, unitPrice, quantity, summary, productId, warehouseId, batchNumber, supplierWarrantyMonths, taxId, purchaseOrderId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/PurchaseOrderItem/UpdatePurchaseOrderItem', {
                        id, unitPrice, quantity, summary, productId, warehouseId, batchNumber, supplierWarrantyMonths, taxId, purchaseOrderId, updatedById
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
            }
        };

        const methods = {
            populateVendorListLookupData: async () => {
                const response = await services.getVendorListLookupData();
                state.vendorListLookupData = response?.data?.content?.data;
            },
            populateTaxListLookupData: async () => {
                const response = await services.getTaxListLookupData();
                state.taxListLookupData = response?.data?.content?.data;
            },
            populatePurchaseOrderStatusListLookupData: async () => {
                const response = await services.getPurchaseOrderStatusListLookupData();
                state.purchaseOrderStatusListLookupData = response?.data?.content?.data;
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
                        cashTransactionAmount: payment?.amount ?? null,
                        cashTransactionDescription: payment?.description ?? null
                    };
                });
            },
            populateSecondaryData: async (purchaseOrderId) => {
                try {
                    const response = await services.getSecondaryData(purchaseOrderId);
                    state.secondaryData = response?.data?.content?.data.map(item => ({
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    }));
                    methods.refreshPaymentSummary(purchaseOrderId);
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
                const record = state.mainData.find(item => item.id === id);
                if (record) {
                    state.subTotalAmount = NumberFormatManager.formatToLocale(record.beforeTaxAmount ?? 0);
                    state.taxAmount = NumberFormatManager.formatToLocale(record.taxAmount ?? 0);
                    state.totalAmount = NumberFormatManager.formatToLocale(record.afterTaxAmount ?? 0);
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
                    Swal.fire({
                        icon: 'error',
                        title: 'An Error Occurred',
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
            },
            populateCustomerListLookupData: async () => {
                const response = await services.getCustomerListLookupData();
                state.customerListLookupData = response?.data?.content?.data ?? [];
            },
            handleCostAllocationSubmit: async () => {
                state.costAllocationErrors.cashAccountId = '';
                if (!state.costAllocationCashAccountId) {
                    state.costAllocationErrors.cashAccountId = 'Vui lòng chọn tài khoản tiền.';
                    return;
                }

                // End any pending edit in the preview grid
                if (costAllocationPreviewGrid.obj && costAllocationPreviewGrid.obj.isEdit) {
                    costAllocationPreviewGrid.obj.endEdit();
                    await new Promise(r => setTimeout(r, 150));
                }

                const gridData = costAllocationPreviewGrid.obj ? costAllocationPreviewGrid.obj.dataSource : [];
                if (!gridData || gridData.length === 0) {
                    Swal.fire({ icon: 'warning', title: 'Chưa chọn sản phẩm', text: 'Vui lòng chọn ít nhất 1 sản phẩm để chia chi phí.' });
                    return;
                }

                // Validate quantities
                const byPoItem = {};
                for (const row of gridData) {
                    if (row.allocateQuantity < 0) {
                        Swal.fire({ icon: 'warning', title: 'Số lượng không hợp lệ', text: 'Số lượng phân bổ không được âm.' });
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
                        Swal.fire({ icon: 'warning', title: 'Tổng phân bổ vượt quá', text: `Sản phẩm "${info.name}" tổng phân bổ (${info.total}) vượt quá số lượng mua (${info.maxQty}).` });
                        return;
                    }
                }

                // Validate: if allocateQuantity > 0, must have a customerId
                for (const row of gridData) {
                    if ((row.allocateQuantity || 0) > 0 && !row.customerId) {
                        const product = state.productListLookupData.find(p => p.id === row.productId);
                        Swal.fire({ icon: 'warning', title: 'Thiếu khách hàng', text: `Sản phẩm "${product?.name || ''}" có số lượng chia > 0 nhưng chưa chọn khách hàng.` });
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
                        state.costAllocationCashAccountId,
                        state.costAllocationCashCategoryId,
                        items,
                        StorageManager.getUserId()
                    );

                    if (response.data.code === 200) {
                        const result = response.data.content;
                        costAllocationModal.obj.hide();

                        await methods.populateSecondaryData(state.id);
                        secondaryGrid.refresh();

                        const txCount = result?.createdTransactions?.length ?? 0;
                        Swal.fire({
                            icon: 'success',
                            title: 'Chia đơn chi phí thành công',
                            html: `Đã tạo <b>${txCount}</b> giao dịch chi.<br/>Bạn có muốn xem trang Finance không?`,
                            showCancelButton: true,
                            confirmButtonText: 'Đến trang Finance',
                            cancelButtonText: 'Đóng'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/CashTransactions/CashTransactionList';
                            }
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Chia đơn thất bại',
                            text: response.data.message ?? 'Vui lòng kiểm tra lại.'
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Có lỗi xảy ra',
                        text: error.response?.data?.message ?? 'Không thể chia đơn chi phí.'
                    });
                } finally {
                    state.isCostAllocationSubmitting = false;
                }
            },
            openCostAllocationModal: async () => {
                try {
                    Swal.fire({ title: 'Loading...', allowOutsideClick: false });
                    Swal.showLoading();

                    const response = await services.getCostAllocationsByPurchaseOrderId(state.id);
                    const allAllocations = response?.data?.content?.data || [];
                    const customerAllocations = allAllocations.filter(x => x.customerId !== null);
                    
                    const prefillCashAccountId = response?.data?.content?.cashAccountId || null;
                    const prefillCashCategoryId = response?.data?.content?.cashCategoryId || null;

                    let previewData = [];
                    if (customerAllocations.length > 0) {
                        previewData = customerAllocations.map((alloc, idx) => {
                            const poItem = state.secondaryData.find(x => x.id === alloc.purchaseOrderItemId);
                            return {
                                id: alloc.id,
                                poItemId: alloc.purchaseOrderItemId,
                                productId: poItem ? poItem.productId : '',
                                warehouseId: poItem ? poItem.warehouseId : '',
                                batchNumber: poItem ? poItem.batchNumber : '',
                                remainingQuantity: poItem ? (poItem.quantity || 0) : 0, 
                                customerId: alloc.customerId,
                                allocateQuantity: alloc.quantity,
                                allocateUnitPrice: alloc.unitPrice,
                                allocateTotal: alloc.quantity * alloc.unitPrice
                            };
                        });
                    }

                    // Ensure every PO item has at least one row, even if empty, so the user can clone it
                    const poItems = state.secondaryData.filter(x => (x.quantity || 0) > 0);
                    for (const item of poItems) {
                        const hasRow = previewData.some(x => x.poItemId === item.id);
                        if (!hasRow) {
                            previewData.push({
                                id: `alloc_def_${item.id}_${Date.now()}`,
                                poItemId: item.id,
                                productId: item.productId,
                                warehouseId: item.warehouseId,
                                batchNumber: item.batchNumber,
                                remainingQuantity: item.quantity || 0,
                                customerId: null,
                                allocateQuantity: 0,
                                allocateUnitPrice: item.unitPrice ?? 0,
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
                        row.remainingQuantity = (poItem?.quantity || 0) - (totalAllocByItem[row.poItemId] || 0);
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
                    Swal.fire({ icon: 'error', title: 'Lỗi', text: 'Không thể tải dữ liệu chia đơn.' });
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
                        placeholder: 'Select a Vendor',
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
                        placeholder: 'Select an Order Status',
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

                // --- INJECTED CODE: Lock form if not Draft ---
                const isReadOnly = newVal > 0;
                if (typeof vendorListLookup !== 'undefined' && vendorListLookup.obj) vendorListLookup.obj.enabled = !isReadOnly;
                if (typeof orderDatePicker !== 'undefined' && orderDatePicker.obj) orderDatePicker.obj.enabled = !isReadOnly;
                if (typeof numberText !== 'undefined' && numberText.obj) numberText.obj.enabled = !isReadOnly;

                if (typeof secondaryGrid !== 'undefined' && secondaryGrid.obj) {
                    secondaryGrid.obj.editSettings.allowEditing = !isReadOnly;
                    secondaryGrid.obj.editSettings.allowAdding = !isReadOnly;
                    secondaryGrid.obj.editSettings.allowDeleting = !isReadOnly;

                    // Toggle grid toolbar buttons if the toolbar module exists
                    try {
                        secondaryGrid.obj.toolbarModule.enableItems(['Add', 'Edit', 'Delete', 'Update', 'Cancel'], !isReadOnly);
                        // QuickExport only enabled when Confirmed (status=2)
                        const isConfirmed = String(newVal) === '2';
                        secondaryGrid.obj.toolbarModule.enableItems(['QuickExportCustom'], isConfirmed);
                    } catch (e) { }
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
                    detailTemplate: '#detailtemplate',
                    detailDataBound: async (e) => {
                        let detailGrid = new ej.grids.Grid({
                            dataSource: [],
                            columns: [
                                { field: 'purchaseOrderItem.product.name', headerText: 'Sản phẩm', width: 150 },
                                { field: 'purchaseOrderItem.warehouse.name', headerText: 'Kho', width: 120 },
                                { field: 'customer.name', headerText: 'Khách hàng', width: 150 },
                                { field: 'quantity', headerText: 'Số lượng', width: 100, format: 'N0' }
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
                                            x.customer = { name: 'Kho' };
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
                        { field: 'orderDate', headerText: 'PO Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'vendorName', headerText: 'Vendor', width: 200, minWidth: 200 },
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
                                    rowData.cashTransactionAmount,
                                    rowData.cashTransactionDescription,
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
                            state.mainTitle = 'Add Purchase Order';
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

                        if (args.item.id === 'DeleteCustom') {
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Delete Purchase Order?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.orderDate = selectedRecord.orderDate ? DateFormatManager.parseBusinessDate(selectedRecord.orderDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.vendorId = selectedRecord.vendorId ?? '';
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
        let batchObj;
        let priceObj;
        let quantityObj;
        let totalObj;
        let taxObj;
        let numberObj;
        let summaryObj;
        let supplierWarrantyObj;

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
                                                args.rowData.productId = selectedProduct.id;
                                                args.rowData.productReferenceCode = selectedProduct.referenceCode;
                                                args.rowData.warehouseId = selectedProduct.defaultWarehouseId ?? null;
                                                args.rowData.warehouseName = selectedProduct.defaultWarehouseName ?? '';
                                                const poBatch = getCurrentPoBatch();
                                                args.rowData.batchNumber = poBatch;
                                                if (warehouseObj) {
                                                    warehouseObj.value = args.rowData.warehouseId;
                                                    warehouseObj.dataBind();
                                                }
                                                if (numberObj) {
                                                    numberObj.value = selectedProduct.number;
                                                }
                                                const defaultPrice = selectedProduct.costPrice ?? selectedProduct.unitPrice ?? null;
                                                if (priceObj) {
                                                    priceObj.value = defaultPrice;
                                                }
                                                if (summaryObj) {
                                                    summaryObj.value = selectedProduct.description;
                                                }
                                                if (quantityObj) {
                                                    quantityObj.value = 1;
                                                    const total = (defaultPrice ?? 0) * quantityObj.value;
                                                    if (totalObj) {
                                                        totalObj.value = total;
                                                    }
                                                }
                                                if (batchObj) {
                                                    batchObj.dataSource = getHistoricalBatchOptions(selectedProduct.id);
                                                    batchObj.value = poBatch;
                                                    batchObj.text = poBatch;
                                                }
                                                if (supplierWarrantyObj) {
                                                    supplierWarrantyObj.value = 6;
                                                }
                                            }
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
                                    return warehouseObj.value || null;
                                },
                                destroy: () => {
                                    if (warehouseObj) {
                                        warehouseObj.destroy();
                                    }
                                },
                                write: (args) => {
                                    warehouseObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.warehouseListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.warehouseId ?? null,
                                        allowFiltering: true,
                                        showClearButton: true,
                                        placeholder: 'Select a Warehouse',
                                        change: (e) => {
                                            const selectedWarehouse = state.warehouseListLookupData.find(item => item.id === e.value);
                                            args.rowData.warehouseId = e.value || null;
                                            args.rowData.warehouseName = selectedWarehouse?.name ?? '';
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
                            width: 150,
                            validationRules: { required: true },
                            edit: {
                                create: () => {
                                    let batchElem = document.createElement('input');
                                    return batchElem;
                                },
                                read: () => {
                                    return batchObj.value;
                                },
                                destroy: () => {
                                    if (batchObj) batchObj.destroy();
                                },
                                write: (args) => {
                                    const existingBatch = args.rowData.batchNumber || '';
                                    const initialBatch = existingBatch !== '' ? existingBatch : getCurrentPoBatch();
                                    batchObj = new ej.dropdowns.ComboBox({
                                        dataSource: getHistoricalBatchOptions(args.rowData.productId),
                                        fields: { value: 'batchNumber', text: 'displayText' },
                                        value: initialBatch,
                                        allowCustom: true,
                                        allowFiltering: true,
                                        autofill: true,
                                        placeholder: 'Select existing or type new batch',
                                        change: (e) => {
                                            args.rowData.batchNumber = normalizeBatchNumber(e.value);
                                        }
                                    });
                                    batchObj.appendTo(args.element);
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
                                        placeholder: 'Warranty months'
                                    });
                                    supplierWarrantyObj.appendTo(args.element);
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
                                        min: 0,
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
                            allowEditing: false,
                            width: 160,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right'
                        },
                        {
                            field: 'afterTaxAmount',
                            headerText: 'Total Amount',
                            allowEditing: false,
                            width: 170,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right'
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
                            field: 'allocatedQuantity',
                            headerText: 'Đã chia',
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
                            headerText: 'Còn lại',
                            allowEditing: false,
                            width: 100,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data, column) => {
                                return (data.quantity || 0) - (data.allocatedQuantity || 0);
                            }
                        },
                    ],
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
                        { type: 'Separator' },
                        { text: 'Chia đơn', tooltipText: 'Chia chi phí các mặt hàng đã chọn cho khách hàng', prefixIcon: 'e-export', id: 'CostAllocateCustom' },
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
                    toolbarClick: (args) => {
                        if (args.item.id === 'SecondaryGrid_excelexport') {
                            secondaryGrid.obj.excelExport();
                        }

                        if (args.item.id === 'CostAllocateCustom') {
                            if (String(state.orderStatus) !== '2') {
                                Swal.fire({ icon: 'warning', title: 'Không thể chia đơn', text: 'Chỉ cho phép chia đơn khi đơn hàng đã được xác nhận (Confirmed).' });
                                return;
                            }
                            methods.openCostAllocationModal();
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
                    },
                    actionComplete: async (args) => {
                        if (args.requestType === 'save' && args.action === 'add') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            await services.createSecondaryData(data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.batchNumber, data?.supplierWarrantyMonths, data?.taxId, purchaseOrderId, userId);
                            await methods.populateSecondaryData(purchaseOrderId);
                            secondaryGrid.refresh();

                            Swal.fire({
                                icon: 'success',
                                title: 'Save Successful',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data;

                            await services.updateSecondaryData(data?.id, data?.unitPrice, data?.quantity, data?.summary, data?.productId, data?.warehouseId, data?.batchNumber, data?.supplierWarrantyMonths, data?.taxId, purchaseOrderId, userId);
                            await methods.populateSecondaryData(purchaseOrderId);
                            secondaryGrid.refresh();

                            Swal.fire({
                                icon: 'success',
                                title: 'Save Successful',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        }
                        if (args.requestType === 'delete') {
                            const purchaseOrderId = state.id;
                            const userId = StorageManager.getUserId();
                            const data = args.data[0];

                            try {
                                const response = await services.deleteSecondaryData(data?.id, userId);
                                if (response?.data?.code === 200) {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Delete Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    await methods.populateSecondaryData(purchaseOrderId);
                                    secondaryGrid.refresh();

                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Delete Failed',
                                        text: response?.data?.message ?? 'Unable to delete this item.',
                                        confirmButtonText: 'OK'
                                    });
                                }
                            } catch (error) {
                                await methods.populateSecondaryData(purchaseOrderId);
                                secondaryGrid.refresh();

                                Swal.fire({
                                    icon: 'error',
                                    title: 'Delete Failed',
                                    text: error.response?.data?.message ?? 'Unable to delete this item.',
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
                        placeholder: 'Chọn tài khoản tiền',
                        filterBarPlaceholder: 'Tìm kiếm',
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
                        placeholder: 'Chọn danh mục (tùy chọn)',
                        filterBarPlaceholder: 'Tìm kiếm',
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

                costAllocationPreviewGrid.obj = new ej.grids.Grid({
                    height: 350,
                    dataSource: dataSource,
                    allowSelection: true,
                    allowSorting: false,
                    allowFiltering: false,
                    allowPaging: false,
                    gridLines: 'Horizontal',
                    editSettings: { allowEditing: true, allowAdding: true, allowDeleting: true, mode: 'Batch' },
                    toolbar: [{ text: 'Thêm dòng chia', tooltipText: 'Chọn dòng để chia thêm', prefixIcon: 'e-add', id: 'splitRowBtn' }, 'Delete'],
                    toolbarClick: (args) => {
                        if (args.item.id === 'splitRowBtn') {
                            const selectedRecords = costAllocationPreviewGrid.obj.getSelectedRecords();
                            if (selectedRecords.length === 0) {
                                Swal.fire({ icon: 'info', title: 'Chưa chọn dòng', text: 'Vui lòng chọn 1 dòng sản phẩm để chia thêm.' });
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
                    },
                    columns: [
                        { field: 'id', isPrimaryKey: true, visible: false },
                        { field: 'poItemId', visible: false },
                        {
                            field: 'productId',
                            headerText: 'Sản phẩm',
                            allowEditing: false,
                            width: 180,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data[field]);
                                return product ? product.name : '';
                            }
                        },
                        { field: 'remainingQuantity', headerText: 'Còn lại', width: 80, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
                        {
                            field: 'customerId',
                            headerText: 'Khách hàng',
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
                                },
                                write: (args) => {
                                    customerDropObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.customerListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        placeholder: 'Chọn khách hàng',
                                        value: args.rowData.customerId || '',
                                        allowFiltering: true,
                                        filterBarPlaceholder: 'Tìm kiếm',
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
                            headerText: 'SL chia',
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
                            headerText: 'Đơn giá',
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
                        { field: 'allocateTotal', headerText: 'Thành tiền', width: 130, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
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
            existingAmount = null,
            existingDescription = null,
            existingTransactionDate = null) => {
            const isReadOnly = existingStatus === 2;
            const resolveMoneyAmount = (value) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                    return value;
                }

                const parsedValue = NumberFormatManager.parseLocaleNumber(value);
                return parsedValue ?? 0;
            };
            const totalAmountValue = resolveMoneyAmount(totalAmount);
            const existingAmountValue = resolveMoneyAmount(existingAmount);
            const displayAmount = NumberFormatManager.formatToLocale(
                isReadOnly && existingAmount !== null && existingAmount !== undefined
                    ? existingAmountValue
                    : totalAmountValue,
                0,
                0
            );
            const displayDescription = existingDescription ?? `Chi tiền đơn ${orderNumber}`;
            const accountOptions = state.cashAccountListData
                .map(a => `<option value="${a.id}" ${a.id === existingCashAccountId ? 'selected' : ''}>${a.name}</option>`)
                .join('');
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
                    const parsedAmount = NumberFormatManager.parseLocaleNumber(document.getElementById('swal-amount').value) ?? 0;
                    if (!accountId) {
                        Swal.showValidationMessage('Please select a payment account.');
                        return false;
                    }
                    return {
                        cashAccountId: accountId,
                        amount: isReadOnly && existingAmount !== null && existingAmount !== undefined ? existingAmountValue : parsedAmount,
                        description: document.getElementById('swal-desc').value,
                        status: isReadOnly ? existingStatus : parseInt(document.getElementById('swal-payment-status').value)
                    };
                }
            });

            if (result.isConfirmed && result.value) {
                try {
                    const payload = {
                        transactionDate: existingTransactionDate ?? new Date().toISOString(),
                        transactionType: 1,
                        status: result.value.status,
                        amount: result.value.amount,
                        description: result.value.description,
                        cashAccountId: result.value.cashAccountId,
                        cashCategoryId: methods.resolveCashCategoryId('Mua hàng') ?? null,
                        sourceModule: 'PurchaseOrder',
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
                    Swal.fire({ icon: 'success', title: 'Payment Successful', timer: 1000, showConfirmButton: false });
                } catch (err) {
                    Swal.fire({ icon: 'error', title: 'Error', text: err.response?.data?.message ?? 'Please try again.' });
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
                handleCostAllocationSubmit: methods.handleCostAllocationSubmit
            }
        };
    }
};

Vue.createApp(App).mount('#app');
