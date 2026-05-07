const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            mainTitle: null,
            id: '',
            name: '',
            number: '',
            accountType: null,
            description: '',
            initialBalance: 0,
            cashOnHand: null,
            errors: {
                name: '',
                accountType: ''
            },
            isSubmitting: false
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const nameRef = Vue.ref(null);
        const accountTypeRef = Vue.ref(null);
        const initialBalanceRef = Vue.ref(null);
        const cashOnHandRef = Vue.ref(null);

        const accountTypeOptions = [
            { value: 0, text: 'Personal' },
            { value: 1, text: 'Company' }
        ];

        const validateForm = function () {
            state.errors.name = '';
            state.errors.accountType = '';
            let isValid = true;

            if (!state.name) {
                state.errors.name = 'Name is required.';
                isValid = false;
            }
            if (state.accountType === null || state.accountType === undefined) {
                state.errors.accountType = 'Account Type is required.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.name = '';
            state.number = '';
            state.accountType = null;
            state.description = '';
            state.initialBalance = 0;
            state.cashOnHand = null;
            state.errors = {
                name: '',
                accountType: ''
            };
        };

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/CashAccount/GetCashAccountList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (name, accountType, description, initialBalance, cashOnHand, createdById) => {
                try {
                    const response = await AxiosManager.post('/CashAccount/CreateCashAccount', {
                        name, accountType, description, initialBalance, cashOnHand, createdById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, name, accountType, description, initialBalance, cashOnHand, updatedById) => {
                try {
                    const response = await AxiosManager.post('/CashAccount/UpdateCashAccount', {
                        id, name, accountType, description, initialBalance, cashOnHand, updatedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/CashAccount/DeleteCashAccount', {
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
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                    accountTypeName: item.accountType === 0 ? 'Personal' : item.accountType === 1 ? 'Company' : ''
                }));
            },
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

        const accountTypeDropDown = {
            obj: null,
            create: () => {
                accountTypeDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: accountTypeOptions,
                    fields: { value: 'value', text: 'text' },
                    placeholder: 'Select Account Type',
                    change: (args) => {
                        state.accountType = args.value;
                    }
                });
                accountTypeDropDown.obj.appendTo(accountTypeRef.value);
            },
            refresh: () => {
                if (accountTypeDropDown.obj) {
                    accountTypeDropDown.obj.value = state.accountType;
                }
            }
        };

        const initialBalanceInput = {
            obj: null,
            create: () => {
                initialBalanceInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Enter Initial Balance',
                    format: 'N0',
                    min: 0,
                    value: 0,
                    change: (args) => {
                        state.initialBalance = args.value;
                    }
                });
                initialBalanceInput.obj.appendTo(initialBalanceRef.value);
            },
            refresh: () => {
                if (initialBalanceInput.obj) {
                    initialBalanceInput.obj.value = state.initialBalance;
                }
            }
        };

        const cashOnHandInput = {
            obj: null,
            create: () => {
                cashOnHandInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Enter Cash On Hand',
                    format: 'N0',
                    min: 0,
                    change: (args) => {
                        state.cashOnHand = args.value;
                    }
                });
                cashOnHandInput.obj.appendTo(cashOnHandRef.value);
            },
            refresh: () => {
                if (cashOnHandInput.obj) {
                    cashOnHandInput.obj.value = state.cashOnHand;
                }
            }
        };

        Vue.watch(() => state.name, () => { state.errors.name = ''; nameText.refresh(); });
        Vue.watch(() => state.accountType, () => { state.errors.accountType = ''; accountTypeDropDown.refresh(); });
        Vue.watch(() => state.initialBalance, () => { initialBalanceInput.refresh(); });
        Vue.watch(() => state.cashOnHand, () => { cashOnHandInput.refresh(); });

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!validateForm()) {
                        return;
                    }

                    const response = state.id === ''
                        ? await services.createMainData(state.name, state.accountType, state.description, state.initialBalance, state.cashOnHand, StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.name, state.accountType, state.description, state.initialBalance, state.cashOnHand, StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            state.mainTitle = 'Edit Cash Account';
                            state.id = response?.data?.content?.data.id ?? '';
                            state.name = response?.data?.content?.data.name ?? '';
                            state.accountType = response?.data?.content?.data.accountType;
                            state.description = response?.data?.content?.data.description ?? '';
                            state.initialBalance = response?.data?.content?.data.initialBalance ?? 0;
                            state.cashOnHand = response?.data?.content?.data.cashOnHand;

                            Swal.fire({
                                icon: 'success',
                                title: 'Save Successful',
                                text: 'Form will be closed...',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            setTimeout(() => {
                                mainModal.obj.hide();
                            }, 2000);

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
                await SecurityManager.authorizePage(['CashAccounts']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);

                nameText.create();
                accountTypeDropDown.create();
                initialBalanceInput.create();
                cashOnHandInput.create();
                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', () => {
                    resetFormState();
                });

            } catch (e) {
                console.error('page init error:', e);
            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', resetFormState);
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
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'name', headerText: 'Name', width: 200, minWidth: 200 },
                        { field: 'accountTypeName', headerText: 'Account Type', width: 150, minWidth: 150 },
                        { field: 'initialBalance', headerText: 'Initial Balance', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'totalDebit', headerText: 'Total Debit', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'totalCredit', headerText: 'Total Credit', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'currentBalance', headerText: 'Current Balance', width: 170, minWidth: 170, textAlign: 'Right', format: 'N0' },
                        { field: 'cashOnHand', headerText: 'Cash On Hand', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'bankBalance', headerText: 'Bank Balance', width: 160, minWidth: 160, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 300, minWidth: 300 },
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
                            mainGrid.obj.clearSelection();
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Cash Account';
                            resetFormState();
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Cash Account';
                                state.id = selectedRecord.id ?? '';
                                state.name = selectedRecord.name ?? '';
                                state.accountType = selectedRecord.accountType;
                                state.description = selectedRecord.description ?? '';
                                state.initialBalance = selectedRecord.initialBalance ?? 0;
                                state.cashOnHand = selectedRecord.cashOnHand;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Delete Cash Account?';
                                state.id = selectedRecord.id ?? '';
                                state.name = selectedRecord.name ?? '';
                                state.accountType = selectedRecord.accountType;
                                state.description = selectedRecord.description ?? '';
                                state.initialBalance = selectedRecord.initialBalance ?? 0;
                                state.cashOnHand = selectedRecord.cashOnHand;
                                mainModal.obj.show();
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

        return {
            mainGridRef,
            mainModalRef,
            nameRef,
            accountTypeRef,
            initialBalanceRef,
            cashOnHandRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');
