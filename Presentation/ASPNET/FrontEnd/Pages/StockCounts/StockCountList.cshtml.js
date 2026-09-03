const App = {
    setup() {
        const stockCountStatus = Object.freeze({
            draft: '0',
            cancelled: '1',
            confirmed: '2',
            archived: '3'
        });

        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            isViewMode: false,
            warehouseListLookupData: [],
            stockCountStatusListLookupData: [],
            secondaryData: [],
            productListLookupData: [],
            inventoryStockLookupData: [],
            mainTitle: null,
            id: '',
            number: '',
            countDate: '',
            description: '',
            warehouseId: null,
            status: stockCountStatus.draft,
            originalStatus: null,
            isHeaderReadOnly: false,
            canEditStatus: true,
            canEditLines: false,
            canSubmit: true,
            errors: {
                countDate: '',
                warehouseId: '',
                status: ''
            },
            showComplexDiv: false,
            isSubmitting: false,
            totalMovementFormatted: '0'
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const secondaryGridRef = Vue.ref(null);
        const countDateRef = Vue.ref(null);
        const warehouseIdRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const numberRef = Vue.ref(null);

        const normalizeStatus = (value) => value === null || value === undefined ? '' : String(value);
        const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));

        const getAllowedStatusData = () => {
            const currentStatus = normalizeStatus(state.originalStatus ?? state.status);
            let allowedStatuses;

            if (state.isViewMode || state.deleteMode) {
                allowedStatuses = [currentStatus];
            } else if (!state.id) {
                allowedStatuses = [stockCountStatus.draft];
            } else if (currentStatus === stockCountStatus.draft) {
                allowedStatuses = [stockCountStatus.draft, stockCountStatus.confirmed];
            } else if (currentStatus === stockCountStatus.confirmed) {
                allowedStatuses = [stockCountStatus.draft, stockCountStatus.confirmed, stockCountStatus.cancelled, stockCountStatus.archived];
            } else if (currentStatus === stockCountStatus.archived) {
                allowedStatuses = [stockCountStatus.archived, stockCountStatus.confirmed];
            } else {
                allowedStatuses = [currentStatus];
            }

            return (state.stockCountStatusListLookupData ?? [])
                .filter(item => allowedStatuses.includes(normalizeStatus(item.id)));
        };

        const refreshEditorPermissions = () => {
            const originalStatus = normalizeStatus(state.originalStatus ?? state.status);
            const isExisting = Boolean(state.id);
            const isDraft = !isExisting || originalStatus === stockCountStatus.draft;
            const isConfirmed = isExisting && originalStatus === stockCountStatus.confirmed;
            const isArchived = isExisting && originalStatus === stockCountStatus.archived;
            const isInteractive = !state.isViewMode && !state.deleteMode;

            state.isHeaderReadOnly = !isInteractive || (isExisting && !isDraft);
            state.canEditStatus = isInteractive && (isDraft || isConfirmed || isArchived);
            state.canEditLines = isInteractive && isExisting && isDraft;
            state.canSubmit = isInteractive && (isDraft || isConfirmed || isArchived);

            if (countDatePicker.obj) {
                countDatePicker.obj.enabled = !state.isHeaderReadOnly;
                countDatePicker.obj.dataBind();
            }
            if (warehouseListLookup.obj) {
                warehouseListLookup.obj.enabled = !state.isHeaderReadOnly;
                warehouseListLookup.obj.dataBind();
            }
            if (statusListLookup.obj) {
                statusListLookup.refresh();
            }
            if (secondaryGrid.obj) {
                secondaryGrid.refresh();
            }
        };

        const validateForm = function () {
            state.errors.countDate = '';
            state.errors.warehouseId = '';
            state.errors.status = '';

            let isValid = true;

            if (!state.countDate) {
                state.errors.countDate = 'Ngày kiểm kê là bắt buộc.';
                isValid = false;
            }
            if (!state.warehouseId) {
                state.errors.warehouseId = 'Kho là bắt buộc.';
                isValid = false;
            }
            if (!state.status) {
                state.errors.status = 'Trạng thái là bắt buộc.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.countDate = '';
            state.description = '';
            state.warehouseId = null;
            state.status = stockCountStatus.draft;
            state.originalStatus = null;
            state.isHeaderReadOnly = false;
            state.canEditStatus = true;
            state.canEditLines = false;
            state.canSubmit = true;
            state.errors = {
                countDate: '',
                warehouseId: '',
                status: ''
            };
            state.secondaryData = [];
        };

        const countDatePicker = {
            obj: null,
            create: () => {
                countDatePicker.obj = new ej.calendars.DatePicker({
                    placeholder: 'Chọn ngày kiểm kê',
                    format: 'yyyy-MM-dd',
                    locale: DateFormatManager.syncfusionDateLocale,
                    enabled: !state.isHeaderReadOnly,
                    value: state.countDate ? DateFormatManager.parseBusinessDate(state.countDate) : null,
                    change: (e) => {
                        state.countDate = e.value;
                    }
                });
                countDatePicker.obj.appendTo(countDateRef.value);
            },
            refresh: () => {
                if (countDatePicker.obj) {
                    countDatePicker.obj.value = state.countDate ? DateFormatManager.parseBusinessDate(state.countDate) : null;
                    countDatePicker.obj.enabled = !state.isHeaderReadOnly;
                    countDatePicker.obj.dataBind();
                }
            }
        };

        Vue.watch(
            () => state.countDate,
            (newVal, oldVal) => {
                countDatePicker.refresh();
                state.errors.countDate = '';
            }
        );

        const warehouseListLookup = {
            obj: null,
            create: () => {
                if (state.warehouseListLookupData && Array.isArray(state.warehouseListLookupData)) {
                    warehouseListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.warehouseListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn kho',
                        allowFiltering: true,
                        enabled: !state.isHeaderReadOnly,
                        filtering: (e) => {
                            e.preventDefaultAction = true;
                            let query = new ej.data.Query();
                            if (e.text !== '') {
                                query = query.where('name', 'startsWith', e.text, true);
                            }
                            e.updateData(state.warehouseListLookupData, query);
                        },
                        change: (e) => {
                            state.warehouseId = e.value;
                        }
                    });
                    warehouseListLookup.obj.appendTo(warehouseIdRef.value);
                }
            },
            refresh: () => {
                if (warehouseListLookup.obj) {
                    warehouseListLookup.obj.value = state.warehouseId;
                    warehouseListLookup.obj.dataSource = state.warehouseListLookupData;
                    warehouseListLookup.obj.enabled = !state.isHeaderReadOnly;
                    warehouseListLookup.obj.dataBind();
                }
            }
        };

        Vue.watch(
            () => state.warehouseId,
            (newVal, oldVal) => {
                warehouseListLookup.refresh();
                state.errors.warehouseId = '';
            }
        );

        const statusListLookup = {
            obj: null,
            create: () => {
                if (state.stockCountStatusListLookupData && Array.isArray(state.stockCountStatusListLookupData)) {
                    statusListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: getAllowedStatusData(),
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Chọn trạng thái',
                        allowFiltering: false,
                        enabled: state.canEditStatus,
                        change: (e) => {
                            state.status = e.value;
                        }
                    });
                    statusListLookup.obj.appendTo(statusRef.value);
                }
            },
            refresh: () => {
                if (statusListLookup.obj) {
                    statusListLookup.obj.setProperties({
                        dataSource: getAllowedStatusData(),
                        enabled: state.canEditStatus,
                        value: normalizeStatus(state.status)
                    });
                    statusListLookup.obj.dataBind();
                }
            }
        };

        Vue.watch(
            () => state.status,
            (newVal, oldVal) => {
                statusListLookup.refresh();
                state.errors.status = '';
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

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/StockCount/GetStockCountList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (countDate, description, status, warehouseId, createdById) => {
                try {
                    const response = await AxiosManager.post('/StockCount/CreateStockCount', {
                        countDate, description, status, warehouseId, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, countDate, description, status, warehouseId, updatedById) => {
                try {
                    const response = await AxiosManager.post('/StockCount/UpdateStockCount', {
                        id, countDate, description, status, warehouseId, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/StockCount/DeleteStockCount', {
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
            getStockCountStatusListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/StockCount/GetStockCountStatusList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getSecondaryData: async (moduleId) => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/StockCountGetInvenTransList?moduleId=' + moduleId, {});
                    const rows = response?.data?.content?.data ?? [];
                    rows.forEach(item => {
                        item.newSerials = item.pendingManufacturerSerialNumbersJson
                            ? (() => { try { const value = JSON.parse(item.pendingManufacturerSerialNumbersJson); return Array.isArray(value) ? value.map(serial => typeof serial === 'string' ? { manufacturerSerialNumber: serial } : serial) : []; } catch { return []; } })()
                            : [];
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createSecondaryData: async (moduleId, productId, qtySCCount, createdById, productSerialIds, unitCost, newSerials) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/StockCountCreateInvenTrans', {
                        moduleId, productId, qtySCCount, createdById, productSerialIds, unitCost, newSerials
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateSecondaryData: async (id, productId, qtySCCount, updatedById, productSerialIds, unitCost, newSerials) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/StockCountUpdateInvenTrans', {
                        id, productId, qtySCCount, updatedById, productSerialIds, unitCost, newSerials
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteSecondaryData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/InventoryTransaction/StockCountDeleteInvenTrans', {
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
            getInventoryStockLookupData: async () => AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}),
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    countDate: DateFormatManager.parseBusinessDate(item.countDate),
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data.filter(warehouse => warehouse.systemWarehouse === false) || [];
            },
            populateStockCountStatusListLookupData: async () => {
                const response = await services.getStockCountStatusListLookupData();
                state.stockCountStatusListLookupData = (response?.data?.content?.data ?? []).map(item => ({
                    ...item,
                    id: normalizeStatus(item.id),
                    name: window.UiLocalization?.translateText?.(item.name) ?? item.name
                }));
            },
            populateSecondaryData: async (stockCountId) => {
                try {
                    const response = await services.getSecondaryData(stockCountId);
                    state.secondaryData = response?.data?.content?.data.map(item => ({
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        qtySCDelta: Number(item.qtySCCount ?? 0) - Number(item.qtySCSys ?? 0)
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
                        numberName: `${product.number} - ${product.name}`
                    })) || [];
            },
            populateInventoryStockLookupData: async () => {
                const response = await services.getInventoryStockLookupData();
                state.inventoryStockLookupData = response?.data?.content?.data ?? [];
            },
            refreshSummary: () => {
                const totalMovement = state.secondaryData.reduce((sum, record) => sum + (record.qtySCDelta ?? 0), 0);
                state.totalMovementFormatted = NumberFormatManager.formatToLocale(totalMovement);
            },
            refreshMainToolbarActions: () => {
                if (!mainGrid.obj?.toolbarModule) return;

                const selectedRecords = mainGrid.obj.getSelectedRecords();
                const hasSingleSelection = selectedRecords.length === 1;
                const selectedStatus = hasSingleSelection ? normalizeStatus(selectedRecords[0].status) : '';
                const canEditSelection = hasSingleSelection
                    && [stockCountStatus.draft, stockCountStatus.confirmed, stockCountStatus.archived].includes(selectedStatus);
                const canDeleteSelection = selectedRecords.length > 0
                    && selectedRecords.every(record => normalizeStatus(record.status) === stockCountStatus.draft);

                mainGrid.obj.toolbarModule.enableItems(['EditCustom'], canEditSelection);
                mainGrid.obj.toolbarModule.enableItems(['DeleteCustom'], canDeleteSelection);
                mainGrid.obj.toolbarModule.enableItems(['ViewCustom', 'PrintPDFCustom'], hasSingleSelection);
            },
            openRecord: async (selectedRecord, viewMode) => {
                if (!selectedRecord) return;

                state.deleteMode = false;
                state.isViewMode = viewMode;
                state.id = selectedRecord.id ?? '';
                state.number = selectedRecord.number ?? '';
                state.countDate = selectedRecord.countDate
                    ? DateFormatManager.parseBusinessDate(selectedRecord.countDate)
                    : null;
                state.description = selectedRecord.description ?? '';
                state.warehouseId = selectedRecord.warehouseId ?? '';
                state.status = normalizeStatus(selectedRecord.status);
                state.originalStatus = state.status;

                if (viewMode) {
                    state.mainTitle = 'Xem phiếu kiểm kê';
                } else if ([stockCountStatus.confirmed, stockCountStatus.archived].includes(state.originalStatus)) {
                    state.mainTitle = 'Cập nhật trạng thái kiểm kê';
                } else {
                    state.mainTitle = 'Sửa phiếu kiểm kê';
                }

                await methods.populateSecondaryData(state.id);
                state.showComplexDiv = true;
                refreshEditorPermissions();
                mainModal.obj.show();
            },
            submitMainData: async () => {
                const originalStatus = normalizeStatus(state.originalStatus ?? state.status);
                const requestedStatus = normalizeStatus(state.status);

                if (!state.canSubmit) {
                    return { isValid: false, response: null };
                }
                if (state.id && originalStatus === stockCountStatus.confirmed
                    && ![stockCountStatus.draft, stockCountStatus.cancelled, stockCountStatus.archived].includes(requestedStatus)) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Trạng thái không hợp lệ',
                        text: 'Phiếu kiểm kê đã xác nhận phải chuyển về Nháp trước khi sửa dòng; cũng có thể hủy hoặc lưu trữ.'
                    });
                    return { isValid: false, response: null };
                }
                if (state.id && originalStatus === stockCountStatus.cancelled) {
                    return { isValid: false, response: null };
                }

                const isValid = validateForm();
                if (!isValid) {
                    return { isValid, response: null };
                }

                if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.status))) {
                    return { isValid: false, response: null };
                }

                try {
                    const response = state.id === ''
                        ? await services.createMainData(state.countDate, state.description, state.status, state.warehouseId, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.countDate, state.description, state.status, state.warehouseId, StorageManager.getUserId());

                    return { isValid, response };
                } catch (error) {
                    return { isValid, response: null, error };
                }
            },
            onMainModalHidden: () => {
                state.deleteMode = false;
                state.isViewMode = false;
                resetFormState();
                state.errors.countDate = '';
                state.errors.warehouseId = '';
                state.errors.status = '';
                state.showComplexDiv = false;
                refreshEditorPermissions();
            }
        };

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    const { isValid, response, error } = await methods.submitMainData();

                    if (!isValid) {
                        return;
                    }

                    if (!response) {
                        Swal.fire({
                            icon: 'error',
                            title: 'Lưu thất bại',
                            text: error?.response?.data?.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                            confirmButtonText: 'Đồng ý'
                        });
                        return;
                    }

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            const savedRecord = response?.data?.content?.data ?? {};
                            state.id = savedRecord.id ?? '';
                            state.number = savedRecord.number ?? '';
                            state.status = normalizeStatus(savedRecord.status ?? state.status);
                            state.originalStatus = state.status;
                            if (state.originalStatus === stockCountStatus.cancelled) {
                                state.isViewMode = true;
                                state.mainTitle = 'Xem phiếu kiểm kê';
                            } else if ([stockCountStatus.confirmed, stockCountStatus.archived].includes(state.originalStatus)) {
                                state.mainTitle = 'Cập nhật trạng thái kiểm kê';
                            } else {
                                state.mainTitle = 'Sửa phiếu kiểm kê';
                            }
                            await methods.populateSecondaryData(state.id);
                            state.showComplexDiv = true;
                            refreshEditorPermissions();

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
                                text: 'Biểu mẫu sẽ được đóng.',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            setTimeout(() => {
                                mainModal.obj.hide();
                                resetFormState();
                                state.isViewMode = false;
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
                await SecurityManager.authorizePage(['StockCounts']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', methods.onMainModalHidden);
                mainModalRef.value?.addEventListener('shown.bs.modal', statusListLookup.refresh);

                await methods.populateWarehouseListLookupData();
                warehouseListLookup.create();
                await methods.populateStockCountStatusListLookupData();
                statusListLookup.create();
                countDatePicker.create();
                numberText.create();

                await methods.populateProductListLookupData();
                await methods.populateInventoryStockLookupData();
                await secondaryGrid.create(state.secondaryData);

                const urlParams = new URLSearchParams(window.location.search);
                const requestedViewId = urlParams.get('viewId')
                    || (urlParams.get('viewMode') === 'true' ? urlParams.get('id') : null);
                if (requestedViewId) {
                    const selectedRecord = state.mainData.find(record => record.id === requestedViewId);
                    if (selectedRecord) {
                        await methods.openRecord(selectedRecord, true);
                    }
                }

            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', methods.onMainModalHidden);
            mainModalRef.value?.removeEventListener('shown.bs.modal', statusListLookup.refresh);
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
                        { field: 'number', headerText: 'Số phiếu', width: 150, minWidth: 150 },
                        { field: 'countDate', headerText: 'Ngày kiểm kê', width: 150, type: 'string', valueAccessor: (field, data) => DateFormatManager.formatToLocale(data[field]) },
                        { field: 'warehouseName', headerText: 'Kho', width: 150, minWidth: 150 },
                        { field: 'statusName', headerText: 'Trạng thái', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Ngày tạo', width: 170, type: 'string', valueAccessor: (field, data) => DateFormatManager.formatDateTimeToLocale(data[field]) }
                    ],
                    toolbar: state.isViewMode ? ['ExcelExport'] : [
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
                        methods.refreshMainToolbarActions();
                        mainGrid.obj.autoFitColumns(['number', 'countDate', 'warehouseName', 'statusName', 'createdAtUtc']);
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        methods.refreshMainToolbarActions();
                    },
                    rowDeselected: () => {
                        methods.refreshMainToolbarActions();
                    },
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            mainGrid.obj.clearSelection();
                        }
                    },
                    recordDoubleClick: async (args) => {
                        await methods.openRecord(args.rowData, true);
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.isViewMode = false;
                            state.mainTitle = 'Thêm phiếu kiểm kê';
                            resetFormState();
                            state.showComplexDiv = false;
                            refreshEditorPermissions();
                            mainModal.obj.show();
                            requestAnimationFrame(() => statusListLookup.refresh());
                        }

                        if (args.item.id === 'EditCustom') {
                            const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                            const selectedStatus = normalizeStatus(selectedRecord?.status);
                            if (![stockCountStatus.draft, stockCountStatus.confirmed, stockCountStatus.archived].includes(selectedStatus)) return;
                            await methods.openRecord(selectedRecord, false);
                        }

                        if (args.item.id === 'ViewCustom') {
                            await methods.openRecord(mainGrid.obj.getSelectedRecords()[0], true);
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            if (selected.some(record => normalizeStatus(record.status) !== stockCountStatus.draft)) {
                                Swal.fire({
                                    icon: 'warning',
                                    title: 'Không thể xóa',
                                    text: 'Chỉ có thể xóa phiếu kiểm kê Nháp.',
                                    heightAuto: false
                                });
                                return;
                            }

                            const result = await Swal.fire({
                                icon: 'warning',
                                title: 'Xác nhận xóa',
                                text: 'Bạn có chắc muốn xóa các phiếu kiểm kê đã chọn?',
                                showCancelButton: true,
                                confirmButtonText: 'Xóa',
                                cancelButtonText: 'Hủy',
                                heightAuto: false
                            });
                            if (!result.isConfirmed) return;

                            for (const record of selected) {
                                await services.deleteMainData(record.id, StorageManager.getUserId());
                            }
                            await methods.populateMainData();
                            mainGrid.refresh();
                            Swal.fire({
                                icon: 'success',
                                title: 'Xóa thành công',
                                text: 'Đã xóa các phiếu kiểm kê được chọn.',
                                heightAuto: false
                            });
                        }

                        if (args.item.id === 'PrintPDFCustom') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                window.open('/StockCounts/StockCountPdf?id=' + encodeURIComponent(selectedRecord.id ?? ''), '_blank', 'noopener');
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

        const getAvailableSerials = async (productId) => {
            const response = await AxiosManager.get(`/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(productId)}&warehouseId=${encodeURIComponent(state.warehouseId)}&moduleName=StockCount`, {});
            return response?.data?.content?.data ?? [];
        };

        const serialAdjustmentSnapshots = new Map();
        const serialAdjustmentKey = row => row?.id || row?.uid || null;
        const cloneSerialRow = row => {
            try { return JSON.parse(JSON.stringify(row)); } catch { return null; }
        };
        const restoreSerialAdjustmentAfterCancel = row => {
            const key = serialAdjustmentKey(row);
            const snapshot = key ? serialAdjustmentSnapshots.get(key) : null;
            if (!snapshot || !secondaryGrid.obj) {
                serialAdjustmentSnapshots.delete(key);
                return;
            }

            Object.assign(row, snapshot);
            const batchChanges = secondaryGrid.obj.editModule?.batchChanges;
            if (Array.isArray(batchChanges?.changedRecords)) {
                for (let index = batchChanges.changedRecords.length - 1; index >= 0; index -= 1) {
                    const item = batchChanges.changedRecords[index];
                    if (item === row || (row.id && String(item?.id) === String(row.id))) {
                        batchChanges.changedRecords.splice(index, 1);
                    }
                }
            }
            const rowObjects = secondaryGrid.obj.getRowsObject?.() ?? [];
            const rowObject = rowObjects
                .find(item => item?.data === row || (row.id && String(item?.data?.id) === String(row.id)));
            if (rowObject?.data && rowObject.data !== row) Object.assign(rowObject.data, snapshot);
            const rowIndex = rowObject ? rowObjects.indexOf(rowObject) : -1;
            if (rowIndex >= 0 && typeof secondaryGrid.obj.refreshRow === 'function') {
                secondaryGrid.obj.refreshRow(rowIndex);
            }
            serialAdjustmentSnapshots.delete(key);
        };

        const confirmSerialAdjustment = async (row) => {
            const product = state.productListLookupData.find(item => item.id === row.productId);
            if (!product || Number(product.serialTrackingMode ?? 0) === 0) return true;

            const quantity = Math.max(0, Math.trunc(Number(row.qtySCCount ?? 0)));
            const available = await getAvailableSerials(row.productId);
            const currentCount = available.length;
            const selectedCount = row.productSerialIds?.length ?? 0;
            // Selecting the exact serials in the existing picker is the explicit
            // alternative to FIFO; keep that choice without showing a decrease warning.
            if (selectedCount > 0 && selectedCount === quantity) {
                row.newSerials = [];
                return true;
            }
            if (selectedCount > quantity || quantity < currentCount) {
                const result = await Swal.fire({
                    icon: 'warning',
                    title: 'Điều chỉnh giảm tồn serial',
                    html: `<div class="text-start">
                        <p class="mb-3">Số lượng kiểm kê đang nhỏ hơn số serial hiện có.</p>
                        <div class="border rounded p-3 bg-light">
                            <div class="d-flex justify-content-between gap-3"><span>Hàng hóa</span><strong>${escapeHtml(product.name)}</strong></div>
                            <div class="d-flex justify-content-between gap-3"><span>Serial hiện có</span><strong>${currentCount}</strong></div>
                            <div class="d-flex justify-content-between gap-3"><span>Số lượng kiểm kê</span><strong>${quantity}</strong></div>
                        </div>
                        <p class="mt-3 mb-0">Nếu tiếp tục, hệ thống sẽ tự chọn serial nhập kho sớm nhất theo FIFO để đưa phần chênh lệch ra khỏi tồn.</p>
                    </div>`,
                    showCancelButton: true,
                    confirmButtonText: 'Tiếp tục',
                    cancelButtonText: 'Hủy',
                    heightAuto: false
                });
                if (!result.isConfirmed) return false;
                row.productSerialIds = [];
                row.productSerialNumbers = '';
                row.newSerials = [];
                return true;
            }
            if (quantity <= currentCount) return true;

            const difference = quantity - currentCount;
            const isManufacturer = Number(product.serialTrackingMode ?? 0) === 2;
            const defaultCost = Number(row.unitCost ?? product.costPrice ?? 0);
            const pending = Array.isArray(row.newSerials) ? row.newSerials : [];
            const used = new Set(available.map(item => String(item.internalSerialNumber ?? '').toUpperCase()));
            const createInternalNumber = () => {
                const fixed = String(product.internalSerialFixedCode ?? 'SN').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'SN';
                let value = '';
                do {
                    const bytes = new Uint8Array(12 - fixed.length);
                    if (window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
                    else bytes.forEach((_, index) => bytes[index] = Math.floor(Math.random() * 256));
                    value = Array.from(bytes, byte => '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'[byte % 36]).join('') + fixed;
                } while (used.has(value));
                used.add(value);
                return value;
            };
            const rows = Array.from({ length: difference }, (_, index) => ({
                internalSerialNumber: String(pending[index]?.internalSerialNumber ?? '').trim() || createInternalNumber(),
                manufacturerSerialNumber: String(pending[index]?.manufacturerSerialNumber ?? '').trim(),
                unitCost: Number(pending[index]?.unitCost ?? defaultCost)
            }));
            const result = await Swal.fire({
                icon: 'warning',
                title: 'Điều chỉnh tăng tồn serial',
                width: 900,
                html: `<div class="text-start">
                    <p class="mb-3">Hàng hóa <strong>${escapeHtml(product.name)}</strong> hiện có <strong>${currentCount}</strong> serial, nhưng số lượng kiểm kê là <strong>${quantity}</strong>.</p>
                    <div class="small text-muted mb-2">Serial đang tồn chỉ để xem lại. Các dòng serial mới có thể chỉnh giá vốn${isManufacturer ? ' và nhập mã serial nhà sản xuất' : ''}.</div>
                    <div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-0"><thead><tr>
                        <th>Trạng thái</th><th>Serial nội bộ</th>${isManufacturer ? '<th>Serial NSX</th>' : ''}<th style="width:180px">Giá vốn</th>
                    </tr></thead><tbody id="stock-count-serial-adjustment-rows"></tbody></table></div>
                </div>`,
                showCancelButton: true,
                confirmButtonText: 'Lưu serial mới',
                cancelButtonText: 'Hủy',
                focusConfirm: false,
                heightAuto: false,
                didOpen: () => {
                    const body = document.getElementById('stock-count-serial-adjustment-rows');
                    const addRow = (label, serial, manufacturer, cost, editable) => {
                        const tr = document.createElement('tr');
                        if (!editable) tr.className = 'table-light text-muted';
                        const status = document.createElement('td');
                        status.innerHTML = `<span class="badge ${editable ? 'bg-primary' : 'bg-secondary'}">${label}</span>`;
                        const internal = document.createElement('td'); internal.textContent = serial || '—';
                        tr.append(status, internal);
                        if (isManufacturer) { const nsx = document.createElement('td'); nsx.textContent = manufacturer || '—'; tr.append(nsx); }
                        const costCell = document.createElement('td');
                        if (editable) {
                            const costInput = document.createElement('input');
                            costInput.className = 'form-control form-control-sm';
                            costCell.append(costInput);
                            const costEditor = new ej.inputs.NumericTextBox({ value: Number(cost ?? 0), min: 0, decimals: 6, format: 'n2', numericKind: 'money', validateDecimalOnType: false });
                            costEditor.appendTo(costInput);
                            NumberFormatManager.configureNumericTextBox(costEditor, { kind: 'money', min: 0 });
                            NumberFormatManager.refreshNumericTextBox(costEditor);
                            tr._costEditor = costEditor;
                            if (isManufacturer) { const nsxInput = document.createElement('input'); nsxInput.type = 'text'; nsxInput.className = 'form-control form-control-sm mt-1'; nsxInput.placeholder = 'Mã serial NSX'; nsxInput.value = manufacturer || ''; tr.children[2].replaceChildren(nsxInput); tr._manufacturerInput = nsxInput; }
                        } else costCell.textContent = NumberFormatManager.formatMoneyToLocale(cost ?? 0);
                        tr.append(costCell); body?.append(tr); return tr;
                    };
                    available.forEach(item => addRow('Tồn hiện tại', item.internalSerialNumber, item.manufacturerSerialNumber, item.unitCost, false));
                    rows.forEach(item => { const tr = addRow('Serial mới', item.internalSerialNumber, item.manufacturerSerialNumber, item.unitCost, true); item._row = tr; });
                },
                preConfirm: () => {
                    const newSerials = rows.map(item => {
                        const unitCost = NumberFormatManager.readNumericTextBoxValue(item._row?._costEditor);
                        const manufacturerSerialNumber = item._row?._manufacturerInput?.value?.trim() || null;
                        if (!Number.isFinite(unitCost) || unitCost < 0) { Swal.showValidationMessage('Giá vốn serial mới phải là số không âm.'); return null; }
                        if (isManufacturer && !manufacturerSerialNumber) { Swal.showValidationMessage('Vui lòng nhập đủ mã serial nhà sản xuất.'); return null; }
                        return { internalSerialNumber: item.internalSerialNumber, manufacturerSerialNumber, unitCost };
                    });
                    if (newSerials.some(item => item == null)) return false;
                    const values = newSerials.map(item => isManufacturer ? item.manufacturerSerialNumber : item.internalSerialNumber);
                    if (new Set(values.map(item => item.toUpperCase())).size !== values.length) { Swal.showValidationMessage('Mã serial mới không được trùng nhau.'); return false; }
                    return newSerials;
                }
            });
            if (!result.isConfirmed) return false;
            row.productSerialIds = available.map(item => item.id).filter(Boolean);
            row.productSerialNumbers = available.map(item => item.internalSerialNumber).filter(Boolean).join(', ');
            row.newSerials = result.value ?? rows.map(item => ({ internalSerialNumber: item.internalSerialNumber, manufacturerSerialNumber: item.manufacturerSerialNumber || null, unitCost: item.unitCost }));
            return true;
        };

        const secondaryGrid = {
            obj: null,
            create: async (dataSource) => {
                secondaryGrid.obj = new ej.grids.Grid({
                    height: 400,
                    dataSource: dataSource,
                    editSettings: { allowEditing: state.canEditLines, allowAdding: state.canEditLines, allowDeleting: state.canEditLines, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: state.canEditLines },
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
                            headerText: 'Mã tham khảo',
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
                            headerText: 'Hàng hóa',
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
                                            const p = state.productListLookupData.find(x => x.id === e.value);
                                            const stock = state.inventoryStockLookupData.find(x => x.productId === e.value && x.warehouseId === state.warehouseId)?.stock ?? 0;
                                            const values = {
                                                productId: e.value,
                                                productReferenceCode: p?.referenceCode ?? '',
                                                productSerialIds: [],
                                                productSerialNumbers: '',
                                                qtySCSys: stock,
                                                qtySCCount: 0,
                                                qtySCDelta: -Number(stock),
                                                unitCost: p?.costPrice ?? 0,
                                                newSerials: []
                                            };
                                            GridInteractionManager.syncBatchRowValues(secondaryGrid.obj, {
                                                rowData: args.rowData,
                                                editorElement: args.element,
                                                values,
                                                formatters: {
                                                    qtySCSys: value => NumberFormatManager.formatToLocale(value ?? 0),
                                                    qtySCCount: value => NumberFormatManager.formatToLocale(value ?? 0),
                                                    qtySCDelta: value => NumberFormatManager.formatToLocale(value ?? 0)
                                                }
                                            });
                                            if (qtySCCountObj) {
                                                qtySCCountObj.value = 0;
                                                const serialTracked = p?.physical === true && Number(p?.serialTrackingMode ?? 0) > 0;
                                                qtySCCountObj.numericKind = serialTracked ? 'integer' : 'decimal';
                                                if (qtySCCountObj.element?.dataset) qtySCCountObj.element.dataset.numericKind = qtySCCountObj.numericKind;
                                                qtySCCountObj.decimals = serialTracked ? 0 : 6;
                                                qtySCCountObj.format = serialTracked ? 'n0' : 'n6';
                                                qtySCCountObj.readonly = serialTracked && (args.rowData.productSerialIds?.length ?? 0) > 0;
                                                qtySCCountObj.dataBind();
                                            }
                                        },
                                        placeholder: 'Chọn hàng hóa',
                                        floatLabelType: 'Never'
                                    });

                                    productObj.appendTo(productElem);
                                }
                            }
                        },
                        { field: 'qtySCSys', headerText: 'Tồn hệ thống', width: 120, allowEditing: false, type: 'number', format: 'N6', textAlign: 'Right'},
                        ProductSerialPicker.createGridColumn({
                            productListGetter: () => state.productListLookupData,
                            gridGetter: () => secondaryGrid.obj,
                            warehouseIdGetter: (rowData) => state.warehouseId,
                            moduleName: 'StockCount',
                            quantityField: 'qtySCCount',
                            quantityObjGetter: () => qtySCCountObj,
                            requireWarehouse: true,
                            allowQuantityOverride: true
                        }),
                        {
                            field: 'qtySCCount',
                            headerText: 'Số lượng thực đếm',
                            width: 200,
                            validationRules: {
                                required: true,
                                custom: [(args) => {
                                    return args['value'] >= 0;
                                }, 'Số lượng thực đếm không được âm.']
                            },
                            type: 'number', format: 'N6', textAlign: 'Right',
                            edit: {
                                create: () => {
                                    qtySCCountElem = document.createElement('input');
                                    return qtySCCountElem;
                                },
                                read: () => {
                                    return NumberFormatManager.readNumericTextBoxValue(qtySCCountObj);
                                },
                                destroy: function () {
                                    qtySCCountObj.destroy();
                                },
                                write: function (args) {
                                    const product = state.productListLookupData.find(x => x.id === args.rowData.productId);
                                    const serialTracked = product?.physical === true && Number(product?.serialTrackingMode ?? 0) > 0;
                                    qtySCCountObj = new ej.inputs.NumericTextBox({
                                        value: args.rowData.qtySCCount ?? 0,
                                        numericKind: serialTracked ? 'integer' : 'decimal',
                                        format: serialTracked ? 'n0' : 'n6',
                                        decimals: serialTracked ? 0 : 6,
                                        readonly: false,
                                        validateDecimalOnType: true,
                                    });
                                    qtySCCountObj.appendTo(qtySCCountElem);
                                }
                            }
                        },
                        { field: 'qtySCDelta', headerText: 'Chênh lệch', width: 120, allowEditing: false, type: 'number', format: '+0.######;-0.######;0', textAlign: 'Right' },
                    ],
                    toolbar: !state.canEditLines ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () { },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (state.canEditLines && secondaryGrid.obj.getSelectedRecords().length == 1) {
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], true);
                        } else {
                            secondaryGrid.obj.toolbarModule.enableItems(['SecondaryGrid_edit'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (state.canEditLines && secondaryGrid.obj.getSelectedRecords().length == 1) {
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
                        if (!state.canEditLines && ['add', 'beginEdit', 'save', 'delete'].includes(args.requestType)) {
                            args.cancel = true;
                            return;
                        }
                        if (String(args.requestType ?? '').toLowerCase() === 'beginedit' && args.rowData) {
                            const key = serialAdjustmentKey(args.rowData);
                            if (key) serialAdjustmentSnapshots.set(key, cloneSerialRow(args.rowData));
                        }
                        if (String(args.requestType ?? '').toLowerCase() === 'save') {
                            const duplicate = (secondaryGrid.obj.getCurrentViewRecords?.() ?? [])
                                .some(row => row !== args.data && row.productId && row.productId === args.data?.productId
                                    && (!row.id || !args.data?.id || String(row.id) !== String(args.data.id)));
                            if (duplicate) {
                                args.cancel = true;
                                Swal.fire({ icon: 'warning', title: 'Hàng hóa bị trùng', text: 'Mỗi hàng hóa chỉ được xuất hiện một lần trong phiếu kiểm kê.', confirmButtonText: 'Đồng ý' });
                                return;
                            }
                        }
                        ProductSerialPicker.validateGridSave(args, {
                            productListGetter: () => state.productListLookupData,
                            quantityField: 'qtySCCount',
                            allowZeroQuantity: true,
                            allowEmptySelection: true
                        });
                    },
                    actionComplete: async (args) => {
                        if (args.requestType === 'save' && args.action === 'add') {
                            try {
                                if (!(await confirmSerialAdjustment(args.data))) {
                                    restoreSerialAdjustmentAfterCancel(args.data);
                                    return;
                                }
                                const response = await services.createSecondaryData(state.id, args.data.productId, args.data.qtySCCount, StorageManager.getUserId(), args.data.productSerialIds ?? [], args.data.unitCost, args.data.newSerials ?? []);
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
                                if (!(await confirmSerialAdjustment(args.data))) {
                                    restoreSerialAdjustmentAfterCancel(args.data);
                                    return;
                                }
                                const response = await services.updateSecondaryData(args.data.id, args.data.productId, args.data.qtySCCount, StorageManager.getUserId(), args.data.productSerialIds ?? [], args.data.unitCost, args.data.newSerials ?? []);
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
                const allowEdit = state.canEditLines;
                secondaryGrid.obj.setProperties({ 
                    dataSource: state.secondaryData,
                    editSettings: { allowEditing: allowEdit, allowAdding: allowEdit, allowDeleting: allowEdit, showDeleteConfirmDialog: true, mode: 'Batch', allowEditOnDblClick: allowEdit },
                    toolbar: !allowEdit ? ['ExcelExport'] : [
                        'ExcelExport',
                        { type: 'Separator' },
                        'Add', 'Edit', 'Delete', 'Update', 'Cancel',
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

        return {
            mainGridRef,
            mainModalRef,
            secondaryGridRef,
            countDateRef,
            warehouseIdRef,
            statusRef,
            numberRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');








