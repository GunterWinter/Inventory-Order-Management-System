const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            negativeAdjustmentStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            warehouseListLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            adjustmentDate: '',
            description: '',
            status: null,
            errors: {
                adjustmentDate: '',
                status: '',
                description: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            isViewMode: false,
            totalMovementFormatted: '0'
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const adjustmentDateRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const numberRef = Vue.ref(null);

        const validateForm = function () {
            state.errors.adjustmentDate = '';
            state.errors.status = '';

            let isValid = true;

            if (!state.adjustmentDate) {
                state.errors.adjustmentDate = 'Adjustment date is required.';
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
            state.adjustmentDate = '';
            state.description = '';
            state.status = null;
            state.errors = {
                adjustmentDate: '',
                status: '',
                description: ''
            };
            state.secondaryData = [];
        };

        const adjustmentDatePicker = {
            obj: null,
            create: () => {
                adjustmentDatePicker.obj = new ej.calendars.DatePicker({
                    placeholder: 'Select Date',
                    format: 'yyyy-MM-dd',
                    locale: DateFormatManager.syncfusionDateLocale,
                    value: state.adjustmentDate ? DateFormatManager.parseBusinessDate(state.adjustmentDate) : null,
                    change: (e) => {
                        state.adjustmentDate = e.value;
                    }
                });
                adjustmentDatePicker.obj.appendTo(adjustmentDateRef.value);
            },
            refresh: () => {
                if (adjustmentDatePicker.obj) {
                    adjustmentDatePicker.obj.value = state.adjustmentDate ? DateFormatManager.parseBusinessDate(state.adjustmentDate) : null;
                }
            }
        };

        Vue.watch(
            () => state.adjustmentDate,
            (newVal, oldVal) => {
                adjustmentDatePicker.refresh();
                state.errors.adjustmentDate = '';
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

        const negativeAdjustmentStatusListLookup = {
            obj: null,
            create: () => {
                if (state.negativeAdjustmentStatusListLookupData && Array.isArray(state.negativeAdjustmentStatusListLookupData)) {
                    negativeAdjustmentStatusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.negativeAdjustmentStatusListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select Status',
                        allowFiltering: false,
                        change: (e) => {
                            state.status = e.value;
                        }
                    });
                    negativeAdjustmentStatusListLookup.obj.appendTo(statusRef.value);
                }
            },
            refresh: () => {
                if (negativeAdjustmentStatusListLookup.obj) {
                    negativeAdjustmentStatusListLookup.obj.value = state.status
                }
            },
        };

        Vue.watch(
            () => state.status,
            (newVal, oldVal) => {
                negativeAdjustmentStatusListLookup.refresh();
                state.errors.status = '';

                // Filter Draft out of dropdown when status > 0
                StatusDropdownHelper.applyToDropdown(
                    negativeAdjustmentStatusListLookup.obj,
                    state.negativeAdjustmentStatusListLookupData,
                    newVal
                );
            
            
            }
        );

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/NegativeAdjustment/GetNegativeAdjustmentList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (adjustmentDate, description, status, createdById) => {
                try {
                    const response = await AxiosManager.post('/NegativeAdjustment/CreateNegativeAdjustment', {
                        adjustmentDate, description, status, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, adjustmentDate, description, status, updatedById) => {
                try {
                    const response = await AxiosManager.post('/NegativeAdjustment/UpdateNegativeAdjustment', {
                        id, adjustmentDate, description, status, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/NegativeAdjustment/DeleteNegativeAdjustment', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getNegativeAdjustmentStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/NegativeAdjustment/GetNegativeAdjustmentStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (moduleId) => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/NegativeAdjustmentGetInvenTransList?moduleId=' + moduleId, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (moduleId, warehouseId, productId, movement, createdById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/NegativeAdjustmentCreateInvenTrans', {
                        moduleId, warehouseId, productId, movement, createdById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, warehouseId, productId, movement, updatedById, productSerialIds) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/NegativeAdjustmentUpdateInvenTrans', {
                        id, warehouseId, productId, movement, updatedById, productSerialIds
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/NegativeAdjustmentDeleteInvenTrans', {
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
                    adjustmentDate: DateFormatManager.parseBusinessDate(item.adjustmentDate),
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
            populateNegativeAdjustmentStatusListLookupData: async () => {
                const response = await services.getNegativeAdjustmentStatusListLookupData();
                state.negativeAdjustmentStatusListLookupData = response?.data?.content?.data;
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
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data.filter(warehouse => warehouse.systemWarehouse === false) || [];
            },
            populateSecondaryData: async (negativeAdjustmentId) => {
                try {
                    const response = await services.getSecondaryData(negativeAdjustmentId);
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
                state.errors.adjustmentDate = '';
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
                        ? await services.createMainData(state.adjustmentDate, state.description, state.status, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.adjustmentDate, state.description, state.status, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Edit Negative Adjustment';
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
                await SecurityManager.authorizePage(['NegativeAdjustments']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);
                await methods.populateNegativeAdjustmentStatusListLookupData();
                numberText.create();
                adjustmentDatePicker.create();
                negativeAdjustmentStatusListLookup.create();

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
                        { field: 'adjustmentDate', headerText: 'Adjustment Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'statusName', headerText: 'Status', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Xem', tooltipText: 'Xem chi ti\u1ebft', prefixIcon: 'e-eye', id: 'ViewCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'Print PDF', tooltipText: 'Print PDF', id: 'PrintPDFCustom' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'ViewCustom', 'DeleteCustom', 'PrintPDFCustom'], false);
                        mainGrid.obj.autoFitColumns(['number', 'adjustmentDate', 'statusName', 'createdAtUtc']);
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
                            state.mainTitle = 'Xem \u0111i\u1ec1u ch\u1ec9nh gi\u1ea3m';
                            state.id = selectedRecord.id ?? '';
                            state.number = selectedRecord.number ?? '';
                            state.adjustmentDate = selectedRecord.adjustmentDate ? DateFormatManager.parseBusinessDate(selectedRecord.adjustmentDate) : null;
                            state.description = selectedRecord.description ?? '';
                            state.status = String(selectedRecord.status ?? '');
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
                            state.isViewMode = false;
                            state.mainTitle = 'Add Negative Adjustment';
                            resetFormState();
                            state.showComplexDiv = false;
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            state.isViewMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Negative Adjustment';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.adjustmentDate = selectedRecord.adjustmentDate ? DateFormatManager.parseBusinessDate(selectedRecord.adjustmentDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.status = String(selectedRecord.status ?? '');
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
                                state.mainTitle = 'Xem \u0111i\u1ec1u ch\u1ec9nh gi\u1ea3m';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.adjustmentDate = selectedRecord.adjustmentDate ? DateFormatManager.parseBusinessDate(selectedRecord.adjustmentDate) : null;
                                state.description = selectedRecord.description ?? '';
                                state.status = String(selectedRecord.status ?? '');
                                await methods.populateSecondaryData(selectedRecord.id);
                                secondaryGrid.refresh();
                                state.showComplexDiv = true;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords(); if (!selected.length) return;
                            const result = await Swal.fire({ icon: 'warning', title: 'Xác nhận xóa', text: `Bạn có chắc chắn muốn xóa ${selected.length} phiếu điều chỉnh đã chọn không?`, showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy', heightAuto: false }); if (!result.isConfirmed) return;
                            for (const record of selected) await services.deleteMainData(record.id, StorageManager.getUserId()); await methods.populateMainData(); mainGrid.refresh(); Swal.fire({ icon: 'success', title: 'Đã xóa', text: `Đã xóa ${selected.length} phiếu điều chỉnh.`, heightAuto: false }); return;
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Delete Negative Adjustment?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.adjustmentDate = selectedRecord.adjustmentDate ? DateFormatManager.parseBusinessDate(selectedRecord.adjustmentDate) : null;
                                state.description = selectedRecord.description ?? '';
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
                                window.open('/NegativeAdjustments/NegativeAdjustmentPdf?id=' + (selectedRecord.id ?? ''), '_blank');
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
                    editSettings: { allowEditing: true, allowAdding: true, allowDeleting: true, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: true },
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
                            moduleName: 'NegativeAdjustment',
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
            adjustmentDateRef,
            statusRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');








