(function (window, document) {
    const DATA_SHEET_NAME = 'Data';
    const DOCUMENT_SHEET_NAME = 'Documents';
    const ITEM_SHEET_NAME = 'Items';
    const ALLOCATION_SHEET_NAME = 'Allocations';
    const INSTRUCTION_SHEET_NAME = 'Instructions';
    const TEMPLATE_BUTTON_ID = 'ExcelImportTemplateCustom';
    const IMPORT_BUTTON_ID = 'ExcelImportCustom';
    const MAX_ERROR_LINES = 12;

    const localizedHeaderAliases = {
        'Name': ['Tên'],
        'Description': ['Mô tả', 'Diễn giải'],
        'Document Key': ['Khóa chứng từ'],
        'Transaction Key': ['Khóa giao dịch'],
        'Transaction Date': ['Ngày giao dịch'],
        'Transaction Type': ['Loại giao dịch'],
        'Amount': ['Số tiền'],
        'Paid Amount': ['Số đã thanh toán'],
        'Cash Account': ['Tài khoản quỹ'],
        'Cash Category': ['Danh mục quỹ'],
        'Customer': ['Khách hàng', 'Công trình'],
        'Vendor': ['Nhà cung cấp'],
        'Order Date': ['Ngày đơn hàng'],
        'Sales Type': ['Loại bán hàng'],
        'Product': ['Sản phẩm', 'Hàng hóa'],
        'Warehouse': ['Kho'],
        'Warehouse From': ['Kho nguồn'],
        'Warehouse To': ['Kho đích'],
        'Quantity': ['Số lượng'],
        'Counted Quantity': ['Số lượng kiểm kê'],
        'Unit Price': ['Đơn giá'],
        'Cost Price': ['Giá vốn'],
        'Tax': ['Thuế'],
        'Status': ['Trạng thái'],
        'Order Status': ['Trạng thái đơn'],
        'Physical Product': ['Hàng vật lý'],
        'Serial Tracking Mode': ['Chế độ serial'],
        'Internal Serial Fixed Code': ['Mã serial cố định'],
        'Default Warehouse': ['Kho mặc định'],
        'Default Warranty Months': ['Số tháng bảo hành mặc định'],
        'Product Serial IDs': ['ID serial sản phẩm'],
        'Product Group': ['Nhóm sản phẩm'],
        'Unit Measure': ['Đơn vị tính'],
        'Return Date': ['Ngày trả hàng'],
        'Purchase Order': ['Đơn mua hàng'],
        'Sales Order': ['Đơn bán hàng'],
        'Release Date': ['Ngày xuất'],
        'Receive Date': ['Ngày nhận'],
        'Transfer Out': ['Phiếu xuất chuyển kho'],
        'Scrapping Date': ['Ngày hủy hàng'],
        'Count Date': ['Ngày kiểm kê'],
        'Export Date': ['Ngày xuất vật tư']
    };

    const normalizeKey = (value) => `${value ?? ''}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const toDisplayText = (value) => `${value ?? ''}`.trim();

    const lookupSources = {
        productGroups: { endpoint: '/ProductGroup/GetProductGroupList', sheetName: 'ProductGroups' },
        vendorGroups: { endpoint: '/VendorGroup/GetVendorGroupList', sheetName: 'VendorGroups' },
        vendorCategories: { endpoint: '/VendorCategory/GetVendorCategoryList', sheetName: 'VendorCategories' },
        customerGroups: { endpoint: '/CustomerGroup/GetCustomerGroupList', sheetName: 'CustomerGroups' },
        customerCategories: { endpoint: '/CustomerCategory/GetCustomerCategoryList', sheetName: 'CustomerCategories' },
        taxes: { endpoint: '/Tax/GetTaxList', sheetName: 'Taxes' },
        vendors: { endpoint: '/Vendor/GetVendorList', sheetName: 'Vendors' },
        customers: { endpoint: '/Customer/GetCustomerList', sheetName: 'Customers' },
        warehouses: { endpoint: '/Warehouse/GetWarehouseList', sheetName: 'Warehouses' },
        products: { endpoint: '/Product/GetProductList', sheetName: 'Products' },
        salesOrders: { endpoint: '/SalesOrder/GetSalesOrderList', sheetName: 'SalesOrders' },
        purchaseOrders: { endpoint: '/PurchaseOrder/GetPurchaseOrderList', sheetName: 'PurchaseOrders' },
        transferOuts: { endpoint: '/TransferOut/GetTransferOutList', sheetName: 'TransferOuts' },
        todos: { endpoint: '/Todo/GetTodoList', sheetName: 'Todos' },
        cashAccounts: { endpoint: '/CashAccount/GetCashAccountList', sheetName: 'CashAccounts' },
        cashCategories: { endpoint: '/CashCategory/GetCashCategoryList', sheetName: 'CashCategories' },
        transactionTypes: {
            sheetName: 'TransactionTypes',
            data: [
                { id: 0, name: 'Debit', aliases: ['Thu', 'Receipt'] },
                { id: 1, name: 'Credit', aliases: ['Chi', 'Expense'] }
            ]
        },
        accountTypes: {
            sheetName: 'AccountTypes',
            data: [
                { id: 0, name: 'Cash', aliases: ['Tiền mặt'] },
                { id: 1, name: 'Bank', aliases: ['Ngân hàng'] }
            ]
        },
        serialTrackingModes: {
            sheetName: 'SerialModes',
            data: [
                { id: 0, name: 'None', aliases: ['Không theo dõi'] },
                { id: 1, name: 'Internal Auto', aliases: ['Mã nội bộ tự sinh'] },
                { id: 2, name: 'Manufacturer Serial', aliases: ['Serial nhà sản xuất'] }
            ]
        },
        salesTypes: {
            sheetName: 'SalesTypes',
            data: [
                { id: 1, name: 'Retail', aliases: ['Bán lẻ'] },
                { id: 2, name: 'Internal Export', aliases: ['Xuất nội bộ'] }
            ]
        },
        statuses: {
            sheetName: 'Statuses',
            data: [
                { id: '0', name: 'Draft', aliases: ['Nháp'] },
                { id: '1', name: 'Cancelled', aliases: ['Hủy', 'Đã hủy'] },
                { id: '2', name: 'Confirmed', aliases: ['Đã xác nhận'] },
                { id: '3', name: 'Archived', aliases: ['Lưu trữ'] }
            ]
        }
    };

    const simpleColumns = [
        { header: 'Name', key: 'name', required: true, example: 'Sample name' },
        { header: 'Description', key: 'description', example: 'Optional description' }
    ];

    const addressColumns = [
        { header: 'Name', key: 'name', required: true, example: 'Sample company' },
        { header: 'Street', key: 'street', required: true, example: '123 Main Street' },
        { header: 'City', key: 'city', required: true, example: 'Ho Chi Minh City' },
        { header: 'State', key: 'state', required: true, example: 'Ho Chi Minh' },
        { header: 'Zip Code', key: 'zipCode', required: true, example: '700000' },
        { header: 'Country', key: 'country', example: 'Vietnam' },
        { header: 'Phone Number', key: 'phoneNumber', required: true, example: '0900000000' },
        { header: 'Fax Number', key: 'faxNumber', example: '' },
        { header: 'Email Address', key: 'emailAddress', required: true, example: 'sample@example.com' },
        { header: 'Website', key: 'website', example: '' },
        { header: 'WhatsApp', key: 'whatsApp', example: '' },
        { header: 'LinkedIn', key: 'linkedIn', example: '' },
        { header: 'Facebook', key: 'facebook', example: '' },
        { header: 'Instagram', key: 'instagram', example: '' },
        { header: 'Twitter X', key: 'twitterX', example: '' },
        { header: 'TikTok', key: 'tikTok', example: '' },
        { header: 'Description', key: 'description', example: '' }
    ];

    const contactColumns = [
        { header: 'Name', key: 'name', required: true, example: 'Sample contact' },
        { header: 'Job Title', key: 'jobTitle', required: true, example: 'Manager' },
        { header: 'Phone Number', key: 'phoneNumber', required: true, example: '0900000000' },
        { header: 'Email Address', key: 'emailAddress', required: true, example: 'contact@example.com' },
        { header: 'Description', key: 'description', example: '' }
    ];

    const statusColumn = { header: 'Status', key: 'status', required: true, lookup: 'statuses', example: 'Draft' };
    const orderStatusColumn = { header: 'Order Status', key: 'orderStatus', required: true, lookup: 'statuses', example: 'Draft' };
    const descriptionColumn = { header: 'Description', key: 'description', example: '' };

    const pageConfigs = {
        productgroups: {
            title: 'Product Group',
            endpoint: '/ProductGroup/CreateProductGroup',
            fileName: 'product-groups-template.xlsx',
            columns: simpleColumns
        },
        vendorgroups: {
            title: 'Vendor Group',
            endpoint: '/VendorGroup/CreateVendorGroup',
            fileName: 'vendor-groups-template.xlsx',
            columns: simpleColumns
        },
        vendorcategories: {
            title: 'Vendor Category',
            endpoint: '/VendorCategory/CreateVendorCategory',
            fileName: 'vendor-categories-template.xlsx',
            columns: simpleColumns
        },
        customergroups: {
            title: 'Customer Group',
            endpoint: '/CustomerGroup/CreateCustomerGroup',
            fileName: 'customer-groups-template.xlsx',
            columns: simpleColumns
        },
        customercategories: {
            title: 'Customer Category',
            endpoint: '/CustomerCategory/CreateCustomerCategory',
            fileName: 'customer-categories-template.xlsx',
            columns: simpleColumns
        },
        warehouses: {
            title: 'Warehouse',
            endpoint: '/Warehouse/CreateWarehouse',
            fileName: 'warehouses-template.xlsx',
            columns: simpleColumns
        },
        cashaccounts: {
            title: 'Cash Account',
            fileName: 'cash-accounts-template.xlsx',
            columns: [
                { header: 'Name', key: 'name', required: true, example: 'Main bank account' },
                { header: 'Account Type', key: 'accountType', required: true, lookup: 'accountTypes', example: 'Bank' },
                { header: 'Initial Balance', key: 'initialBalance', type: 'number', defaultValue: 0, example: 0 },
                descriptionColumn
            ]
        },
        cashcategories: {
            title: 'Cash Category',
            fileName: 'cash-categories-template.xlsx',
            columns: simpleColumns
        },
        cashtransactions: {
            title: 'Cash Transaction',
            endpoint: '/CashTransaction/CreateCashTransaction',
            fileName: 'cash-transactions-template.xlsx',
            columns: [
                { header: 'Transaction Date', key: 'transactionDate', required: true, type: 'date', example: '2026-04-29' },
                { header: 'Transaction Type', key: 'transactionType', required: true, lookup: 'transactionTypes', example: 'Credit' },
                { header: 'Amount', key: 'amount', required: true, type: 'number', example: 1000000 },
                { header: 'Paid Amount', key: 'paidAmount', type: 'number', defaultValue: 0, example: 0 },
                { header: 'Description', key: 'description', example: '' },
                { header: 'Cash Account', key: 'cashAccountId', required: true, lookup: 'cashAccounts', example: 'Sample Account' },
                { header: 'Cash Category', key: 'cashCategoryId', lookup: 'cashCategories', example: 'Sample Category' },
                { header: 'Customer', key: 'customerId', lookup: 'customers', example: 'Sample Customer' },
                { header: 'Vendor', key: 'vendorId', lookup: 'vendors', example: 'Sample Vendor' },
                { header: 'Transaction Key', key: 'documentKey', required: true, example: 'CT-1', clientOnly: true }
            ],
            nestedSheetName: ALLOCATION_SHEET_NAME,
            nestedProperty: 'allocations',
            nestedColumns: [
                { header: 'Transaction Key', key: 'documentKey', required: true, example: 'CT-1', clientOnly: true },
                { header: 'Customer', key: 'customerId', required: true, lookup: 'customers', example: 'Sample Customer' },
                { header: 'Amount', key: 'amount', required: true, type: 'number', example: 1000000 },
                descriptionColumn
            ],
            validate: (payload, rowNumber) => {
                if ((payload.paidAmount ?? 0) < 0 || payload.paidAmount > payload.amount) {
                    throw new Error(`Row ${rowNumber}: "Paid Amount" must be between zero and the transaction amount.`);
                }
                const allocations = payload.allocations ?? [];
                if (allocations.length && Math.abs(allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0) - payload.amount) > 0.000001) {
                    throw new Error(`Row ${rowNumber}: allocation total must equal the transaction amount.`);
                }
            }
        },
        taxs: {
            title: 'Tax',
            endpoint: '/Tax/CreateTax',
            fileName: 'tax-template.xlsx',
            columns: [
                { header: 'Name', key: 'name', required: true, example: 'VAT 10%' },
                { header: 'Percentage', key: 'percentage', required: true, type: 'number', example: 10 },
                { header: 'Description', key: 'description', example: '' }
            ]
        },
        products: {
            title: 'Product',
            endpoint: '/Product/CreateProduct',
            fileName: 'products-template.xlsx',
            columns: [
                { header: 'Name', key: 'name', required: true, example: 'Sample product' },
                { header: 'Ref Code', key: 'referenceCode', aliases: ['Reference Code', 'SKU'], example: 'SKU-001' },
                { header: 'Unit Price', key: 'unitPrice', required: true, type: 'number', example: 100000 },
                { header: 'Cost Price', key: 'costPrice', type: 'number', defaultValue: 0, example: 80000 },
                { header: 'Physical Product', key: 'physical', required: true, type: 'boolean', example: 'TRUE', defaultValue: true },
                { header: 'Serial Tracking Mode', key: 'serialTrackingMode', required: true, lookup: 'serialTrackingModes', example: 'None' },
                { header: 'Internal Serial Fixed Code', key: 'internalSerialFixedCode', example: '' },
                { header: 'Default Warehouse', key: 'defaultWarehouseId', lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Default Warranty Months', key: 'defaultWarrantyMonths', type: 'number', defaultValue: 0, example: 12 },
                { header: 'Product Group', key: 'productGroupId', required: true, lookup: 'productGroups', example: 'General' },
                { header: 'Unit Measure', key: 'unitMeasureName', required: false, example: 'Cái, Hộp, PCS' },
                { header: 'Description', key: 'description', example: '' }
            ],
            validate: (payload, rowNumber) => {
                if (!payload.physical) {
                    payload.serialTrackingMode = 0;
                    payload.internalSerialFixedCode = '';
                    payload.defaultWarehouseId = null;
                    payload.defaultWarrantyMonths = null;
                    return;
                }
                if (Number(payload.serialTrackingMode) === 1 && !/^[A-Za-z0-9]{2,4}$/.test(payload.internalSerialFixedCode || '')) {
                    throw new Error(`Row ${rowNumber}: "Internal Serial Fixed Code" must contain 2-4 letters or numbers for Internal Auto mode.`);
                }
            }
        },
        vendors: {
            title: 'Vendor',
            endpoint: '/Vendor/CreateVendor',
            fileName: 'vendors-template.xlsx',
            columns: [
                { header: 'Vendor Group', key: 'vendorGroupId', required: true, lookup: 'vendorGroups', example: 'General' },
                { header: 'Vendor Category', key: 'vendorCategoryId', required: true, lookup: 'vendorCategories', example: 'Default' },
                ...addressColumns
            ]
        },
        customers: {
            title: 'Customer',
            endpoint: '/Customer/CreateCustomer',
            fileName: 'customers-template.xlsx',
            columns: [
                { header: 'Customer Group', key: 'customerGroupId', required: true, lookup: 'customerGroups', example: 'General' },
                { header: 'Customer Category', key: 'customerCategoryId', required: true, lookup: 'customerCategories', example: 'Default' },
                ...addressColumns
            ]
        },
        customercontacts: {
            title: 'Customer Contact',
            endpoint: '/CustomerContact/CreateCustomerContact',
            fileName: 'customer-contacts-template.xlsx',
            columns: [
                { header: 'Customer', key: 'customerId', required: true, lookup: 'customers', example: 'Sample customer' },
                ...contactColumns
            ]
        },
        vendorcontacts: {
            title: 'Vendor Contact',
            endpoint: '/VendorContact/CreateVendorContact',
            fileName: 'vendor-contacts-template.xlsx',
            columns: [
                { header: 'Vendor', key: 'vendorId', required: true, lookup: 'vendors', example: 'Sample vendor' },
                ...contactColumns
            ]
        },
        todos: {
            title: 'Todo',
            endpoint: '/Todo/CreateTodo',
            fileName: 'todos-template.xlsx',
            columns: simpleColumns
        },
        todoitems: {
            title: 'Todo Item',
            endpoint: '/TodoItem/CreateTodoItem',
            fileName: 'todo-items-template.xlsx',
            columns: [
                { header: 'Todo', key: 'todoId', required: true, lookup: 'todos', example: 'Sample todo' },
                ...simpleColumns
            ]
        },
        salesorders: {
            title: 'Sales Order',
            endpoint: '/SalesOrder/CreateSalesOrder',
            fileName: 'sales-orders-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SO-1', clientOnly: true },
                { header: 'Order Date', key: 'orderDate', required: true, type: 'date', example: '2026-04-29' },
                { header: 'Customer', key: 'customerId', required: true, lookup: 'customers', example: 'Sample customer' },
                { header: 'Sales Type', key: 'salesType', required: true, lookup: 'salesTypes', example: 'Retail' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SO-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Warehouse', key: 'warehouseId', lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Quantity', key: 'quantity', required: true, type: 'number', example: 1 },
                { header: 'Unit Price', key: 'unitPrice', required: true, type: 'number', example: 100000 },
                { header: 'Tax', key: 'taxId', lookup: 'taxes', example: 'VAT 10%' },
                { header: 'Warranty Months', key: 'warrantyMonths', type: 'number', defaultValue: 0, example: 12 },
                { header: 'Summary', key: 'summary', example: '' }
            ]
        },
        purchaseorders: {
            title: 'Purchase Order',
            endpoint: '/PurchaseOrder/CreatePurchaseOrder',
            fileName: 'purchase-orders-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'PO-1', clientOnly: true },
                { header: 'Order Date', key: 'orderDate', required: true, type: 'date', example: '2026-04-29' },
                { header: 'Vendor', key: 'vendorId', required: true, lookup: 'vendors', example: 'Sample vendor' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'PO-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Warehouse', key: 'warehouseId', lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Quantity', key: 'quantity', required: true, type: 'number', example: 1 },
                { header: 'Unit Price', key: 'unitPrice', required: true, type: 'number', example: 100000 },
                { header: 'Tax', key: 'taxId', lookup: 'taxes', example: 'VAT 10%' },
                { header: 'Supplier Warranty Months', key: 'supplierWarrantyMonths', type: 'number', defaultValue: 0, example: 12 },
                { header: 'Manufacturer Serials', key: 'manufacturerSerialNumbers', type: 'list', example: '' },
                { header: 'Summary', key: 'summary', example: '' }
            ]
        },
        purchasereturns: {
            title: 'Purchase Return',
            endpoint: '/PurchaseReturn/CreatePurchaseReturn',
            fileName: 'purchase-returns-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'PR-1', clientOnly: true },
                { header: 'Return Date', key: 'returnDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Purchase Order', key: 'purchaseOrderId', required: true, lookup: 'purchaseOrders', example: 'PO-0001' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'PR-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Warehouse', key: 'warehouseId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 },
                { header: 'Product Serial IDs', key: 'productSerialIds', type: 'list', example: '' }
            ]
        },
        salesreturns: {
            title: 'Sales Return',
            endpoint: '/SalesReturn/CreateSalesReturn',
            fileName: 'sales-returns-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SR-1', clientOnly: true },
                { header: 'Return Date', key: 'returnDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Sales Order', key: 'salesOrderId', required: true, lookup: 'salesOrders', example: 'SO-0001' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SR-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Warehouse', key: 'warehouseId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 },
                { header: 'Product Serial IDs', key: 'productSerialIds', type: 'list', example: '' }
            ]
        },
        transferouts: {
            title: 'Transfer Out',
            endpoint: '/TransferOut/CreateTransferOut',
            fileName: 'transfer-outs-template.xlsx',
            columns: [
                { header: 'Release Date', key: 'transferReleaseDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Warehouse From', key: 'warehouseFromId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Warehouse To', key: 'warehouseToId', required: true, lookup: 'warehouses', example: 'Secondary Warehouse' },
                descriptionColumn,
                { header: 'Document Key', key: 'documentKey', required: true, example: 'TO-1', clientOnly: true }
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'TO-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 }
            ]
        },
        transferins: {
            title: 'Transfer In',
            endpoint: '/TransferIn/CreateTransferIn',
            fileName: 'transfer-ins-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'TI-1', clientOnly: true },
                { header: 'Receive Date', key: 'transferReceiveDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Transfer Out', key: 'transferOutId', required: true, lookup: 'transferOuts', example: 'OUT-0001' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'TI-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 },
                { header: 'Product Serial IDs', key: 'productSerialIds', type: 'list', example: '' }
            ]
        },
        scrappings: {
            title: 'Scrapping',
            endpoint: '/Scrapping/CreateScrapping',
            fileName: 'scrappings-template.xlsx',
            columns: [
                { header: 'Scrapping Date', key: 'scrappingDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Warehouse', key: 'warehouseId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                descriptionColumn,
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SCRAP-1', clientOnly: true }
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SCRAP-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 }
            ]
        },
        stockcounts: {
            title: 'Stock Count',
            endpoint: '/StockCount/CreateStockCount',
            fileName: 'stock-counts-template.xlsx',
            columns: [
                { header: 'Count Date', key: 'countDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Warehouse', key: 'warehouseId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                descriptionColumn,
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SC-1', clientOnly: true }
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'SC-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Counted Quantity', key: 'qtySCCount', required: true, type: 'number', example: 1 }
            ]
        },
        materialexports: {
            title: 'Material Export',
            fileName: 'material-exports-template.xlsx',
            columns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'ME-1', clientOnly: true },
                { header: 'Export Date', key: 'materialExportDate', required: true, type: 'date', example: '2026-04-29' },
                { header: 'Warehouse', key: 'warehouseId', required: true, lookup: 'warehouses', example: 'Main Warehouse' },
                { header: 'Customer', key: 'customerId', required: true, lookup: 'customers', example: 'Sample customer' },
                descriptionColumn
            ],
            itemColumns: [
                { header: 'Document Key', key: 'documentKey', required: true, example: 'ME-1', clientOnly: true },
                { header: 'Product', key: 'productId', required: true, lookup: 'products', example: 'SKU-001' },
                { header: 'Quantity', key: 'movement', required: true, type: 'number', example: 1 }
            ]
        }
    };

    const getCurrentConfig = () => {
        const segment = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
        return pageConfigs[segment.toLowerCase()] ?? null;
    };

    const getSwal = () => window.Swal;

    const showError = (title, text) => {
        if (getSwal()) {
            Swal.fire({ icon: 'error', title, text, confirmButtonText: 'OK' });
            return;
        }

        alert(`${title}\n${text}`);
    };

    const showInfo = (title, text) => {
        if (getSwal()) {
            Swal.fire({ icon: 'info', title, text, confirmButtonText: 'OK' });
            return;
        }

        alert(`${title}\n${text}`);
    };

    const getResponseData = (response) => response?.data?.content?.data ?? [];

    const fetchLookup = async (lookupName) => {
        const source = lookupSources[lookupName];
        if (!source) {
            return { source: null, data: [], index: new Map() };
        }

        const response = source.endpoint ? await AxiosManager.get(source.endpoint, {}) : null;
        const data = source.data ?? getResponseData(response) ?? [];
        const index = new Map();

        data.forEach((item) => {
            [
                item?.id,
                item?.name,
                item?.number,
                item?.referenceCode,
                item?.emailAddress,
                item?.percentage,
                ...(item?.aliases ?? [])
            ].forEach((value) => {
                const key = normalizeKey(value);
                if (!key) return;
                if (!index.has(key)) {
                    index.set(key, item);
                } else if (index.get(key)?.id !== item?.id) {
                    index.set(key, null);
                }
            });
        });

        return { source, data, index };
    };

    const getRequiredLookups = (config) => [...new Set(
        [...config.columns, ...(config.itemColumns ?? []), ...(config.nestedColumns ?? [])]
            .map((column) => column.lookup)
            .filter(Boolean)
    )];

    const fetchLookups = async (config) => {
        const entries = await Promise.all(
            getRequiredLookups(config).map(async (lookupName) => [lookupName, await fetchLookup(lookupName)])
        );

        return Object.fromEntries(entries);
    };

    const getLookupSample = (column, lookups) => {
        const lookup = lookups[column.lookup];
        const item = lookup?.data?.[0];

        return item?.name ?? item?.number ?? item?.referenceCode ?? column.example ?? '';
    };

    const getSampleValue = (column, lookups) => {
        if (column.lookup) {
            return getLookupSample(column, lookups);
        }

        return column.example ?? column.defaultValue ?? '';
    };

    const buildInstructions = (config, lookups) => [
        ['Instruction'],
        [`Fill the "${config.itemColumns ? DOCUMENT_SHEET_NAME : DATA_SHEET_NAME}" sheet, then import this file from the ${config.title} page.`],
        ['Required columns are marked with "*".'],
        ['For lookup columns, use the name, number, reference code, or id from the reference sheets.'],
        ['Do not rename the header row.'],
        ['The whole workbook is atomic: if one row is invalid, no rows are imported.'],
        [],
        ['Example only - do not copy this row unless you intend to import it.'],
        [config.columns.map(column => column.header).join(' | ')],
        [config.columns.map(column => getSampleValue(column, lookups)).join(' | ')]
    ];

    const appendLookupSheets = (workbook, lookups) => {
        Object.values(lookups).forEach((lookup) => {
            if (!lookup?.source) {
                return;
            }

            const rows = [
                ['Name', 'Number', 'Ref Code', 'Email Address', 'Id'],
                ...lookup.data.map((item) => [
                    item?.name ?? '',
                    item?.number ?? '',
                    item?.referenceCode ?? '',
                    item?.emailAddress ?? '',
                    item?.id ?? ''
                ])
            ];

            const sheet = XLSX.utils.aoa_to_sheet(rows);
            XLSX.utils.book_append_sheet(workbook, sheet, lookup.source.sheetName);
        });
    };

    const downloadTemplate = async (config) => {
        if (!window.XLSX) {
            showError('Excel import is not ready', 'SheetJS could not be loaded.');
            return;
        }

        try {
            const lookups = await fetchLookups(config);
            const workbook = XLSX.utils.book_new();
            const appendEmptyInputSheet = (columns, sheetName) => {
                const headers = columns.map((column) => column.required ? `${column.header} *` : column.header);
                XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), sheetName);
            };

            appendEmptyInputSheet(config.columns, config.itemColumns ? DOCUMENT_SHEET_NAME : DATA_SHEET_NAME);
            if (config.itemColumns) appendEmptyInputSheet(config.itemColumns, ITEM_SHEET_NAME);
            if (config.nestedColumns) appendEmptyInputSheet(config.nestedColumns, config.nestedSheetName ?? ALLOCATION_SHEET_NAME);
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet(buildInstructions(config, lookups)),
                INSTRUCTION_SHEET_NAME
            );
            appendLookupSheets(workbook, lookups);
            XLSX.writeFile(workbook, config.fileName);
        } catch (error) {
            showError('Template download failed', getErrorMessage(error));
        }
    };

    const getNormalizedRow = (row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [normalizeKey(key.replace(/\*/g, '')), value])
    );

    const getCellValue = (normalizedRow, column) => {
        const keys = [
            column.header,
            column.key,
            ...(column.aliases ?? []),
            ...(localizedHeaderAliases[column.header] ?? [])
        ].map(normalizeKey);

        for (const key of keys) {
            if (Object.prototype.hasOwnProperty.call(normalizedRow, key)) {
                return normalizedRow[key];
            }
        }

        return '';
    };

    const parseNumber = (value) => {
        if (value === '' || value == null) {
            return null;
        }

        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        const parsed = window.NumberFormatManager?.parseLocaleNumber?.(value);
        if (parsed != null) {
            return parsed;
        }

        const fallback = Number(`${value}`.replace(/,/g, ''));
        return Number.isFinite(fallback) ? fallback : null;
    };

    const parseBoolean = (value, defaultValue = false) => {
        const text = `${value ?? ''}`.trim().toLowerCase();
        if (!text) {
            return defaultValue;
        }

        return ['true', 'yes', 'y', '1', 'x', 'checked', 'có', 'co', 'đúng', 'dung'].includes(text);
    };

    const parseDate = (value) => {
        if (!value) {
            return null;
        }

        if (typeof value === 'string') {
            const text = value.trim();
            const dmyMatch = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
            if (dmyMatch) {
                const [, day, month, year] = dmyMatch;
                return [
                    year,
                    month.padStart(2, '0'),
                    day.padStart(2, '0')
                ].join('-');
            }
        }

        if (window.DateFormatManager?.formatForApiDate) {
            return window.DateFormatManager.formatForApiDate(value);
        }

        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) {
            return null;
        }

        return [
            date.getFullYear(),
            `${date.getMonth() + 1}`.padStart(2, '0'),
            `${date.getDate()}`.padStart(2, '0')
        ].join('-');
    };

    const resolveLookup = (column, value, lookups, rowNumber) => {
        const text = toDisplayText(value);
        if (!text) {
            return null;
        }

        const lookup = lookups[column.lookup];
        const item = lookup?.index?.get(normalizeKey(text));
        if (item === null) {
            throw new Error(`Row ${rowNumber}: "${column.header}" value "${text}" is ambiguous. Use a unique number, reference code, or id.`);
        }
        if (!item) {
            throw new Error(`Row ${rowNumber}: "${column.header}" value "${text}" was not found in lookup data.`);
        }

        return item.id;
    };

    const buildPayload = (config, row, lookups, rowNumber) => {
        const normalizedRow = getNormalizedRow(row);
        const payload = {};

        config.columns.forEach((column) => {
            const rawValue = getCellValue(normalizedRow, column);
            const valueText = toDisplayText(rawValue);

            if (column.required && !valueText && column.defaultValue == null) {
                throw new Error(`Row ${rowNumber}: "${column.header}" is required.`);
            }

            if (column.clientOnly) {
                payload[column.key] = valueText;
                return;
            }

            if (column.lookup) {
                payload[column.key] = resolveLookup(column, rawValue, lookups, rowNumber);
                return;
            }

            if (column.type === 'number') {
                const numberValue = parseNumber(rawValue);
                if (column.required && numberValue == null) {
                    throw new Error(`Row ${rowNumber}: "${column.header}" must be a number.`);
                }
                payload[column.key] = numberValue;
                return;
            }

            if (column.type === 'date') {
                const dateValue = parseDate(rawValue);
                if (column.required && !dateValue) {
                    throw new Error(`Row ${rowNumber}: "${column.header}" must be a valid date.`);
                }
                payload[column.key] = dateValue;
                return;
            }

            if (column.type === 'boolean') {
                payload[column.key] = parseBoolean(rawValue, column.defaultValue ?? false);
                return;
            }

            if (column.type === 'list') {
                payload[column.key] = valueText
                    ? valueText.split(/[;,\n]/).map(value => value.trim()).filter(Boolean)
                    : [];
                return;
            }

            payload[column.key] = valueText;
        });

        payload.createdById = StorageManager.getUserId();
        return payload;
    };

    const getErrorMessage = (error) => {
        const responseData = error?.response?.data;
        const value = responseData?.message
            ?? responseData?.title
            ?? responseData?.errors
            ?? error?.message
            ?? 'Please check your data.';
        if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? item : item?.message ?? JSON.stringify(item)).join('\n');
        if (value && typeof value === 'object') return Object.values(value).flat().join('\n');
        return `${value}`;
    };

    const readWorkbook = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                resolve(XLSX.read(data, { type: 'array', cellDates: true }));
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file);
    });

    const readDataRows = (workbook, requestedSheetName = DATA_SHEET_NAME) => {
        const sheetName = workbook.SheetNames.includes(requestedSheetName)
            ? requestedSheetName
            : workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        return rows
            .map((row, index) => ({ row, rowNumber: index + 2 }))
            .filter((item) => Object.values(item.row).some((value) => toDisplayText(value) !== ''));
    };

    const importFile = async (config, file) => {
        if (!window.XLSX) {
            showError('Excel import is not ready', 'SheetJS could not be loaded.');
            return;
        }

        const workbook = await readWorkbook(file);
        const mainSheetName = config.itemColumns ? DOCUMENT_SHEET_NAME : DATA_SHEET_NAME;
        const rows = readDataRows(workbook, mainSheetName);
        if (!rows.length) {
            showInfo('No data found', 'The Excel file does not contain any import rows.');
            return;
        }

        const confirmation = !getSwal()
            ? { isConfirmed: confirm(`Import ${rows.length} rows?`) }
            : await Swal.fire({
                icon: 'question',
                title: `Import ${config.title}`,
                text: `Import ${rows.length} row(s) from this Excel file?`,
                showCancelButton: true,
                confirmButtonText: 'Import',
                cancelButtonText: 'Cancel'
            });

        if (!confirmation.isConfirmed) {
            return;
        }

        const lookups = await fetchLookups(config);
        const errors = [];
        const payloads = [];
        const nestedRows = config.nestedColumns
            ? readDataRows(workbook, config.nestedSheetName ?? ALLOCATION_SHEET_NAME)
            : [];
        const itemRows = config.itemColumns ? readDataRows(workbook, ITEM_SHEET_NAME) : [];
        const keyColumn = config.columns.find(column => column.key === 'documentKey');
        if (keyColumn) {
            const keys = rows.map(item => toDisplayText(getCellValue(getNormalizedRow(item.row), keyColumn)));
            const duplicateKeys = keys.filter((key, index) => key && keys.indexOf(key) !== index);
            if (duplicateKeys.length) errors.push(`Duplicate document key: ${[...new Set(duplicateKeys)].join(', ')}.`);
            const mainKeys = new Set(keys);
            [
                ...itemRows.map(item => ({ ...item, column: config.itemColumns?.[0], sheet: ITEM_SHEET_NAME })),
                ...nestedRows.map(item => ({ ...item, column: config.nestedColumns?.[0], sheet: config.nestedSheetName ?? ALLOCATION_SHEET_NAME }))
            ].forEach(detail => {
                const key = toDisplayText(getCellValue(getNormalizedRow(detail.row), detail.column));
                if (key && !mainKeys.has(key)) errors.push(`${detail.sheet} row ${detail.rowNumber}: document key "${key}" was not found.`);
            });
        }

        for (const item of rows) {
            try {
                const payload = buildPayload(config, item.row, lookups, item.rowNumber);
                const documentKey = payload.documentKey;
                delete payload.documentKey;

                if (config.itemColumns) {
                    payload.items = itemRows
                        .filter(detail => toDisplayText(getCellValue(getNormalizedRow(detail.row), config.itemColumns[0])) === documentKey)
                        .map(detail => {
                            const nestedConfig = { columns: config.itemColumns };
                            const nestedPayload = buildPayload(nestedConfig, detail.row, lookups, detail.rowNumber);
                            delete nestedPayload.documentKey;
                            return nestedPayload;
                        });
                    if (!payload.items.length) throw new Error(`Row ${item.rowNumber}: document "${documentKey}" must contain at least one item row.`);
                }

                if (config.nestedColumns) {
                    payload[config.nestedProperty] = nestedRows
                        .filter(detail => toDisplayText(getCellValue(getNormalizedRow(detail.row), config.nestedColumns[0])) === documentKey)
                        .map(detail => {
                            const nestedPayload = buildPayload({ columns: config.nestedColumns }, detail.row, lookups, detail.rowNumber);
                            delete nestedPayload.documentKey;
                            return nestedPayload;
                        });
                }

                config.validate?.(payload, item.rowNumber);
                payloads.push(payload);
            } catch (error) {
                errors.push(getErrorMessage(error));
            }
        }

        if (errors.length) {
            const details = errors.slice(0, MAX_ERROR_LINES).join('\n');
            const extra = errors.length > MAX_ERROR_LINES ? `\n...and ${errors.length - MAX_ERROR_LINES} more error(s).` : '';
            if (getSwal()) {
                await Swal.fire({
                    icon: 'error',
                    title: 'Import validation failed',
                    text: `${details}${extra}`,
                    confirmButtonText: 'OK'
                });
            } else {
                alert(`Import validation failed\n${details}${extra}`);
            }
            return;
        }

        if (getSwal()) {
            Swal.fire({
                title: 'Importing...',
                text: 'Please wait while the workbook is being validated and saved.',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });
        }

        const moduleName = window.location.pathname.split('/').filter(Boolean)[0] ?? '';
        const requestProperty = config.itemColumns || config.nestedColumns ? 'documents' : 'rows';
        const response = await AxiosManager.post(`/${moduleName}/ImportExcel`, { [requestProperty]: payloads });
        if (response?.data?.code !== 200) throw new Error(getErrorMessage({ response }));
        const successCount = response?.data?.content?.importedCount ?? payloads.length;

        if (getSwal()) {
            await Swal.fire({
                icon: 'success',
                title: 'Import Successful',
                text: `Imported ${successCount} row(s).`,
                confirmButtonText: 'OK'
            });
        } else {
            alert(`Imported ${successCount} row(s).`);
        }

        window.location.reload();
    };

    const openImportPicker = (config) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.xlsx,.xls,.csv';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            input.remove();
            if (!file) {
                return;
            }

            try {
                await importFile(config, file);
            } catch (error) {
                showError('Import failed', getErrorMessage(error));
            }
        });
        document.body.appendChild(input);
        input.click();
    };

    const createToolbarButton = (id, text, iconClass, clickHandler) => {
        const item = document.createElement('div');
        item.className = 'e-toolbar-item e-template';
        item.id = id;
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'e-tbar-btn e-tbtn-txt e-control e-btn e-lib';
        button.title = text;
        button.innerHTML = `<span class="${iconClass} e-icon-left"></span><span class="e-tbar-btn-text">${text}</span>`;
        item.appendChild(button);

        item.addEventListener('click', clickHandler);
        item.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                clickHandler(event);
            }
        });

        return item;
    };

    const createSeparator = () => {
        const separator = document.createElement('div');
        separator.className = 'e-toolbar-item e-separator';
        separator.setAttribute('role', 'separator');
        return separator;
    };

    const injectToolbarButtons = (config) => {
        if (document.getElementById(TEMPLATE_BUTTON_ID) || document.getElementById(IMPORT_BUTTON_ID)) {
            return true;
        }

        const addButton = document.getElementById('AddCustom');
        const addItem = addButton?.closest?.('.e-toolbar-item');
        const toolbarItems = addItem?.parentElement
            ?? document.querySelector('.e-grid .e-toolbar .e-toolbar-items');

        if (!toolbarItems || !addItem) {
            return false;
        }

        const fragment = document.createDocumentFragment();
        fragment.appendChild(createSeparator());
        fragment.appendChild(createToolbarButton(
            TEMPLATE_BUTTON_ID,
            'Download Template',
            'e-icons e-download',
            () => downloadTemplate(config)
        ));
        fragment.appendChild(createToolbarButton(
            IMPORT_BUTTON_ID,
            'Import Excel',
            'e-icons e-upload',
            () => openImportPicker(config)
        ));

        addItem.after(fragment);
        window.UiLocalization?.refresh?.();
        return true;
    };

    const init = () => {
        const config = getCurrentConfig();
        if (!config) {
            return;
        }

        let attempts = 0;
        const timer = window.setInterval(() => {
            attempts += 1;
            if (injectToolbarButtons(config) || attempts >= 120) {
                window.clearInterval(timer);
            }
        }, 250);
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.ExcelImportManager = {
        downloadTemplate,
        openImportPicker,
        importFile,
        _test: { buildPayload, fetchLookup, parseBoolean, parseDate, readDataRows, normalizeKey }
    };
})(window, document);
