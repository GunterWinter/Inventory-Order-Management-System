const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);

        const aggregateProfitRows = (items) => {
            const rows = new Map();

            items.forEach(item => {
                const soldQty = Number(item.quantity ?? 0);
                const totalCost = Number(item.totalCost ?? 0);
                const totalSales = Number(item.totalSales ?? 0);
                const unitCost = Number(item.unitCost ?? 0);
                const salesUnitPrice = Number(item.salesUnitPrice ?? 0);
                const soldDate = item.soldDate ? DateFormatManager.parseBusinessDate(item.soldDate) : null;
                const key = [
                    item.productId ?? '',
                    String(Math.round(unitCost * 1000000)),
                    String(Math.round(salesUnitPrice * 1000000)),
                    item.costSource ?? ''
                ].join('|');

                const current = rows.get(key) ?? {
                    productId: item.productId ?? '',
                    productNumber: item.productNumber ?? '',
                    productReferenceCode: item.productReferenceCode ?? '',
                    productName: item.productName ?? '',
                    soldQty: 0,
                        unitCost,
                        salesUnitPrice,
                        totalCost: 0,
                        totalSales: 0,
                        totalProfit: 0,
                    costSource: item.costSource ?? '',
                    isFallbackCost: item.isFallbackCost === true,
                    lastSoldDate: soldDate
                };

                current.soldQty += soldQty;
                current.totalCost += totalCost;
                current.totalSales += totalSales;
                current.totalProfit += Number(item.profit ?? 0);

                if (soldDate && (!current.lastSoldDate || soldDate > current.lastSoldDate)) {
                    current.lastSoldDate = soldDate;
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
                    const response = await AxiosManager.get('/SalesOrderItem/GetInventoryProfitReport', {});
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
                state.mainData = aggregateProfitRows(allocations);
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
                        { field: 'soldQty', headerText: 'Sold Qty', width: 130, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'unitCost', headerText: 'Unit Cost', width: 130, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'salesUnitPrice', headerText: 'Sales Price', width: 130, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'totalCost', headerText: 'Total Cost', width: 150, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'totalSales', headerText: 'Total Sales', width: 150, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'totalProfit', headerText: 'Profit', width: 150, type: 'number', format: 'N6', textAlign: 'Right' },
                        { field: 'costSource', headerText: 'Cost Source', width: 210 },
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
