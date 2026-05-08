const App = {
    setup() {
        const state = Vue.reactive({
            search: '',
            mainData: [],
            movementData: [],
            selectedSerialNumber: ''
        });

        const searchTextRef = Vue.ref(null);
        const mainGridRef = Vue.ref(null);
        const movementGridRef = Vue.ref(null);

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
                const response = await services.lookupWarranty(state.search);
                state.mainData = (response?.data?.content?.data ?? []).map(item => ({
                    ...item,
                    salesOrderDate: item.salesOrderDate ? DateFormatManager.parseServerDate(item.salesOrderDate) : null,
                    customerWarrantyEndDate: item.customerWarrantyEndDate ? DateFormatManager.parseServerDate(item.customerWarrantyEndDate) : null,
                    warrantyStatus: item.customerWarrantyEndDate
                        ? (item.isCustomerWarrantyValid ? 'Valid' : 'Expired')
                        : ''
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
            showMovements: (record) => {
                state.selectedSerialNumber = record?.internalSerialNumber ?? '';
                state.movementData = (record?.movements ?? []).map(item => ({
                    ...item,
                    movementDate: item.movementDate ? DateFormatManager.parseServerDate(item.movementDate) : null
                }));
                movementGrid.refresh();
            }
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['WarrantyLookups']);
                await SecurityManager.validateToken();

                searchText.create();
                await mainGrid.create(state.mainData);
                await movementGrid.create(state.movementData);
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
                        { field: 'salesOrderDate', headerText: 'Sold Date', width: 150, format: 'yyyy-MM-dd' },
                        { field: 'customerWarrantyEndDate', headerText: 'Warranty End', width: 160, format: 'yyyy-MM-dd' },
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
                        { field: 'movementDate', headerText: 'Movement Date', width: 170, format: 'yyyy-MM-dd' },
                        { field: 'moduleName', headerText: 'Module', width: 170 },
                        { field: 'moduleId', headerText: 'Document Id', width: 220 },
                        { field: 'moduleItemId', headerText: 'Line Id', width: 220 },
                        { field: 'fromWarehouseId', headerText: 'From Warehouse', width: 180 },
                        { field: 'toWarehouseId', headerText: 'To Warehouse', width: 180 },
                        { field: 'statusName', headerText: 'Status', width: 130 }
                    ]
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
            state,
            methods
        };
    }
};

Vue.createApp(App).mount('#app');
