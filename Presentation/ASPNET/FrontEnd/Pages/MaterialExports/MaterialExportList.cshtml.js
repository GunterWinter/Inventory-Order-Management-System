const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            warehouseListLookupData: [],
            customerListLookupData: [],
            MaterialExportStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            MaterialExportDate: '',
            description: '',
            warehouseId: null,
            customerId: null,
            status: null,
            errors: {
                MaterialExportDate: '',
                warehouseId: '',
                customerId: '',
                status: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            isViewMode: false,
            totalMovementFormatted: '0'
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const MaterialExportDateRef = Vue.ref(null);
        const warehouseIdRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const customerIdRef = Vue.ref(null);
        const numberRef = Vue.ref(null);

        const validateForm = function () {
            state.errors.MaterialExportDate = '';
            state.errors.warehouseId = '';
            state.errors.customerId = '';
            state.errors.status = '';

            let isValid = true;

            if (!state.MaterialExportDate) {
                state.errors.MaterialExportDate = 'Ngày xuất là bắt buộc.';
                isValid = false;
            }
            if (!state.warehouseId) {
                state.errors.warehouseId = 'Kho là bắt buộc.';
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
            state.warehouseId = null;
            state.customerId = null;
            state.status = null;
            state.isViewMode = false;
            state.errors = {
                MaterialExportDate: '',
                warehouseId: '',
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

        const WarehouseListLookup = {
            obj: null,
            create: () => {
                if (state.warehouseListLookupData && Array.isArray(state.warehouseListLookupData)) {
                    WarehouseListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.warehouseListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn Kho',
                        allowFiltering: true,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'contains', e.text, true);
                            }
                            e.updateData(state.warehouseListLookupData, query);
                        },
                        change: (e) => {
                            state.warehouseId = e.value;
                        }
                    });
                    WarehouseListLookup.obj.appendTo(warehouseIdRef.value);
                }
            },
            refresh: () => {
                if (WarehouseListLookup.obj) {
                    WarehouseListLookup.obj.value = state.warehouseId;
                }
            }
        };

        Vue.watch(
            () => state.warehouseId,
            async (newVal, oldVal) => {
                if (oldVal && newVal !== oldVal && state.secondaryData.length > 0) {
                    state.warehouseId = oldVal;
                    WarehouseListLookup.obj.value = oldVal;
                    Swal.fire({
                        icon: 'warning',
                        title: 'Warehouse cannot be changed',
                        text: 'Remove all material export lines before changing the warehouse.'
                    });
                    return;
                }
                WarehouseListLookup.refresh();
                state.errors.warehouseId = '';
                if (newVal !== oldVal) {
                    await methods.populateProductListLookupData();
                }
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

                StatusDropdownHelper.applyToDropdown(
                    statusListLookup.obj,
                    state.MaterialExportStatusListLookupData,
                    newVal
                );
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
            createMainData: async (MaterialExportDate, description, status, warehouseId, customerId, createdById) => {
                try {
                    const response = await AxiosManager.post('/MaterialExport/CreateMaterialExport', {
                        MaterialExportDate, description, status, warehouseId, customerId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, MaterialExportDate, description, status, warehouseId, customerId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/MaterialExport/UpdateMaterialExport', {
                        id, MaterialExportDate, description, status, warehouseId, customerId, updatedById
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
            getWarehouseListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Warehouse/GetWarehouseList', {});
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
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    MaterialExportDate: DateFormatManager.parseBusinessDate(item.materialExportDate),
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data
                    ?.filter(warehouse => warehouse.systemWarehouse === false) ?? [];
            },
            populateCustomerListLookupData: async () => {
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
                        totalCost: (item.costAllocations ?? []).length
                            ? item.costAllocations.reduce((sum, allocation) => sum + Number(allocation.total ?? 0), 0)
                            : null,
                        costStatus: (item.costAllocations ?? []).length ? 'Đã chốt' : 'Chưa chốt',
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                    }));
                    methods.refreshSummary();
                } catch (error) {
                    state.secondaryData = [];
                }
            },
            populateProductListLookupData: async () => {
                if (state.warehouseId) {
                    try {
                        const currentDocument = state.id ? `&materialExportId=${encodeURIComponent(state.id)}` : '';
                        const response = await AxiosManager.get(
                            `/MaterialExport/GetWarehouseProductStock?warehouseId=${encodeURIComponent(state.warehouseId)}${currentDocument}`,
                            {});
                        state.productListLookupData = (response?.data?.content?.data ?? []).map(item => ({
                            id: item.productId,
                            name: item.productName,
                            referenceCode: item.referenceCode,
                            physical: true,
                            serialTrackingMode: item.serialTrackingMode ?? 0,
                            stockQuantity: item.stockQuantity ?? 0,
                        }));
                    } catch (error) {
                        state.productListLookupData = [];
                    }
                } else {
                    state.productListLookupData = [];
                }
            },
            refreshSummary: () => {
                const totalMovement = state.secondaryData.reduce((sum, record) => sum + (record.movement ?? 0), 0);
                state.totalMovementFormatted = NumberFormatManager.formatToLocale(totalMovement);
            },

            onMainModalHidden: () => {
                state.errors.MaterialExportDate = '';
                state.errors.warehouseId = '';
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

                const response = state.id === ''
                    ? await services.createMainData(state.MaterialExportDate, state.description, state.status, state.warehouseId, state.customerId, StorageManager.getUserId())
                    : state.deleteMode
                        ? await services.deleteMainData(state.id, StorageManager.getUserId())
                        : await services.updateMainData(state.id, state.MaterialExportDate, state.description, state.status, state.warehouseId, state.customerId, StorageManager.getUserId());

                return { isValid, response };
            },
        };

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    if (secondaryGrid.obj?.isEdit) {
                        secondaryGrid.obj.endEdit();
                        await new Promise(resolve => setTimeout(resolve, 150));
                    }
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
                            state.status = String(response?.data?.content?.data.status ?? state.status);
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
            quickAddCustomer: async () => {
                if (typeof QuickAddHelper === 'undefined') {
                    Swal.fire({ icon: 'error', title: 'Quick Add is unavailable' });
                    return null;
                }
                return await QuickAddHelper.complexQuickAddCustomer({
                    dropdownObj: CustomerListLookup.obj,
                    refreshLookup: methods.populateCustomerListLookupData,
                    refreshLookups: [
                        methods.populateWarehouseListLookupData,
                        methods.populateProductListLookupData
                    ],
                    state,
                    stateKey: 'customerId',
                    lookupKey: 'customerListLookupData'
                });
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['MaterialExports']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);

                await methods.populateWarehouseListLookupData();
                WarehouseListLookup.create();
                await methods.populateCustomerListLookupData();
                CustomerListLookup.create();
                await methods.populateMaterialExportStatusListLookupData();
                statusListLookup.create();
                MaterialExportDatePicker.create();
                numberText.create();

                await methods.populateProductListLookupData();
                await secondaryGrid.create(state.secondaryData);

            } catch (e) {
                console.error('page init error:', e);
                Swal.fire({
                    icon: 'error',
                    title: 'Page initialization failed',
                    text: e?.response?.data?.message ?? e?.message ?? 'Material Export could not be loaded.'
                });
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
                        { field: 'MaterialExportDate', headerText: 'Delivery Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 150, minWidth: 150 },
                        { field: 'customerName', headerText: 'Customer', width: 150, minWidth: 150 },
                        { field: 'statusName', headerText: 'Status', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'View', tooltipText: 'View', prefixIcon: 'e-eye', id: 'ViewCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'Print PDF', tooltipText: 'Print PDF', id: 'PrintPDFCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        const hasSelection = mainGrid.obj.getSelectedRecords().length === 1;
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], hasSelection);
                        mainGrid.obj.autoFitColumns(['number', 'MaterialExportDate', 'warehouseName', 'customerName', 'statusName', 'createdAtUtc']);
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
                            state.mainTitle = 'Xem phi\u1ebfu Xu\u1ea5t v\u1eadt t\u01b0';
                            state.id = selectedRecord.id ?? '';
                            state.number = selectedRecord.number ?? '';
                            state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                            state.description = selectedRecord.description ?? '';
                            state.warehouseId = selectedRecord.warehouseId ?? '';
                            state.customerId = selectedRecord.customerId ?? '';
                            state.status = String(selectedRecord.status ?? '');
                            await methods.populateProductListLookupData();
                            await methods.populateSecondaryData(selectedRecord.id);
                            secondaryGrid.refresh();
                            state.showComplexDiv = true;
                            mainModal.obj.show();
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
                            state.isViewMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Sửa phiếu Xuất vật tư';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.warehouseId = selectedRecord.warehouseId ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
                                state.status = String(selectedRecord.status ?? '');
                                await methods.populateProductListLookupData();
                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                state.showComplexDiv = true;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'ViewCustom') {
                            state.deleteMode = false;
                            state.isViewMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Xem phiếu Xuất vật tư';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.warehouseId = selectedRecord.warehouseId ?? '';
                                state.customerId = selectedRecord.customerId ?? '';
                                state.status = String(selectedRecord.status ?? '');
                                await methods.populateProductListLookupData();
                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                state.showComplexDiv = true;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            const result = await Swal.fire({ icon: 'warning', title: 'Xác nhận xóa', text: `Bạn có chắc chắn muốn xóa ${selected.length} phiếu xuất vật tư đã chọn không?`, showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy', heightAuto: false });
                            if (!result.isConfirmed) return;
                            for (const record of selected) await services.deleteMainData(record.id, StorageManager.getUserId());
                            await methods.populateMainData();
                            mainGrid.refresh();
                            Swal.fire({ icon: 'success', title: 'Đã xóa', text: `Đã xóa ${selected.length} phiếu xuất vật tư.`, heightAuto: false });
                            return;
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Xóa phiếu Xuất vật tư?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.MaterialExportDate = selectedRecord.MaterialExportDate ? DateFormatManager.parseBusinessDate(selectedRecord.MaterialExportDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.warehouseId = selectedRecord.warehouseId ?? '';
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
                                window.open('/MaterialExports/MaterialExportPdf?id=' + encodeURIComponent(selectedRecord.id ?? ''), '_blank', 'noopener');
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

        let productElem = null;
        let productObj = null;
        let activeProductPreviewPollId = null;
        let movementElem = null;
        let movementObj = null;
        const syncMaterialExportBatchRow = (rowData, editorElement, values, rowIndex = -1, rowUid = null) => {
            if (!rowData || !values) return -1;
            if (!secondaryGrid.obj || typeof GridInteractionManager === 'undefined') {
                Object.assign(rowData, values);
                return -1;
            }
            return GridInteractionManager.syncBatchRowValues(secondaryGrid.obj, {
                rowData,
                editorElement,
                rowIndex,
                rowUid,
                values,
                formatters: {
                    productReferenceCode: value => value ?? '',
                    productSerialNumbers: value => value ?? '',
                    movement: value => NumberFormatManager.formatToLocale(value ?? 0),
                    remainingDisplay: value => NumberFormatManager.formatToLocale(value ?? 0)
                }
            });
        };
        const updateEditorRowCell = (element, field, value) => {
            const row = element?.closest?.('tr');
            const rowIndex = row && secondaryGrid.obj ? secondaryGrid.obj.getRows().indexOf(row) : -1;
            if (rowIndex >= 0) {
                const cellIndex = secondaryGrid.obj.getColumnIndexByField(field);
                const cell = row.cells?.[cellIndex] ?? secondaryGrid.obj.getCellFromIndex(rowIndex, cellIndex);
                if (cell) cell.textContent = NumberFormatManager.formatToLocale(value);
                try {
                    secondaryGrid.obj.updateCell(rowIndex, field, value);
                } catch (error) {
                    // Syncfusion can reject updateCell for a read-only cell while another
                    // cell is in batch edit; rowData and the rendered preview are already synced.
                }
            }
        };
        const syncActiveProductPreview = () => {
            const editedCell = secondaryGrid.obj?.element?.querySelector?.('td.e-editedbatchcell');
            const editor = editedCell?.querySelector?.('.e-dropdownlist')?.ej2_instances?.[0];
            const selectedProduct = state.productListLookupData.find(item => item.id === editor?.value);
            const row = editedCell?.closest?.('tr');
            if (!selectedProduct || !row) return;

            const inventoryIndex = secondaryGrid.obj.getColumnIndexByField('remainingDisplay');
            const referenceIndex = secondaryGrid.obj.getColumnIndexByField('productReferenceCode');
            if (row.cells?.[inventoryIndex]) {
                row.cells[inventoryIndex].textContent = NumberFormatManager.formatToLocale(selectedProduct.stockQuantity ?? 0);
            }
            if (row.cells?.[referenceIndex]) {
                row.cells[referenceIndex].textContent = selectedProduct.referenceCode ?? '';
            }
        };
        const editNewMaterialExportProductCell = (temporaryId, attempt = 0) => {
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
                requestAnimationFrame(() => editNewMaterialExportProductCell(temporaryId, attempt + 1));
            }
        };

        const secondaryGrid = {
            obj: null,
            create: async (dataSource) => {
                const allowEdit = !state.isViewMode && String(state.status ?? '0') === '0';
                secondaryGrid.obj = new ej.grids.Grid({
                    height: 400,
                    dataSource: dataSource,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
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
                            headerText: 'Reference Code',
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
                                    const applyProductSelection = (productId) => {
                                        if (!productId) return;
                                        const selectedProduct = state.productListLookupData.find(x => x.id === productId);
                                        if (!selectedProduct) return;
                                        const productChanged = args.rowData.productId !== productId;
                                        if (args.rowData.productId === productId
                                            && Number(args.rowData.remainingDisplay) === Number(selectedProduct.stockQuantity ?? 0)) return;
                                        const p = selectedProduct;
                                        const values = {
                                            productId,
                                            productSerialIds: productChanged
                                                ? []
                                                : [...(args.rowData.productSerialIds ?? [])],
                                            productSerialNumbers: productChanged
                                                ? ''
                                                : (args.rowData.productSerialNumbers ?? ''),
                                            productReferenceCode: p ? p.referenceCode || '' : '',
                                            remainingDisplay: Number(p?.stockQuantity ?? 0),
                                            movement: productChanged ? 1 : Number(args.rowData.movement ?? 1)
                                        };
                                        syncMaterialExportBatchRow(args.rowData, args.element, values);
                                        const refCell = args.element.closest('tr').querySelector('input[name="productReferenceCode"]');
                                        if (refCell) {
                                            refCell.value = values.productReferenceCode;
                                        }
                                        updateEditorRowCell(args.element, 'remainingDisplay', values.remainingDisplay);
                                        if (movementObj) {
                                            movementObj.value = values.movement;
                                            movementObj.dataBind?.();
                                        }
                                    };
                                    productObj = new ej.dropdowns.DropDownList({
                                        dataSource: state.productListLookupData,
                                        fields: { value: 'id', text: 'name' },
                                        value: args.rowData.productId,
                                        allowFiltering: true,
                                        select: function (e) {
                                            applyProductSelection(e.itemData?.id ?? e.itemData?.value ?? e.value);
                                        },
                                        change: function (e) {
                                            applyProductSelection(e.value);
                                        },
                                        placeholder: 'Chọn hàng hóa',
                                        floatLabelType: 'Never'
                                    });

                                    productObj.appendTo(productElem);
                                }
                            }
                        },
                        ProductSerialPicker.createGridColumn({
                            headerText: 'Serial Numbers',
                            productListGetter: () => state.productListLookupData,
                            warehouseIdGetter: () => state.warehouseId,
                            moduleName: 'MaterialExport',
                            moduleIdGetter: () => state.id,
                            quantityField: 'movement',
                            quantityObjGetter: () => movementObj,
                            gridGetter: () => secondaryGrid.obj,
                            requireWarehouse: true,
                            allowEmptySelection: false,
                            onSelectionApplied: ({ rowData, editorElement, rowIndex, rowUid, serialIds, serialNumbers, quantity }) => {
                                syncMaterialExportBatchRow(rowData, editorElement, {
                                    productSerialIds: [...serialIds],
                                    productSerialNumbers: serialNumbers,
                                    movement: quantity
                                }, rowIndex, rowUid);
                            }
                        }),
                        {
                            field: 'movement',
                            headerText: 'Quantity',
                            width: 150,
                            validationRules: {
                                required: true,
                                custom: [(args) => {
                                    return args['value'] > 0;
                                }, 'Must be a positive number and not zero']
                            },
                            type: 'number', format: 'N2', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    movementElem = document.createElement('input');
                                    return movementElem;
                                },
                                read: () => {
                                    return NumberFormatManager.readNumericTextBoxValue(movementObj);
                                },
                                destroy: function () {
                                    movementObj?.destroy();
                                    movementObj = null;
                                },
                                write: function (args) {
                                    const product = state.productListLookupData.find(x => x.id === args.rowData.productId);
                                    const serialTracked = product?.physical === true && Number(product?.serialTrackingMode ?? 0) > 0;
                                    movementObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.movement ?? 0,
                                        numericKind: serialTracked ? 'integer' : 'decimal',
                                        format: serialTracked ? 'n0' : 'n6',
                                        decimals: serialTracked ? 0 : 6,
                                        readonly: serialTracked,
                                        validateDecimalOnType: serialTracked,
                                    });
                                    movementObj.appendTo(movementElem);
                                }
                            }
                        },
                        {
                            field: 'remainingDisplay',
                            headerText: 'Inventory',
                            width: 120,
                            allowEditing: false,
                            type: 'number', format: 'N2', textAlign: 'Right',
                            valueAccessor: (field, data, column) => {
                                const product = state.productListLookupData.find(p => p.id === data.productId);
                                if (product) return Number(product.stockQuantity ?? 0);
                                const previewQuantity = Number(data[field]);
                                return Number.isFinite(previewQuantity) ? previewQuantity : '';
                            }
                        },
                        {
                            field: 'unitCost',
                            headerText: 'Giá vốn bình quân',
                            width: 160,
                            allowEditing: false,
                            textAlign: 'Right',
                            valueAccessor: (_field, data) => data.unitCost == null ? '' : NumberFormatManager.formatToLocale(data.unitCost, 0, 6)
                        },
                        {
                            field: 'totalCost',
                            headerText: 'Tổng giá vốn',
                            width: 160,
                            allowEditing: false,
                            textAlign: 'Right',
                            valueAccessor: (_field, data) => data.totalCost == null ? '' : NumberFormatManager.formatToLocale(data.totalCost, 0, 6)
                        },
                        {
                            field: 'costStatus',
                            headerText: 'Trạng thái giá vốn',
                            width: 130,
                            allowEditing: false,
                            valueAccessor: (_field, data) => (data.costAllocations ?? []).length ? 'Đã chốt' : 'Chưa chốt'
                        },
                        {
                            headerText: 'Chi tiết giá vốn',
                            width: 140,
                            allowEditing: false,
                            template: '<button type="button" class="btn btn-outline-info btn-sm cost-layer-details">Chi tiết</button>'
                        },
                    ],
                    toolbar: allowEdit ? [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
                    ] : ['ExcelExport'],
                    beforeDataBound: () => { },
                    dataBound: function () { },
                    recordClick: args => {
                        if (!args.target?.closest?.('.cost-layer-details')) return;
                        InventoryCostLayerViewer.show(args.rowData?.costAllocations ?? []);
                    },
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
                        if (args.item.id === 'SecondaryGrid_add') {
                            args.cancel = true;
                            const temporaryId = `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                            secondaryGrid.obj.addRecord({
                                id: temporaryId,
                                productId: null,
                                productReferenceCode: '',
                                productSerialIds: [],
                                productSerialNumbers: '',
                                movement: 1,
                                remainingDisplay: 0
                            }, 0);
                            requestAnimationFrame(() => editNewMaterialExportProductCell(temporaryId));
                            return;
                        }
                        if (args.item.id === 'SecondaryGrid_excelexport') {
                            secondaryGrid.obj.excelExport();
                        }
                    },
                    cellSave: (args) => {
                        const field = args.columnName ?? args.column?.field;
                        if (field !== 'productId') return;
                        const product = state.productListLookupData.find(item => item.id === args.value);
                        syncMaterialExportBatchRow(args.rowData, args.cell, {
                            productId: args.value,
                            productReferenceCode: product?.referenceCode ?? '',
                            remainingDisplay: Number(product?.stockQuantity ?? 0),
                            productSerialIds: Array.isArray(args.rowData.productSerialIds)
                                ? [...args.rowData.productSerialIds]
                                : [],
                            productSerialNumbers: args.rowData.productSerialNumbers ?? '',
                            movement: Number(args.rowData.movement ?? 1)
                        });
                    },
                    actionBegin: (args) => {
                        if (args.requestType === 'save' && args.managedBatch === true) {
                            if (!ProductSerialPicker.validateGridSave(args, {
                                productListGetter: () => state.productListLookupData,
                                quantityField: 'movement',
                                allowEmptySelection: false
                            })) {
                                return;
                            }
                            // Check against actual inventory stock
                            const product = state.productListLookupData.find(p => p.id === args.data.productId);
                            if (product) {
                                const otherQuantity = (secondaryGrid.obj.dataSource ?? [])
                                    .filter(row => row.id !== args.data.id && row.productId === args.data.productId)
                                    .reduce((sum, row) => sum + Number(row.movement ?? 0), 0);
                                const requestedQuantity = otherQuantity + Number(args.data.movement ?? 0);
                                if (requestedQuantity > product.stockQuantity) {
                                    args.cancel = true;
                                    Swal.fire({
                                        icon: 'warning',
                                        title: 'Quantity exceeds stock',
                                        text: `Tổng số lượng ${requestedQuantity} vượt quá số lượng tồn kho ${product.stockQuantity}.`
                                    });
                                    return;
                                }
                            }
                        }
                    },
                    actionComplete: async (args) => {
                        if (args.requestType === 'save' && args.action === 'add') {
                            try {
                                const response = await services.createSecondaryData(
                                    state.id,
                                    args.data.productId,
                                    args.data.movement,
                                    StorageManager.getUserId(),
                                    args.data.productSerialIds ?? []);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to create material export item.');
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
                                throw error;
                            }
                        }
                        if (args.requestType === 'save' && args.action === 'edit') {
                            try {
                                const response = await services.updateSecondaryData(
                                    args.data.id,
                                    args.data.productId,
                                    args.data.movement,
                                    StorageManager.getUserId(),
                                    args.data.productSerialIds ?? []);
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to update material export item.');
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
                                throw error;
                            }
                        }
                        if (args.requestType === 'delete') {
                            try {
                                const response = await services.deleteSecondaryData(args.data[0].id, StorageManager.getUserId());
                                if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Unable to delete material export item.');
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
                                throw error;
                            }
                        }
                        methods.refreshSummary();
                    }
                });
                secondaryGrid.obj.appendTo(secondaryGridRef.value);
                if (!activeProductPreviewPollId) {
                    activeProductPreviewPollId = setInterval(syncActiveProductPreview, 50);
                }
            },
            refresh: () => {
                const allowEdit = !state.isViewMode && String(state.status ?? '') === '0';
                secondaryGrid.obj.setProperties({
                    dataSource: state.secondaryData,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
                    toolbar: allowEdit ? ['ExcelExport', { type: 'Separator' }, 'Add', 'Edit', 'Delete', 'Update', 'Cancel'] : ['ExcelExport']
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

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', methods.onMainModalHidden);
            if (activeProductPreviewPollId) clearInterval(activeProductPreviewPollId);
        });

        return {
            mainGridRef,
            mainModalRef,
            secondaryGridRef,
            MaterialExportDateRef,
            warehouseIdRef,
            statusRef,
            customerIdRef,
            numberRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');
