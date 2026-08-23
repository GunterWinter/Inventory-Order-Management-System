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
            customer: {
                name: '',
                street: '',
                city: '',
                state: '',
                zipCode: '',
                country: '',
                emailAddress: '',
                phoneNumber: ''
            },
            customerAddress: '',
            orderNumber: '',
            orderDate: '',
            orderCurrency: '',
            subTotal: '',
            tax: '',
            totalAmount: '',
            items: [],
            isDownloading: false
        });

        const services = {
            getPDFData: async (id) => {
                try {
                    const response = await AxiosManager.get('/SalesOrder/GetSalesOrderSingle?id=' + id, {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populatePDFData: async (id) => {
                const response = await services.getPDFData(id);
                const pdfData = response?.data?.content?.data || {};
                state.items = (pdfData.salesOrderItemList || []).map(item => ({
                    ...item,
                    taxName: item?.tax?.name || '',
                    unitPrice: NumberFormatManager.formatMoneyToLocale(item?.unitPrice || 0),
                    quantity: NumberFormatManager.formatToLocale(item?.quantity || 0),
                    total: NumberFormatManager.formatMoneyToLocale(item?.total || 0),
                    taxAmount: NumberFormatManager.formatMoneyToLocale(item?.taxAmount || 0),
                    afterTaxAmount: NumberFormatManager.formatMoneyToLocale(item?.afterTaxAmount || 0),
                }));
                state.customer = pdfData.customer || {};
                state.orderNumber = pdfData.number || '';
                state.orderDate = DateFormatManager.formatToLocale(pdfData.orderDate) || '';
    state.orderCurrency = StorageManager.getCompany()?.currency || 'VND';
                state.subTotal = NumberFormatManager.formatMoneyToLocale(pdfData.beforeTaxAmount) || '';
                state.tax = NumberFormatManager.formatMoneyToLocale(pdfData.taxAmount) || '';
                state.totalAmount = NumberFormatManager.formatMoneyToLocale(pdfData.afterTaxAmount) || '';
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

                state.customerAddress = [
                    state.customer.street,
                    state.customer.city,
                    state.customer.state,
                    state.customer.zipCode,
                    state.customer.country
                ].filter(Boolean).join(', ');
            }
        };

        const handler = {
            downloadPDF: async () => {
                state.isDownloading = true;
                try {
                    await PdfDocumentManager.downloadSafely({
                        element: '#content',
                        fileName: `sales-order-${state.orderNumber || 'unknown'}.pdf`
                    });
                } finally {
                    state.isDownloading = false;
                }
            },
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['SalesOrders']);
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
