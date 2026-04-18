const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const aggregateBatchStockRows = (items) => {
            const rows = new Map();

            items
                .filter(item => Number(item.remainingQty ?? 0) > 0)
                .forEach(item => {
                    const warehouseId = item.warehouseId ?? '';
                    const productId = item.productId ?? '';
                    const batchNumber = (item.batchNumber ?? '').toString().trim();
                    const unitCost = Number(item.unitCost ?? 0);
                    const key = [warehouseId, productId, batchNumber, unitCost.toFixed(4)].join('|');

                    const current = rows.get(key) ?? {
                        warehouseId,
                        warehouseName: item.warehouseName ?? '',
                        productId,
                        productNumber: item.productNumber ?? '',
                        productName: item.productName ?? '',
                        batchNumber,
                        unitCost,
                        originalQty: 0,
                        remainingQty: 0,
                        firstReceivedDate: item.receivedDate ? new Date(item.receivedDate) : null,
                        lastUpdatedAtUtc: item.createdAtUtc ? new Date(item.createdAtUtc) : null
                    };

                    current.originalQty += Number(item.originalQty ?? 0);
                    current.remainingQty += Number(item.remainingQty ?? 0);

                    const receivedDate = item.receivedDate ? new Date(item.receivedDate) : null;
                    if (receivedDate && (!current.firstReceivedDate || receivedDate < current.firstReceivedDate)) {
                        current.firstReceivedDate = receivedDate;
                    }

                    const createdAtUtc = item.createdAtUtc ? new Date(item.createdAtUtc) : null;
                    if (createdAtUtc && (!current.lastUpdatedAtUtc || createdAtUtc > current.lastUpdatedAtUtc)) {
                        current.lastUpdatedAtUtc = createdAtUtc;
                    }

                    rows.set(key, current);
                });

            return [...rows.values()].sort((a, b) => {
                const warehouseCompare = (a.warehouseName ?? '').localeCompare(b.warehouseName ?? '');
                if (warehouseCompare !== 0) {
                    return warehouseCompare;
                }

                const productCompare = (a.productName ?? '').localeCompare(b.productName ?? '');
                if (productCompare !== 0) {
                    return productCompare;
                }

                const dateA = a.firstReceivedDate ? a.firstReceivedDate.getTime() : 0;
                const dateB = b.firstReceivedDate ? b.firstReceivedDate.getTime() : 0;
                return dateA - dateB;
            });
        };

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/InventoryCostLayer/GetInventoryCostLayerList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populateMainData: async () => {
                const response = await services.getMainData();
                const layers = response?.data?.content?.data ?? [];
                state.mainData = aggregateBatchStockRows(layers);
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
                    sortSettings: { columns: [{ field: 'firstReceivedDate', direction: 'Ascending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', '200', 'All'] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 180 },
                        { field: 'productNumber', headerText: 'Product Number', width: 160 },
                        { field: 'productName', headerText: 'Product Name', width: 220 },
                        { field: 'batchNumber', headerText: 'Batch Number', width: 170 },
                        { field: 'unitCost', headerText: 'Unit Cost', width: 140, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'originalQty', headerText: 'Original Qty', width: 140, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'remainingQty', headerText: 'Remaining Qty', width: 150, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'firstReceivedDate', headerText: 'Received Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'lastUpdatedAtUtc', headerText: 'Created At UTC', width: 170, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    aggregates: [
                        {
                            columns: [
                                {
                                    type: 'Sum',
                                    field: 'remainingQty',
                                    groupCaptionTemplate: 'Remaining Qty: ${Sum}',
                                    format: 'N2'
                                }
                            ]
                        }
                    ],
                    toolbar: ['ExcelExport', 'Search'],
                    dataBound: function () {
                        mainGrid.obj.autoFitColumns(['unitCost', 'originalQty', 'remainingQty', 'firstReceivedDate', 'lastUpdatedAtUtc']);
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
