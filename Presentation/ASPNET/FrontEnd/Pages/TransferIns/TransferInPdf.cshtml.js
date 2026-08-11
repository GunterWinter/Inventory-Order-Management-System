const App = {
    setup() {
        const state = Vue.reactive({
            company: {
                name: '',
                emailAddress: '',
                phoneNumber: '',
                street: '',
                city: '',
                state: '',
                zipCode: '',
                country: ''
            },
            companyAddress: '',
            warehouseFrom: '',
            warehouseTo: '',
            number: '',
            date: '',
            reference: '',
            pdfTransactionList: [],
            isDownloading: false,
            mappedItems: [],
            movementTotal: 0
        });

        const services = {
            getPDFData: async (id) => {
                try {
                    const response = await AxiosManager.get('/TransferIn/GetTransferInSingle?id=' + id, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populatePDFData: async (id) => {
                const response = await services.getPDFData(id);
                state.pdfData = response?.data?.content?.data || {};
                state.pdfTransactionList = response?.data?.content?.transactionList || [];
                methods.bindPDFControls();
            },

            bindPDFControls: () => {
                const company = StorageManager.getCompany() || state.company;
                state.company = {
                    name: company.name,
                    emailAddress: company.emailAddress,
                    phoneNumber: company.phoneNumber,
                    street: company.street,
                    city: company.city,
                    state: company.state,
                    zipCode: company.zipCode,
                    country: company.country
                };
                state.companyAddress = [
                    company.street,
                    company.city,
                    company.state,
                    company.zipCode,
                    company.country
                ].filter(Boolean).join(', ');

                const pdfData = state.pdfData;
                state.warehouseFrom = pdfData?.transferOut?.warehouseFrom?.name || '';
                state.warehouseTo = pdfData?.transferOut?.warehouseTo?.name || '';

                state.number = pdfData?.number || '';
                state.date = DateFormatManager.formatToLocale(pdfData?.transferReceiveDate) || '';
                state.reference = pdfData?.transferOut?.number || '';

                state.mappedItems = (state.pdfTransactionList || []).map(item => ({
                    product: `${item.product?.number || ''} ${item.product?.name || ''}`.trim(),
                    movement: NumberFormatManager.formatToLocale(item.movement || 0),
                }));

                let movementTotal = (state.pdfTransactionList || []).reduce((sum, item) => sum + (item.movement || 0), 0);
                state.movementTotal = NumberFormatManager.formatToLocale(movementTotal);
            }
        };

        const handler = {
            downloadPDF: async () => {
                state.isDownloading = true;
                try {
                    await PdfDocumentManager.downloadSafely({
                        element: '#content',
                        fileName: `transfer-in-${state.number || 'unknown'}.pdf`
                    });
                } finally {
                    state.isDownloading = false;
                }
            },
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['TransferIns']);
                var urlParams = new URLSearchParams(window.location.search);
                var id = urlParams.get('id');
                await methods.populatePDFData(id ?? '');
            } catch (e) {
                console.error('page init error:', e);
            } finally {
                
            }
        });

        return {
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');
