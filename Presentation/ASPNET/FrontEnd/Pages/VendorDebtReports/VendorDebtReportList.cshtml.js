const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/CashTransaction/GetVendorDebtReport', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data ?? [];
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['VendorDebtReports']);
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
                    height: '520px',
                    dataSource: dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'remainingDebt', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', 'All'] },
                    selectionSettings: { type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'vendorName', headerText: 'Vendor Name', width: 250 },
                        { field: 'totalPurchase', headerText: 'Total Purchase', width: 180, type: 'number', format: 'N0', textAlign: 'Right' },
                        { field: 'totalPaid', headerText: 'Total Paid', width: 180, type: 'number', format: 'N0', textAlign: 'Right' },
                        { field: 'remainingDebt', headerText: 'Remaining Debt', width: 180, type: 'number', format: 'N0', textAlign: 'Right' }
                    ],
                    queryCellInfo: (args) => {
                        if (args.column.field === 'remainingDebt') {
                            const val = args.data.remainingDebt ?? 0;
                            const color = val > 0 ? '#dc3545' : val < 0 ? '#28a745' : '#6c757d';
                            args.cell.style.color = color;
                            args.cell.style.fontWeight = 'bold';
                        }
                    },
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'totalPurchase',
                                    footerTemplate: 'Tổng: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'totalPaid',
                                    footerTemplate: 'Tổng: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'remainingDebt',
                                    footerTemplate: 'Tổng: ${Sum}',
                                    format: 'N0'
                                }
                            ]
                        }
                    ],
                    toolbar: ['ExcelExport', 'Search'],
                    toolbarClick: (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport({
                                fileName: 'BaoCaoCongNo_NCC.xlsx'
                            });
                        }
                    }
                });

                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => {
                mainGrid.obj.setProperties({ dataSource: state.mainData });
            }
        };

        return {
            mainGridRef,
            state,
        };
    }
};

Vue.createApp(App).mount('#app');
