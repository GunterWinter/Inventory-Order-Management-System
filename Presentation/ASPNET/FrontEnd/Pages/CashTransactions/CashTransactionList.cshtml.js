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
            originalPaidAmount: 0,
            sourceModule: null,
            sourceModuleId: null,
            sourceModuleNumber: null,
            allocationDetails: [],
            allocationRows: [],
            showAllocationDetails: false,
            paymentHistory: [],
            sourceDetailsLoading: false,
            sourceDetailsError: '',
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
        let allocationRowSequence = 0;
        const createAllocationRow = allocation => ({
            ...allocation,
            amount: allocation?.amount == null ? '' : NumberFormatManager.formatToLocale(allocation.amount),
            __uiKey: allocation?.__uiKey ?? `allocation-${++allocationRowSequence}`
        });

        const transactionTypeOptions = [
            { value: 0, text: 'Debit' },
            { value: 1, text: 'Credit' }
        ];

        const statusOptions = [
            { value: 0, text: 'Unpaid' },
            { value: 1, text: 'Partially Paid' },
            { value: 2, text: 'Paid' }
        ];

        const sourceModulesWithItems = new Set([
            'purchaseorder',
            'salesorder',
            'materialexport',
            'salesreturn',
            'purchasereturn'
        ]);

        const validateForm = function () {
            state.errors.transactionDate = '';
            state.errors.transactionType = '';
            state.errors.cashAccountId = '';
            state.errors.amount = '';
            state.errors.paidAmount = '';
            let isValid = true;

            if (!state.transactionDate) { state.errors.transactionDate = 'Transaction Date is required.'; isValid = false; }
            if (state.transactionType === null || state.transactionType === undefined) { state.errors.transactionType = 'Transaction Type is required.'; isValid = false; }
            if (!state.amount || state.amount <= 0) { state.errors.amount = 'Amount must be greater than 0.'; isValid = false; }
            if (Number(state.paidAmount ?? 0) < Number(state.originalPaidAmount ?? 0)) {
                state.errors.paidAmount = 'Không được giảm số tiền đã trả; hãy lập nghiệp vụ hoàn/hủy riêng.';
                isValid = false;
            }
            if (state.paidAmount !== null && state.paidAmount !== undefined && Number(state.paidAmount) > Number(state.amount)) {
                state.errors.paidAmount = 'Paid amount cannot exceed the original amount.';
                isValid = false;
            }
            if (Number(state.paidAmount ?? 0) > Number(state.originalPaidAmount ?? 0) && !state.cashAccountId) {
                state.errors.cashAccountId = 'Phải chọn tài khoản quỹ khi ghi nhận thanh toán.';
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
            state.originalPaidAmount = 0;
            state.description = '';
            state.cashAccountId = null;
            state.cashCategoryId = null;
            state.partnerId = null;
            state.sourceModule = null;
            state.sourceModuleId = null;
            state.sourceModuleNumber = null;
            state.allocationDetails = [];
            state.allocationRows = [];
            state.showAllocationDetails = false;
            state.paymentHistory = [];
            state.sourceDetailsLoading = false;
            state.sourceDetailsError = '';
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
            getSourceItems: async (cashTransactionId) => {
                return await AxiosManager.get(
                    `/CashTransaction/GetCashTransactionSourceItems?cashTransactionId=${encodeURIComponent(cashTransactionId)}`,
                    {});
            },
            getPaymentHistory: async (cashTransactionId) => {
                return await AxiosManager.get(
                    `/PurchaseOrder/GetPurchaseOrderPaymentHistory?cashTransactionId=${encodeURIComponent(cashTransactionId)}`,
                    {});
            }
        };

        const methods = {
            formatMoney: value => NumberFormatManager.formatMoneyToLocale(value ?? 0),
            formatNumber: value => NumberFormatManager.formatToLocale(value ?? 0),
            formatDate: value => DateFormatManager.formatToLocale(value),
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
                        statusName: (item.paidAmount >= item.amount && item.amount > 0) ? 'Paid' : (item.paidAmount > 0 ? 'Partially Paid' : 'Unpaid'),
                        remaining: Math.max(0, Number(item.amount ?? 0) - Number(item.paidAmount ?? 0)),
                        partnerName: partnerName
                        ,allocations: item.allocations ?? []
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
            loadSourceDetails: async () => {
                state.allocationDetails = [];
                state.paymentHistory = [];
                state.sourceDetailsError = '';
                if (!state.id) return;

                state.sourceDetailsLoading = true;
                try {
                    const hasSupportedSource = sourceModulesWithItems.has(
                        (state.sourceModule ?? '').toLowerCase()) && !!state.sourceModuleId;
                    const [allocationResponse, paymentResponse] = await Promise.all([
                        hasSupportedSource ? services.getSourceItems(state.id) : Promise.resolve(null),
                        services.getPaymentHistory(state.id)
                    ]);
                    if ((allocationResponse && allocationResponse?.data?.code !== 200) || paymentResponse?.data?.code !== 200) {
                        throw new Error('Không thể tải chi tiết chứng từ nguồn.');
                    }
                    state.allocationDetails = Array.isArray(allocationResponse?.data?.content?.data)
                        ? allocationResponse.data.content.data
                        : [];
                    state.paymentHistory = Array.isArray(paymentResponse?.data?.content?.data)
                        ? paymentResponse.data.content.data
                        : [];
                    await Vue.nextTick();
                } catch (error) {
                    state.sourceDetailsError = error.response?.data?.message
                        ?? error.message
                        ?? 'Không thể tải chi tiết chứng từ nguồn.';
                } finally {
                    state.sourceDetailsLoading = false;
                }
            },
            isEditableSource: () => !!state.sourceModule,
            isSourceTransaction: () => !!state.sourceModule && !!state.sourceModuleId,
            hasSupportedSourceItems: () => sourceModulesWithItems.has((state.sourceModule ?? '').toLowerCase()),
            isManualTransaction: () => !methods.isSourceTransaction(),
            canShowAllocationToggle: () => methods.isManualTransaction() && !state.viewMode && !state.deleteMode,
            shouldShowAllocationPanel: () => methods.isManualTransaction()
                && ((state.viewMode || state.deleteMode)
                    ? state.allocationRows.length > 0
                    : state.showAllocationDetails),
            shouldShowGoodsPanel: () => methods.isSourceTransaction() && methods.hasSupportedSourceItems(),
            isFormReadOnly: () => state.viewMode || state.deleteMode,
            canEditPrimaryFields: () => !state.viewMode && !state.deleteMode && !state.sourceModule,
            canEditRestrictedFields: () => !state.viewMode && !state.deleteMode,
            canEditPaidAmount: () => !state.viewMode && !state.deleteMode,
            canEditCashAccount: () => !state.viewMode && !state.deleteMode
            ,allocationTotal: () => state.allocationRows.reduce((sum, row) => sum + (NumberFormatManager.parseLocaleNumber(row.amount) || 0), 0)
            ,validateAllocations: () => {
                if (state.allocationRows.length === 0 || !methods.canEditPrimaryFields()) return true;
                return Math.abs(methods.allocationTotal() - (Number(state.amount) || 0)) <= 0.000001;
            }
            ,syncAmountFromAllocations: () => {
                if (!methods.shouldShowAllocationPanel() || !methods.canEditPrimaryFields()) return;
                state.amount = methods.allocationTotal();
            }
            ,onAllocationAmountInput: (row, event) => {
                row.amount = event?.target?.value ?? '';
                Vue.nextTick(() => methods.syncAmountFromAllocations());
            }
            ,partnerOptions: () => state.partnerList
            ,refreshAllocationDropdowns: () => Vue.nextTick(() => {
                window.DropdownSearchManager?.refresh(mainModalRef.value);
            })
            ,toggleAllocationDetails: () => {
                state.showAllocationDetails = !state.showAllocationDetails;
                partnerDropDown.refresh();
                methods.refreshAllocationDropdowns();
            }
            ,setAllocationRows: (allocations) => {
                state.allocationRows = (allocations ?? []).map(createAllocationRow);
                state.showAllocationDetails = state.allocationRows.length > 0;
                methods.refreshAllocationDropdowns();
            }
            ,addAllocation: () => {
                state.allocationRows.push(createAllocationRow({ customerId: null, amount: 0, description: '' }));
                methods.refreshAllocationDropdowns();
            }
            ,removeAllocation: (index) => {
                state.allocationRows.splice(index, 1);
                methods.syncAmountFromAllocations();
                methods.refreshAllocationDropdowns();
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
            refresh: () => {
                if (transactionTypeDropDown.obj) {
                    transactionTypeDropDown.obj.value = state.transactionType;
                    transactionTypeDropDown.obj.enabled = methods.canEditPrimaryFields();
                    transactionTypeDropDown.obj.dataBind();
                }
            }
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
            refresh: () => {
                if (cashAccountDropDown.obj) {
                    cashAccountDropDown.obj.value = state.cashAccountId;
                    cashAccountDropDown.obj.enabled = methods.canEditCashAccount();
                    cashAccountDropDown.obj.dataBind();
                }
            }
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
            refresh: () => {
                if (cashCategoryDropDown.obj) {
                    cashCategoryDropDown.obj.value = state.cashCategoryId;
                    cashCategoryDropDown.obj.enabled = methods.canEditRestrictedFields();
                    cashCategoryDropDown.obj.dataBind();
                }
            }
        };

        const partnerDropDown = {
            obj: null,
            create: () => {
                partnerDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: methods.partnerOptions(),
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Partner',
                    filterBarPlaceholder: 'Search...',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (e) => {
                        let query = new ej.data.Query();
                        query = (e.text !== '') ? query.where('name', 'startswith', e.text, true) : query;
                        e.updateData(methods.partnerOptions(), query);
                    },
                    change: (args) => { state.partnerId = args.value; }
                });
                partnerDropDown.obj.appendTo(partnerRef.value);
            },
            refresh: () => {
                if (partnerDropDown.obj) {
                    partnerDropDown.obj.dataSource = methods.partnerOptions();
                    partnerDropDown.obj.value = state.partnerId;
                    partnerDropDown.obj.enabled = methods.canEditPrimaryFields();
                    partnerDropDown.obj.dataBind();
                }
            }
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
            refresh: () => {
                if (amountInput.obj) {
                    amountInput.obj.value = state.amount;
                    amountInput.obj.enabled = methods.canEditPrimaryFields();
                    amountInput.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(amountInput.obj);
                }
            }
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
            refresh: () => {
                if (transferAmountInput.obj) {
                    transferAmountInput.obj.value = state.transfer.amount;
                    transferAmountInput.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(transferAmountInput.obj);
                }
            }
        };

        const paidAmountInput = {
            obj: null,
            create: () => {
                paidAmountInput.obj = new ej.inputs.NumericTextBox({
                    placeholder: 'Paid Amount',
                    format: 'N0',
                    min: 0,
                    change: (args) => { state.paidAmount = args.value; }
                });
                paidAmountInput.obj.appendTo(paidAmountRef.value);
            },
            refresh: () => {
                if (paidAmountInput.obj) {
                    paidAmountInput.obj.value = state.paidAmount;
                    paidAmountInput.obj.enabled = methods.canEditPaidAmount();
                    paidAmountInput.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(paidAmountInput.obj);
                }
            }
        };

        Vue.watch(() => state.transactionDate, () => { state.errors.transactionDate = ''; transactionDatePicker.refresh(); });
        Vue.watch(() => state.transactionType, () => { state.errors.transactionType = ''; transactionTypeDropDown.refresh(); });
        Vue.watch(() => state.cashAccountId, () => { state.errors.cashAccountId = ''; cashAccountDropDown.refresh(); });
        Vue.watch(() => state.cashCategoryId, () => { cashCategoryDropDown.refresh(); });
        Vue.watch(() => state.partnerId, () => { partnerDropDown.refresh(); });
        Vue.watch(() => state.sourceModule, (sourceModule) => {
            if (sourceModule) state.showAllocationDetails = false;
            partnerDropDown.refresh();
        });
        Vue.watch(() => state.amount, () => {
            state.errors.amount = '';
            if (document.activeElement !== amountInput.obj?.element) {
                amountInput.refresh();
            }
        });
        Vue.watch(() => state.paidAmount, () => {
            state.errors.paidAmount = '';
            if (document.activeElement !== paidAmountInput.obj?.element) {
                paidAmountInput.refresh();
            }
        });
        Vue.watch(() => state.transfer.transferDate, () => { state.transfer.errors.transferDate = ''; transferDatePicker.refresh(); });
        Vue.watch(() => state.transfer.fromCashAccountId, () => { state.transfer.errors.fromCashAccountId = ''; fromAccountDropDown.refresh(); });
        Vue.watch(() => state.transfer.toCashAccountId, () => { state.transfer.errors.toCashAccountId = ''; toAccountDropDown.refresh(); });
        Vue.watch(() => state.transfer.amount, () => {
            state.transfer.errors.amount = '';
            if (document.activeElement !== transferAmountInput.obj?.element) {
                transferAmountInput.refresh();
            }
        });

        const refreshMainFormControls = () => {
            if (transactionDatePicker.obj) {
                transactionDatePicker.obj.enabled = methods.canEditRestrictedFields();
                transactionDatePicker.obj.dataBind();
            }
            transactionTypeDropDown.refresh();
            cashAccountDropDown.refresh();
            cashCategoryDropDown.refresh();
            partnerDropDown.refresh();
            amountInput.refresh();
            paidAmountInput.refresh();
        };

        const showMainModal = async () => {
            await Vue.nextTick();
            refreshMainFormControls();
            mainModal.obj.show();
        };

        const handler = {
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;
                    await new Promise(resolve => setTimeout(resolve, 300));

                    if (!validateForm()) return;
                    if (!methods.validateAllocations()) {
                        Swal.fire({ icon: 'error', title: 'Phân bổ chưa hợp lệ', text: 'Tổng giá trị phân bổ phải bằng số tiền của giao dịch.' });
                        return;
                    }



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
                        paymentDate: DateFormatManager.formatForApiDate(new Date()),
                        description: state.description,
                        cashAccountId: state.cashAccountId,
                        cashCategoryId: state.cashCategoryId,
                        customerId: customerId,
                        vendorId: vendorId,
                        sourceModule: state.sourceModule,
                        sourceModuleId: state.sourceModuleId,
                        sourceModuleNumber: state.sourceModuleNumber,
                        allocations: state.allocationRows.map(row => ({ customerId: row.customerId || null, amount: NumberFormatManager.parseLocaleNumber(row.amount) || 0, description: row.description || null })).filter(row => row.amount > 0),
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
                            state.originalPaidAmount = Number(data.paidAmount ?? 0);
                            state.description = data.description ?? '';
                            state.cashAccountId = data.cashAccountId;
                            state.cashCategoryId = data.cashCategoryId;
                            state.partnerId = data.customerId ? ('cust_' + data.customerId) : (data.vendorId ? ('vend_' + data.vendorId) : null);
                            state.sourceModule = data.sourceModule ?? state.sourceModule;
                            state.sourceModuleId = data.sourceModuleId ?? state.sourceModuleId;
                            state.sourceModuleNumber = data.sourceModuleNumber ?? state.sourceModuleNumber;
                            methods.setAllocationRows(data.allocations);
                            await methods.loadSourceDetails();
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
                mainModalRef.value?.addEventListener('shown.bs.modal', () => {
                    refreshMainFormControls();
                });
                mainModalRef.value?.addEventListener('hidden.bs.modal', () => {
                    resetFormState();
                    requestAnimationFrame(() => {
                        if (!mainGrid.obj?.isDestroyed) {
                            mainGrid.obj.setProperties({ dataSource: state.mainData }, true);
                            mainGrid.obj.refresh();
                        }
                    });
                });
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
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Multiple', checkboxOnly: true },
                    autoFit: true, showColumnMenu: true, gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'transactionDate', headerText: 'Date', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'transactionTypeName', headerText: 'Type', width: 100, minWidth: 100 },
                        { field: 'cashAccountName', headerText: 'Cash Account', width: 180, minWidth: 180 },
                        { field: 'cashCategoryName', headerText: 'Cash Category', width: 150, minWidth: 150 },
                        { field: 'partnerName', headerText: 'Partner', width: 180, minWidth: 180 },
                        { field: 'amount', headerText: 'Original Amount', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'paidAmount', headerText: 'Paid Amount', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'remaining', headerText: 'Remaining', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 250, minWidth: 250 },
                        { field: 'sourceModuleNumber', headerText: 'Source', width: 130, minWidth: 130 },
                        { field: 'statusName', headerText: 'Status', width: 120, minWidth: 120 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'amount',
                                    format: 'N0',
                                    footerTemplate: 'Total: ${Sum}',
                                    groupFooterTemplate: 'Total: ${Sum}',
                                    groupCaptionTemplate: 'Total: ${Sum}'
                                },
                                {
                                    type: 'Sum',
                                    field: 'paidAmount',
                                    format: 'N0',
                                    footerTemplate: 'Total: ${Sum}',
                                    groupFooterTemplate: 'Total: ${Sum}',
                                    groupCaptionTemplate: 'Paid: ${Sum}'
                                }
                            ]
                        }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'View', tooltipText: 'View details', prefixIcon: 'e-eye', id: 'ViewCustom' },
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
                    recordDoubleClick: async (args) => {
                        if (args.rowData) {
                            state.viewMode = true;
                            state.deleteMode = false;
                            state.mainTitle = 'View Cash Transaction';
                            state.id = args.rowData.id ?? '';
                            state.number = args.rowData.number ?? '';
                            state.transactionDate = DateFormatManager.parseBusinessDate(args.rowData.transactionDate);
                            state.transactionType = args.rowData.transactionType;
                            state.amount = args.rowData.amount;
                            state.paidAmount = args.rowData.paidAmount;
                            state.originalPaidAmount = Number(args.rowData.paidAmount ?? 0);
                            state.description = args.rowData.description ?? '';
                            state.cashAccountId = args.rowData.cashAccountId;
                            state.cashCategoryId = args.rowData.cashCategoryId;
                            state.partnerId = args.rowData.customerId ? ('cust_' + args.rowData.customerId) : (args.rowData.vendorId ? ('vend_' + args.rowData.vendorId) : null);
                            state.sourceModule = args.rowData.sourceModule;
                            state.sourceModuleId = args.rowData.sourceModuleId;
                                state.sourceModuleNumber = args.rowData.sourceModuleNumber;
                                methods.setAllocationRows(args.rowData.allocations);
                            await methods.loadSourceDetails();
                            await showMainModal();
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') mainGrid.obj.excelExport();

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Cash Transaction';
                            resetFormState();
                            state.transactionDate = DateFormatManager.parseBusinessDate(new Date());
                            await showMainModal();
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
                                state.mainTitle = 'View Cash Transaction';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.amount = r.amount;
                                state.paidAmount = r.paidAmount;
                                state.originalPaidAmount = Number(r.paidAmount ?? 0);
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.partnerId = r.customerId ? ('cust_' + r.customerId) : (r.vendorId ? ('vend_' + r.vendorId) : null);
                                state.sourceModule = r.sourceModule;
                                state.sourceModuleId = r.sourceModuleId;
                                state.sourceModuleNumber = r.sourceModuleNumber;
                                methods.setAllocationRows(r.allocations);
                                await methods.loadSourceDetails();
                                await showMainModal();
                            }
                        }

                        if (args.item.id === 'EditCustom') {
                            state.viewMode = false;
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const r = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Cash Transaction';
                                state.id = r.id ?? '';
                                state.number = r.number ?? '';
                                state.transactionDate = DateFormatManager.parseBusinessDate(r.transactionDate);
                                state.transactionType = r.transactionType;
                                state.amount = r.amount;
                                state.paidAmount = r.paidAmount;
                                state.originalPaidAmount = Number(r.paidAmount ?? 0);
                                state.description = r.description ?? '';
                                state.cashAccountId = r.cashAccountId;
                                state.cashCategoryId = r.cashCategoryId;
                                state.partnerId = r.customerId ? ('cust_' + r.customerId) : (r.vendorId ? ('vend_' + r.vendorId) : null);
                                state.sourceModule = r.sourceModule;
                                state.sourceModuleId = r.sourceModuleId;
                                state.sourceModuleNumber = r.sourceModuleNumber;
                                methods.setAllocationRows(r.allocations);
                                await methods.loadSourceDetails();
                                await showMainModal();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            const result = await Swal.fire({ icon: 'warning', title: 'Xác nhận xóa', text: `Bạn có chắc chắn muốn xóa ${selected.length} giao dịch tiền mặt đã chọn không?`, showCancelButton: true, confirmButtonText: 'Xóa', cancelButtonText: 'Hủy', heightAuto: false });
                            if (!result.isConfirmed) return;
                            for (const record of selected) await services.deleteMainData(record.id, StorageManager.getUserId());
                            await methods.populateMainData();
                            mainGrid.refresh();
                            Swal.fire({ icon: 'success', title: 'Đã xóa', text: `Đã xóa ${selected.length} giao dịch tiền mặt.`, heightAuto: false });
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
            state, handler, methods
        };
    }
};

Vue.createApp(App).mount('#app');
