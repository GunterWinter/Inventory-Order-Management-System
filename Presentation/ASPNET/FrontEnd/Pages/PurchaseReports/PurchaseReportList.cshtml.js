const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/PurchaseOrderItem/GetPurchaseOrderItemList', {});
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
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
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
                        columns: ['purchaseOrderNumber']
                    },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'purchaseOrderNumber', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        {
                            field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false
                        },
                        { field: 'vendorName', headerText: 'Vendor', width: 200, minWidth: 200 },
                        { field: 'purchaseOrderNumber', headerText: 'PurchaseOrder', width: 200, minWidth: 200 },
                        { field: 'productNumber', headerText: 'Product Number', width: 200, minWidth: 200 },
                        { field: 'productReferenceCode', headerText: 'Ref Code', width: 160, minWidth: 160 },
                        { field: 'productName', headerText: 'Product Name', width: 200, minWidth: 200 },
                        { field: 'unitPrice', headerText: 'Unit Price', width: 150, minWidth: 150, format: 'N2' },
                        { field: 'quantity', headerText: 'Quantity', width: 150, minWidth: 150 },
                        { field: 'total', headerText: 'Subtotal', width: 150, minWidth: 150, format: 'N2' },
                        { field: 'taxName', headerText: 'Tax', width: 150, minWidth: 150 },
                        { field: 'taxAmount', headerText: 'Tax Amount', width: 150, minWidth: 150, format: 'N2' },
                        { field: 'afterTaxAmount', headerText: 'Total Amount', width: 150, minWidth: 150, format: 'N2' },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'total',
                                    groupCaptionTemplate: 'Subtotal: ${Sum}',
                                    format: 'N2'
                                },
                                {
                                    type: 'Sum',
                                    field: 'taxAmount',
                                    groupCaptionTemplate: 'Tax: ${Sum}',
                                    format: 'N2'
                                },
                                {
                                    type: 'Sum',
                                    field: 'afterTaxAmount',
                                    groupCaptionTemplate: 'Total Amount: ${Sum}',
                                    format: 'N2'
                                }
                            ]
                        }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.autoFitColumns(['vendorName', 'purchaseOrderNumber', 'productNumber', 'productReferenceCode', 'productName', 'unitPrice', 'quantity', 'total', 'taxName', 'taxAmount', 'afterTaxAmount', 'createdAtUtc']);
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => { },
                    rowDeselected: () => { },
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
                await SecurityManager.authorizePage(['PurchaseReports']);
                await SecurityManager.validateToken();
                await methods.populateMainData();
                await mainGrid.create(state.mainData);
            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        return {
            mainGridRef,
            state,
        };
    }
};

Vue.createApp(App).mount('#app');

