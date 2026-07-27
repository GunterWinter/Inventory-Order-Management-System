const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            purchaseOrderListLookupData: [],
            customerListLookupData: [],
            MaterialExportStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            MaterialExportDate: '',
            description: '',
            purchaseOrderId: null,
            status: null,
            errors: {
                MaterialExportDate: '',
                purchaseOrderId: '',
                status: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            totalMovementFormatted: '0'
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const MaterialExportDateRef = Vue.ref(null);
        const purchaseOrderIdRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const customerIdRef = Vue.ref(null);
        const numberRef = Vue.ref(null);

        const validateForm = function () {
            state.errors.MaterialExportDate = '';
            state.errors.purchaseOrderId = '';
            state.errors.customerId = '';
            state.errors.status = '';

            let isValid = true;

            if (!state.MaterialExportDate) {
                state.errors.MaterialExportDate = 'Ngày xuất là bắt buộc.';
                isValid = false;
            }
            if (!state.purchaseOrderId) {
                state.errors.purchaseOrderId = 'Đơn mua hàng là bắt buộc.';
                isValid = false;
            }
            if (!state.customerId) {
                state.errors.customerId = 'Khách hàng là bắt buộc.';
                isValid = false;
            }
            if (!state.status && state.status !== 0 && state.status !== '0') {
                state.errors.status = 'Trạng thái là bắt buộc.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.MaterialExportDate = '';
            state.description = '';
            state.purchaseOrderId = null;
            state.customerId = null;
            state.status = null;
            state.errors = {
                MaterialExportDate: '',
                purchaseOrderId: '',
                customerId: '',
                status: ''
            };
            state.secondaryData = [];
        };

        const MaterialExportDatePicker = {
            obj: null,
            create: () => {
                MaterialExportDatePicker.obj = new ej.calendars.DatePicker({
                    placeholder: 'Chọn ngày',
                    format: 'yyyy-MM-dd',
                    locale: DateFormatManager.syncfusionDateLocale,
                    value: state.MaterialExportDate ? DateFormatManager.parseBusinessDate(state.MaterialExportDate) : null,
                    change: (e) => {
                        state.MaterialExportDate = e.value;
                    }
                });
                MaterialExportDatePicker.obj.appendTo(MaterialExportDateRef.value);
            },
            refresh: () => {
                if (MaterialExportDatePicker.obj) {
                    MaterialExportDatePicker.obj.value = state.MaterialExportDate ? DateFormatManager.parseBusinessDate(state.MaterialExportDate) : null;
                }
            }
        };

        Vue.watch(
            () => state.MaterialExportDate,
            (newVal, oldVal) => {
                MaterialExportDatePicker.refresh();
                state.errors.MaterialExportDate = '';
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

        const PurchaseOrderListLookup = {
            obj: null,
            create: () => {
                if (state.purchaseOrderListLookupData && Array.isArray(state.purchaseOrderListLookupData)) {
                    PurchaseOrderListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.purchaseOrderListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn đơn mua hàng',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.purchaseOrderListLookupData, query);
                        },
                        change: (e) => {
                            state.purchaseOrderId = e.value;
                        }
                    });
                    PurchaseOrderListLookup.obj.appendTo(purchaseOrderIdRef.value);
                }
            },
            refresh: () => {
                if (PurchaseOrderListLookup.obj) {
                    PurchaseOrderListLookup.obj.value = state.purchaseOrderId;
                }
            }
        };

        Vue.watch(
            () => state.purchaseOrderId,
            (newVal, oldVal) => {
                PurchaseOrderListLookup.refresh();
                state.errors.purchaseOrderId = '';
            }
        );

        const CustomerListLookup = {
            obj: null,
            create: () => {
                if (state.customerListLookupData && Array.isArray(state.customerListLookupData)) {
                    CustomerListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.customerListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn Khách hàng',
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
                    CustomerListLookup.obj.appendTo(customerIdRef.value);
                }
            },
            refresh: () => {
                if (CustomerListLookup.obj) {
                    CustomerListLookup.obj.value = state.customerId;
                }
            }
        };

        Vue.watch(
            () => state.customerId,
            (newVal, oldVal) => {
                CustomerListLookup.refresh();
                state.errors.customerId = '';
            }
        );

        const statusListLookup = {
            obj: null,
            create: () => {
                if (state.MaterialExportStatusListLookupData && Array.isArray(state.MaterialExportStatusListLookupData)) {
                    statusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.MaterialExportStatusListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn Trạng thái',
                        allowFiltering: false,
                        change: (e) => {
                            state.status = e.value;
                        }
                    });
                    statusListLookup.obj.appendTo(statusRef.value);
                }
            },
            refresh: () => {
                if (statusListLookup.obj) {
                    statusListLookup.obj.value = state.status;
                }
            }
        };

        Vue.watch(
            () => state.status,
            (newVal, oldVal) => {
                statusListLookup.refresh();
                state.errors.status = '';

                // Filter Draft out of dropdown when status > 0
                StatusDropdownHelper.applyToDropdown(
                    statusListLookup.obj,
                    state.MaterialExportStatusListLookupData,
                    newVal
                );
            
                // --- INJECTED CODE: Lock form if not Draft ---
                const isReadOnly = newVal > 0;
                if (typeof MaterialExportDatePicker !== 'undefined' && MaterialExportDatePicker.obj) MaterialExportDatePicker.obj.enabled = !isReadOnly;
                if (typeof numberText !== 'undefined' && numberText.obj) numberText.obj.enabled = !isReadOnly;
                if (typeof PurchaseOrderListLookup !== 'undefined' && PurchaseOrderListLookup.obj) PurchaseOrderListLookup.obj.enabled = !isReadOnly;
                
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
                    const response = await AxiosManager.get('/MaterialExport/GetMaterialExportList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (MaterialExportDate, description, status, purchaseOrderId, customerId, createdById) => {
                try {
                    const response = await AxiosManager.post('/MaterialExport/CreateMaterialExport', {
                        MaterialExportDate, description, status, purchaseOrderId, customerId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, MaterialExportDate, description, status, purchaseOrderId, customerId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/MaterialExport/UpdateMaterialExport', {
                        id, MaterialExportDate, description, status, purchaseOrderId, customerId, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/MaterialExport/DeleteMaterialExport', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getpurchaseOrderListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/PurchaseOrder/GetPurchaseOrderList', {});
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
            getMaterialExportStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/MaterialExport/GetMaterialExportStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (moduleId) => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=' + moduleId, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (moduleId, productId, movement, createdById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/MaterialExportCreateInvenTrans', {
                        moduleId, productId, movement, createdById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, productId, movement, updatedById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/MaterialExportUpdateInvenTrans', {
                        id, productId, movement, updatedById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/MaterialExportDeleteInvenTrans', {
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
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    MaterialExportDate: DateFormatManager.parseBusinessDate(item.MaterialExportDate),
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
            populatepurchaseOrderListLookupData: async () => {
                const response = await services.getpurchaseOrderListLookupData();
                state.purchaseOrderListLookupData = response?.data?.content?.data.filter(PurchaseOrder => PurchaseOrder.systemPurchaseOrder === false) || [];
            },
            populatecustomerListLookupData: async () => {
                const response = await services.getCustomerListLookupData();
                state.customerListLookupData = response?.data?.content?.data;
            },
            populateMaterialExportStatusListLookupData: async () => {
                const response = await services.getMaterialExportStatusListLookupData();
                state.MaterialExportStatusListLookupData = response?.data?.content?.data;
            },
            populateSecondaryData: async (MaterialExportId) => {
                try {
                    const response = await services.getSecondaryData(MaterialExportId);
                    state.secondaryData = response?.data?.content?.data.map(item => ({
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    }));
                    methods.refreshSummary();
                } catch (error) {
                    state.secondaryData = [];
                }
            },
            populateProductListLookupData: async () => {
                const response = await services.getProductListLookupData();
                state.productListLookupData = response?.data?.content?.data
                    .filter(product => product.physical === true)
                    .map(product => ({
                        ...product,
                        name: `${product.name}`
                    })) || [];
            },
            refreshSummary: () => {
                const totalMovement = state.secondaryData.reduce((sum, record) => sum + (record.movement ?? 0), 0);
                state.totalMovementFormatted = NumberFormatManager.formatToLocale(totalMovement);
            },

            onMainModalHidden: () => {
                state.errors.MaterialExportDate = '';
                state.errors.purchaseOrderId = '';
            state.errors.customerId = '';
                state.errors.status = '';
            },

            submitMainData: async () => {
                const isValid = validateForm();
                if (!isValid) {
                    return { isValid, response: null };
                }

                if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.status))) {
                    return { isValid: false, response: null };
                }

                try {
                    const response = state.id === ''
                        ? await services.createMainData(state.MaterialExportDate, state.description, state.status, state.purchaseOrderId, state.customerId, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.MaterialExportDate, state.description, state.status, state.purchaseOrderId, state.customerId, StorageManager.getUserId());

                    return { isValid, response };
                } catch (error) {
                    return { isValid, response: null };
                }
            },
        };

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    const { isValid, response } = await methods.submitMainData();

                    if (!isValid) {
                        return;
                    }

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Sửa phiếu Xuất vật tư';
                            state.id = response?.data?.content?.data.id ?? '';
                            state.number = response?.data?.content?.data.number ?? '';
                            await methods.populateSecondaryData(state.id);
                            secondaryGrid.refresh();
                            state.showComplexDiv = true;

                            Swal.fire({
                                icon: 'success',
                                title: 'Lưu thành công',
                                timer: 2000,
                                showConfirmButton: false
                            });
                        } else {
                            Swal.fire({
                                icon: 'success',
                                title: 'Xóa thành công',
                                text: 'Biểu mẫu sẽ được đóng...',
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
                            text: response.data.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                            confirmButtonText: 'Thử lại'
                        });
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Đã xảy ra lỗi',
                        text: error.response?.data?.message ?? 'Vui lòng thử lại.',
                        confirmButtonText: 'Đồng ý'
                    });
                } finally {
                    state.isSubmitting = false;
                }
            },
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['MaterialExports']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden());

                await methods.populatepurchaseOrderListLookupData();
                PurchaseOrderListLookup.create();
                await methods.populatecustomerListLookupData();
                CustomerListLookup.create();
                await methods.populateMaterialExportStatusListLookupData();
                statusListLookup.create();
                MaterialExportDatePicker.create();
                numberText.create();

                await methods.populateProductListLookupData();
                await secondaryGrid.create(state.secondaryData);

            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', methods.onMainModalHidden());
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
                        { field: 'MaterialExportDate', headerText: 'Ngày xuất', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'purchaseOrderName', headerText: 'Đơn mua hàng', width: 150, minWidth: 150 },
                        { field: 'customerName', headerText: 'Khách hàng', width: 150, minWidth: 150 },
                        { field: 'statusName', headerText: 'Trạng thái', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Ngày tạo', width: 150, format: 'yyyy-MM-dd HH:mm' }
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
                        mainGrid.obj.autoFitColumns(['number', 'MaterialExportDate', 'purchaseOrderName', 'customerName', 'statusName', 'createdAtUtc']);
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
                            state.mainTitle = 'Thêm phiếu Xuất vật tư';
                            resetFormState();
                            state.status = '0';
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Sửa phiếu Xuất vật tư';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.purchaseOrderId = selectedRecord.purchaseOrderId ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
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
                                state.mainTitle = 'Xóa phiếu Xuất vật tư?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.purchaseOrderId = selectedRecord.purchaseOrderId ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
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
                                window.open('/MaterialExports/MaterialExportPdf?id=' + (selectedRecord.id ?? ''), '_blank');
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

                let PurchaseOrderObj = null;
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
                            headerText: 'Sản phẩm',
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
                                    productElem = document.createElement('input');
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
                                        placeholder: 'Chọn hàng hóa',
                                        floatLabelType: 'Never'
                                    });

                                    productObj.appendTo(productElem);
                                }
                            }
                        },
                        ProductSerialPicker.createGridColumn({
                            productListGetter: () => state.productListLookupData,
                            purchaseOrderIdGetter: (rowData) => state.purchaseOrderId,
                            moduleName: 'MaterialExport',
                            quantityField: 'movement',
                            quantityObjGetter: () => movementObj,
                            requirePurchaseOrder: true
                        }),
                        {
                            field: 'movement',
                            headerText: 'Số lượng',
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
                                    movementElem = document.createElement('input');
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
                                    movementObj.appendTo(movementElem);
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
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], true);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], true);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], false);
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
                                const response = await services.createSecondaryData(state.id, args.data.productId, args.data.movement, StorageManager.getUserId(), args.data.productSerialIds ?? []);
                                await methods.populateSecondaryData(state.id);
                                secondaryGrid.refresh();
                                if (response.data.code === 200) {
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Lưu thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Lưu thất bại',
                                        text: response.data.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                        confirmButtonText: 'Thử lại'
                                    });
                                }
                            } catch (error) {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Đã xảy ra lỗi',
                                    text: error.response?.data?.message ?? 'Vui lòng thử lại.',
                                    confirmButtonText: 'Đồng ý'
                                });
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            try {
                                const response = await services.updateSecondaryData(args.data.id, args.data.productId, args.data.movement, StorageManager.getUserId(), args.data.productSerialIds ?? []);
                                await methods.populateSecondaryData(state.id);
                                secondaryGrid.refresh();
                                if (response.data.code === 200) {
                                    Swal.fire({
                                        icon: 'success',
                                        title: 'Cập nhật thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Cập nhật thất bại',
                                        text: response.data.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                        confirmButtonText: 'Thử lại'
                                    });
                                }
                            } catch (error) {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Đã xảy ra lỗi',
                                    text: error.response?.data?.message ?? 'Vui lòng thử lại.',
                                    confirmButtonText: 'Đồng ý'
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
                                        title: 'Xóa thành công',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                } else {
                                    Swal.fire({
                                        icon: 'error',
                                        title: 'Xóa thất bại',
                                        text: response.data.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                        confirmButtonText: 'Thử lại'
                                    });
                                }
                            } catch (error) {
                                Swal.fire({
                                    icon: 'error',
                                    title: 'Đã xảy ra lỗi',
                                    text: error.response?.data?.message ?? 'Vui lòng thử lại.',
                                    confirmButtonText: 'Đồng ý'
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
            MaterialExportDateRef,
            purchaseOrderIdRef,
            statusRef,
            customerIdRef,
            numberRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');







