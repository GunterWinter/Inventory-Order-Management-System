const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            cashAccountList: [],
            isLoading: false,
            error: '',
            filter: {
                fromDate: null,
                toDate: null,
                cashAccountId: null
            },
            summary: {
                receiptText: '0',
                expenseText: '0',
                netText: '0'
            }
        });

        const mainGridRef = Vue.ref(null);
        const fromDateRef = Vue.ref(null);
        const toDateRef = Vue.ref(null);
        const cashAccountRef = Vue.ref(null);
        let currentRequest = 0;

        const services = {
            getReport: async () => {
                const query = new URLSearchParams();
                if (state.filter.fromDate) query.set('fromDate', DateFormatManager.formatForApiDate(state.filter.fromDate));
                if (state.filter.toDate) query.set('toDate', DateFormatManager.formatForApiDate(state.filter.toDate));
                if (state.filter.cashAccountId) query.set('cashAccountId', state.filter.cashAccountId);
                const suffix = query.toString() ? `?${query.toString()}` : '';
                return await AxiosManager.get(`/CashTransaction/GetCashCategorySummary${suffix}`, {});
            },
            getCashAccountList: async () => await AxiosManager.get('/CashAccount/GetCashAccountList', {})
        };

        const methods = {
            populateCashAccountList: async () => {
                const response = await services.getCashAccountList();
                state.cashAccountList = (response?.data?.content?.data ?? [])
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
                        throw new Error(response?.data?.message || 'Không thể tải báo cáo thu chi theo danh mục.');
                    }

                    const content = response?.data?.content ?? {};
                    state.mainData = (content.data ?? []).map(item => ({
                        ...item,
                        rowId: item.cashCategoryId || '__uncategorized__'
                    }));
                    state.summary.receiptText = NumberFormatManager.formatMoneyToLocale(content.totalReceipt ?? 0);
                    state.summary.expenseText = NumberFormatManager.formatMoneyToLocale(content.totalExpense ?? 0);
                    state.summary.netText = NumberFormatManager.formatMoneyToLocale(content.netCashFlow ?? 0);
                    mainGrid.refresh();
                } catch (error) {
                    if (requestNumber !== currentRequest) return;
                    state.mainData = [];
                    state.summary.receiptText = '0';
                    state.summary.expenseText = '0';
                    state.summary.netText = '0';
                    state.error = error?.response?.data?.message || error?.message || 'Không thể tải báo cáo thu chi theo danh mục.';
                    mainGrid.refresh();
                    console.error('Cash category report error:', error);
                } finally {
                    if (requestNumber === currentRequest) state.isLoading = false;
                }
            }
        };

        const cashAccountDropDown = {
            obj: null,
            create: () => {
                cashAccountDropDown.obj = new ej.dropdowns.DropDownList({
                    dataSource: state.cashAccountList,
                    fields: { value: 'id', text: 'name' },
                    placeholder: 'Chọn tài khoản quỹ',
                    allowFiltering: true,
                    showClearButton: true,
                    filtering: (event) => {
                        event.preventDefaultAction = true;
                        let query = new ej.data.Query();
                        if (event.text !== '') query = query.where('name', 'contains', event.text, true);
                        event.updateData(state.cashAccountList, query);
                    },
                    change: async (args) => {
                        state.filter.cashAccountId = args.value || null;
                        await methods.loadReport();
                    }
                });
                cashAccountDropDown.obj.appendTo(cashAccountRef.value);
            },
            refresh: () => {
                if (!cashAccountDropDown.obj) return;
                cashAccountDropDown.obj.value = state.filter.cashAccountId;
                cashAccountDropDown.obj.dataBind();
            }
        };

        const createDatePicker = (ref, filterName) => {
            const picker = new ej.calendars.DatePicker(DateFormatManager.datePickerOptions({
                placeholder: 'Chọn ngày',
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
                state.filter.fromDate = null;
                state.filter.toDate = null;
                state.filter.cashAccountId = null;
                if (fromDatePicker) {
                    fromDatePicker.value = null;
                    fromDatePicker.dataBind();
                }
                if (toDatePicker) {
                    toDatePicker.value = null;
                    toDatePicker.dataBind();
                }
                cashAccountDropDown.refresh();
                await methods.loadReport();
            },
            handleRetry: async () => await methods.loadReport()
        };

        const mainGrid = {
            obj: null,
            create: () => {
                mainGrid.obj = new ej.grids.Grid({
                    height: 'auto',
                    dataSource: state.mainData,
                    allowFiltering: true,
                    allowSorting: true,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', 'All'] },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'rowId', isPrimaryKey: true, visible: false },
                        { field: 'cashCategoryName', headerText: 'Cash Category', width: 260, minWidth: 220 },
                        { field: 'receiptAmount', headerText: 'Received', width: 180, minWidth: 160, textAlign: 'Right', format: 'N0' },
                        { field: 'expenseAmount', headerText: 'Spent', width: 180, minWidth: 160, textAlign: 'Right', format: 'N0' },
                        { field: 'netCashFlow', headerText: 'Net Cash Flow', width: 190, minWidth: 170, textAlign: 'Right', format: 'N0' }
                    ],
                    aggregates: [{
                        columns: [
                            { type: 'Sum', field: 'receiptAmount', footerTemplate: 'Total: ${Sum}', format: 'N0' },
                            { type: 'Sum', field: 'expenseAmount', footerTemplate: 'Total: ${Sum}', format: 'N0' },
                            { type: 'Sum', field: 'netCashFlow', footerTemplate: 'Total: ${Sum}', format: 'N0' }
                        ]
                    }],
                    toolbar: ['ExcelExport', 'Search'],
                    toolbarClick: (args) => {
                        if (args.item.id === 'MainGrid_excelexport') mainGrid.obj.excelExport();
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
                await methods.populateCashAccountList();
                cashAccountDropDown.create();
                fromDatePicker = createDatePicker(fromDateRef, 'fromDate');
                toDatePicker = createDatePicker(toDateRef, 'toDate');
                await methods.loadReport();
            } catch (error) {
                state.error = error?.response?.data?.message || error?.message || 'Không thể khởi tạo báo cáo thu chi theo danh mục.';
                console.error('Cash category report initialization error:', error);
            }
        });

        return { mainGridRef, fromDateRef, toDateRef, cashAccountRef, state, handler };
    }
};

Vue.createApp(App).mount('#app');
