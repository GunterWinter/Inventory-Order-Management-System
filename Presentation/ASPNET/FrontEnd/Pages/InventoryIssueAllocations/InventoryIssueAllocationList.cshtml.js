    const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/InventoryIssueAllocation/GetInventoryIssueAllocationList', {});
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
                    allocationDate: item.allocationDate ? DateFormatManager.parseBusinessDate(item.allocationDate) : null,
                    createdAtUtc: item.createdAtUtc ? DateFormatManager.parseServerDate(item.createdAtUtc) : null
                }));
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['InventoryIssueAllocations']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);
            } catch (e) {
                console.error('page init error:', e);
            } finally {

            }
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
                    sortSettings: { columns: [{ field: 'allocationDate', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false },
                        { field: 'salesOrderNumber', headerText: 'Sales Order', width: 170 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 180 },
                        { field: 'productNumber', headerText: 'Product Number', width: 180 },
                        { field: 'productReferenceCode', headerText: 'Ref Code', width: 150 },
                        { field: 'productName', headerText: 'Product Name', width: 220 },
                        { field: 'batchNumber', headerText: 'Issued Batch', width: 160 },
                        { field: 'qtyIssued', headerText: 'Qty Issued', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'unitCost', headerText: 'Unit Cost', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'salesUnitPrice', headerText: 'Sales Price', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'costAmount', headerText: 'COGS', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'salesAmount', headerText: 'Sales Amount', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'profitAmount', headerText: 'Profit', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'allocationDate', headerText: 'Allocation Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 170, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                    ],
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


