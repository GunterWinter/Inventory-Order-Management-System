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
            partnerId: null,
            paidAmount: null,
            sourceModule: null,
            sourceModuleId: null,
            sourceModuleNumber: null,
            cashAccountList: [],
            cashCategoryList: [],
            partnerList: [],
            errors: {
                transactionDate: '',
                transactionType: '',
                cashAccountId: '',
                amount: '',
                paidAmount: ''
            },
            isSubmitting: false,
            viewMode: false,
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
        const partnerRef = Vue.ref(null);
        const amountRef = Vue.ref(null);
        const paidAmountRef = Vue.ref(null);
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
            { value: 0, text: 'Chưa thanh toán' },
            { value: 1, text: 'Còn nợ' },
            { value: 2, text: 'Đã thanh toán' }
        ];

        const validateForm = function () {
            state.errors.transactionDate = '';
            state.errors.transactionType = '';
            state.errors.cashAccountId = '';
            state.errors.amount = '';
            state.errors.paidAmount = '';
            let isValid = true;

            if (!state.transactionDate) { state.errors.transactionDate = 'Transaction Date is required.'; isValid = false; }
            if (state.transactionType === null || state.transactionType === undefined) { state.errors.transactionType = 'Transaction Type is required.'; isValid = false; }
            if (!state.cashAccountId) { state.errors.cashAccountId = 'Cash Account is required.'; isValid = false; }
            if (!state.amount || state.amount <= 0) { state.errors.amount = 'Amount must be greater than 0.'; isValid = false; }
            if (state.paidAmount !== null && state.paidAmount !== undefined && Number(state.paidAmount) > Number(state.amount)) {
                state.errors.paidAmount = 'Số tiền thanh toán không được lớn hơn số tiền gốc.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.number = '';
            state.transactionDate = null;
            state.transactionType = null;
            state.amount = null;
            state.paidAmount = null;
            state.description = '';
            state.cashAccountId = null;
            state.cashCategoryId = null;
            state.partnerId = null;
            state.sourceModule = null;
            state.sourceModuleId = null;
            state.sourceModuleNumber = null;
            state.viewMode = false;
            state.errors = { transactionDate: '', transactionType: '', cashAccountId: '', amount: '', paidAmount: '' };
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
            getVendorList: async () => {
                return await AxiosManager.get('/Vendor/GetVendorList', {});
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
                const rawData = response?.data?.content?.data ?? [];
                state.mainData = rawData.map(item => {
                    let partnerName = '';
                    if (item.customerName && item.vendorName) partnerName = item.customerName;
                    else if (item.customerName) partnerName = item.customerName;
                    else if (item.vendorName) partnerName = item.vendorName;

                    return {
                        ...item,
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        transactionDate: DateFormatManager.parseBusinessDate(item.transactionDate),
                        transactionTypeName: item.transactionType === 0 ? 'Debit' : item.transactionType === 1 ? 'Credit' : '',
                        statusName: (item.paidAmount >= item.amount && item.amount > 0) ? 'Đã thanh toán' : (item.paidAmount > 0 ? 'Còn nợ' : 'Chưa thanh toán'),
                        partnerName: partnerName
                    };
                });
            },
            populateCashAccountList: async () => {
                const response = await services.getCashAccountList();
                state.cashAccountList = response?.data?.content?.data ?? [];
            },
            populateCashCategoryList: async () => {
                const response = await services.getCashCategoryList();
                state.cashCategoryList = response?.data?.content?.data ?? [];
            },
            populatePartnerList: async () => {
                const [custResp, vendResp] = await Promise.all([services.getCustomerList(), services.getVendorList()]);
                const customers = (custResp?.data?.content?.data ?? []).map(c => ({ id: 'cust_' + c.id, name: '[KH] ' + c.name, customerId: c.id, vendorId: null }));
                const vendors = (vendResp?.data?.content?.data ?? []).map(v => ({ id: 'vend_' + v.id, name: '[NCC] ' + v.name, customerId: null, vendorId: v.id }));
                state.partnerList = [...customers, ...vendors];
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

        const partnerDropDown = {
            obj: null,
            create: () => {
                partnerDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.partnerList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Chọn đối tác',
                    filterBarPlaceholder: 'Tìm kiếm...',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (e) => {
                        let query = new ej.data.Query();
                        query = (e.text !== '') ? query.where('name', 'startswith', e.text, true) : query;
                        e.updateData(state.partnerList, query);
                    },
                    change: (args) => { state.partnerId = args.value; }
                });
                partnerDropDown.obj.appendTo(partnerRef.value);
            },
            refresh: () => { if (partnerDropDown.obj) partnerDropDown.obj.value = state.partnerId; }
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

        const paidAmountInput = {
            obj: null,
            create: () => {
                paidAmountInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Số tiền thanh toán',
                    format: 'N0',
                    min: 0,
                    max: state.amount || 0,
                    change: (args) => { state.paidAmount = args.value; }
                });
                paidAmountInput.obj.appendTo(paidAmountRef.value);
            },
            refresh: () => { if (paidAmountInput.obj) paidAmountInput.obj.value = state.paidAmount; }
        };

        Vue.watch(() => state.transactionDate, () => { state.errors.transactionDate = ''; transactionDatePicker.refresh(); });
        Vue.watch(() => state.transactionType, () => { state.errors.transactionType = ''; transactionTypeDropDown.refresh(); });
        Vue.watch(() => state.cashAccountId, () => { state.errors.cashAccountId = ''; cashAccountDropDown.refresh(); });
        Vue.watch(() => state.cashCategoryId, () => { cashCategoryDropDown.refresh(); });
        Vue.watch(() => state.partnerId, () => { partnerDropDown.refresh(); });
        Vue.watch(() => state.amount, () => {
            state.errors.amount = '';
            amountInput.refresh();
            if (paidAmountInput.obj) {
                paidAmountInput.obj.max = state.amount || 0;
            }
        });
        Vue.watch(() => state.paidAmount, () => { state.errors.paidAmount = ''; paidAmountInput.refresh(); });
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



                    let customerId = null;
                    let vendorId = null;
                    if (state.partnerId) {
                        const partner = state.partnerList.find(p => p.id === state.partnerId);
                        if (partner) {
                            customerId = partner.customerId || null;
                            vendorId = partner.vendorId || null;
                        }
                    }

                    const payload = {
                        id: state.id || undefined,
                        transactionDate: DateFormatManager.formatForApiDate(state.transactionDate),
                        transactionType: state.transactionType,
                        amount: state.amount,
                        paidAmount: state.paidAmount,
                        description: state.description,
                        cashAccountId: state.cashAccountId,
                        cashCategoryId: state.cashCategoryId,
                        customerId: customerId,
                        vendorId: vendorId,
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
                            state.amount = data.amount;
                            state.paidAmount = data.paidAmount;
                            state.description = data.description ?? '';
                            state.cashAccountId = data.cashAccountId;
                            state.cashCategoryId = data.cashCategoryId;
                            state.partnerId = data.customerId ? ('cust_' + data.customerId) : (data.vendorId ? ('vend_' + data.vendorId) : null);
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
                await methods.populatePartnerList();
                await methods.populateMainData();
                methods.refreshSummary();
                await mainGrid.create(state.mainData);

                transactionDatePicker.create();
                transactionTypeDropDown.create();
                cashAccountDropDown.create();
                cashCategoryDropDown.create();
                partnerDropDown.create();
                amountInput.create();
                paidAmountInput.create();
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
                        { field: 'number', headerText: 'Số chứng từ', width: 180, minWidth: 180 },
                        { field: 'transactionDate', headerText: 'Ngày', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'transactionTypeName', headerText: 'Loại', width: 100, minWidth: 100 },
                        { field: 'cashAccountName', headerText: 'Tài khoản', width: 180, minWidth: 180 },
                        { field: 'cashCategoryName', headerText: 'Danh mục', width: 150, minWidth: 150 },
                        { field: 'partnerName', headerText: 'Đối tác', width: 180, minWidth: 180 },
                        { field: 'amount', headerText: 'Số tiền gốc', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'paidAmount', headerText: 'Đã thanh toán', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Mô tả', width: 250, minWidth: 250 },
                        { field: 'sourceModuleNumber', headerText: 'Nguồn', width: 130, minWidth: 130 },
                        { field: 'statusName', headerText: 'Trạng thái', width: 120, minWidth: 120 },
                        { field: 'createdAtUtc', headerText: 'Thời điểm tạo', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'amount',
                                    format: 'N0',
                                    footerTemplate: 'T\u1ed5ng: ${Sum}',
                                    groupFooterTemplate: 'T\u1ed5ng: ${Sum}',
                                    groupCaptionTemplate: 'T\u1ed5ng: ${Sum}'
                                },
                                {
                                    type: 'Sum',
                                    field: 'paidAmount',
                                    format: 'N0',
                                    footerTemplate: 'T\u1ed5ng: ${Sum}',
                                    groupFooterTemplate: 'T\u1ed5ng: ${Sum}',
                                    groupCaptionTemplate: '\u0110\u00e3 TT: ${Sum}'
                                }
                            ]
                        }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Xem', tooltipText: 'Xem chi ti\u1ebft', prefixIcon: 'e-eye', id: 'ViewCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                        { text: 'Transfer', tooltipText: 'Fund Transfer', prefixIcon: 'e-repeat', id: 'TransferCustom' },
                        { type: 'Separator' },
                    ],
                    dataBound: function () { mainGrid.obj.toolbarModule.enableItems(['ViewCustom', 'EditCustom', 'DeleteCustom'], false); },
                    rowSelected: () => {
                        const hasSelection = mainGrid.obj.getSelectedRecords().length == 1;
                        mainGrid.obj.toolbarModule.enableItems(['ViewCustom', 'EditCustom', 'DeleteCustom'], hasSelection);
                    },
                    rowDeselected: () => {
                        const hasSelection = mainGrid.obj.getSelectedRecords().length == 1;
                        mainGrid.obj.toolbarModule.enableItems(['ViewCustom', 'EditCustom', 'DeleteCustom'], hasSelection);
                    },
                    rowSelecting: () => { if (mainGrid.obj.getSelectedRecords().length) mainGrid.obj.clearSelection(); },
                    recordDoubleClick: (args) => {
                        if (args.rowData) {
                            state.viewMode = true;
                            state.deleteMode = false;
                            state.mainTitle = 'Xem giao d\u1ecbch';
                            state.id = args.rowData.id ?? '';
                            state.number = args.rowData.number ?? '';
                            state.transactionDate = DateFormatManager.parseBusinessDate(args.rowData.transactionDate);
                            state.transactionType = args.rowData.transactionType;
                            state.amount = args.rowData.amount;
                            state.paidAmount = args.rowData.paidAmount;
                            state.description = args.rowData.description ?? '';
                            state.cashAccountId = args.rowData.cashAccountId;
                            state.cashCategoryId = args.rowData.cashCategoryId;
                            state.partnerId = args.rowData.customerId ? ('cust_' + args.rowData.customerId) : (args.rowData.vendorId ? ('vend_' + args.rowData.vendorId) : null);
                            state.sourceModule = args.rowData.sourceModule;
                            state.sourceModuleId = args.rowData.sourceModuleId;
                            state.sourceModuleNumber = args.rowData.sourceModuleNumber;
                            mainModal.obj.show();
                        }
                    },
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

                        if (args.item.id === 'ViewCustom') {
                            state.viewMode = true;
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const r = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Xem giao d\u1ecbch';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.amount = r.amount;
                                state.paidAmount = r.paidAmount;
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.partnerId = r.customerId ? ('cust_' + r.customerId) : (r.vendorId ? ('vend_' + r.vendorId) : null);
                                state.sourceModule = r.sourceModule;
                                state.sourceModuleId = r.sourceModuleId;
                                state.sourceModuleNumber = r.sourceModuleNumber;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'EditCustom') {
                            state.viewMode = false;
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
                                state.mainTitle = 'S\u1eeda giao d\u1ecbch';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.amount = r.amount;
                                state.paidAmount = r.paidAmount;
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.partnerId = r.customerId ? ('cust_' + r.customerId) : (r.vendorId ? ('vend_' + r.vendorId) : null);
                                state.sourceModule = r.sourceModule;
                                state.sourceModuleId = r.sourceModuleId;
                                state.sourceModuleNumber = r.sourceModuleNumber;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            state.viewMode = false;
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const r = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = r.sourceModule === 'CashTransfer' ? 'X\u00f3a chuy\u1ec3n kho\u1ea3n?' : 'X\u00f3a giao d\u1ecbch?';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.amount = r.amount;
                                state.paidAmount = r.paidAmount;
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.partnerId = r.customerId ? ('cust_' + r.customerId) : (r.vendorId ? ('vend_' + r.vendorId) : null);
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
            transactionDateRef, transactionTypeRef, cashAccountRef, cashCategoryRef, partnerRef, amountRef, paidAmountRef,
            transferModalRef, transferDateRef, fromAccountRef, toAccountRef, transferAmountRef,
            state, handler
        };
    }
};

Vue.createApp(App).mount('#app');
