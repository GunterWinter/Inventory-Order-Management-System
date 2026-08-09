const App = {
    setup() {
        const state = Vue.reactive({
            mainData: []
        });

        const mainGridRef = Vue.ref(null);
        const documentRoutes = {
            PurchaseOrder: '/PurchaseOrders/PurchaseOrderList',
            SalesOrder: '/SalesOrders/SalesOrderList',
            MaterialExport: '/MaterialExports/MaterialExportList',
            GoodsReceive: '/GoodsReceives/GoodsReceiveList',
            DeliveryOrder: '/DeliveryOrders/DeliveryOrderList',
            PurchaseReturn: '/PurchaseReturns/PurchaseReturnList',
            SalesReturn: '/SalesReturns/SalesReturnList',
            TransferIn: '/TransferIns/TransferInList',
            TransferOut: '/TransferOuts/TransferOutList',
            PositiveAdjustment: '/PositiveAdjustments/PositiveAdjustmentList',
            NegativeAdjustment: '/NegativeAdjustments/NegativeAdjustmentList',
            StockCount: '/StockCounts/StockCountList',
            Scrapping: '/Scrappings/ScrappingList'
        };

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
                state.mainData = (response?.data?.content?.data ?? []).map(vendor => ({
                    ...vendor,
                    transactions: (vendor.transactions ?? []).map(transaction => ({
                        ...transaction,
                        transactionDate: DateFormatManager.parseBusinessDate(transaction.transactionDate)
                    }))
                }));
            },
            openTransaction: (transaction) => {
                if (!transaction?.id) return;

                const sourceRoute = documentRoutes[transaction.source];
                const hasSourceDocument = !!sourceRoute && !!transaction.sourceModuleId;
                const route = hasSourceDocument ? sourceRoute : '/CashTransactions/CashTransactionList';
                const recordId = hasSourceDocument ? transaction.sourceModuleId : transaction.id;

                window.open(`${route}?viewId=${encodeURIComponent(recordId)}`, '_blank', 'noopener');
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
                    allowGrouping: true,
                    groupSettings: { columns: ['vendorName'] },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'remainingDebt', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ['10', '20', '50', '100', 'All'] },
                    selectionSettings: { type: 'Single' },
                    detailTemplate: '<div class="p-2"><div class="vendor-transactions"></div></div>',
                    detailDataBound: (args) => {
                        const host = args.detailElement.querySelector('.vendor-transactions');
                        const rows = args.data.transactions ?? args.data.purchaseTransactions ?? [];
                        if (!host) return;
                        if (!rows.length) { host.textContent = 'Không có giao dịch.'; return; }
                        new ej.grids.Grid({
                            dataSource: rows,
                            allowPaging: true,
                            pageSettings: { pageSize: 10 },
                            gridLines: 'Horizontal',
                            columns: [
                                { field: 'transactionDate', headerText: 'Ngày giao dịch', width: 130, format: 'yyyy-MM-dd' },
                                { field: 'number', headerText: 'Số chứng từ / nguồn', width: 180 },
                                { field: 'description', headerText: 'Diễn giải', width: 260 },
                                { field: 'amount', headerText: 'Số tiền', width: 140, format: 'N0', textAlign: 'Right' },
                                { field: 'paidAmount', headerText: 'Đã trả', width: 140, format: 'N0', textAlign: 'Right' },
                                { field: 'remaining', headerText: 'Còn lại', width: 140, format: 'N0', textAlign: 'Right' }
                            ],
                            rowDataBound: (event) => {
                                event.row.style.cursor = 'pointer';
                                event.row.title = 'Nhấn để xem chứng từ';
                            },
                            recordClick: (event) => methods.openTransaction(event.rowData)
                        }).appendTo(host);
                    },
                    dataBound: function () {
                        GridInteractionManager.collapseGroupsOnFirstLoad(mainGrid.obj);
                    },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'vendorName', headerText: 'Vendor Name', width: 250 },
                        { field: 'totalPurchase', headerText: 'Purchase Obligation', width: 180, type: 'number', format: 'N0', textAlign: 'Right' },
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
                                    footerTemplate: 'Total: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'totalPaid',
                                    footerTemplate: 'Total: ${Sum}',
                                    format: 'N0'
                                },
                                {
                                    type: 'Sum',
                                    field: 'remainingDebt',
                                    footerTemplate: 'Total: ${Sum}',
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
