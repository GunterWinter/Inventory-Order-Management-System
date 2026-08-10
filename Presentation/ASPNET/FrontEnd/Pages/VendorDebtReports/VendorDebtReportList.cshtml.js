const App = {
    setup() {
        const state = Vue.reactive({ mainData: [], partyType: 'Customer' });
        const mainGridRef = Vue.ref(null);
        const documentRoutes = { PurchaseOrder: '/PurchaseOrders/PurchaseOrderList', SalesOrder: '/SalesOrders/SalesOrderList' };

        const methods = {
            load: async () => {
                const response = await AxiosManager.get(`/CashTransaction/GetDebtReport?partyType=${state.partyType}`, {});
                state.mainData = (response?.data?.content?.data ?? []).map(party => ({
                    ...party,
                    documents: (party.documents ?? []).map(document => ({
                        ...document,
                        documentDate: DateFormatManager.parseBusinessDate(document.documentDate),
                        paymentHistory: (document.payments ?? []).map(payment =>
                            `${payment.paymentDate ?? ''}: ${NumberFormatManager.formatToLocale(payment.amount ?? 0)}${payment.description ? ` - ${payment.description}` : ''}`
                        ).join('\n')
                    }))
                }));
                mainGrid.refresh();
            },
            openDocument: document => {
                const route = documentRoutes[document?.sourceType];
                if (route && document?.id) window.open(`${route}?viewId=${encodeURIComponent(document.id)}`, '_blank', 'noopener');
            }
        };

        const handler = {
            selectParty: async partyType => {
                if (state.partyType === partyType) return;
                state.partyType = partyType;
                await methods.load();
            }
        };

        const mainGrid = {
            obj: null,
            create: () => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '520px', dataSource: state.mainData,
                    allowFiltering: true, allowSorting: true, allowPaging: true, allowExcelExport: true, allowResizing: true,
                    pageSettings: { pageSize: 50, pageSizes: ['10', '20', '50', '100', 'All'] },
                    sortSettings: { columns: [{ field: 'remaining', direction: 'Descending' }] },
                    detailTemplate: '<div class="p-2"><div class="debt-documents"></div></div>',
                    detailDataBound: args => {
                        const host = args.detailElement.querySelector('.debt-documents');
                        if (!host) return;
                        new ej.grids.Grid({
                            dataSource: args.data.documents ?? [], allowTextWrap: true,
                            columns: [
                                { field: 'documentDate', headerText: 'Date', width: 120, format: 'yyyy-MM-dd' },
                                { field: 'number', headerText: 'Document', width: 170 },
                                { field: 'totalAmount', headerText: 'Obligation', width: 140, format: 'N0', textAlign: 'Right' },
                                { field: 'paidAmount', headerText: 'Paid', width: 140, format: 'N0', textAlign: 'Right' },
                                { field: 'remaining', headerText: 'Remaining', width: 140, format: 'N0', textAlign: 'Right' },
                                { field: 'paymentHistory', headerText: 'Payment History', width: 300 }
                            ],
                            recordClick: event => methods.openDocument(event.rowData),
                            rowDataBound: event => { event.row.style.cursor = 'pointer'; }
                        }).appendTo(host);
                    },
                    columns: [
                        { field: 'partyName', headerText: 'Partner', width: 260 },
                        { field: 'totalAmount', headerText: 'Total Obligation', width: 180, format: 'N0', textAlign: 'Right' },
                        { field: 'paidAmount', headerText: 'Paid', width: 180, format: 'N0', textAlign: 'Right' },
                        { field: 'remaining', headerText: 'Remaining', width: 180, format: 'N0', textAlign: 'Right' }
                    ],
                    aggregates: [{ columns: [
                        { type: 'Sum', field: 'totalAmount', footerTemplate: 'Total: ${Sum}', format: 'N0' },
                        { type: 'Sum', field: 'paidAmount', footerTemplate: 'Total: ${Sum}', format: 'N0' },
                        { type: 'Sum', field: 'remaining', footerTemplate: 'Total: ${Sum}', format: 'N0' }
                    ] }],
                    toolbar: ['ExcelExport', 'Search'],
                    toolbarClick: args => {
                        if (args.item.id === 'MainGrid_excelexport') mainGrid.obj.excelExport({ fileName: `DebtReport_${state.partyType}.xlsx` });
                    }
                });
                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => mainGrid.obj?.setProperties({ dataSource: state.mainData })
        };

        Vue.onMounted(async () => {
            await SecurityManager.authorizePage(['VendorDebtReports']);
            await SecurityManager.validateToken();
            mainGrid.create();
            await methods.load();
        });
        return { state, mainGridRef, handler };
    }
};
Vue.createApp(App).mount('#app');
