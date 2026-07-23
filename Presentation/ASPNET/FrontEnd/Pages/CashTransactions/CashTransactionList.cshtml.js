const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            mainTitle: null,
            id: '',
            number: '',
            transactionDate: null,
            transactionType: null,
            status: null,
            amount: null,
            description: '',
            cashAccountId: null,
            cashCategoryId: null,
            customerId: null,
            sourceModule: null,
            sourceModuleId: null,
            sourceModuleNumber: null,
            cashAccountList: [],
            cashCategoryList: [],
            customerList: [],
            errors: {
                transactionDate: '',
                transactionType: '',
                cashAccountId: '',
                amount: '',
                status: ''
            },
            isSubmitting: false,
            transfer: {
                transferDate: null,
                fromCashAccountId: null,
                toCashAccountId: null,
                amount: null,
                description: '',
                errors: {
                    transferDate: '',
                    fromCashAccountId: '',
                    toCashAccountId: '',
                    amount: ''
                },
                isSubmitting: false
            },
            summary: {
                totalDebit: 0,
                totalCredit: 0,
                totalBalance: 0,
                totalDebitText: '0',
                totalCreditText: '0',
                totalBalanceText: '0'
            }
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const transactionDateRef = Vue.ref(null);
        const transactionTypeRef = Vue.ref(null);
        const cashAccountRef = Vue.ref(null);
        const cashCategoryRef = Vue.ref(null);
        const customerRef = Vue.ref(null);
        const amountRef = Vue.ref(null);
        const statusRef = Vue.ref(null);
        const transferModalRef = Vue.ref(null);
        const transferDateRef = Vue.ref(null);
        const fromAccountRef = Vue.ref(null);
        const toAccountRef = Vue.ref(null);
        const transferAmountRef = Vue.ref(null);

        const transactionTypeOptions = [
            { value: 0, text: 'Debit' },
            { value: 1, text: 'Credit' }
        ];

        const statusOptions = [
            { value: 0, text: 'Draft' },
            { value: 2, text: 'Confirmed' },
            { value: 1, text: 'Cancelled' },
            { value: 3, text: 'Archived' }
        ];

        const validateForm = function () {
            state.errors.transactionDate = '';
            state.errors.transactionType = '';
            state.errors.cashAccountId = '';
            state.errors.amount = '';
            state.errors.status = '';
            let isValid = true;

            if (!state.transactionDate) { state.errors.transactionDate = 'Transaction Date is required.'; isValid = false; }
            if (state.transactionType === null || state.transactionType === undefined) { state.errors.transactionType = 'Transaction Type is required.'; isValid = false; }
            if (!state.cashAccountId) { state.errors.cashAccountId = 'Cash Account is required.'; isValid = false; }
            if (!state.amount || state.amount <= 0) { state.errors.amount = 'Amount must be greater than 0.'; isValid = false; }
            if (state.status === null || state.status === undefined) { state.errors.status = 'Status is required.'; isValid = false; }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.transactionDate = null;
            state.transactionType = null;
            state.status = null;
            state.amount = null;
            state.description = '';
            state.cashAccountId = null;
            state.cashCategoryId = null;
            state.customerId = null;
            state.sourceModule = null;
            state.sourceModuleId = null;
            state.sourceModuleNumber = null;
            state.errors = { transactionDate: '', transactionType: '', cashAccountId: '', amount: '', status: '' };
        };

        const validateTransferForm = function () {
            state.transfer.errors.transferDate = '';
            state.transfer.errors.fromCashAccountId = '';
            state.transfer.errors.toCashAccountId = '';
            state.transfer.errors.amount = '';
            let isValid = true;

            if (!state.transfer.transferDate) { state.transfer.errors.transferDate = 'Transfer Date is required.'; isValid = false; }
            if (!state.transfer.fromCashAccountId) { state.transfer.errors.fromCashAccountId = 'From Account is required.'; isValid = false; }
            if (!state.transfer.toCashAccountId) { state.transfer.errors.toCashAccountId = 'To Account is required.'; isValid = false; }
            if (state.transfer.fromCashAccountId && state.transfer.toCashAccountId && state.transfer.fromCashAccountId === state.transfer.toCashAccountId) {
                state.transfer.errors.toCashAccountId = 'Source and destination accounts must be different.';
                isValid = false;
            }
            if (!state.transfer.amount || state.transfer.amount <= 0) { state.transfer.errors.amount = 'Amount must be greater than 0.'; isValid = false; }

            return isValid;
        };

        const resetTransferState = () => {
            state.transfer.transferDate = null;
            state.transfer.fromCashAccountId = null;
            state.transfer.toCashAccountId = null;
            state.transfer.amount = null;
            state.transfer.description = '';
            state.transfer.errors = { transferDate: '', fromCashAccountId: '', toCashAccountId: '', amount: '' };
        };

        const services = {
            getMainData: async () => {
                return await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
            },
            getCashAccountList: async () => {
                return await AxiosManager.get('/CashAccount/GetCashAccountList', {});
            },
            getCashCategoryList: async () => {
                return await AxiosManager.get('/CashCategory/GetCashCategoryList', {});
            },
            getCustomerList: async () => {
                return await AxiosManager.get('/Customer/GetCustomerList', {});
            },
            createMainData: async (data) => {
                return await AxiosManager.post('/CashTransaction/CreateCashTransaction', data);
            },
            createTransfer: async (data) => {
                return await AxiosManager.post('/CashTransaction/CreateCashTransfer', data);
            },
            updateMainData: async (data) => {
                return await AxiosManager.post('/CashTransaction/UpdateCashTransaction', data);
            },
            deleteMainData: async (id, deletedById) => {
                return await AxiosManager.post('/CashTransaction/DeleteCashTransaction', { id, deletedById });
            },
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                    transactionDate: DateFormatManager.parseBusinessDate(item.transactionDate),
                    transactionTypeName: item.transactionType === 0 ? 'Debit' : item.transactionType === 1 ? 'Credit' : '',
                    statusName: item.status === 0 ? 'Draft' : item.status === 1 ? 'Cancelled' : item.status === 2 ? 'Confirmed' : item.status === 3 ? 'Archived' : ''
                }));
            },
            populateCashAccountList: async () => {
                const response = await services.getCashAccountList();
                state.cashAccountList = response?.data?.content?.data ?? [];
            },
            populateCashCategoryList: async () => {
                const response = await services.getCashCategoryList();
                state.cashCategoryList = response?.data?.content?.data ?? [];
            },
            populateCustomerList: async () => {
                const response = await services.getCustomerList();
                state.customerList = response?.data?.content?.data ?? [];
            },
            refreshSummary: () => {
                state.summary.totalDebit = state.cashAccountList.reduce((sum, item) => sum + (item.totalDebit ?? 0), 0);
                state.summary.totalCredit = state.cashAccountList.reduce((sum, item) => sum + (item.totalCredit ?? 0), 0);
                state.summary.totalBalance = state.cashAccountList.reduce((sum, item) => sum + (item.currentBalance ?? 0), 0);
                state.summary.totalDebitText = NumberFormatManager.formatToLocale(state.summary.totalDebit);
                state.summary.totalCreditText = NumberFormatManager.formatToLocale(state.summary.totalCredit);
                state.summary.totalBalanceText = NumberFormatManager.formatToLocale(state.summary.totalBalance);
            }
        };

        // UI Controls
        const transactionDatePicker = {
            obj: null,
            create: () => {
                transactionDatePicker.obj = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                    placeholder: 'Select Date',
                    value: state.transactionDate ? DateFormatManager.parseBusinessDate(state.transactionDate) : null,
                    change: (args) => { state.transactionDate = DateFormatManager.parseBusinessDate(args.value); }
                }));
                transactionDatePicker.obj.appendTo(transactionDateRef.value);
            },
            refresh: () => {
                if (transactionDatePicker.obj) {
                    transactionDatePicker.obj.value = state.transactionDate ? DateFormatManager.parseBusinessDate(state.transactionDate) : null;
                    transactionDatePicker.obj.dataBind();
                }
            }
        };

        const transactionTypeDropDown = {
            obj: null,
            create: () => {
                transactionTypeDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: transactionTypeOptions,
                    fields: { value: 'value', text: 'text' },
                    placeholder: 'Select Type',
                    change: (args) => { state.transactionType = args.value; }
                });
                transactionTypeDropDown.obj.appendTo(transactionTypeRef.value);
            },
            refresh: () => { if (transactionTypeDropDown.obj) transactionTypeDropDown.obj.value = state.transactionType; }
        };

        const cashAccountDropDown = {
            obj: null,
            create: () => {
                cashAccountDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.cashAccountList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Account',
                    change: (args) => { state.cashAccountId = args.value; }
                });
                cashAccountDropDown.obj.appendTo(cashAccountRef.value);
            },
            refresh: () => { if (cashAccountDropDown.obj) cashAccountDropDown.obj.value = state.cashAccountId; }
        };

        const cashCategoryDropDown = {
            obj: null,
            create: () => {
                cashCategoryDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.cashCategoryList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Category',
                    allowFiltering: true,
                    change: (args) => { state.cashCategoryId = args.value; }
                });
                cashCategoryDropDown.obj.appendTo(cashCategoryRef.value);
            },
            refresh: () => { if (cashCategoryDropDown.obj) cashCategoryDropDown.obj.value = state.cashCategoryId; }
        };

        const customerDropDown = {
            obj: null,
            create: () => {
                customerDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.customerList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select a Customer',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (e) => {
                        e.preventDefaultAction = true;
                        let query = new ej.data.Query();
                        if (e.text !== '') {
                            query = query.where('name', 'startswith', e.text, true);
                        }
                        e.updateData(state.customerList, query);
                    },
                    change: (args) => { state.customerId = args.value; }
                });
                customerDropDown.obj.appendTo(customerRef.value);
            },
            refresh: () => { if (customerDropDown.obj) customerDropDown.obj.value = state.customerId; }
        };

        const amountInput = {
            obj: null,
            create: () => {
                amountInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Enter Amount',
                    format: 'N0',
                    min: 0,
                    change: (args) => { state.amount = args.value; }
                });
                amountInput.obj.appendTo(amountRef.value);
            },
            refresh: () => { if (amountInput.obj) amountInput.obj.value = state.amount; }
        };

        const transferDatePicker = {
            obj: null,
            create: () => {
                transferDatePicker.obj = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                    placeholder: 'Select Date',
                    value: state.transfer.transferDate ? DateFormatManager.parseBusinessDate(state.transfer.transferDate) : null,
                    change: (args) => { state.transfer.transferDate = DateFormatManager.parseBusinessDate(args.value); }
                }));
                transferDatePicker.obj.appendTo(transferDateRef.value);
            },
            refresh: () => {
                if (transferDatePicker.obj) {
                    transferDatePicker.obj.value = state.transfer.transferDate ? DateFormatManager.parseBusinessDate(state.transfer.transferDate) : null;
                    transferDatePicker.obj.dataBind();
                }
            }
        };

        const fromAccountDropDown = {
            obj: null,
            create: () => {
                fromAccountDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.cashAccountList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Source Account',
                    change: (args) => { state.transfer.fromCashAccountId = args.value; }
                });
                fromAccountDropDown.obj.appendTo(fromAccountRef.value);
            },
            refresh: () => { if (fromAccountDropDown.obj) fromAccountDropDown.obj.value = state.transfer.fromCashAccountId; }
        };

        const toAccountDropDown = {
            obj: null,
            create: () => {
                toAccountDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.cashAccountList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Destination Account',
                    change: (args) => { state.transfer.toCashAccountId = args.value; }
                });
                toAccountDropDown.obj.appendTo(toAccountRef.value);
            },
            refresh: () => { if (toAccountDropDown.obj) toAccountDropDown.obj.value = state.transfer.toCashAccountId; }
        };

        const transferAmountInput = {
            obj: null,
            create: () => {
                transferAmountInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Enter Amount',
                    format: 'N0',
                    min: 0,
                    change: (args) => { state.transfer.amount = args.value; }
                });
                transferAmountInput.obj.appendTo(transferAmountRef.value);
            },
            refresh: () => { if (transferAmountInput.obj) transferAmountInput.obj.value = state.transfer.amount; }
        };

        const statusDropDown = {
            obj: null,
            create: () => {
                statusDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: statusOptions,
                    fields: { value: 'value', text: 'text' },
                    placeholder: 'Select Status',
                    change: (args) => { state.status = args.value; }
                });
                statusDropDown.obj.appendTo(statusRef.value);
            },
            refresh: () => { if (statusDropDown.obj) statusDropDown.obj.value = state.status; }
        };

        Vue.watch(() => state.transactionDate, () => { state.errors.transactionDate = ''; transactionDatePicker.refresh(); });
        Vue.watch(() => state.transactionType, () => { state.errors.transactionType = ''; transactionTypeDropDown.refresh(); });
        Vue.watch(() => state.cashAccountId, () => { state.errors.cashAccountId = ''; cashAccountDropDown.refresh(); });
        Vue.watch(() => state.cashCategoryId, () => { cashCategoryDropDown.refresh(); });
        Vue.watch(() => state.customerId, () => { customerDropDown.refresh(); });
        Vue.watch(() => state.amount, () => { state.errors.amount = ''; amountInput.refresh(); });
        Vue.watch(() => state.status, () => { state.errors.status = ''; statusDropDown.refresh(); });
        Vue.watch(() => state.transfer.transferDate, () => { state.transfer.errors.transferDate = ''; transferDatePicker.refresh(); });
        Vue.watch(() => state.transfer.fromCashAccountId, () => { state.transfer.errors.fromCashAccountId = ''; fromAccountDropDown.refresh(); });
        Vue.watch(() => state.transfer.toCashAccountId, () => { state.transfer.errors.toCashAccountId = ''; toAccountDropDown.refresh(); });
        Vue.watch(() => state.transfer.amount, () => { state.transfer.errors.amount = ''; transferAmountInput.refresh(); });

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!validateForm()) return;

                    if (!state.deleteMode && !(await DocumentStatusGuard.confirmIfFinalStatus(state.status))) {
                        return;
                    }

                    const payload = {
                        id: state.id || undefined,
                        transactionDate: DateFormatManager.formatForApiDate(state.transactionDate),
                        transactionType: state.transactionType,
                        status: state.status,
                        amount: state.amount,
                        description: state.description,
                        cashAccountId: state.cashAccountId,
                        cashCategoryId: state.cashCategoryId,
                        customerId: state.customerId,
                        sourceModule: state.sourceModule,
                        sourceModuleId: state.sourceModuleId,
                        sourceModuleNumber: state.sourceModuleNumber,
                    };

                    let response;
                    if (state.id === '') {
                        payload.createdById = StorageManager.getUserId();
                        response = await services.createMainData(payload);
                    } else if (state.deleteMode) {
                        response = await services.deleteMainData(state.id, StorageManager.getUserId());
                    } else {
                        payload.updatedById = StorageManager.getUserId();
                        response = await services.updateMainData(payload);
                    }

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        await methods.populateCashAccountList();
                        methods.refreshSummary();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            const data = response?.data?.content?.data;
                            state.mainTitle = 'Edit Cash Transaction';
                            state.id = data.id ?? '';
                            state.number = data.number ?? '';
                            state.transactionDate = DateFormatManager.parseBusinessDate(data.transactionDate);
                            state.transactionType = data.transactionType;
                            state.status = data.status;
                            state.amount = data.amount;
                            state.description = data.description ?? '';
                            state.cashAccountId = data.cashAccountId;
                            state.cashCategoryId = data.cashCategoryId;
                            state.customerId = data.customerId;
                        }

                        Swal.fire({
                            icon: 'success',
                            title: state.deleteMode ? 'Delete Successful' : 'Save Successful',
                            text: 'Form will be closed...',
                            timer: 2000,
                            showConfirmButton: false
                        });
                        setTimeout(() => {
                            mainModal.obj.hide();
                            if (state.deleteMode) resetFormState();
                        }, 2000);

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
            handleTransferSubmit: async function () {
                try {
                    state.transfer.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!validateTransferForm()) return;

                    if (!(await DocumentStatusGuard.confirmIfFinalStatus(2))) {
                        return;
                    }

                    const response = await services.createTransfer({
                        transferDate: DateFormatManager.formatForApiDate(state.transfer.transferDate),
                        fromCashAccountId: state.transfer.fromCashAccountId,
                        toCashAccountId: state.transfer.toCashAccountId,
                        amount: state.transfer.amount,
                        description: state.transfer.description,
                        createdById: StorageManager.getUserId()
                    });

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        await methods.populateCashAccountList();
                        methods.refreshSummary();
                        mainGrid.refresh();

                        Swal.fire({
                            icon: 'success',
                            title: 'Save Successful',
                            text: 'Form will be closed...',
                            timer: 2000,
                            showConfirmButton: false
                        });
                        setTimeout(() => {
                            transferModal.obj.hide();
                        }, 2000);

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
                } finally {
                    state.transfer.isSubmitting = false;
                }
            },
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['CashTransactions']);
                await SecurityManager.validateToken();

                await methods.populateCashAccountList();
                await methods.populateCashCategoryList();
                await methods.populateCustomerList();
                await methods.populateMainData();
                methods.refreshSummary();
                await mainGrid.create(state.mainData);

                transactionDatePicker.create();
                transactionTypeDropDown.create();
                cashAccountDropDown.create();
                cashCategoryDropDown.create();
                customerDropDown.create();
                amountInput.create();
                statusDropDown.create();
                transferDatePicker.create();
                fromAccountDropDown.create();
                toAccountDropDown.create();
                transferAmountInput.create();
                mainModal.create();
                transferModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', () => { resetFormState(); });
                transferModalRef.value?.addEventListener('hidden.bs.modal', () => { resetTransferState(); });

            } catch (e) {
                console.error('page init error:', e);
            }
        });

        const mainGrid = {
            obj: null,
            create: async (dataSource) => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '240px',
                    dataSource: dataSource,
                    allowFiltering: true, allowSorting: true, allowSelection: true, allowGrouping: true,
                    allowTextWrap: true, allowResizing: true, allowPaging: true, allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'transactionDate', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true, showColumnMenu: true, gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'transactionDate', headerText: 'Date', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'transactionTypeName', headerText: 'Type', width: 100, minWidth: 100 },
                        { field: 'cashAccountName', headerText: 'Account', width: 180, minWidth: 180 },
                        { field: 'cashCategoryName', headerText: 'Category', width: 150, minWidth: 150 },
                        { field: 'customerName', headerText: 'Customer', width: 180, minWidth: 180 },
                        { field: 'amount', headerText: 'Amount', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 250, minWidth: 250 },
                        { field: 'sourceModuleNumber', headerText: 'Source', width: 130, minWidth: 130 },
                        { field: 'statusName', headerText: 'Status', width: 120, minWidth: 120 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'Transfer', tooltipText: 'Fund Transfer', prefixIcon: 'e-repeat', id: 'TransferCustom' },
                        { type: 'Separator' },
                    ],
                    dataBound: function () { mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false); },
                    rowSelected: () => {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], mainGrid.obj.getSelectedRecords().length == 1);
                    },
                    rowDeselected: () => {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], mainGrid.obj.getSelectedRecords().length == 1);
                    },
                    rowSelecting: () => { if (mainGrid.obj.getSelectedRecords().length) mainGrid.obj.clearSelection(); },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') mainGrid.obj.excelExport();

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Cash Transaction';
                            resetFormState();
                            state.transactionDate = DateFormatManager.parseBusinessDate(new Date());
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'TransferCustom') {
                            resetTransferState();
                            state.transfer.transferDate = DateFormatManager.parseBusinessDate(new Date());
                            transferModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const r = mainGrid.obj.getSelectedRecords()[0];
                                if (r.sourceModule === 'CashTransfer') {
                                    Swal.fire({
                                        icon: 'info',
                                        text: 'Cash transfer legs cannot be edited. Delete the transfer and create a new one.'
                                    });
                                    return;
                                }
                                state.mainTitle = 'Edit Cash Transaction';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.status = r.status;
                                state.amount = r.amount;
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.customerId = r.customerId;
                                state.sourceModule = r.sourceModule;
                                state.sourceModuleId = r.sourceModuleId;
                                state.sourceModuleNumber = r.sourceModuleNumber;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const r = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = r.sourceModule === 'CashTransfer' ? 'Delete Cash Transfer?' : 'Delete Cash Transaction?';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.status = r.status;
                                state.amount = r.amount;
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.customerId = r.customerId;
                                mainModal.obj.show();
                            }
                        }
                    }
                });
                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => { mainGrid.obj.setProperties({ dataSource: state.mainData }); }
        };

        const mainModal = {
            obj: null,
            create: () => {
                mainModal.obj = new bootstrap.Modal(mainModalRef.value, { backdrop: 'static', keyboard: false });
            }
        };

        const transferModal = {
            obj: null,
            create: () => {
                transferModal.obj = new bootstrap.Modal(transferModalRef.value, { backdrop: 'static', keyboard: false });
            }
        };

        return {
            mainGridRef, mainModalRef,
            transactionDateRef, transactionTypeRef, cashAccountRef, cashCategoryRef, customerRef, amountRef, statusRef,
            transferModalRef, transferDateRef, fromAccountRef, toAccountRef, transferAmountRef,
            state, handler
        };
    }
};

Vue.createApp(App).mount('#app');
