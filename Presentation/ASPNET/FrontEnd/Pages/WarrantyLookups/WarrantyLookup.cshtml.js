const App = {
    setup() {
        const state = Vue.reactive({
            search: '',
            mainData: [],
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
            lookupWarranty: async (search) => {
                const encodedSearch = encodeURIComponent(search ?? '');
                return await AxiosManager.get(`/ProductSerial/GetWarrantyLookup?search=${encodedSearch}`, {});
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
                const response = await services.lookupWarranty(state.search);
                state.mainData = (response?.data?.content?.data ?? []).map(item => ({
                    ...item,
                    salesOrderDate: item.salesOrderDate ? DateFormatManager.parseServerDate(item.salesOrderDate) : null,
                    salesOrderDateText: methods.formatDate(item.salesOrderDate),
                    customerWarrantyEndDate: item.customerWarrantyEndDate ? DateFormatManager.parseServerDate(item.customerWarrantyEndDate) : null,
                    customerWarrantyEndDateText: methods.formatDate(item.customerWarrantyEndDate),
                    supplierWarrantyEndDate: item.supplierWarrantyEndDate ? DateFormatManager.parseServerDate(item.supplierWarrantyEndDate) : null,
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
            },
            clearSearch: () => {
                state.search = '';
                state.mainData = [];
                state.movementData = [];
                state.selectedSerialNumber = '';
                searchText.refresh();
                mainGrid.refresh();
                movementGrid.refresh();
            },
            showMovements: (rowData) => {
                state.selectedSerialNumber = rowData.internalSerialNumber;
                state.movementData = (rowData.movements ?? []).map(m => ({
                    ...m,
                    movementDate: m.movementDate ? DateFormatManager.parseServerDate(m.movementDate) : null,
                    movementDateText: methods.formatDateTime(m.movementDate),
                    moduleName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.moduleName) : m.moduleName,
                    fromWarehouseName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.fromWarehouseName) : m.fromWarehouseName,
                    toWarehouseName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.toWarehouseName) : m.toWarehouseName,
                    statusName: window.UiLocalization?.translateText ? window.UiLocalization.translateText(m.statusName) : m.statusName
                }));
                movementGrid.refresh();
            },
            formatDate: (dateString) => {
                if (!dateString) return '';
                const date = dateString instanceof Date ? dateString : DateFormatManager.parseServerDate(dateString);
                if (!date) return '';
                return new Intl.DateTimeFormat('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    day: '2-digit', month: '2-digit', year: 'numeric'
                }).format(date);
            },
            formatDateTime: (dateString) => {
                if (!dateString) return '';
                const date = dateString instanceof Date ? dateString : DateFormatManager.parseServerDate(dateString);
                if (!date) return '';
                return new Intl.DateTimeFormat('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit', hour12: false
                }).format(date);
            },
            formatNumber: (value) => {
                if (!value && value !== 0) return '';
                return Number(value).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
            },
            formatStatus: (statusValue) => {
                if (!statusValue) return '';
                // basic mapping
                const statuses = {
                    '1': 'Draft',
                    '2': 'Confirmed',
                    '3': 'Processing',
                    '4': 'Completed',
                    '5': 'Cancelled'
                };
                return statuses[statusValue] || statusValue;
            },
            openDocumentModal: async (moduleName, moduleId) => {
                if (!moduleName || !moduleId) return;

                let targetModule = moduleName;
                let targetId = moduleId;
                
                state.docTitle = moduleName === 'GoodsReceive' || moduleName === 'PurchaseOrder' ? 'Purchase Order Details' : 'Sales Order Details';
                state.docType = null;
                state.docData = null;
                state.docItems = [];
                state.docLoading = true;
                
                if (documentModal.obj) {
                    documentModal.obj.show();
                }

                if (moduleName === 'GoodsReceive') {
                    try {
                        const res = await AxiosManager.get('/GoodsReceive/GetGoodsReceiveSingle?id=' + moduleId, {});
                        const poId = res?.data?.content?.data?.purchaseOrderId;
                        if (poId) {
                            targetModule = 'PurchaseOrder';
                            targetId = poId;
                        }
                    } catch (e) {
                        console.error('Failed to get parent order', e);
                    }
                } else if (moduleName === 'DeliveryOrder') {
                    try {
                        const res = await AxiosManager.get('/DeliveryOrder/GetDeliveryOrderSingle?id=' + moduleId, {});
                        const soId = res?.data?.content?.data?.salesOrderId;
                        if (soId) {
                            targetModule = 'SalesOrder';
                            targetId = soId;
                        }
                    } catch (e) {
                        console.error('Failed to get parent order', e);
                    }
                }

                try {
                    const endpoint = `/${targetModule}/Get${targetModule}Single?id=${targetId}`;
                    const res = await AxiosManager.get(endpoint, {});
                    const data = res?.data?.content?.data;
                    if (data) {
                        state.docType = targetModule;
                        state.docData = data;
                        state.docItems = data.purchaseOrderItemList || data.salesOrderItemList || [];
                        state.docTitle = targetModule === 'PurchaseOrder' ? 'Purchase Order Details' : 'Sales Order Details';
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
                    GoodsReceive: '/GoodsReceives/GoodsReceiveList',
                    SalesOrder: '/SalesOrders/SalesOrderList',
                    DeliveryOrder: '/DeliveryOrders/DeliveryOrderList',
                    MaterialExport: '/MaterialExports/MaterialExportList',
                    PurchaseReturn: '/PurchaseReturns/PurchaseReturnList',
                    SalesReturn: '/SalesReturns/SalesReturnList',
                    TransferIn: '/TransferIns/TransferInList',
                    TransferOut: '/TransferOuts/TransferOutList',
                    PositiveAdjustment: '/PositiveAdjustments/PositiveAdjustmentList',
                    NegativeAdjustment: '/NegativeAdjustments/NegativeAdjustmentList',
                    StockCount: '/StockCounts/StockCountList',
                    Scrapping: '/Scrappings/ScrappingList'
                };
                const route = routes[moduleName];
                if (!route || !moduleId) {
                    Swal.fire({ icon: 'info', title: 'Document View Unavailable' });
                    return;
                }
                window.open(`${route}?viewId=${encodeURIComponent(moduleId)}`, '_blank', 'noopener');
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

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['WarrantyLookups']);
                await SecurityManager.validateToken();

                searchText.create();
                await mainGrid.create([]);
                await movementGrid.create([]);
                documentModal.create();
            } catch (e) {
                console.error('page init error:', e);
            }
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
                        { field: 'productName', headerText: 'Product', width: 220 },
                        { field: 'statusName', headerText: 'Status', width: 130 },
                        { field: 'warehouseName', headerText: 'Warehouse', width: 170 },
                        { field: 'batchNumber', headerText: 'Batch', width: 140 },
                        { field: 'salesOrderNumber', headerText: 'SO Number', width: 160 },
                        { field: 'customerName', headerText: 'Customer', width: 190 },
                        { field: 'customerPhoneNumber', headerText: 'Phone', width: 150 },
                        { field: 'salesOrderDateText', headerText: 'Sold Date', width: 150 },
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
                    mainGrid.obj.setProperties({ dataSource: state.mainData });
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
                        methods.openDocumentView(
                            args.rowData.viewModuleName ?? args.rowData.moduleName,
                            args.rowData.viewModuleId ?? args.rowData.moduleId);
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
