const App = {
    setup() {
        const state = Vue.reactive({
            search: '',
            mainData: [],
            totalCount: 0,
            pageSize: 20,
            loading: false,
            movementData: [],
            selectedSerialNumber: '',
            docTitle: 'Document Detail',
            docLoading: false,
            docData: null,
            docItems: [],
            docType: null
        });

        const searchTextRef = Vue.ref(null);
        const mainGridRef = Vue.ref(null);
        const movementGridRef = Vue.ref(null);
        const documentModalRef = Vue.ref(null);

        const getDisplayLocale = () => window.UiLocalization?.getLocale?.() === 'vi' ? 'vi-VN' : 'en-US';
        
        const documentModal = {
            obj: null,
            create: () => {
                documentModal.obj = new bootstrap.Modal(documentModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });
            }
        };

        const services = {
            lookupWarranty: async (search, page, pageSize) => {
                const encodedSearch = encodeURIComponent(search ?? '');
                return await AxiosManager.get(`/ProductSerial/GetWarrantyLookup?search=${encodedSearch}&page=${page}&pageSize=${pageSize}`, {});
            }
        };

        const searchText = {
            obj: null,
            create: () => {
                searchText.obj = new ej.inputs.TextBox({
                    placeholder: 'Internal serial, SO number, or customer phone',
                    value: state.search,
                    input: (e) => {
                        state.search = e.value;
                    }
                });
                searchText.obj.appendTo(searchTextRef.value);
            },
            refresh: () => {
                if (searchText.obj) {
                    searchText.obj.value = state.search;
                }
            }
        };

        const methods = {
            lookupWarranty: async () => {
                if (searchText.obj) {
                    state.search = searchText.obj.value;
                }
                state.search = String(state.search ?? '').trim();
                state.loading = true;
                try {
                    const apiPageSize = 200;
                    const firstResponse = await services.lookupWarranty(state.search, 1, apiPageSize);
                    const firstContent = firstResponse?.data?.content ?? {};
                    const totalCount = Number(firstContent.totalCount ?? 0);
                    const pageCount = Math.ceil(totalCount / apiPageSize);
                    const remainingResponses = pageCount > 1
                        ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) =>
                            services.lookupWarranty(state.search, index + 2, apiPageSize)))
                        : [];
                    const allItems = [firstContent, ...remainingResponses.map(response => response?.data?.content ?? {})]
                        .flatMap(content => content.data ?? []);

                    state.totalCount = totalCount;
                    state.mainData = allItems.map(item => ({
                    ...item,
                    salesOrderDate: item.salesOrderDate ? DateFormatManager.parseBusinessDate(item.salesOrderDate) : null,
                    salesOrderDateText: methods.formatDate(item.salesOrderDate),
                    issueDate: item.issueDate ? DateFormatManager.parseBusinessDate(item.issueDate) : null,
                    issueDateText: methods.formatDate(item.issueDate),
                    customerWarrantyEndDate: item.customerWarrantyEndDate ? DateFormatManager.parseBusinessDate(item.customerWarrantyEndDate) : null,
                    customerWarrantyEndDateText: methods.formatDate(item.customerWarrantyEndDate),
                    supplierWarrantyEndDate: item.supplierWarrantyEndDate ? DateFormatManager.parseBusinessDate(item.supplierWarrantyEndDate) : null,
                    supplierWarrantyEndDateText: methods.formatDate(item.supplierWarrantyEndDate),
                    warrantyStatus: item.customerWarrantyEndDate
                        ? (window.UiLocalization?.translateText ? window.UiLocalization.translateText(item.isCustomerWarrantyValid ? 'Valid' : 'Expired') : (item.isCustomerWarrantyValid ? 'Valid' : 'Expired'))
                        : (window.UiLocalization?.translateText ? window.UiLocalization.translateText('N/A') : 'N/A'),
                    statusName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(item.statusName) : item.statusName,
                    warehouseName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(item.warehouseName) : item.warehouseName
                    }));
                    state.movementData = [];
                    state.selectedSerialNumber = '';
                    mainGrid.refresh();
                    movementGrid.refresh();
                } finally {
                    state.loading = false;
                }
            },
            clearSearch: async () => {
                state.search = '';
                searchText.refresh();
                await methods.lookupWarranty();
            },
            showMovements: (rowData) => {
                state.selectedSerialNumber = rowData.internalSerialNumber;
                state.movementData = (rowData.movements ?? []).map(m => ({
                    ...m,
                    movementDate: m.movementDate ? DateFormatManager.parseBusinessDate(m.movementDate) : null,
                    movementDateText: methods.formatDate(m.movementDate),
                    moduleName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.moduleName) : m.moduleName,
                    fromWarehouseName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.fromWarehouseName) : m.fromWarehouseName,
                    toWarehouseName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.toWarehouseName) : m.toWarehouseName,
                    statusName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.statusName) : m.statusName
                }));
                movementGrid.refresh();
            },
            formatDate: (dateString) => {
                if (!dateString) return '';
                const date = DateFormatManager.parseBusinessDate(dateString);
                if (!date) return '';
                return new Intl.DateTimeFormat(getDisplayLocale(), {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                }).format(date);
            },
            formatDateTime: (dateString) => {
                if (!dateString) return '';
                const date = dateString instanceof Date ? dateString : DateFormatManager.parseServerDate(dateString);
                if (!date) return '';
                return new Intl.DateTimeFormat(getDisplayLocale(), {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                }).format(date);
            },
            formatNumber: (value) => {
                if (!value && value !== 0) return '';
                return NumberFormatManager.formatToLocale(value);
            },
            formatMoney: (value) => {
                if (!value && value !== 0) return '';
                return NumberFormatManager.formatMoneyToLocale(value);
            },
            formatStatus: (statusValue) => {
                if (statusValue === null || statusValue === undefined || statusValue === '') return '';
                // basic mapping
                const statuses = {
                    '0': 'Draft',
                    '1': 'Cancelled',
                    '2': 'Confirmed',
                    '3': 'Archived'
                };
                return statuses[statusValue] || statusValue;
            },
            formatStockCountStatus: (statusValue) => {
                const statuses = {
                    '0': 'Draft',
                    '1': 'Cancelled',
                    '2': 'Confirmed',
                    '3': 'Archived'
                };
                return statuses[String(statusValue)] || statusValue;
            },
            getDocumentConfig: (moduleName) => {
                const configs = {
                    PurchaseOrder: {
                        title: 'Purchase Order Details',
                        endpoint: (id) => `/PurchaseOrder/GetPurchaseOrderSingle?id=${encodeURIComponent(id)}`
                    },
                    SalesOrder: {
                        title: 'Sales Order Details',
                        endpoint: (id) => `/SalesOrder/GetSalesOrderSingle?id=${encodeURIComponent(id)}`
                    },
                    StockCount: {
                        title: 'Stock Count Details',
                        endpoint: (id) => `/StockCount/GetStockCountSingle?id=${encodeURIComponent(id)}`
                    }
                };

                return configs[moduleName] ?? {
                    title: 'Document Details',
                    endpoint: (id) => `/${moduleName}/Get${moduleName}Single?id=${encodeURIComponent(id)}`
                };
            },
            openDocumentModal: async (moduleName, moduleId, movementData = null) => {
                if (!moduleName || !moduleId) return;

                if (moduleName === 'CostAllocation') {
                    state.docTitle = 'Cost Allocation Details';
                    state.docType = 'CostAllocation';
                    state.docData = movementData;
                    state.docItems = [];
                    state.docLoading = false;
                    documentModal.obj?.show();
                    return;
                }

                const targetModule = moduleName;
                const targetId = moduleId;
                const documentConfig = methods.getDocumentConfig(targetModule);

                state.docTitle = documentConfig.title;
                state.docType = null;
                state.docData = null;
                state.docItems = [];
                state.docLoading = true;
                
                if (documentModal.obj) {
                    documentModal.obj.show();
                }

                try {
                    const res = await AxiosManager.get(documentConfig.endpoint(targetId), {});
                    const content = res?.data?.content ?? {};
                    const data = content.data;
                    if (data) {
                        state.docType = targetModule;
                        if (targetModule === 'StockCount') {
                            state.docItems = (content.transactionList ?? []).map(item => ({
                                ...item,
                                quantity: item.qtySCCount ?? Math.abs(item.movement ?? 0),
                                unitPrice: item.unitCost ?? 0
                            }));
                            const totalCost = state.docItems.reduce(
                                (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                                0);
                            state.docData = {
                                ...data,
                                orderDate: data.countDate,
                                orderStatus: methods.formatStockCountStatus(data.status),
                                beforeTaxAmount: totalCost,
                                taxAmount: 0,
                                afterTaxAmount: totalCost
                            };
                        } else {
                            state.docData = data;
                            state.docItems = data.purchaseOrderItemList || data.salesOrderItemList || [];
                        }
                        state.docTitle = documentConfig.title;
                    } else {
                        state.docTitle = 'Document not found';
                    }
                } catch (e) {
                    console.error('Failed to get document data', e);
                    state.docTitle = 'Error loading document';
                } finally {
                    state.docLoading = false;
                }
            },
            openDocumentView: (moduleName, moduleId) => {
                const routes = {
                    PurchaseOrder: '/PurchaseOrders/PurchaseOrderList',
                    SalesOrder: '/SalesOrders/SalesOrderList',
                    MaterialExport: '/MaterialExports/MaterialExportList',
                    PurchaseReturn: '/PurchaseReturns/PurchaseReturnList',
                    SalesReturn: '/SalesReturns/SalesReturnList',
                    TransferIn: '/TransferIns/TransferInList',
                    TransferOut: '/TransferOuts/TransferOutList',
                    StockCount: '/StockCounts/StockCountList',
                    Scrapping: '/Scrappings/ScrappingList'
                };
                const route = routes[moduleName];
                if (!route || !moduleId) {
                    Swal.fire({ icon: 'info', title: 'Document View Unavailable' });
                    return;
                }
                const query = ['PurchaseOrder', 'SalesOrder'].includes(moduleName)
                    ? `?viewMode=true&id=${encodeURIComponent(moduleId)}`
                    : `?viewId=${encodeURIComponent(moduleId)}`;
                window.open(`${route}${query}`, '_blank', 'noopener');
            },
            closeDocumentModal: () => {
                state.documentIframeSrc = null;
                state.docData = null;
                state.docItems = [];
                if (documentModal.obj) {
                    documentModal.obj.hide();
                }
            }
        };

        const handleLanguageChanged = () => {
            state.mainData = state.mainData.map(item => ({
                ...item,
                salesOrderDateText: methods.formatDate(item.salesOrderDate),
                issueDateText: methods.formatDate(item.issueDate),
                customerWarrantyEndDateText: methods.formatDate(item.customerWarrantyEndDate),
                supplierWarrantyEndDateText: methods.formatDate(item.supplierWarrantyEndDate)
            }));
            state.movementData = state.movementData.map(item => ({
                ...item,
                movementDateText: methods.formatDate(item.movementDate)
            }));
            mainGrid.refresh();
            movementGrid.refresh();
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['WarrantyLookups']);
                await SecurityManager.validateToken();

                searchText.create();
                await mainGrid.create([]);
                await movementGrid.create([]);
                documentModal.create();
                await methods.lookupWarranty();
                window.addEventListener('ui:languagechanged', handleLanguageChanged);
            } catch (e) {
                console.error('page init error:', e);
            }
        });

        Vue.onUnmounted(() => {
            window.removeEventListener('ui:languagechanged', handleLanguageChanged);
        });

        const mainGrid = {
            obj: null,
            create: async (dataSource) => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '420px',
                    dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    pageSettings: { currentPage: 1, pageSize: 20, pageSizes: ['10', '20', '50', '100'] },
                    selectionSettings: { type: 'Single' },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'internalSerialNumber', headerText: 'Device Serial', width: 170 },
                        { field: 'manufacturerSerialNumber', headerText: 'Manufacturer Serial', width: 190 },
                        { field: 'productName', headerText: 'Product', width: 220 },
                        { field: 'statusName', headerText: 'Status', width: 130 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 170 },
                        { field: 'sourceDocumentNumber', headerText: 'Document Number', width: 160 },
                        { field: 'customerName', headerText: 'Customer', width: 190 },
                        { field: 'customerPhoneNumber', headerText: 'Phone', width: 150 },
                        { field: 'issueDateText', headerText: 'Issue / Sold Date', width: 160 },
                        { field: 'customerWarrantyEndDateText', headerText: 'Warranty End', width: 160 },
                        { field: 'supplierWarrantyEndDateText', headerText: 'Supplier Warranty End', width: 220 },
                        { field: 'warrantyStatus', headerText: 'Warranty Status', width: 160 }
                    ],
                    toolbar: ['ExcelExport', 'Search'],
                    recordClick: (args) => {
                        methods.showMovements(args.rowData);
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
                if (mainGrid.obj) {
                    mainGrid.obj.dataSource = state.mainData;
                    mainGrid.obj.pageSettings.currentPage = 1;
                    mainGrid.obj.pageSettings.pageSize = state.pageSize;
                    mainGrid.obj.dataBind();
                }
            }
        };

        const movementGrid = {
            obj: null,
            create: async (dataSource) => {
                movementGrid.obj = new ej.grids.Grid({
                    height: '260px',
                    dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    filterSettings: { type: 'CheckBox' },
                    pageSettings: { currentPage: 1, pageSize: 10, pageSizes: ['10', '20', '50'] },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { field: 'movementDateText', headerText: 'Movement Date', width: 190 },
                        { field: 'moduleName', headerText: 'Module', width: 170 },
                        { field: 'fromWarehouseName', headerText: 'From Warehouse', width: 180 },
                        { field: 'toWarehouseName', headerText: 'To Warehouse', width: 180 },
                        { field: 'statusName', headerText: 'Status', width: 130 }
                    ],
                    sortSettings: { columns: [{ field: 'movementDate', direction: 'Descending' }] },
                    recordClick: (args) => {
                        methods.openDocumentModal(
                            args.rowData.viewModuleName ?? args.rowData.moduleName,
                            args.rowData.viewModuleId ?? args.rowData.moduleId,
                            args.rowData);
                    }
                });

                movementGrid.obj.appendTo(movementGridRef.value);
            },
            refresh: () => {
                if (movementGrid.obj) {
                    movementGrid.obj.setProperties({ dataSource: state.movementData });
                }
            }
        };

        return {
            searchTextRef,
            mainGridRef,
            movementGridRef,
            documentModalRef,
            state,
            methods
        };
    }
};

Vue.createApp(App).mount('#app');
