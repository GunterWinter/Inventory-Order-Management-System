const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            salesOrderListLookupData: [],
            salesReturnStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            warehouseListLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            returnDate: '',
            description: '',
            salesOrderId: null,
            status: null,
            errors: {
                returnDate: '',
                salesOrderId: '',
                status: '',
                description: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            totalMovementFormatted: '0'
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const returnDateRef = Vue.ref(null);
        const salesOrderIdRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const numberRef = Vue.ref(null);


        const validateForm = function () {
            state.errors.returnDate = '';
            state.errors.salesOrderId = '';
            state.errors.status = '';

            let isValid = true;

            if (!state.returnDate) {
                state.errors.returnDate = 'Return date is required.';
                isValid = false;
            }
            if (!state.salesOrderId) {
                state.errors.salesOrderId = 'Sales Order is required.';
                isValid = false;
            }
            if (!state.status) {
                state.errors.status = 'Status is required.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.returnDate = '';
            state.description = '';
            state.salesOrderId = null;
            state.status = null;
            state.errors = {
                returnDate: '',
                salesOrderId: '',
                status: '',
                description: ''
            };
            state.secondaryData = [];
        };

        const returnDatePicker = {
            obj: null,
            create: () => {
                returnDatePicker.obj = new ej.calendars.DatePicker({
                    placeholder: 'Select Date',
                    format: 'yyyy-MM-dd',
                    locale: DateFormatManager.syncfusionDateLocale,
                    value: state.returnDate ? DateFormatManager.parseBusinessDate(state.returnDate) : null,
                    change: (e) => {
                        state.returnDate = e.value;
                    }
                });
                returnDatePicker.obj.appendTo(returnDateRef.value);
            },
            refresh: () => {
                if (returnDatePicker.obj) {
                    returnDatePicker.obj.value = state.returnDate ? DateFormatManager.parseBusinessDate(state.returnDate) : null;
                }
            }
        };

        Vue.watch(
            () => state.returnDate,
            (newVal, oldVal) => {
                returnDatePicker.refresh();
                state.errors.returnDate = '';
            }
        );

        const numberText = {
            obj: null,
            create: () => {
                numberText.obj = new ej.inputs.TextBox({
                    placeholder: '[auto]',
                });
                numberText.obj.appendTo(numberRef.value);
            }
        };

        const salesOrderListLookup = {
            obj: null,
            create: () => {
                if (state.salesOrderListLookupData && Array.isArray(state.salesOrderListLookupData)) {
                    salesOrderListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.salesOrderListLookupData,
                        fields: { value: 'id', text: 'number' },
                        placeholder: 'Select Sales Order',
                        filterBarPlaceholder: 'Search',
                        sortOrder: 'Ascending',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('number', 'startsWith', e.text, true);
                            }
                            e.updateData(state.salesOrderListLookupData, query);
                        },
                        change: (e) => {
                            state.salesOrderId = e.value;
                        }
                    });
                    salesOrderListLookup.obj.appendTo(salesOrderIdRef.value);
                }
            },
            refresh: () => {
                if (salesOrderListLookup.obj) {
                    salesOrderListLookup.obj.value = state.salesOrderId;
                }
            },
        };

        Vue.watch(
            () => state.salesOrderId,
            async (newVal, oldVal) => {
                salesOrderListLookup.refresh();
                state.errors.salesOrderId = '';
                await methods.populateProductListLookupData();
            }
        );

        const salesReturnStatusListLookup = {
            obj: null,
            create: () => {
                if (state.salesReturnStatusListLookupData && Array.isArray(state.salesReturnStatusListLookupData)) {
                    salesReturnStatusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.salesReturnStatusListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Status',
                        allowFiltering: false,
                        change: (e) => {
                            state.status = e.value;
                        }
                    });
                    salesReturnStatusListLookup.obj.appendTo(statusRef.value);
                }
            },
            refresh: () => {
                if (salesReturnStatusListLookup.obj) {
                    salesReturnStatusListLookup.obj.value = state.status
                }
            },
        };

        Vue.watch(
            () => state.status,
            (newVal, oldVal) => {
                salesReturnStatusListLookup.refresh();
                state.errors.status = '';

                // Filter Draft out of dropdown when status > 0
                StatusDropdownHelper.applyToDropdown(
                    salesReturnStatusListLookup.obj,
                    state.salesReturnStatusListLookupData,
                    newVal
                );
            
                // --- INJECTED CODE: Lock form if not Draft ---
                const isReadOnly = newVal > 0;
                if (typeof returnDatePicker !== 'undefined' && returnDatePicker.obj) returnDatePicker.obj.enabled = !isReadOnly;
                if (typeof numberText !== 'undefined' && numberText.obj) numberText.obj.enabled = !isReadOnly;
                if (typeof salesOrderListLookup !== 'undefined' && salesOrderListLookup.obj) salesOrderListLookup.obj.enabled = !isReadOnly;
                
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

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesReturn/GetSalesReturnList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (returnDate, description, status, salesOrderId, createdById) => {
                try {
                    const response = await AxiosManager.post('/SalesReturn/CreateSalesReturn', {
                        returnDate, description, status, salesOrderId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, returnDate, description, status, salesOrderId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/SalesReturn/UpdateSalesReturn', {
                        id, returnDate, description, status, salesOrderId, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/SalesReturn/DeleteSalesReturn', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getsalesOrderListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesOrder/GetSalesOrderList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSalesReturnStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/SalesReturn/GetSalesReturnStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (moduleId) => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/SalesReturnGetInvenTransList?moduleId=' + moduleId, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (moduleId, warehouseId, productId, movement, createdById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/SalesReturnCreateInvenTrans', {
                        moduleId, warehouseId, productId, movement, createdById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, warehouseId, productId, movement, updatedById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/SalesReturnUpdateInvenTrans', {
                        id, warehouseId, productId, movement, updatedById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/SalesReturnDeleteInvenTrans', {
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
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    returnDate: DateFormatManager.parseBusinessDate(item.returnDate),
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
            populatesalesOrderListLookupData: async () => {
                const response = await services.getsalesOrderListLookupData();
                state.salesOrderListLookupData = response?.data?.content?.data;
            },
            populateSalesReturnStatusListLookupData: async () => {
                const response = await services.getSalesReturnStatusListLookupData();
                state.salesReturnStatusListLookupData = response?.data?.content?.data;
            },
            populateProductListLookupData: async () => {
                if (state.salesOrderId) {
                    try {
                        const response = await AxiosManager.get('/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=' + state.salesOrderId, {});
                        const productsMap = new Map();
                        response?.data?.content?.data?.forEach(item => {
                            if (!productsMap.has(item.productId)) {
                                productsMap.set(item.productId, {
                                    id: item.productId,
                                    name: item.productName,
                                    referenceCode: item.productReferenceCode,
                                    physical: true,
                                    serialTrackingMode: 1
                                });
                            }
                        });
                        state.productListLookupData = Array.from(productsMap.values());
                    } catch (error) {
                        state.productListLookupData = [];
                    }
                } else {
                    state.productListLookupData = [];
                }
            },
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data.filter(warehouse => warehouse.systemWarehouse === false) || [];
            },
            populateSecondaryData: async (salesReturnId) => {
                try {
                    const response = await services.getSecondaryData(salesReturnId);
                    state.secondaryData = response?.data?.content?.data.map(item => ({
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    }));
                    methods.refreshSummary();
                } catch (error) {
                    state.secondaryData = [];
                }
            },
            refreshSummary: () => {
                const totalMovement = state.secondaryData.reduce((sum, record) => sum + (record.movement ?? 0), 0);
                state.totalMovementFormatted = NumberFormatManager.formatToLocale(totalMovement);
            },
            onMainModalHidden: () => {
                state.errors.returnDate = '';
                state.errors.salesOrderId = '';
                state.errors.status = '';
            }
        };

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!validateForm()) {
                        return;
                    }

                    if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.status))) {
                        return;
                    }

                    const response = state.id === ''
                        ? await services.createMainData(state.returnDate, state.description, state.status, state.salesOrderId, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.returnDate, state.description, state.status, state.salesOrderId, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Edit Sales Return';
                            state.id = response?.data?.content?.data.id ?? '';
                            state.number = response?.data?.content?.data.number ?? '';
                            await methods.populateSecondaryData(state.id);
                            secondaryGrid.refresh();
                            state.showComplexDiv = true;

                            Swal.fire({
                                icon: 'success',
                                title: 'Save Successful',
                                timer: 2000,
                                showConfirmButton: false
                            });

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
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['SalesReturns']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);
                await methods.populatesalesOrderListLookupData();
                await methods.populateSalesReturnStatusListLookupData();
                numberText.create();
                returnDatePicker.create();
                salesOrderListLookup.create();
                salesReturnStatusListLookup.create();

                await secondaryGrid.create(state.secondaryData);
                await methods.populateProductListLookupData();
                await methods.populateWarehouseListLookupData();

            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', methods.onMainModalHidden);
        });

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
                        { field: 'returnDate', headerText: 'Return Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'salesOrderNumber', headerText: 'Sales Order', width: 150, minWidth: 150 },
                        { field: 'statusName', headerText: 'Status', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
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
                        mainGrid.obj.autoFitColumns(['number', 'returnDate', 'salesOrderNumber', 'statusName', 'createdAtUtc']);
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
                            state.mainTitle = 'Add Sales Return';
                            resetFormState();
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Sales Return';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.returnDate = selectedRecord.returnDate ? DateFormatManager.parseBusinessDate(selectedRecord.returnDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.salesOrderId = selectedRecord.salesOrderId ?? '';
                                state.status = String(selectedRecord.status ?? '');
                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                state.showComplexDiv = true;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Delete Sales Return?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.returnDate = selectedRecord.returnDate ? DateFormatManager.parseBusinessDate(selectedRecord.returnDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.salesOrderId = selectedRecord.salesOrderId ?? '';
                                state.status = String(selectedRecord.status ?? '');
                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                state.showComplexDiv = false;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'PrintPDFCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                window.open('/SalesReturns/SalesReturnPdf?id=' + (selectedRecord.id ?? ''), '_blank');
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

                let warehouseObj = null;
        let productObj = null;
        let movementObj = null;
        let qtySCCountObj = null;

        const secondaryGrid = {
            obj: null,
            create: async (dataSource) => {
                secondaryGrid.obj = new ej.grids.Grid({
                    height: 400,
                    dataSource: dataSource,
                    editSettings: { allowEditing: true, allowAdding: true, allowDeleting: true, showDeleteConfirmDialog: true, mode: 'Normal', allowEditOnDblClick: true },
                    allowFiltering: false,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: false,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: false,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'warehouseName', direction: 'Descending' }] },
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
                            field: 'warehouseId',
                            headerText: 'Warehouse',
                            width: 250,
                            validationRules: { required: true },
                            disableHtmlEncode: false,
                            valueAccessor: (field, data, column) => {
                                const warehouse = state.warehouseListLookupData.find(item => item.id === data[field]);
                                return warehouse ? `${warehouse.name}` : '';
                            },
                            editType: 'dropdownedit',
                            edit: {
                                create: () => {
                                    const warehouseElem = document.createElement('input');
                                    return warehouseElem;
                                },
                                read: () => {
                                    return warehouseObj.value;
                                },
                                destroy: function () {
                                    warehouseObj.destroy();
                                },
                                write: function (args) {
                                    warehouseObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.warehouseListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.warehouseId,
                                        placeholder: 'Select a Warehouse',
                                        floatLabelType: 'Never',
                                        change: function (e) {
                                            args.rowData.warehouseId = e.value;
                                            args.rowData.productSerialIds = [];
                                            args.rowData.productSerialNumbers = '';
                                        }
                                    });
                                    warehouseObj.appendTo(args.element);
                                }
                            }
                        },
                        {
                            field: 'productReferenceCode',
                            headerText: 'Ref Code',
                            width: 140,
                            allowEditing: false,
                            disableHtmlEncode: false,
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(item => item.id === data.productId);
                                return product ? `${product.referenceCode ?? ''}` : '';
                            }
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
                                    const productElem = document.createElement('input');
                                    return productElem;
                                },
                                read: () => {
                                    return productObj.value;
                                },
                                destroy: function () {
                                    productObj.destroy();
                                },
                                write: function (args) {
                                    productObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.productListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.productId,
                                        change: function (e) {
                                            args.rowData.productId = e.value;
                                            args.rowData.productSerialIds = [];
                                            args.rowData.productSerialNumbers = '';
                                            const p = state.productListLookupData.find(x => x.id === e.value);
                                            args.rowData.productReferenceCode = p ? p.referenceCode || '' : '';
                                            const refCell = args.element.closest('tr').querySelector('input[name="productReferenceCode"]');
                                            if (refCell) {
                                                refCell.value = args.rowData.productReferenceCode;
                                            }
                                            if (movementObj) {
                                                movementObj.value = 1;
                                            }
                                        },
                                        placeholder: 'Select a Product',
                                        floatLabelType: 'Never'
                                    });
                                    productObj.appendTo(args.element);
                                }
                            }
                        },
                        ProductSerialPicker.createGridColumn({
                            productListGetter: () => state.productListLookupData,
                            warehouseIdGetter: (rowData) => rowData.warehouseId,
                            moduleName: 'SalesReturn',
                            moduleIdGetter: () => state.salesOrderId,
                            quantityField: 'movement',
                            quantityObjGetter: () => movementObj,
                            requireWarehouse: true
                        }),
                        {
                            field: 'movement',
                            headerText: 'Movement',
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
                                    const movementElem = document.createElement('input');
                                    return movementElem;
                                },
                                read: () => {
                                    return movementObj.value;
                                },
                                destroy: function () {
                                    movementObj.destroy();
                                },
                                write: function (args) {
                                    movementObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.movement ?? 0,
                                        format: 'n0',
                                        decimals: 0,
                                        validateDecimalOnType: true,
                                    });
                                    movementObj.appendTo(args.element);
                                }
                            }
                        },
                    ],
                    toolbar: [
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
                        ProductSerialPicker.validateGridSave(args, {
                            productListGetter: () => state.productListLookupData,
                            quantityField: 'movement',
                            allowEmptySelection: false
                        });
                    },
                    actionComplete: async (args) => {
                        if (args.requestType === 'save' && args.action === 'add') {
                            try {
                                const response = await services.createSecondaryData(state.id, args.data.warehouseId, args.data.productId, args.data.movement, StorageManager.getUserId(), args.data.productSerialIds ?? []);
                                await methods.populateSecondaryData(state.id);
                                secondaryGrid.refresh();
                                if (response.data.code === 200) {
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Save Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Save Failed',
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
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            try {
                                const response = await services.updateSecondaryData(args.data.id, args.data.warehouseId, args.data.productId, args.data.movement, StorageManager.getUserId(), args.data.productSerialIds ?? []);
                                await methods.populateSecondaryData(state.id);
                                secondaryGrid.refresh();
                                if (response.data.code === 200) {
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Update Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Update Failed',
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
                            }
                        }
                        if (args.requestType === 'delete') {
                            try {
                                const response = await services.deleteSecondaryData(args.data[0].id, StorageManager.getUserId());
                                await methods.populateSecondaryData(state.id);
                                secondaryGrid.refresh();
                                if (response.data.code === 200) {
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Delete Successful',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Delete Failed',
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
                            }
                        }
                        methods.refreshSummary();
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

        return {
            mainGridRef,
            mainModalRef,
            secondaryGridRef,
            numberRef,
            returnDateRef,
            salesOrderIdRef,
            statusRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');















