const App = {
    setup() {
        const state = Vue.reactive({
            accountData: [],
            transactionData: [],
            mainData: [],
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

        const services = {
            getCashAccountList: async () => {
                return await AxiosManager.get('/CashAccount/GetCashAccountList', {});
            },
            getCashTransactionList: async () => {
                return await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
            }
        };

        const methods = {
            populateMainData: async () => {
                const accountResponse = await services.getCashAccountList();
                const transactionResponse = await services.getCashTransactionList();

                state.accountData = accountResponse?.data?.content?.data ?? [];
                state.transactionData = transactionResponse?.data?.content?.data ?? [];

                const confirmedTransactions = state.transactionData
                    .filter(item => item.status === 2)
                    .map(item => ({
                        ...item,
                        transactionDate: DateFormatManager.parseBusinessDate(item.transactionDate),
                        createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                        transactionTypeName: item.transactionType === 0 ? 'Debit' : item.transactionType === 1 ? 'Credit' : '',
                        signedAmount: item.transactionType === 0 ? item.amount ?? 0 : -(item.amount ?? 0)
                    }))
                    .sort((a, b) => {
                        const accountCompare = (a.cashAccountName ?? '').localeCompare(b.cashAccountName ?? '');
                        if (accountCompare !== 0) return accountCompare;
                        return (a.transactionDate ?? new Date(0)) - (b.transactionDate ?? new Date(0));
                    });

                const runningBalanceByAccount = new Map(
                    state.accountData.map(account => [account.id, account.initialBalance ?? 0])
                );

                state.mainData = confirmedTransactions.map(item => {
                    const previousBalance = runningBalanceByAccount.get(item.cashAccountId) ?? 0;
                    const runningBalance = previousBalance + item.signedAmount;
                    runningBalanceByAccount.set(item.cashAccountId, runningBalance);

                    return {
                        ...item,
                        runningBalance,
                        source: item.sourceModuleNumber || item.sourceModule || ''
                    };
                });

                state.summary.totalDebit = state.accountData.reduce((sum, item) => sum + (item.totalDebit ?? 0), 0);
                state.summary.totalCredit = state.accountData.reduce((sum, item) => sum + (item.totalCredit ?? 0), 0);
                state.summary.totalBalance = state.accountData.reduce((sum, item) => sum + (item.currentBalance ?? 0), 0);
                state.summary.totalDebitText = NumberFormatManager.formatToLocale(state.summary.totalDebit);
                state.summary.totalCreditText = NumberFormatManager.formatToLocale(state.summary.totalCredit);
                state.summary.totalBalanceText = NumberFormatManager.formatToLocale(state.summary.totalBalance);
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['CashBookReports']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);
            } catch (e) {
                console.error('page init error:', e);
            }
        });

        const mainGrid = {
            obj: null,
            create: async (dataSource) => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '300px',
                    dataSource: dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowGrouping: true,
                    groupSettings: {
                        columns: ['cashAccountName']
                    },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'transactionDate', direction: 'Ascending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'transactionDate', headerText: 'Date', width: 130, format: 'yyyy-MM-dd' },
                        { field: 'number', headerText: 'Number', width: 160 },
                        { field: 'cashAccountName', headerText: 'Account', width: 180 },
                        { field: 'transactionTypeName', headerText: 'Type', width: 100 },
                        { field: 'cashCategoryName', headerText: 'Category', width: 160 },
                        { field: 'signedAmount', headerText: 'Amount', width: 150, textAlign: 'Right', format: '+0;-0;0' },
                        { field: 'runningBalance', headerText: 'Running Balance', width: 170, textAlign: 'Right', format: 'N0' },
                        { field: 'description', headerText: 'Description', width: 280 },
                        { field: 'source', headerText: 'Source', width: 140 }
                    ],
                    toolbar: [
                        'ExcelExport',
                        'Search',
                        { type: 'Separator' }
                    ],
                    dataBound: function () {
                        mainGrid.obj.autoFitColumns(['transactionDate', 'number', 'cashAccountName', 'transactionTypeName', 'cashCategoryName', 'signedAmount', 'runningBalance', 'source']);
                    },
                    toolbarClick: (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }
                    }
                });

                mainGrid.obj.appendTo(mainGridRef.value);
            }
        };

        return {
            mainGridRef,
            state
        };
    }
};

Vue.createApp(App).mount('#app');
