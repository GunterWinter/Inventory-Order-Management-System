(function (window, document) {
    const DATA_SHEET_NAME = 'Data';
    const INSTRUCTION_SHEET_NAME = 'Instructions';
    const TEMPLATE_BUTTON_ID = 'ExcelImportTemplateCustom';
    const IMPORT_BUTTON_ID = 'ExcelImportCustom';
    const MAX_ERROR_LINES = 12;

    const normalizeKey = (value) => `${value ?? ''}`
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');

    const toDisplayText = (value) => `${value ?? ''}`.trim();

    const lookupSources = {
        productGroups: { endpoint: '/ProductGroup/GetProductGroupList', sheetName: 'ProductGroups' },
        unitMeasures: { endpoint: '/UnitMeasure/GetUnitMeasureList', sheetName: 'UnitMeasures' },
        vendorGroups: { endpoint: '/VendorGroup/GetVendorGroupList', sheetName: 'VendorGroups' },
        vendorCategories: { endpoint: '/VendorCategory/GetVendorCategoryList', sheetName: 'VendorCategories' },
        customerGroups: { endpoint: '/CustomerGroup/GetCustomerGroupList', sheetName: 'CustomerGroups' },
        customerCategories: { endpoint: '/CustomerCategory/GetCustomerCategoryList', sheetName: 'CustomerCategories' },
        taxes: { endpoint: '/Tax/GetTaxList', sheetName: 'Taxes' },
        vendors: { endpoint: '/Vendor/GetVendorList', sheetName: 'Vendors' },
        customers: { endpoint: '/Customer/GetCustomerList', sheetName: 'Customers' },
        warehouses: { endpoint: '/Warehouse/GetWarehouseList', sheetName: 'Warehouses' },
        salesOrders: { endpoint: '/SalesOrder/GetSalesOrderList', sheetName: 'SalesOrders' },
        purchaseOrders: { endpoint: '/PurchaseOrder/GetPurchaseOrderList', sheetName: 'PurchaseOrders' },
        deliveryOrders: { endpoint: '/DeliveryOrder/GetDeliveryOrderList', sheetName: 'DeliveryOrders' },
        goodsReceives: { endpoint: '/GoodsReceive/GetGoodsReceiveList', sheetName: 'GoodsReceives' },
        transferOuts: { endpoint: '/TransferOut/GetTransferOutList', sheetName: 'TransferOuts' },
        todos: { endpoint: '/Todo/GetTodoList', sheetName: 'Todos' },
        statuses: {
            sheetName: 'Statuses',
            data: [
                { id: '0', name: 'Draft' },
                { id: '1', name: 'Cancelled' },
                { id: '2', name: 'Confirmed' },
                { id: '3', name: 'Archived' }
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
        unitmeasures: {
            title: 'Unit Measure',
            endpoint: '/UnitMeasure/CreateUnitMeasure',
            fileName: 'unit-measures-template.xlsx',
            columns: simpleColumns
        },
        warehouses: {
            title: 'Warehouse',
            endpoint: '/Warehouse/CreateWarehouse',
            fileName: 'warehouses-template.xlsx',
            columns: simpleColumns
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
                { header: 'Physical Product', key: 'physical', required: true, type: 'boolean', example: 'TRUE', defaultValue: true },
                { header: 'Product Group', key: 'productGroupId', required: true, lookup: 'productGroups', example: 'General' },
                { header: 'Unit Measure', key: 'unitMeasureId', required: true, lookup: 'unitMeasures', example: 'PCS' },
                { header: 'Description', key: 'description', example: '' }
            ]
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
                { header: 'Order Date', key: 'orderDate', required: true, type: 'date', example: '2026-04-29' },
                orderStatusColumn,
                { header: 'Customer', key: 'customerId', required: true, lookup: 'customers', example: 'Sample customer' },
                { header: 'Tax', key: 'taxId', required: true, lookup: 'taxes', example: 'VAT 10%' },
                descriptionColumn
            ]
        },
        purchaseorders: {
            title: 'Purchase Order',
            endpoint: '/PurchaseOrder/CreatePurchaseOrder',
            fileName: 'purchase-orders-template.xlsx',
            columns: [
                { header: 'Order Date', key: 'orderDate', required: true, type: 'date', example: '2026-04-29' },
                orderStatusColumn,
                { header: 'Vendor', key: 'vendorId', required: true, lookup: 'vendors', example: 'Sample vendor' },
                { header: 'Tax', key: 'taxId', required: true, lookup: 'taxes', example: 'VAT 10%' },
                descriptionColumn
            ]
        },
        deliveryorders: {
            title: 'Delivery Order',
            endpoint: '/DeliveryOrder/CreateDeliveryOrder',
            fileName: 'delivery-orders-template.xlsx',
            columns: [
                { header: 'Delivery Date', key: 'deliveryDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Sales Order', key: 'salesOrderId', required: true, lookup: 'salesOrders', example: 'SO-0001' },
                descriptionColumn
            ]
        },
        goodsreceives: {
            title: 'Goods Receive',
            endpoint: '/GoodsReceive/CreateGoodsReceive',
            fileName: 'goods-receives-template.xlsx',
            columns: [
                { header: 'Receive Date', key: 'receiveDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Purchase Order', key: 'purchaseOrderId', required: true, lookup: 'purchaseOrders', example: 'PO-0001' },
                descriptionColumn
            ]
        },
        purchasereturns: {
            title: 'Purchase Return',
            endpoint: '/PurchaseReturn/CreatePurchaseReturn',
            fileName: 'purchase-returns-template.xlsx',
            columns: [
                { header: 'Return Date', key: 'returnDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Goods Receive', key: 'goodsReceiveId', required: true, lookup: 'goodsReceives', example: 'GR-0001' },
                descriptionColumn
            ]
        },
        salesreturns: {
            title: 'Sales Return',
            endpoint: '/SalesReturn/CreateSalesReturn',
            fileName: 'sales-returns-template.xlsx',
            columns: [
                { header: 'Return Date', key: 'returnDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Delivery Order', key: 'deliveryOrderId', required: true, lookup: 'deliveryOrders', example: 'DO-0001' },
                descriptionColumn
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
                descriptionColumn
            ]
        },
        transferins: {
            title: 'Transfer In',
            endpoint: '/TransferIn/CreateTransferIn',
            fileName: 'transfer-ins-template.xlsx',
            columns: [
                { header: 'Receive Date', key: 'transferReceiveDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                { header: 'Transfer Out', key: 'transferOutId', required: true, lookup: 'transferOuts', example: 'OUT-0001' },
                descriptionColumn
            ]
        },
        positiveadjustments: {
            title: 'Positive Adjustment',
            endpoint: '/PositiveAdjustment/CreatePositiveAdjustment',
            fileName: 'positive-adjustments-template.xlsx',
            columns: [
                { header: 'Adjustment Date', key: 'adjustmentDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                descriptionColumn
            ]
        },
        negativeadjustments: {
            title: 'Negative Adjustment',
            endpoint: '/NegativeAdjustment/CreateNegativeAdjustment',
            fileName: 'negative-adjustments-template.xlsx',
            columns: [
                { header: 'Adjustment Date', key: 'adjustmentDate', required: true, type: 'date', example: '2026-04-29' },
                statusColumn,
                descriptionColumn
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
                descriptionColumn
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
                descriptionColumn
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
                item?.percentage
            ].forEach((value) => {
                const key = normalizeKey(value);
                if (key && !index.has(key)) {
                    index.set(key, item);
                }
            });
        });

        return { source, data, index };
    };

    const getRequiredLookups = (config) => [...new Set(
        config.columns
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

    const buildInstructions = (config) => [
        ['Instruction'],
        [`Fill the "${DATA_SHEET_NAME}" sheet, then import this file from the ${config.title} page.`],
        ['Required columns are marked with "*".'],
        ['For lookup columns, use the name, number, reference code, or id from the reference sheets.'],
        ['Do not rename the header row.']
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
            const headers = config.columns.map((column) => column.required ? `${column.header} *` : column.header);
            const sampleRow = config.columns.map((column) => getSampleValue(column, lookups));
            const workbook = XLSX.utils.book_new();

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet([headers, sampleRow]),
                DATA_SHEET_NAME
            );
            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.aoa_to_sheet(buildInstructions(config)),
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
        const keys = [column.header, column.key, ...(column.aliases ?? [])].map(normalizeKey);

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

        return ['true', 'yes', 'y', '1', 'x', 'checked'].includes(text);
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
            return '';
        }

        const lookup = lookups[column.lookup];
        const item = lookup?.index?.get(normalizeKey(text));
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

            payload[column.key] = valueText;
        });

        payload.createdById = StorageManager.getUserId();
        return payload;
    };

    const getErrorMessage = (error) => {
        const responseData = error?.response?.data;
        return responseData?.message
            ?? responseData?.title
            ?? responseData?.errors
            ?? error?.message
            ?? 'Please check your data.';
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

    const readDataRows = (workbook) => {
        const sheetName = workbook.SheetNames.includes(DATA_SHEET_NAME)
            ? DATA_SHEET_NAME
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
        const rows = readDataRows(workbook);
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

        if (getSwal()) {
            Swal.fire({
                title: 'Importing...',
                text: 'Please wait while rows are being created.',
                allowOutsideClick: false,
                allowEscapeKey: false,
                didOpen: () => Swal.showLoading()
            });
        }

        const lookups = await fetchLookups(config);
        const errors = [];
        let successCount = 0;

        for (const item of rows) {
            try {
                const payload = buildPayload(config, item.row, lookups, item.rowNumber);
                const response = await AxiosManager.post(config.endpoint, payload);
                if (response?.data?.code !== 200) {
                    throw new Error(response?.data?.message ?? 'Create request failed.');
                }
                successCount += 1;
            } catch (error) {
                errors.push(getErrorMessage(error));
            }
        }

        if (errors.length) {
            const details = errors.slice(0, MAX_ERROR_LINES).join('\n');
            const extra = errors.length > MAX_ERROR_LINES ? `\n...and ${errors.length - MAX_ERROR_LINES} more error(s).` : '';
            if (getSwal()) {
                await Swal.fire({
                    icon: successCount ? 'warning' : 'error',
                    title: `Imported ${successCount}/${rows.length} row(s)`,
                    html: `<pre style="text-align:left;white-space:pre-wrap;margin:0">${details}${extra}</pre>`,
                    confirmButtonText: 'OK'
                });
            } else {
                alert(`Imported ${successCount}/${rows.length} row(s)\n${details}${extra}`);
            }
        } else if (getSwal()) {
            await Swal.fire({
                icon: 'success',
                title: 'Import Successful',
                text: `Imported ${successCount} row(s).`,
                confirmButtonText: 'OK'
            });
        } else {
            alert(`Imported ${successCount} row(s).`);
        }

        if (successCount > 0) {
            window.location.reload();
        }
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
        importFile
    };
})(window, document);
