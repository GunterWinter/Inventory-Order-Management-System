const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const aggregateBatchProfitRows = (items) => {
            const rows = new Map();

            items.forEach(item => {
                const unitCost = Number(item.unitCost ?? 0);
                const salesUnitPrice = Number(item.salesUnitPrice ?? 0);
                const batchNumber = (item.batchNumber ?? '').toString().trim();
                const allocationDate = item.allocationDate ? DateFormatManager.parseBusinessDate(item.allocationDate) : null;
                const key = [
                    item.productId ?? '',
                    batchNumber,
                    unitCost.toFixed(4),
                    salesUnitPrice.toFixed(4)
                ].join('|');

                const current = rows.get(key) ?? {
                    productId: item.productId ?? '',
                    productNumber: item.productNumber ?? '',
                    productReferenceCode: item.productReferenceCode ?? '',
                    productName: item.productName ?? '',
                    batchNumber,
                    soldQty: 0,
                    unitCost,
                    salesUnitPrice,
                    totalCost: 0,
                    totalSales: 0,
                    totalProfit: 0,
                    lastSoldDate: allocationDate
                };

                current.soldQty += Number(item.qtyIssued ?? 0);
                current.totalCost += Number(item.costAmount ?? 0);
                current.totalSales += Number(item.salesAmount ?? 0);
                current.totalProfit += Number(item.profitAmount ?? 0);

                if (allocationDate && (!current.lastSoldDate || allocationDate > current.lastSoldDate)) {
                    current.lastSoldDate = allocationDate;
                }

                rows.set(key, current);
            });

            return [...rows.values()].sort((a, b) => {
                const dateB = b.lastSoldDate ? b.lastSoldDate.getTime() : 0;
                const dateA = a.lastSoldDate ? a.lastSoldDate.getTime() : 0;
                return dateB - dateA;
            });
        };

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
                const allocations = response?.data?.content?.data ?? [];
                state.mainData = aggregateBatchProfitRows(allocations);
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['MovementReports']);
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
                    height: '560px',
                    dataSource: dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: false,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'lastSoldDate', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 20, pageSizes: ['10', '20', '50', '100', 'All'] },
                    selectionSettings: { persistSelection: true, type: 'Single' },
                    autoFit: false,
                    showColumnMenu: false,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'productNumber', headerText: 'Product Number', width: 160 },
                        { field: 'productReferenceCode', headerText: 'Ref Code', width: 150 },
                        { field: 'productName', headerText: 'Product', width: 220 },
                        { field: 'batchNumber', headerText: 'Batch Number', width: 180 },
                        { field: 'soldQty', headerText: 'Sold Qty', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'unitCost', headerText: 'Unit Cost', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'salesUnitPrice', headerText: 'Sales Price', width: 130, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'totalCost', headerText: 'Total Cost', width: 150, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'totalSales', headerText: 'Total Sales', width: 150, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'totalProfit', headerText: 'Profit', width: 150, type: 'number', format: 'N2', textAlign: 'Right' },
                        { field: 'lastSoldDate', headerText: 'Last Sold', width: 150, format: 'yyyy-MM-dd' }
                    ],
                    toolbar: ['ExcelExport', 'Search'],
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
            state,
        };
    }
};

Vue.createApp(App).mount('#app');
