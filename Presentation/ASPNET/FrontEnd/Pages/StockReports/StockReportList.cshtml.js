const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = (response?.data?.content?.data ?? [])
                    .filter(item => Number(item.stock ?? 0) !== 0)
                    .map(item => ({
                        ...item,
                        createdAtUtc: item.createdAtUtc ? DateFormatManager.parseServerDate(item.createdAtUtc) : null
                    }));
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['StockReports']);
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
                    allowGrouping: true,
                    groupSettings: {
                        columns: ['warehouseName', 'productName']
                    },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'productName', direction: 'Ascending' }, { field: 'batchNumber', direction: 'Ascending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', '200', 'All'] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 180 },
                        { field: 'productNumber', headerText: 'Product Number', width: 160 },
                        { field: 'productReferenceCode', headerText: 'Ref Code', width: 150 },
                        { field: 'productName', headerText: 'Product Name', width: 220 },
                        { field: 'batchNumber', headerText: 'Batch Number', width: 170 },
                        { field: 'stock', headerText: 'Stock', width: 140, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'statusName', headerText: 'Status', width: 120 },
                        { field: 'createdAtUtc', headerText: 'Last Updated', width: 170, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'stock',
                                    groupCaptionTemplate: 'Stock: ${Sum}',
                                    format: 'N2'
                                }
                            ]
                        }
                    ],
                    toolbar: ['ExcelExport', 'Search'],
                    dataBound: function () {
                        mainGrid.obj.autoFitColumns(['stock', 'statusName', 'createdAtUtc']);
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

        return {
            mainGridRef,
            state,
        };
    }
};

Vue.createApp(App).mount('#app');


