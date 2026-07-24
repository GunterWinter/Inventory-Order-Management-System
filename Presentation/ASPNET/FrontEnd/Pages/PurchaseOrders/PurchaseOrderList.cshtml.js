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
            quickSalesSelectedItems: [],
            quickSalesCustomerId: null,
            quickSalesSalesType: '2',
            isQuickSalesSubmitting: false,
            quickSalesErrors: {
                customerId: ''
            }
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const orderDateRef = Vue.ref(null);
        const numberRef = Vue.ref(null);
        const vendorIdRef = Vue.ref(null);
        const orderStatusRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const quickSalesModalRef = Vue.ref(null);
        const quickSalesCustomerIdRef = Vue.ref(null);
        const quickSalesPreviewGridRef = Vue.ref(null);
        const quickSalesSalesTypeRef = Vue.ref(null);

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
            createQuickSalesOrderFromItems: async (purchaseOrderId, items, customerId, createdById, salesType) => {
                try {
                    const response = await AxiosManager.post('/SalesOrder/CreateQuickSalesOrderFromItems', {
                        purchaseOrderId, items, customerId, createdById, salesType
                    });
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
            handleQuickSalesSubmit: async () => {
                state.quickSalesErrors.customerId = '';
                if (!state.quickSalesCustomerId) {
                    state.quickSalesErrors.customerId = 'Vui lòng chọn khách hàng.';
                    return;
                }

                // End any pending edit in the preview grid
                if (quickSalesPreviewGrid.obj && quickSalesPreviewGrid.obj.isEdit) {
                    quickSalesPreviewGrid.obj.endEdit();
                    await new Promise(r => setTimeout(r, 150));
                }

                const gridData = quickSalesPreviewGrid.obj ? quickSalesPreviewGrid.obj.dataSource : [];
                if (!gridData || gridData.length === 0) {
                    Swal.fire({ icon: 'warning', title: 'Chưa chọn sản phẩm', text: 'Vui lòng chọn ít nhất 1 sản phẩm để xuất nhanh.' });
                    return;
                }

                // Validate quantities
                for (const row of gridData) {
                    if (!row.exportQuantity || row.exportQuantity <= 0) {
                        Swal.fire({ icon: 'warning', title: 'Số lượng không hợp lệ', text: `Số lượng xuất phải lớn hơn 0.` });
                        return;
                    }
                    if (row.exportQuantity > row.remainingQuantity) {
                        const product = state.productListLookupData.find(p => p.id === row.productId);
                        Swal.fire({ icon: 'warning', title: 'Số lượng vượt quá', text: `Sản phẩm "${product?.name || ''}" chỉ còn lại ${row.remainingQuantity}, không thể xuất ${row.exportQuantity}.` });
                        return;
                    }
                }

                state.isQuickSalesSubmitting = true;
                try {
                    const items = gridData.map(row => ({
                        purchaseOrderItemId: row.id,
                        quantity: row.exportQuantity,
                        unitPrice: row.exportUnitPrice
                    }));
                    const response = await services.createQuickSalesOrderFromItems(
                        state.id,
                        items,
                        state.quickSalesCustomerId,
                        StorageManager.getUserId(),
                        parseInt(state.quickSalesSalesType)
                    );

                    if (response.data.code === 200) {
                        const newSo = response.data.content?.data;
                        quickSalesModal.obj.hide();

                        await methods.populateSecondaryData(state.id);
                        secondaryGrid.refresh();

                        Swal.fire({
                            icon: 'success',
                            title: 'Xuất nhanh thành công',
                            html: `Đã tạo đơn bán hàng <b>${newSo?.number || ''}</b>.<br/>Bạn có muốn xem đơn bán hàng mới không?`,
                            showCancelButton: true,
                            confirmButtonText: 'Đến trang đơn bán hàng',
                            cancelButtonText: 'Đóng'
                        }).then((result) => {
                            if (result.isConfirmed) {
                                window.location.href = '/SalesOrders/SalesOrderList';
                            }
                        });
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Xuất nhanh thất bại',
                            text: response.data.message ?? 'Vui lòng kiểm tra lại.'
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Có lỗi xảy ra',
                        text: error.response?.data?.message ?? 'Không thể tạo đơn bán hàng.'
                    });
                } finally {
                    state.isQuickSalesSubmitting = false;
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
                            field: 'quickSalesExportedQuantity',
                            headerText: 'Đã xuất',
                            allowEditing: false,
                            width: 100,
                            type: 'number',
                            format: 'N0',
                            textAlign: 'Right',
                            valueAccessor: (field, data, column) => {
                                return data.quickSalesExportedQuantity || 0;
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
                                return (data.quantity || 0) - (data.quickSalesExportedQuantity || 0);
                            }
                        },
                    ],
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
                        { type: 'Separator' },
                        { text: 'Xuất nhanh', tooltipText: 'Xuất nhanh các mặt hàng đã chọn ra đơn bán hàng', prefixIcon: 'e-export', id: 'QuickExportCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        if (!state.isViewMode) {
                            try {
                                const isConfirmed = String(state.orderStatus) === '2';
                                secondaryGrid.obj.toolbarModule.enableItems(['QuickExportCustom'], isConfirmed);
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

                        if (args.item.id === 'QuickExportCustom') {
                            // Only allow quick export when PO status is Confirmed
                            if (String(state.orderStatus) !== '2') {
                                Swal.fire({ icon: 'warning', title: 'Không thể xuất nhanh', text: 'Chỉ cho phép xuất nhanh khi đơn hàng đã được xác nhận (Confirmed).' });
                                return;
                            }

                            const selectedRecords = secondaryGrid.obj.getSelectedRecords();
                            if (!selectedRecords || selectedRecords.length === 0) {
                                Swal.fire({ icon: 'warning', title: 'Chưa chọn sản phẩm', text: 'Vui lòng chọn ít nhất 1 sản phẩm để xuất nhanh.' });
                                return;
                            }

                            // Check if any selected items have no remaining quantity
                            const fullyExported = selectedRecords.filter(item => {
                                const remaining = (item.quantity || 0) - (item.quickSalesExportedQuantity || 0);
                                return remaining <= 0;
                            });
                            if (fullyExported.length > 0) {
                                const names = fullyExported.map(item => {
                                    const product = state.productListLookupData.find(p => p.id === item.productId);
                                    return product ? product.name : item.productId;
                                }).join(', ');
                                Swal.fire({
                                    icon: 'warning',
                                    title: 'Sản phẩm đã xuất hết',
                                    html: `Các sản phẩm sau đã xuất hết số lượng: <b>${names}</b>.<br/>Vui lòng bỏ chọn các sản phẩm này.`
                                });
                                return;
                            }

                            // Store selected items and open the quick sales modal
                            state.quickSalesSelectedItems = selectedRecords;
                            state.quickSalesCustomerId = null;
                            state.quickSalesErrors.customerId = '';

                            // Prepare preview data with editable fields
                            const isInternalType = state.quickSalesSalesType === '2';
                            const previewData = selectedRecords.map(item => {
                                const product = state.productListLookupData.find(p => p.id === item.productId);
                                const remaining = (item.quantity || 0) - (item.quickSalesExportedQuantity || 0);
                                const unitPrice = isInternalType
                                    ? (product?.costPrice ?? item.unitPrice ?? 0)
                                    : (product?.unitPrice ?? item.unitPrice ?? 0);
                                return {
                                    id: item.id,
                                    productId: item.productId,
                                    warehouseId: item.warehouseId,
                                    batchNumber: item.batchNumber,
                                    remainingQuantity: remaining,
                                    exportQuantity: remaining,
                                    exportUnitPrice: unitPrice,
                                    exportTotal: unitPrice * remaining
                                };
                            });

                            // Create/refresh preview grid
                            quickSalesPreviewGrid.createOrRefresh(previewData);

                            // Reset and refresh customer dropdown
                            if (quickSalesCustomerLookup.obj) {
                                quickSalesCustomerLookup.obj.value = null;
                            }

                            quickSalesModal.obj.show();
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

        const quickSalesModal = {
            obj: null,
            create: () => {
                quickSalesModal.obj = new bootstrap.Modal(quickSalesModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });

                // Restore scroll on parent modal when this modal closes
                quickSalesModalRef.value.addEventListener('hidden.bs.modal', () => {
                    if (document.querySelector('.modal.show')) {
                        document.body.classList.add('modal-open');
                        document.body.style.overflow = 'hidden';
                    }
                });
            }
        };

        const quickSalesCustomerLookup = {
            obj: null,
            create: () => {
                if (state.customerListLookupData && Array.isArray(state.customerListLookupData)) {
                    quickSalesCustomerLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.customerListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn khách hàng',
                        filterBarPlaceholder: 'Tìm kiếm',
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
                            state.quickSalesCustomerId = e.value;
                            state.quickSalesErrors.customerId = '';
                        }
                    });
                    quickSalesCustomerLookup.obj.appendTo(quickSalesCustomerIdRef.value);
                }
            }
        };

        const quickSalesSalesTypeLookup = {
            obj: null,
            create: () => {
                quickSalesSalesTypeLookup.obj = new ej.dropdowns.DropDownList({
                    dataSource: [
                        { id: '2', name: 'Nội bộ (giá vốn)' },
                        { id: '1', name: 'Bán lẻ (giá bán)' }
                    ],
                    fields: { value: 'id', text: 'name' },
                    value: state.quickSalesSalesType,
                    change: (e) => {
                        state.quickSalesSalesType = e.value;

                        // Update prices in preview grid based on sales type
                        if (quickSalesPreviewGrid.obj) {
                            const isInternal = e.value === '2';
                            const records = quickSalesPreviewGrid.obj.getCurrentViewRecords();
                            records.forEach((row) => {
                                const product = state.productListLookupData.find(p => p.id === row.productId);
                                const newPrice = isInternal
                                    ? (product?.costPrice ?? row.exportUnitPrice ?? 0)
                                    : (product?.unitPrice ?? row.exportUnitPrice ?? 0);
                                quickSalesPreviewGrid.obj.setCellValue(row.id, 'exportUnitPrice', newPrice);
                                quickSalesPreviewGrid.obj.setCellValue(row.id, 'exportTotal', newPrice * (row.exportQuantity || 0));
                            });
                        }
                    }
                });
                quickSalesSalesTypeLookup.obj.appendTo(quickSalesSalesTypeRef.value);
            }
        };

        const quickSalesPreviewGrid = {
            obj: null,
            createOrRefresh: (dataSource) => {
                if (quickSalesPreviewGrid.obj) {
                    quickSalesPreviewGrid.obj.dataSource = dataSource;
                    quickSalesPreviewGrid.obj.refresh();
                    return;
                }

                let exportQtyObj = null;
                let exportPriceObj = null;

                quickSalesPreviewGrid.obj = new ej.grids.Grid({
                    height: 300,
                    dataSource: dataSource,
                    allowSelection: false,
                    allowSorting: false,
                    allowFiltering: false,
                    allowPaging: false,
                    gridLines: 'Horizontal',
                    editSettings: { allowEditing: true, allowAdding: false, allowDeleting: false, mode: 'Batch' },
                    columns: [
                        { field: 'id', isPrimaryKey: true, visible: false },
                        {
                            field: 'productId',
                            headerText: 'Sản phẩm',
                            allowEditing: false,
                            width: 200,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data[field]);
                                return product ? product.name : '';
                            }
                        },
                        {
                            field: 'warehouseId',
                            headerText: 'Kho',
                            allowEditing: false,
                            width: 140,
                            valueAccessor: (field, data, column) => {
                                const wh = state.warehouseListLookupData.find(item => item.id === data[field]);
                                return wh ? wh.name : '';
                            }
                        },
                        { field: 'batchNumber', headerText: 'Số Lô', width: 100, allowEditing: false },
                        { field: 'remainingQuantity', headerText: 'Còn lại', width: 90, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
                        {
                            field: 'exportQuantity',
                            headerText: 'SL xuất',
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
                                    return exportQtyObj ? exportQtyObj.value : 0;
                                },
                                destroy: () => {
                                    if (exportQtyObj) exportQtyObj.destroy();
                                },
                                write: (args) => {
                                    exportQtyObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.exportQuantity,
                                        min: 1,
                                        max: args.rowData.remainingQuantity,
                                        format: 'n0',
                                        decimals: 0,
                                        validateDecimalOnType: true,
                                        change: (e) => {
                                            if (args.rowData) {
                                                args.rowData.exportQuantity = e.value;
                                                const newTotal = (e.value || 0) * (args.rowData.exportUnitPrice || 0);
                                                args.rowData.exportTotal = newTotal;
                                                
                                                if (quickSalesPreviewGrid.obj) {
                                                    const actualRow = quickSalesPreviewGrid.obj.dataSource.find(x => x.id === args.rowData.id);
                                                    if (actualRow) {
                                                        actualRow.exportQuantity = e.value;
                                                        actualRow.exportTotal = newTotal;
                                                    }
                                                }
                                                
                                                const tr = args.element.closest('tr');
                                                if (tr && quickSalesPreviewGrid.obj) {
                                                    const cellIndex = quickSalesPreviewGrid.obj.getColumnIndexByField('exportTotal');
                                                    if (cellIndex !== -1 && tr.cells[cellIndex]) {
                                                        tr.cells[cellIndex].innerText = Intl.NumberFormat('en-US').format(newTotal);
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    exportQtyObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'exportUnitPrice',
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
                                    return exportPriceObj ? exportPriceObj.value : 0;
                                },
                                destroy: () => {
                                    if (exportPriceObj) exportPriceObj.destroy();
                                },
                                write: (args) => {
                                    exportPriceObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.exportUnitPrice,
                                        min: 0,
                                        format: 'N0',
                                        change: (e) => {
                                            if (args.rowData) {
                                                args.rowData.exportUnitPrice = e.value;
                                                const newTotal = (args.rowData.exportQuantity || 0) * (e.value || 0);
                                                args.rowData.exportTotal = newTotal;
                                                
                                                if (quickSalesPreviewGrid.obj) {
                                                    const actualRow = quickSalesPreviewGrid.obj.dataSource.find(x => x.id === args.rowData.id);
                                                    if (actualRow) {
                                                        actualRow.exportUnitPrice = e.value;
                                                        actualRow.exportTotal = newTotal;
                                                    }
                                                }
                                                
                                                const tr = args.element.closest('tr');
                                                if (tr && quickSalesPreviewGrid.obj) {
                                                    const cellIndex = quickSalesPreviewGrid.obj.getColumnIndexByField('exportTotal');
                                                    if (cellIndex !== -1 && tr.cells[cellIndex]) {
                                                        tr.cells[cellIndex].innerText = Intl.NumberFormat('en-US').format(newTotal);
                                                    }
                                                }
                                            }
                                        }
                                    });
                                    exportPriceObj.appendTo(args.element);
                                }
                            }
                        },
                        { field: 'exportTotal', headerText: 'Thành tiền', width: 130, type: 'number', format: 'N0', textAlign: 'Right', allowEditing: false },
                    ],
                    cellSave: (args) => {
                        // Recalculate total after cell save
                        const row = args.rowData;
                        if (row) {
                            row.exportTotal = (row.exportQuantity || 0) * (row.exportUnitPrice || 0);
                        }
                    }
                });
                quickSalesPreviewGrid.obj.appendTo(quickSalesPreviewGridRef.value);
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
                quickSalesModal.create();
                quickSalesCustomerLookup.create();
                quickSalesSalesTypeLookup.create();
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
            quickSalesModalRef,
            quickSalesCustomerIdRef,
            quickSalesPreviewGridRef,
            quickSalesSalesTypeRef,
            state,
            methods,
            handler: {
                handleSubmit: methods.handleFormSubmit,
                handleQuickSalesSubmit: methods.handleQuickSalesSubmit
            }
        };
    }
};

Vue.createApp(App).mount('#app');
