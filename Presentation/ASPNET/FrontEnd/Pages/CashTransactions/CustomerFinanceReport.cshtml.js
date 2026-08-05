const App = {
    setup() {
        const state = Vue.reactive({
            allData: [],
            mainData: [],
            partnerList: [],
            filter: {
                partnerId: null,
                fromDate: null,
                toDate: null
            },
            summary: {
                totalReceived: 0,
                totalSpent: 0,
                profit: 0,
                totalReceivedText: '0',
                totalSpentText: '0',
                profitText: '0'
            }
        });

        const mainGridRef = Vue.ref(null);
        const partnerRef = Vue.ref(null);
        const fromDateRef = Vue.ref(null);
        const toDateRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                return await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
            },
            getPartnerList: async () => {
                const custResp = await AxiosManager.get('/Customer/GetCustomerList', {});
                const vendResp = await AxiosManager.get('/Vendor/GetVendorList', {});
                return { customers: custResp?.data?.content?.data ?? [], vendors: vendResp?.data?.content?.data ?? [] };
            },
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                const rows = response?.data?.content?.data ?? [];
                state.allData = rows
                    .filter(item => (item.customerId || item.vendorId))
                    .map(item => {
                        const debitAmount = item.transactionType === 0 ? (item.amount ?? 0) : 0;
                        const creditAmount = item.transactionType === 1 ? (item.amount ?? 0) : 0;
                        const debtAmount = (item.amount ?? 0) - (item.paidAmount ?? 0);
                        let paymentStatusStr = 'Chưa thanh toán';
                        if (item.paidAmount >= item.amount && item.amount > 0) {
                            paymentStatusStr = 'Đã thanh toán';
                        } else if (item.paidAmount > 0) {
                            paymentStatusStr = 'Còn nợ';
                        } else if (item.amount === 0) {
                            paymentStatusStr = 'Hoàn tất';
                        }
                        
                        return {
                            partnerName: item.customerName || item.vendorName || '',
                            customerId: item.customerId,
                            vendorId: item.vendorId,
                            number: item.number,
                            transactionDate: DateFormatManager.parseBusinessDate(item.transactionDate),
                            transactionTypeName: item.transactionType === 0 ? 'Debit' : item.transactionType === 1 ? 'Credit' : '',
                            cashAccountName: item.cashAccountName || '',
                            cashCategoryName: item.cashCategoryName || '',
                            description: item.description,
                            sourceModuleNumber: item.sourceModuleNumber,
                            debitAmount,
                            creditAmount,
                            netAmount: debitAmount - creditAmount,
                            debtAmount: debtAmount > 0 ? debtAmount : 0,
                            paymentStatus: paymentStatusStr
                        };
                    });
            },
            populatePartnerList: async () => {
                const data = await services.getPartnerList();
                const partnerMap = new Map();
                data.customers.forEach(c => {
                    if (!c.name) return;
                    partnerMap.set(c.name.toLowerCase().trim(), { name: c.name, customerIds: [c.id], vendorIds: [] });
                });
                data.vendors.forEach(v => {
                    if (!v.name) return;
                    const key = v.name.toLowerCase().trim();
                    if (partnerMap.has(key)) {
                        partnerMap.get(key).vendorIds.push(v.id);
                    } else {
                        partnerMap.set(key, { name: v.name, customerIds: [], vendorIds: [v.id] });
                    }
                });
                let idCounter = 1;
                state.partnerList = Array.from(partnerMap.values()).map(p => ({
                    id: String(idCounter++),
                    name: p.name,
                    customerIds: p.customerIds,
                    vendorIds: p.vendorIds
                }));
            },
            applyFilters: () => {
                const startOfDay = (value) => {
                    const d = new Date(value);
                    d.setHours(0, 0, 0, 0);
                    return d.getTime();
                };

                state.mainData = state.allData.filter(item => {
                    if (state.filter.partnerId) {
                        const partner = state.partnerList.find(p => p.id === state.filter.partnerId);
                        if (!partner) return false;
                        const matchCustomer = item.customerId && partner.customerIds.includes(item.customerId);
                        const matchVendor = item.vendorId && partner.vendorIds.includes(item.vendorId);
                        if (!matchCustomer && !matchVendor) return false;
                    }
                    if (state.filter.fromDate || state.filter.toDate) {
                        if (!item.transactionDate) return false;
                        const t = startOfDay(item.transactionDate);
                        if (state.filter.fromDate && t < startOfDay(state.filter.fromDate)) return false;
                        if (state.filter.toDate && t > startOfDay(state.filter.toDate)) return false;
                    }
                    return true;
                });

                state.summary.totalReceived = state.mainData.reduce((sum, item) => sum + (item.debitAmount ?? 0), 0);
                state.summary.totalSpent = state.mainData.reduce((sum, item) => sum + (item.creditAmount ?? 0), 0);
                state.summary.profit = state.summary.totalReceived - state.summary.totalSpent;
                state.summary.totalReceivedText = NumberFormatManager.formatToLocale(state.summary.totalReceived);
                state.summary.totalSpentText = NumberFormatManager.formatToLocale(state.summary.totalSpent);
                state.summary.profitText = NumberFormatManager.formatToLocale(state.summary.profit);

                if (mainGrid.obj) {
                    mainGrid.refresh();
                }
            }
        };

        const partnerDropDown = {
            obj: null,
            create: () => {
                partnerDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.partnerList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Partner',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (e) => {
                        e.preventDefaultAction = true;
                        let query = new ej.data.Query();
                        if (e.text !== '') {
                            query = query.where('name', 'startswith', e.text, true);
                        }
                        e.updateData(state.partnerList, query);
                    },
                    change: (args) => {
                        state.filter.partnerId = args.value;
                        methods.applyFilters();
                    }
                });
                partnerDropDown.obj.appendTo(partnerRef.value);
            },
            refresh: () => { if (partnerDropDown.obj) partnerDropDown.obj.value = state.filter.partnerId; }
        };

        const fromDatePicker = {
            obj: null,
            create: () => {
                fromDatePicker.obj = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                    placeholder: 'Select Date',
                    change: (args) => {
                        state.filter.fromDate = args.value ? DateFormatManager.parseBusinessDate(args.value) : null;
                        methods.applyFilters();
                    }
                }));
                fromDatePicker.obj.appendTo(fromDateRef.value);
            },
            refresh: () => {
                if (fromDatePicker.obj) {
                    fromDatePicker.obj.value = state.filter.fromDate ? DateFormatManager.parseBusinessDate(state.filter.fromDate) : null;
                    fromDatePicker.obj.dataBind();
                }
            }
        };

        const toDatePicker = {
            obj: null,
            create: () => {
                toDatePicker.obj = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                    placeholder: 'Select Date',
                    change: (args) => {
                        state.filter.toDate = args.value ? DateFormatManager.parseBusinessDate(args.value) : null;
                        methods.applyFilters();
                    }
                }));
                toDatePicker.obj.appendTo(toDateRef.value);
            },
            refresh: () => {
                if (toDatePicker.obj) {
                    toDatePicker.obj.value = state.filter.toDate ? DateFormatManager.parseBusinessDate(state.filter.toDate) : null;
                    toDatePicker.obj.dataBind();
                }
            }
        };

        const handler = {
            handleClearFilters: () => {
                state.filter.partnerId = null;
                state.filter.fromDate = null;
                state.filter.toDate = null;
                partnerDropDown.refresh();
                fromDatePicker.refresh();
                toDatePicker.refresh();
                methods.applyFilters();
            }
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
                    groupSettings: {
                        columns: ['partnerName']
                    },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'transactionDate', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'partnerName', headerText: 'Partner', width: 200, minWidth: 200 },
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'transactionDate', headerText: 'Date', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'transactionTypeName', headerText: 'Type', width: 100, minWidth: 100 },
                        { field: 'cashAccountName', headerText: 'Account', width: 180, minWidth: 180 },
                        { field: 'cashCategoryName', headerText: 'Category', width: 150, minWidth: 150 },
                        { field: 'debitAmount', headerText: 'Received', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'creditAmount', headerText: 'Spent', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'netAmount', headerText: 'Net', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'paymentStatus', headerText: 'Payment Status', width: 150, minWidth: 150 },
                        { field: 'debtAmount', headerText: 'Debt', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 250, minWidth: 250 },
                        { field: 'sourceModuleNumber', headerText: 'Source', width: 130, minWidth: 130 }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'debitAmount',
                                    groupCaptionTemplate: 'Total Received: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'creditAmount',
                                    groupCaptionTemplate: 'Total Spent: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'netAmount',
                                    groupCaptionTemplate: 'Profit: ${Sum}',
                                    format: 'N0'
                                }
                            ]
                        }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                    ],
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            mainGrid.obj.clearSelection();
                        }
                    },
                    toolbarClick: (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }
                    }
                });

                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => {
                mainGrid.obj.setProperties({ dataSource: state.mainData });
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['CashTransactions']);
                await SecurityManager.validateToken();

                await methods.populatePartnerList();
                await methods.populateMainData();
                methods.applyFilters();
                await mainGrid.create(state.mainData);

                partnerDropDown.create();
                fromDatePicker.create();
                toDatePicker.create();
            } catch (e) {
                console.error('page init error:', e);
            }
        });

        return {
            mainGridRef,
            partnerRef,
            fromDateRef,
            toDateRef,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');
