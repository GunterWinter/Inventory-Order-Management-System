const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            customerList: [],
            isLoading: false,
            error: '',
            filter: {
                customerId: null,
                fromDate: null,
                toDate: null
            },
            summary: {
                actualReceivedText: '0',
                projectCostText: '0',
                profitText: '0'
            }
        });

        const mainGridRef = Vue.ref(null);
        const customerRef = Vue.ref(null);
        const fromDateRef = Vue.ref(null);
        const toDateRef = Vue.ref(null);
        let currentRequest = 0;

        const services = {
            getReport: async () => {
                const query = new URLSearchParams();
                if (state.filter.customerId) query.set('customerId', state.filter.customerId);
                if (state.filter.fromDate) query.set('fromDate', DateFormatManager.formatForApiDate(state.filter.fromDate));
                if (state.filter.toDate) query.set('toDate', DateFormatManager.formatForApiDate(state.filter.toDate));
                const suffix = query.toString() ? `?${query.toString()}` : '';
                return await AxiosManager.get(`/CashTransaction/GetCustomerProfitReport${suffix}`, {});
            },
            getCustomerList: async () => await AxiosManager.get('/Customer/GetCustomerList', {})
        };

        const methods = {
            populateCustomerList: async () => {
                const response = await services.getCustomerList();
                state.customerList = (response?.data?.content?.data ?? [])
                    .filter(item => item.id && item.name)
                    .sort((left, right) => left.name.localeCompare(right.name));
            },
            loadReport: async () => {
                const requestNumber = ++currentRequest;
                state.isLoading = true;
                state.error = '';
                try {
                    const response = await services.getReport();
                    if (requestNumber !== currentRequest) return;
                    if (response?.status !== 200 || response?.data?.code !== 200) {
                        throw new Error(response?.data?.message || 'Unable to load the customer profit report.');
                    }

                    const content = response?.data?.content ?? {};
                    state.mainData = (content.data ?? []).map(item => ({
                        ...item,
                        transactionDate: DateFormatManager.parseBusinessDate(item.transactionDate),
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        transactionTypeName: item.transactionType === 0 ? 'Debit' : item.transactionType === 1 ? 'Credit' : ''
                    }));
                    state.summary.actualReceivedText = NumberFormatManager.formatToLocale(content.actualReceived ?? 0);
                    state.summary.projectCostText = NumberFormatManager.formatToLocale(content.projectCost ?? 0);
                    state.summary.profitText = NumberFormatManager.formatToLocale(content.profit ?? 0);
                    mainGrid.refresh();
                } catch (error) {
                    if (requestNumber !== currentRequest) return;
                    state.mainData = [];
                    state.summary.actualReceivedText = '0';
                    state.summary.projectCostText = '0';
                    state.summary.profitText = '0';
                    state.error = error?.response?.data?.message || error?.message || 'Unable to load the customer profit report.';
                    mainGrid.refresh();
                    console.error('Customer profit report error:', error);
                } finally {
                    if (requestNumber === currentRequest) state.isLoading = false;
                }
            }
        };

        const customerDropDown = {
            obj: null,
            create: () => {
                customerDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.customerList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Select Partner',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (event) => {
                        event.preventDefaultAction = true;
                        let query = new ej.data.Query();
                        if (event.text !== '') query = query.where('name', 'contains', event.text, true);
                        event.updateData(state.customerList, query);
                    },
                    change: async (args) => {
                        state.filter.customerId = args.value || null;
                        await methods.loadReport();
                    }
                });
                customerDropDown.obj.appendTo(customerRef.value);
            },
            refresh: () => {
                if (!customerDropDown.obj) return;
                customerDropDown.obj.value = state.filter.customerId;
                customerDropDown.obj.dataBind();
            }
        };

        const createDatePicker = (ref, filterName) => {
            const picker = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                placeholder: 'Select Date',
                change: async (args) => {
                    state.filter[filterName] = args.value ? DateFormatManager.parseBusinessDate(args.value) : null;
                    await methods.loadReport();
                }
            }));
            picker.appendTo(ref.value);
            return picker;
        };

        let fromDatePicker = null;
        let toDatePicker = null;

        const handler = {
            handleClearFilters: async () => {
                state.filter.customerId = null;
                state.filter.fromDate = null;
                state.filter.toDate = null;
                customerDropDown.refresh();
                if (fromDatePicker) {
                    fromDatePicker.value = null;
                    fromDatePicker.dataBind();
                }
                if (toDatePicker) {
                    toDatePicker.value = null;
                    toDatePicker.dataBind();
                }
                await methods.loadReport();
            },
            handleRetry: async () => await methods.loadReport()
        };

        const mainGrid = {
            obj: null,
            create: () => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '340px',
                    dataSource: state.mainData,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: true,
                    groupSettings: { columns: ['customerName'] },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', '200', 'All'] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'customerName', headerText: 'Customer', width: 200, minWidth: 200 },
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'transactionDate', headerText: 'Date', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'transactionTypeName', headerText: 'Type', width: 100, minWidth: 100 },
                        { field: 'cashAccountName', headerText: 'Account', width: 160, minWidth: 160 },
                        { field: 'cashCategoryName', headerText: 'Category', width: 170, minWidth: 170 },
                        { field: 'actualReceived', headerText: 'Actual Received', width: 160, minWidth: 160, textAlign: 'Right', format: 'N0' },
                        { field: 'projectCost', headerText: 'Project Cost', width: 160, minWidth: 160, textAlign: 'Right', format: 'N0' },
                        { field: 'profit', headerText: 'Profit', width: 150, minWidth: 150, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 260, minWidth: 260 },
                        { field: 'sourceModuleNumber', headerText: 'Source', width: 150, minWidth: 150 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 170, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [{
                        columns: [
                            { type: 'Sum', field: 'actualReceived', groupCaptionTemplate: 'Actual Received: ${Sum}', footerTemplate: 'Actual Received: ${Sum}', format: 'N0' },
                            { type: 'Sum', field: 'projectCost', groupCaptionTemplate: 'Project Cost: ${Sum}', footerTemplate: 'Project Cost: ${Sum}', format: 'N0' },
                            { type: 'Sum', field: 'profit', groupCaptionTemplate: 'Profit: ${Sum}', footerTemplate: 'Profit: ${Sum}', format: 'N0' }
                        ]
                    }],
                    toolbar: ['ExcelExport', 'Search', { type: 'Separator' }],
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) mainGrid.obj.clearSelection();
                    },
                    toolbarClick: (args) => {
                        if (args.item.id === 'MainGrid_excelexport') mainGrid.obj.excelExport();
                    },
                    dataBound: () => {
                        GridInteractionManager.collapseGroupsOnFirstLoad(mainGrid.obj);
                    }
                });
                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => {
                if (mainGrid.obj) mainGrid.obj.setProperties({ dataSource: state.mainData });
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['CashTransactions']);
                await SecurityManager.validateToken();
                mainGrid.create();
                await methods.populateCustomerList();
                customerDropDown.create();
                fromDatePicker = createDatePicker(fromDateRef, 'fromDate');
                toDatePicker = createDatePicker(toDateRef, 'toDate');
                await methods.loadReport();
            } catch (error) {
                state.error = error?.response?.data?.message || error?.message || 'Unable to initialize the customer profit report.';
                console.error('Customer profit report initialization error:', error);
            }
        });

        return { mainGridRef, customerRef, fromDateRef, toDateRef, state, handler };
    }
};

Vue.createApp(App).mount('#app');
