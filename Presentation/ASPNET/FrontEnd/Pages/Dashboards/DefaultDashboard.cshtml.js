const App = {
    setup() {
        const state = Vue.reactive({
            cards: {},
            sales: {},
            purchase: {},
            inventory: {},
            loading: false,
            pageError: '',
            errors: {
                cards: '',
                sales: '',
                purchase: '',
                inventory: ''
            },
            lastUpdated: ''
        });

        const salesOrderGridRef = Vue.ref(null);
        const purchaseOrderGridRef = Vue.ref(null);
        const inventoryTransactionGridRef = Vue.ref(null);
        const stockChartRef = Vue.ref(null);

        const controls = { salesGrid: null, purchaseGrid: null, inventoryGrid: null, stockChart: null };

        const getContent = response => {
            if (response?.data?.code !== 200) throw new Error(response?.data?.message ?? 'Dashboard data could not be loaded.');
            return response?.data?.content?.data ?? {};
        };

        const services = {
            cards: () => AxiosManager.get('/Dashboard/GetCardsDashboard', {}),
            sales: () => AxiosManager.get('/Dashboard/GetSalesDashboard', {}),
            purchase: () => AxiosManager.get('/Dashboard/GetPurchaseDashboard', {}),
            inventory: () => AxiosManager.get('/Dashboard/GetInventoryDashboard', {})
        };

        const methods = {
            money: value => NumberFormatManager.formatMoneyToLocale(value ?? 0),
            quantity: value => NumberFormatManager.formatToLocale(value ?? 0),
            date: value => DateFormatManager.formatToLocale(value),
            dateTime: value => DateFormatManager.formatDateTimeToLocale(value),
            kpiCards: () => [
                { label: 'Confirmed Sales', value: methods.money(state.cards.confirmedSalesAmount), note: 'Order value', icon: 'fas fa-chart-line', iconClass: 'bg-primary-subtle text-primary', href: '/SalesOrders/SalesOrderList' },
                { label: 'Customer Receivable', value: methods.money(state.cards.customerReceivable), note: 'Outstanding sales', icon: 'fas fa-hand-holding-usd', iconClass: 'bg-warning-subtle text-warning', href: '/CashTransactions/CustomerFinanceReport' },
                { label: 'Confirmed Purchases', value: methods.money(state.cards.confirmedPurchaseAmount), note: 'Order value', icon: 'fas fa-shopping-cart', iconClass: 'bg-info-subtle text-info', href: '/PurchaseOrders/PurchaseOrderList' },
                { label: 'Vendor Debt', value: methods.money(state.cards.vendorDebt), note: 'Outstanding purchases', icon: 'fas fa-file-invoice-dollar', iconClass: 'bg-danger-subtle text-danger', href: '/VendorDebtReports/VendorDebtReportList' },
                { label: 'Cash Balance', value: methods.money(state.cards.cashBalance), note: 'Across active accounts', icon: 'fas fa-wallet', iconClass: 'bg-success-subtle text-success', href: '/CashAccounts/CashAccountList' },
                { label: 'Inventory Quantity', value: methods.quantity(state.cards.inventoryQuantity), note: 'Confirmed on hand', icon: 'fas fa-boxes', iconClass: 'bg-secondary-subtle text-secondary', href: '/StockReports/StockReportList' },
                { label: 'Material Exports', value: methods.quantity(state.cards.materialExportCount), note: 'Confirmed documents', icon: 'fas fa-dolly', iconClass: 'bg-primary-subtle text-primary', href: '/MaterialExports/MaterialExportList' }
            ],
            openDocument: (route, id) => {
                if (id) window.open(`${route}?viewId=${encodeURIComponent(id)}`, '_blank', 'noopener');
            },
            renderSalesGrid: () => {
                controls.salesGrid?.destroy();
                const data = (state.sales.salesOrderDashboard ?? []).map(item => ({
                    ...item,
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                    orderDate: DateFormatManager.parseBusinessDate(item.orderDate)
                }));
                controls.salesGrid = new ej.grids.Grid({
                    dataSource: data, height: 300, allowSorting: true, allowPaging: true,
                    pageSettings: { pageSize: 8 }, gridLines: 'Horizontal',
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    columns: [
                        { field: 'createdAtUtc', visible: false },
                        { field: 'orderDate', headerText: 'Date', width: 100, valueAccessor: (field, row) => methods.date(row[field]) },
                        { field: 'number', headerText: 'Number', width: 145 },
                        { field: 'productName', headerText: 'Product', width: 190 },
                        { field: 'total', headerText: 'Total', width: 120, textAlign: 'Right', format: 'N0' }
                    ],
                    recordDoubleClick: args => methods.openDocument('/SalesOrders/SalesOrderList', args.rowData.documentId)
                });
                controls.salesGrid.appendTo(salesOrderGridRef.value);
            },
            renderPurchaseGrid: () => {
                controls.purchaseGrid?.destroy();
                const data = (state.purchase.purchaseOrderDashboard ?? []).map(item => ({
                    ...item,
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc),
                    orderDate: DateFormatManager.parseBusinessDate(item.orderDate)
                }));
                controls.purchaseGrid = new ej.grids.Grid({
                    dataSource: data, height: 300, allowSorting: true, allowPaging: true,
                    pageSettings: { pageSize: 8 }, gridLines: 'Horizontal',
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    columns: [
                        { field: 'createdAtUtc', visible: false },
                        { field: 'orderDate', headerText: 'Date', width: 100, valueAccessor: (field, row) => methods.date(row[field]) },
                        { field: 'number', headerText: 'Number', width: 145 },
                        { field: 'productName', headerText: 'Product', width: 190 },
                        { field: 'total', headerText: 'Total', width: 120, textAlign: 'Right', format: 'N0' }
                    ],
                    recordDoubleClick: args => methods.openDocument('/PurchaseOrders/PurchaseOrderList', args.rowData.documentId)
                });
                controls.purchaseGrid.appendTo(purchaseOrderGridRef.value);
            },
            renderInventoryGrid: () => {
                controls.inventoryGrid?.destroy();
                const data = (state.inventory.inventoryTransactionDashboard ?? []).map(item => ({
                    ...item,
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
                controls.inventoryGrid = new ej.grids.Grid({
                    dataSource: data, height: 340, allowSorting: true, allowPaging: true,
                    pageSettings: { pageSize: 10 }, gridLines: 'Horizontal',
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    columns: [
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, valueAccessor: (field, row) => methods.dateTime(row[field]) },
                        { field: 'number', headerText: 'Number', width: 145 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 150 },
                        { field: 'productName', headerText: 'Product', width: 190 },
                        { field: 'stock', headerText: 'Movement', width: 110, textAlign: 'Right', format: 'N0' },
                        { field: 'moduleName', headerText: 'Source', width: 130 }
                    ]
                });
                controls.inventoryGrid.appendTo(inventoryTransactionGridRef.value);
            },
            renderStockChart: () => {
                controls.stockChart?.destroy();
                controls.stockChart = new ej.charts.Chart({
                    primaryXAxis: { valueType: 'Category', labelRotation: -25, majorGridLines: { width: 0 } },
                    primaryYAxis: { title: 'Quantity', lineStyle: { width: 0 }, majorTickLines: { width: 0 } },
                    series: state.inventory.inventoryStockDashboard ?? [],
                    tooltip: { enable: true, shared: true },
                    legendSettings: { visible: true },
                    chartArea: { border: { width: 0 } },
                    height: '340px'
                });
                controls.stockChart.appendTo(stockChartRef.value);
            },
            loadSection: async (section, request, applyData, render) => {
                state.errors[section] = '';
                try {
                    const response = await request();
                    applyData(getContent(response));
                    await Vue.nextTick();
                    render?.();
                    return true;
                } catch (error) {
                    console.error(`Dashboard ${section} load error:`, error);
                    state.errors[section] = error.response?.data?.message
                        ?? error.message
                        ?? 'Dashboard data could not be loaded.';
                    return false;
                }
            },
            loadCards: async () => methods.loadSection(
                'cards',
                services.cards,
                data => { state.cards = data.cardsDashboard ?? {}; }),
            loadSales: async () => methods.loadSection(
                'sales',
                services.sales,
                data => { state.sales = data; },
                methods.renderSalesGrid),
            loadPurchase: async () => methods.loadSection(
                'purchase',
                services.purchase,
                data => { state.purchase = data; },
                methods.renderPurchaseGrid),
            loadInventory: async () => methods.loadSection(
                'inventory',
                services.inventory,
                data => { state.inventory = data; },
                () => {
                    methods.renderInventoryGrid();
                    methods.renderStockChart();
                }),
            loadDashboard: async () => {
                state.loading = true;
                state.pageError = '';
                try {
                    await Promise.allSettled([
                        methods.loadCards(),
                        methods.loadSales(),
                        methods.loadPurchase(),
                        methods.loadInventory()
                    ]);
                    state.lastUpdated = methods.dateTime(new Date());
                } catch (error) {
                    console.error('Dashboard load error:', error);
                    state.pageError = error.response?.data?.message ?? error.message ?? 'Dashboard data could not be loaded.';
                } finally {
                    state.loading = false;
                }
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['Dashboards']);
                await SecurityManager.validateToken();
                await methods.loadDashboard();
            } catch (error) {
                console.error('Dashboard initialization error:', error);
                state.pageError = error.response?.data?.message
                    ?? error.message
                    ?? 'Dashboard could not be initialized.';
            }
        });

        Vue.onBeforeUnmount(() => Object.values(controls).forEach(control => control?.destroy?.()));

        return { state, methods, salesOrderGridRef, purchaseOrderGridRef, inventoryTransactionGridRef, stockChartRef };
    }
};

Vue.createApp(App).mount('#app');
