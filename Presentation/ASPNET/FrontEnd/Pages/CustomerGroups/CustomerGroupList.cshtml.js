const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            mainTitle: null,
            id: '',
            name: '',
            description: '',
            errors: {
                name: ''
            },
            isSubmitting: false
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const nameRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/CustomerGroup/GetCustomerGroupList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (name, description, createdById) => {
                try {
                    const response = await AxiosManager.post('/CustomerGroup/CreateCustomerGroup', {
                        name, description, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, name, description, updatedById) => {
                try {
                    const response = await AxiosManager.post('/CustomerGroup/UpdateCustomerGroup', {
                        id, name, description, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/CustomerGroup/DeleteCustomerGroup', {
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
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            }
        };

        const nameText = {
            obj: null,
            create: () => {
                nameText.obj = new ej.inputs.TextBox({
                    placeholder: 'Enter Name',
                });
                nameText.obj.appendTo(nameRef.value);
            },
            refresh: () => {
                if (nameText.obj) {
                    nameText.obj.value = state.name;
                }
            }
        };

        Vue.watch(
            () => state.name,
            (newVal, oldVal) => {
                state.errors.name = '';
                nameText.refresh();
            }
        );

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 200));

                    let isValid = true;

                    // name validation
                    if (!state.name) {
                        state.errors.name = 'Name is required.';
                        isValid = false;
                    }

                    if (!isValid) return;

                    const response = state.id === ''
                        ? await services.createMainData(state.name, state.description, StorageManager.getUserId())
                        : await services.updateMainData(state.id, state.name, state.description, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        Swal.fire({
                            icon: 'success',
                            title: 'Lưu thành công',
                            text: 'Form will be closed...',
                            timer: 2000,
                            showConfirmButton: false
                        });
                        setTimeout(() => {
                            mainModal.obj.hide();
                            resetFormState();
                        }, 2000);
                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: 'Lưu thất bại',
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

        const resetFormState = () => {
            state.id = '';
            state.name = '';
            state.description = '';
            state.errors = {
                name: ''
            };
        };

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
                        { field: 'name', headerText: 'Name', width: 200, minWidth: 200 },
                        { field: 'description', headerText: 'Description', width: 400, minWidth: 400 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        mainGrid.obj.autoFitColumns(['name', 'description', 'createdAtUtc']);
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        }
                    },
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            // preserve multiple selection
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Customer Group';
                            resetFormState();
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Customer Group';
                                state.id = selectedRecord.id ?? '';
                                state.name = selectedRecord.name ?? '';
                                state.description = selectedRecord.description ?? '';
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            const confirmation = await Swal.fire({ title: 'Bạn có chắc chắn muốn xóa?', text: 'Số dòng sẽ xóa: ' + selected.length, icon: 'warning', showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy', heightAuto: false });
                            if (!confirmation.isConfirmed) return;
                            try {
                                for (const record of selected) await services.deleteMainData(record.id, StorageManager.getUserId());
                                await methods.populateMainData();
                                mainGrid.refresh();
                                await Swal.fire({ icon: 'success', title: 'Đã xóa', text: `Đã xóa ${selected.length} nhóm khách hàng.`, heightAuto: false });
                            } catch (error) {
                                await methods.populateMainData();
                                mainGrid.refresh();
                                await Swal.fire({
                                    icon: 'error',
                                    title: 'Xóa thất bại',
                                    text: error.response?.data?.message?.replace(/^Exception:\s*/, '') ?? 'Vui lòng thử lại.',
                                    confirmButtonText: 'Đồng ý',
                                    heightAuto: false
                                });
                            }
                            return;
                        }
                        if (args.item.id === 'DeleteCustomLegacy') {
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                Swal.fire({
                                    title: 'Xóa Nhóm Khách Hàng?',
                                    text: `Bạn có chắc chắn muốn xóa nhóm khách hàng: ${selectedRecord.name}?`,
                                    icon: 'warning',
                                    showCancelButton: true,
                                    confirmButtonColor: '#d33',
                                    cancelButtonColor: '#3085d6',
                                    confirmButtonText: 'Đồng ý',
                                    cancelButtonText: 'Hủy',
                                    heightAuto: false
                                }).then(async (result) => {
                                    if (result.isConfirmed) {
                                        try {
                                            const response = await services.deleteMainData(selectedRecord.id, StorageManager.getUserId());
                                            if (response.data.code === 200) {
                                                Swal.fire({
                                                    icon: 'success',
                                                    title: 'Xóa thành công',
                                                    showConfirmButton: false,
                                                    timer: 2000,
                                                    heightAuto: false
                                                });
                                                await methods.populateMainData();
                                                mainGrid.refresh();
                                            } else {
                                                Swal.fire({
                                                    icon: 'error',
                                                    title: 'Xóa thất bại',
                                                    text: response.data.message ?? 'Vui lòng kiểm tra lại dữ liệu.',
                                                    confirmButtonText: 'Thử lại',
                                                    heightAuto: false
                                                });
                                            }
                                        } catch (error) {
                                            Swal.fire({
                                                icon: 'error',
                                                title: 'Đã xảy ra lỗi',
                                                text: error.response?.data?.message ?? 'Vui lòng thử lại.',
                                                confirmButtonText: 'Đồng ý',
                                                heightAuto: false
                                            });
                                        }
                                    }
                                });
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

        const mainModal = {
            obj: null,
            create: () => {
                mainModal.obj = new bootstrap.Modal(mainModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['CustomerGroups']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);
                nameText.create();
                mainModal.create();
            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        return {
            mainGridRef,
            mainModalRef,
            nameRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');

