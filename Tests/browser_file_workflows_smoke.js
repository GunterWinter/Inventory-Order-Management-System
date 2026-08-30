const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('../Presentation/ASPNET/wwwroot/lib/vendor-export/xlsx.full.min.js');

const readWorkbook = filePath => XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
const writeWorkbook = (workbook, filePath) => fs.writeFileSync(filePath,
    XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
const rowsOf = (workbook, sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
const headerRowOf = (workbook, sheetName) =>
    (XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' })[0] || [])
        .map(value => String(value));
const cellOf = (row, header) => {
    const key = Object.keys(row || {}).find(candidate => candidate.localeCompare(header, undefined, {
        sensitivity: 'accent'
    }) === 0);
    return key ? row[key] : undefined;
};
const waitForUi = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const consoleErrors = [];
    const failedRequests = [];
    const httpErrors = [];
    const expectedHttpErrors = [];
    const createdProductIds = [];
    const createdCustomerIds = [];
    const createdCustomerGroupIds = [];
    const testKey = `E2E-FILE-${Date.now()}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-file-smoke-'));
    const baseOrigin = new URL(baseUrl).origin;
    const expectHttpError = (pathname, status = 400) => {
        const apiPathname = pathname.startsWith('/api/') ? pathname : `/api${pathname}`;
        expectedHttpErrors.push({ pathname: apiPathname, status });
    };
    const confirmSuccessAndWaitForReload = async () => {
        const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' });
        await page.locator('.swal2-confirm').click();
        await navigation;
    };

    page.on('console', message => {
        const locationUrl = message.location()?.url || 'unknown';
        const isExpectedRollbackResponse = [
            '/api/Products/ImportExcel',
            '/Product/CreateProduct',
            '/Product/UpdateProduct',
            '/StockCount/UpdateStockCount',
            '/StockCount/DeleteStockCount',
            '/InventoryTransaction/StockCountUpdateInvenTrans',
            '/InventoryTransaction/StockCountDeleteInvenTrans'
        ]
            .some(pathname => locationUrl.includes(pathname))
            && /status of (?:400|409)|(?:400|409) \((?:Bad Request|Conflict)\)/i.test(message.text());
        if (message.type() === 'error' && !isExpectedRollbackResponse) {
            consoleErrors.push(`${message.text()} @ ${locationUrl}`);
        }
    });
    page.on('pageerror', error => {
        consoleErrors.push(`Uncaught page error: ${error.stack || error.message}`);
    });
    page.on('requestfailed', request => {
        failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin !== baseOrigin || response.status() < 400) return;
        const expectedIndex = expectedHttpErrors.findIndex(item =>
            item.status === response.status() && url.pathname === item.pathname);
        if (expectedIndex >= 0) {
            expectedHttpErrors.splice(expectedIndex, 1);
            return;
        }
        httpErrors.push(`${response.status()} ${url.pathname}`);
    });

    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit', timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.UiLocalization?.setLocale);
    await page.evaluate(() => window.UiLocalization.setLocale('en'));

    await page.goto(`${baseUrl}/Products/ProductList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForSelector('#ExcelImportTemplateCustom', { timeout: 20000 });

    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    if (!await page.locator('#SerialTrackingNone').isChecked()) {
        throw new Error('A new Product does not default to no serial tracking.');
    }
    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });

    const templateDownload = page.waitForEvent('download');
    await page.locator('#ExcelImportTemplateCustom').click();
    const template = await templateDownload;
    const templatePath = path.join(tempDir, 'products-template.xlsx');
    await template.saveAs(templatePath);
    const templateWorkbook = readWorkbook(templatePath);
    if (!templateWorkbook.SheetNames.includes('Data') || !templateWorkbook.SheetNames.includes('Instructions')) {
        throw new Error(`Product template sheets are incomplete: ${templateWorkbook.SheetNames.join(', ')}`);
    }
    if (rowsOf(templateWorkbook, 'Data').length !== 0) throw new Error('Importable Data sheet must not contain a sample row.');
    const englishProductHeaders = headerRowOf(templateWorkbook, 'Data');
    if (!englishProductHeaders.some(header => header.replace(/\s*\*$/, '') === 'Opening Stock')) {
        throw new Error(`Product template is missing Opening Stock: ${englishProductHeaders.join(', ')}`);
    }
    const englishLookupHeaders = headerRowOf(templateWorkbook, 'ProductGroups');
    const expectedEnglishLookupHeaders = ['Name', 'Number', 'Ref Code', 'Email Address', 'Id'];
    if (JSON.stringify(englishLookupHeaders) !== JSON.stringify(expectedEnglishLookupHeaders)) {
        throw new Error(`English lookup headers are not canonical: ${englishLookupHeaders.join(', ')}`);
    }
    const productGroupRow = rowsOf(templateWorkbook, 'ProductGroups')[0];
    const productGroup = cellOf(productGroupRow, 'Name');
    const productGroupId = cellOf(productGroupRow, 'Id');
    if (!productGroup || !productGroupId) throw new Error('Product template does not contain a usable ProductGroups lookup.');

    await page.evaluate(() => window.UiLocalization.setLocale('vi'));
    await waitForUi(300);
    const vietnameseTemplateDownload = page.waitForEvent('download').then(download => ({ download }));
    const vietnameseTemplateError = page.waitForSelector('.swal2-icon-error', { timeout: 30000 })
        .then(async () => ({ error: await page.locator('.swal2-html-container').innerText() }));
    await page.locator('#ExcelImportTemplateCustom').click();
    const vietnameseTemplateOutcome = await Promise.race([vietnameseTemplateDownload, vietnameseTemplateError]);
    if (vietnameseTemplateOutcome.error) {
        throw new Error(`Vietnamese Product template download failed: ${vietnameseTemplateOutcome.error}`);
    }
    const vietnameseTemplate = vietnameseTemplateOutcome.download;
    const vietnameseTemplatePath = path.join(tempDir, 'products-template-vi.xlsx');
    await vietnameseTemplate.saveAs(vietnameseTemplatePath);
    const vietnameseTemplateWorkbook = readWorkbook(vietnameseTemplatePath);
    const vietnameseProductHeaders = headerRowOf(vietnameseTemplateWorkbook, 'Data');
    const expectedVietnameseProductHeaders = await page.evaluate(headers => headers.map(header => {
        const required = /\s\*$/.test(header);
        const canonical = header.replace(/\s*\*$/, '');
        return `${window.UiLocalization.translateText(canonical, 'vi')}${required ? ' *' : ''}`;
    }), englishProductHeaders);
    if (JSON.stringify(vietnameseProductHeaders) !== JSON.stringify(expectedVietnameseProductHeaders)) {
        throw new Error(`Vietnamese Product template headers do not match UI localization: ${vietnameseProductHeaders.join(', ')}`);
    }
    const vietnameseLookupHeaders = headerRowOf(vietnameseTemplateWorkbook, 'ProductGroups');
    const expectedVietnameseLookupHeaders = await page.evaluate(headers =>
        headers.map(header => window.UiLocalization.translateText(header, 'vi')), englishLookupHeaders);
    if (JSON.stringify(vietnameseLookupHeaders) !== JSON.stringify(expectedVietnameseLookupHeaders)) {
        throw new Error(`Vietnamese lookup headers do not match UI localization: ${vietnameseLookupHeaders.join(', ')}`);
    }
    await page.evaluate(() => window.UiLocalization.setLocale('en'));
    await waitForUi(300);

    const headers = englishProductHeaders;
    const productRow = values => headers.map(header => values[header.replace(/\s*\*$/, '')] ?? '');
    const makeWorkbook = rows => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Data');
        return workbook;
    };

    const invalidNames = [`${testKey}-INVALID-A`, `${testKey}-INVALID-B`];
    const invalidPath = path.join(tempDir, 'invalid-products.xlsx');
    writeWorkbook(makeWorkbook([
        productRow({ Name: invalidNames[0], 'Ref Code': `${testKey}-IA`, 'Unit Price': 100, 'Cost Price': 50,
            'Physical Product': 'TRUE', 'Serial Tracking Mode': 'None', 'Opening Stock': 0,
            'Product Group': productGroup, 'Unit Measure': 'PCS' }),
        productRow({ Name: invalidNames[1], 'Ref Code': `${testKey}-IB`, 'Unit Price': 100, 'Cost Price': 50,
            'Physical Product': 'TRUE', 'Serial Tracking Mode': 'Internal Auto', 'Opening Stock': 0,
            'Product Group': productGroup, 'Unit Measure': 'PCS' })
    ]), invalidPath);

    let chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#ExcelImportCustom').click();
    await (await chooserPromise).setFiles(invalidPath);
    await page.locator('.swal2-confirm').click();
    await page.waitForSelector('.swal2-icon-error', { timeout: 15000 });
    await page.locator('.swal2-confirm').click();
    const invalidMatches = await page.evaluate(async names => {
        const response = await AxiosManager.get('/Product/GetProductList', {});
        return (response?.data?.content?.data || []).filter(item => names.includes(item.name)).length;
    }, invalidNames);
    if (invalidMatches !== 0) throw new Error('An invalid workbook created partial product data.');

    const serverRollbackName = `${testKey}-SERVER-ROLLBACK`;
    expectHttpError('/api/Products/ImportExcel');
    const rollbackResult = await page.evaluate(async ({ name, productGroupId }) => {
        const createdById = StorageManager.getUserId();
        let status = 0;
        try {
            await AxiosManager.post('/Products/ImportExcel', { rows: [
                { name, unitPrice: 100, costPrice: 50, physical: false, serialTrackingMode: 0,
                    productGroupId, unitMeasureName: 'SERVICE', createdById },
                { name: '', unitPrice: 100, physical: false, serialTrackingMode: 0,
                    productGroupId, unitMeasureName: 'SERVICE', createdById }
            ] }, { skipGlobalError: true });
            status = 200;
        } catch (error) {
            status = error?.response?.status ?? 0;
        }
        const products = await AxiosManager.get('/Product/GetProductList', {});
        return {
            status,
            createdCount: (products?.data?.content?.data || []).filter(item => item.name === name).length
        };
    }, { name: serverRollbackName, productGroupId });
    if (rollbackResult.status !== 400 || rollbackResult.createdCount !== 0) {
        throw new Error(`Backend workbook rollback failed: ${JSON.stringify(rollbackResult)}`);
    }

    const validNames = [`${testKey}-VALID-A`, `${testKey}-VALID-B`];
    const validPath = path.join(tempDir, 'valid-products.xlsx');
    writeWorkbook(makeWorkbook([
        productRow({ Name: validNames[0], 'Ref Code': `${testKey}-VA`, 'Unit Price': 100, 'Cost Price': 50,
            'Physical Product': 'TRUE', 'Serial Tracking Mode': 'None', 'Default Warranty Months': 12,
            'Opening Stock': 0, 'Product Group': productGroup, 'Unit Measure': 'PCS' }),
        productRow({ Name: validNames[1], 'Ref Code': `${testKey}-VB`, 'Unit Price': 200, 'Cost Price': 0,
            'Physical Product': 'FALSE', 'Serial Tracking Mode': 'None', 'Opening Stock': 0,
            'Product Group': productGroup, 'Unit Measure': 'SERVICE' })
    ]), validPath);

    chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#ExcelImportCustom').click();
    await (await chooserPromise).setFiles(validPath);
    await page.locator('.swal2-confirm').click();
    await page.waitForSelector('.swal2-icon-success', { timeout: 30000 });
    const created = await page.evaluate(async names => {
        const response = await AxiosManager.get('/Product/GetProductList', {});
        return (response?.data?.content?.data || []).filter(item => names.includes(item.name));
    }, validNames);
    if (created.length !== 2) throw new Error(`Atomic product import created ${created.length}/2 rows.`);
    createdProductIds.push(...created.map(item => item.id));

    await confirmSuccessAndWaitForReload();
    await page.waitForSelector('#MainGrid.e-grid');

    const warehouses = await page.evaluate(async () => {
        const response = await AxiosManager.get('/Warehouse/GetWarehouseList', {});
        return (response?.data?.content?.data || []).filter(item => item.systemWarehouse === false);
    });
    if (warehouses.length < 2) throw new Error('Opening-stock smoke requires two normal warehouses.');
    const [openingWarehouse, changedDefaultWarehouse] = warehouses;
    const openingNames = {
        none: `${testKey}-OPENING-NONE`,
        auto: `${testKey}-OPENING-AUTO`
    };
    const openingResult = await page.evaluate(async ({ names, productGroupId, warehouseId, changedWarehouseId }) => {
        const userId = StorageManager.getUserId();
        const getProducts = async () => (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data || [];
        const getStock = async () => (await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))?.data?.content?.data || [];
        const getTransactions = async () => (await AxiosManager.get('/InventoryTransaction/GetInventoryTransactionList', {}))?.data?.content?.data || [];
        const common = {
            unitPrice: 200,
            costPrice: 100,
            physical: true,
            defaultWarehouseId: warehouseId,
            defaultWarrantyMonths: 0,
            productGroupId,
            unitMeasureName: 'PCS',
            createdById: userId
        };

        const noneResponse = await AxiosManager.post('/Product/CreateProduct', {
            ...common,
            name: names.none,
            referenceCode: `${names.none}-REF`,
            serialTrackingMode: 0,
            openingStockQuantity: 5.5
        });
        const noneId = noneResponse?.data?.content?.data?.id;
        let none = (await getProducts()).find(item => item.id === noneId);
        const openingTransactionsBeforeMetadata = (await getTransactions())
            .filter(item => item.productReferenceCode === none.referenceCode && item.moduleCode === 'PRODUCT_OPENING').length;

        await AxiosManager.post('/Product/UpdateProduct', {
            id: none.id,
            name: `${none.name}-EDITED`,
            referenceCode: none.referenceCode,
            unitPrice: none.unitPrice,
            costPrice: 999,
            imageUrl: none.imageUrl,
            physical: none.physical,
            serialTrackingMode: none.serialTrackingMode,
            internalSerialFixedCode: none.internalSerialFixedCode,
            defaultWarehouseId: changedWarehouseId,
            defaultWarrantyMonths: none.defaultWarrantyMonths,
            description: none.description,
            productGroupId: none.productGroupId,
            unitMeasureName: none.unitMeasureName,
            openingStockQuantity: null,
            updatedById: userId
        });
        none = (await getProducts()).find(item => item.id === noneId);
        const openingTransactionsAfterMetadata = (await getTransactions())
            .filter(item => item.productReferenceCode === none.referenceCode && item.moduleCode === 'PRODUCT_OPENING').length;

        await AxiosManager.post('/Product/UpdateProduct', {
            id: none.id,
            name: none.name,
            referenceCode: none.referenceCode,
            unitPrice: none.unitPrice,
            costPrice: none.costPrice,
            imageUrl: none.imageUrl,
            physical: none.physical,
            serialTrackingMode: none.serialTrackingMode,
            internalSerialFixedCode: none.internalSerialFixedCode,
            defaultWarehouseId: none.defaultWarehouseId,
            defaultWarrantyMonths: none.defaultWarrantyMonths,
            description: none.description,
            productGroupId: none.productGroupId,
            unitMeasureName: none.unitMeasureName,
            openingStockQuantity: 7.5,
            updatedById: userId
        });
        none = (await getProducts()).find(item => item.id === noneId);
        const openingTransactionsAfterCorrection = (await getTransactions())
            .filter(item => item.productReferenceCode === none.referenceCode && item.moduleCode === 'PRODUCT_OPENING').length;
        const autoResponse = await AxiosManager.post('/Product/CreateProduct', {
            ...common,
            name: names.auto,
            referenceCode: `${names.auto}-REF`,
            serialTrackingMode: 1,
            internalSerialFixedCode: 'E2E',
            openingStockQuantity: 3
        });
        const autoId = autoResponse?.data?.content?.data?.id;
        const auto = (await getProducts()).find(item => item.id === autoId);
        const picker = (await AxiosManager.get(`/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(autoId)}&warehouseId=${encodeURIComponent(warehouseId)}`, {}))
            ?.data?.content?.data || [];
        const stock = await getStock();

        return {
            noneId,
            autoId,
            none,
            auto,
            openingTransactionsBeforeMetadata,
            openingTransactionsAfterMetadata,
            openingTransactionsAfterCorrection,
            noneStockAtOpeningWarehouse: stock.find(item => item.productId === noneId && item.warehouseId === warehouseId)?.stock ?? 0,
            noneStockAtChangedWarehouse: stock.find(item => item.productId === noneId && item.warehouseId === changedWarehouseId)?.stock ?? 0,
            autoStock: stock.find(item => item.productId === autoId && item.warehouseId === warehouseId)?.stock ?? 0,
            serials: picker.map(item => ({ code: item.internalSerialNumber, status: item.status }))
        };
    }, {
        names: openingNames,
        productGroupId,
        warehouseId: openingWarehouse.id,
        changedWarehouseId: changedDefaultWarehouse.id
    });
    if (!openingResult.noneId || openingResult.none?.openingStockQuantity !== 7.5
        || openingResult.none?.openingStockWarehouseId !== openingWarehouse.id
        || openingResult.noneStockAtOpeningWarehouse !== 7.5
        || openingResult.noneStockAtChangedWarehouse !== 0) {
        throw new Error(`No-serial opening stock is inconsistent: ${JSON.stringify(openingResult)}`);
    }
    if (openingResult.openingTransactionsBeforeMetadata !== 1
        || openingResult.openingTransactionsAfterMetadata !== 1
        || openingResult.openingTransactionsAfterCorrection !== 2) {
        throw new Error(`Editing Product metadata changed opening-stock history: ${JSON.stringify(openingResult)}`);
    }
    if (!openingResult.autoId || openingResult.auto?.openingStockQuantity !== 3
        || openingResult.autoStock !== 3 || openingResult.serials.length !== 3
        || new Set(openingResult.serials.map(item => item.code)).size !== 3
        || openingResult.serials.some(item => !item.code || item.code.length !== 12)) {
        throw new Error(`InternalAuto opening stock/serial generation is inconsistent: ${JSON.stringify(openingResult)}`);
    }

    expectHttpError('/Product/UpdateProduct');
    const autoMutationStatus = await page.evaluate(async ({ id, quantity }) => {
        const products = (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data || [];
        const item = products.find(product => product.id === id);
        try {
            await AxiosManager.post('/Product/UpdateProduct', {
                ...item,
                openingStockQuantity: quantity,
                updatedById: StorageManager.getUserId()
            });
            return 200;
        } catch (error) {
            return error?.response?.status ?? 0;
        }
    }, { id: openingResult.autoId, quantity: 4 });
    if (autoMutationStatus !== 400) throw new Error(`InternalAuto opening stock update returned ${autoMutationStatus}.`);

    const invalidOpeningNames = [
        `${testKey}-OPENING-MANUFACTURER`,
        `${testKey}-OPENING-NONPHYSICAL`,
        `${testKey}-OPENING-AUTO-FRACTION`,
        `${testKey}-OPENING-NEGATIVE`,
        `${testKey}-OPENING-NO-COST`,
        `${testKey}-OPENING-NO-WAREHOUSE`
    ];
    invalidOpeningNames.forEach(() => expectHttpError('/Product/CreateProduct'));
    const invalidOpeningResult = await page.evaluate(async ({ names, productGroupId, warehouseId }) => {
        const userId = StorageManager.getUserId();
        const common = {
            unitPrice: 100,
            costPrice: 50,
            physical: true,
            serialTrackingMode: 0,
            defaultWarehouseId: warehouseId,
            productGroupId,
            unitMeasureName: 'PCS',
            createdById: userId
        };
        const payloads = [
            { ...common, name: names[0], serialTrackingMode: 2, openingStockQuantity: 1 },
            { ...common, name: names[1], physical: false, defaultWarehouseId: null, openingStockQuantity: 1 },
            { ...common, name: names[2], serialTrackingMode: 1, internalSerialFixedCode: 'E2E', openingStockQuantity: 1.5 },
            { ...common, name: names[3], openingStockQuantity: -1 },
            { ...common, name: names[4], costPrice: null, openingStockQuantity: 1 },
            { ...common, name: names[5], defaultWarehouseId: null, openingStockQuantity: 1 }
        ];
        const statuses = [];
        for (const payload of payloads) {
            try {
                await AxiosManager.post('/Product/CreateProduct', payload);
                statuses.push(200);
            } catch (error) {
                statuses.push(error?.response?.status ?? 0);
            }
        }
        const products = (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data || [];
        return {
            statuses,
            createdCount: products.filter(item => names.includes(item.name)).length
        };
    }, { names: invalidOpeningNames, productGroupId, warehouseId: openingWarehouse.id });
    if (invalidOpeningResult.statuses.some(status => status !== 400) || invalidOpeningResult.createdCount !== 0) {
        throw new Error(`Invalid opening-stock requests were not atomic: ${JSON.stringify(invalidOpeningResult)}`);
    }

    expectHttpError('/StockCount/UpdateStockCount', 409);
    expectHttpError('/StockCount/DeleteStockCount', 409);
    expectHttpError('/InventoryTransaction/StockCountUpdateInvenTrans', 409);
    expectHttpError('/InventoryTransaction/StockCountDeleteInvenTrans', 409);
    const openingLifecycleResult = await page.evaluate(async ({ productId, referenceCode, warehouseId }) => {
        const userId = StorageManager.getUserId();
        const dataOf = response => response?.data?.content?.data || [];
        const getProducts = async () => dataOf(await AxiosManager.get('/Product/GetProductList', {}));
        const getStock = async () => dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}));
        const getTransactions = async () => dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryTransactionList', {}));
        const getStockCounts = async () => dataOf(await AxiosManager.get('/StockCount/GetStockCountList', {}));
        const requestStatus = async (url, payload) => {
            try {
                await AxiosManager.post(url, payload);
                return 200;
            } catch (error) {
                return error?.response?.status ?? 0;
            }
        };

        const openingTransactions = (await getTransactions())
            .filter(item => item.productReferenceCode === referenceCode && item.moduleCode === 'PRODUCT_OPENING')
            .sort((left, right) => {
                const dateDifference = new Date(left.createdAtUtc) - new Date(right.createdAtUtc);
                return dateDifference || String(left.id).localeCompare(String(right.id));
            });
        if (openingTransactions.length !== 2) {
            throw new Error(`Expected two opening-stock documents, got ${openingTransactions.length}.`);
        }

        const [originalTransaction, correctionTransaction] = openingTransactions;
        const stockCounts = await getStockCounts();
        const originalHeader = stockCounts.find(item => item.id === originalTransaction.moduleId);
        const correctionHeader = stockCounts.find(item => item.id === correctionTransaction.moduleId);
        if (!originalHeader || !correctionHeader) {
            throw new Error('Opening Stock Count header lookup failed.');
        }
        const originalLines = dataOf(await AxiosManager.get(
            `/InventoryTransaction/StockCountGetInvenTransList?moduleId=${encodeURIComponent(originalHeader.id)}`, {}));
        const originalLine = originalLines.find(item => item.id === originalTransaction.id);
        if (!originalLine) {
            throw new Error('Opening Stock Count line lookup failed.');
        }

        const headerMutationStatus = await requestStatus('/StockCount/UpdateStockCount', {
            id: originalHeader.id,
            countDate: originalHeader.countDate,
            status: '2',
            description: `${originalHeader.description || ''} - forbidden edit`,
            warehouseId: originalHeader.warehouseId,
            updatedById: userId
        });
        const headerDeleteStatus = await requestStatus('/StockCount/DeleteStockCount', {
            id: originalHeader.id,
            deletedById: userId
        });
        const lineMutationStatus = await requestStatus('/InventoryTransaction/StockCountUpdateInvenTrans', {
            id: originalLine.id,
            productId: originalLine.productId,
            qtySCCount: originalLine.qtySCCount,
            productSerialIds: originalLine.productSerialIds,
            updatedById: userId
        });
        const lineDeleteStatus = await requestStatus('/InventoryTransaction/StockCountDeleteInvenTrans', {
            id: originalLine.id,
            deletedById: userId
        });

        await AxiosManager.post('/StockCount/UpdateStockCount', {
            id: originalHeader.id,
            countDate: originalHeader.countDate,
            status: '3',
            description: originalHeader.description,
            warehouseId: originalHeader.warehouseId,
            updatedById: userId
        });
        const stockAfterArchive = (await getStock())
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0;
        const productAfterArchive = (await getProducts()).find(item => item.id === productId);

        try {
            await AxiosManager.post('/StockCount/UpdateStockCount', {
                id: correctionHeader.id,
                countDate: correctionHeader.countDate,
                status: '1',
                description: correctionHeader.description,
                warehouseId: correctionHeader.warehouseId,
                updatedById: userId
            });
        } catch (error) {
            throw new Error(`Opening Stock Count correction cancellation failed: ${JSON.stringify({
                message: error?.message,
                status: error?.response?.status,
                data: error?.response?.data
            })}`);
        }
        const stockAfterCorrectionCancel = (await getStock())
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0;
        const productAfterCorrectionCancel = (await getProducts()).find(item => item.id === productId);
        const stockCountsAfter = await getStockCounts();

        return {
            headerMutationStatus,
            headerDeleteStatus,
            lineMutationStatus,
            lineDeleteStatus,
            originalStatus: stockCountsAfter.find(item => item.id === originalHeader.id)?.status,
            correctionStatus: stockCountsAfter.find(item => item.id === correctionHeader.id)?.status,
            stockAfterArchive,
            openingAfterArchive: productAfterArchive?.openingStockQuantity,
            stockAfterCorrectionCancel,
            openingAfterCorrectionCancel: productAfterCorrectionCancel?.openingStockQuantity
        };
    }, {
        productId: openingResult.noneId,
        referenceCode: openingResult.none.referenceCode,
        warehouseId: openingWarehouse.id
    });
    if (openingLifecycleResult.headerMutationStatus !== 409
        || openingLifecycleResult.headerDeleteStatus !== 409
        || openingLifecycleResult.lineMutationStatus !== 409
        || openingLifecycleResult.lineDeleteStatus !== 409
        || openingLifecycleResult.originalStatus !== 3
        || openingLifecycleResult.correctionStatus !== 1
        || openingLifecycleResult.stockAfterArchive !== 7.5
        || openingLifecycleResult.openingAfterArchive !== 7.5
        || openingLifecycleResult.stockAfterCorrectionCancel !== 5.5
        || openingLifecycleResult.openingAfterCorrectionCancel !== 5.5) {
        throw new Error(`Opening Stock Count lifecycle is inconsistent: ${JSON.stringify(openingLifecycleResult)}`);
    }

    const cancellableAutoName = `${testKey}-OPENING-AUTO-CANCEL`;
    const cancellableAutoResult = await page.evaluate(async ({ name, productGroupId, warehouseId }) => {
        const userId = StorageManager.getUserId();
        const dataOf = response => response?.data?.content?.data || [];
        const createResponse = await AxiosManager.post('/Product/CreateProduct', {
            name,
            referenceCode: `${name}-REF`,
            unitPrice: 250,
            costPrice: 125,
            physical: true,
            serialTrackingMode: 1,
            internalSerialFixedCode: 'CAN',
            defaultWarehouseId: warehouseId,
            defaultWarrantyMonths: 0,
            productGroupId,
            unitMeasureName: 'PCS',
            openingStockQuantity: 1,
            createdById: userId
        });
        const productId = createResponse?.data?.content?.data?.id;
        const productsBefore = dataOf(await AxiosManager.get('/Product/GetProductList', {}));
        const productBefore = productsBefore.find(item => item.id === productId);
        const transactions = dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryTransactionList', {}));
        const sourceTransaction = transactions.find(item =>
            item.productReferenceCode === `${name}-REF` && item.moduleCode === 'PRODUCT_OPENING');
        const headers = dataOf(await AxiosManager.get('/StockCount/GetStockCountList', {}));
        const sourceHeader = headers.find(item => item.id === sourceTransaction?.moduleId);
        const pickerBefore = dataOf(await AxiosManager.get(
            `/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(productId)}&warehouseId=${encodeURIComponent(warehouseId)}`, {}));
        if (!productBefore || !sourceTransaction || !sourceHeader || pickerBefore.length !== 1) {
            throw new Error('Cancellable InternalAuto opening-stock setup failed.');
        }

        try {
            await AxiosManager.post('/StockCount/UpdateStockCount', {
                id: sourceHeader.id,
                countDate: sourceHeader.countDate,
                status: '1',
                description: sourceHeader.description,
                warehouseId: sourceHeader.warehouseId,
                updatedById: userId
            });
        } catch (error) {
            throw new Error(`InternalAuto Opening Stock Count cancellation failed: ${JSON.stringify({
                message: error?.message,
                status: error?.response?.status,
                data: error?.response?.data
            })}`);
        }

        const productAfter = dataOf(await AxiosManager.get('/Product/GetProductList', {}))
            .find(item => item.id === productId);
        const stockAfter = dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0;
        const sourceAwarePicker = dataOf(await AxiosManager.get(
            `/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(productId)}`
            + `&moduleName=StockCount&moduleId=${encodeURIComponent(sourceHeader.id)}`
            + `&moduleItemId=${encodeURIComponent(sourceTransaction.id)}`, {}));
        const sourceSerial = sourceAwarePicker.find(item => item.id === pickerBefore[0].id);

        return {
            productId,
            openingBefore: productBefore.openingStockQuantity,
            serialBefore: pickerBefore[0],
            openingAfter: productAfter?.openingStockQuantity,
            stockAfter,
            serialAfter: sourceSerial
        };
    }, { name: cancellableAutoName, productGroupId, warehouseId: openingWarehouse.id });
    if (!cancellableAutoResult.productId
        || cancellableAutoResult.openingBefore !== 1
        || cancellableAutoResult.serialBefore?.status !== 1
        || cancellableAutoResult.openingAfter !== 0
        || cancellableAutoResult.stockAfter !== 0
        || cancellableAutoResult.serialAfter?.status !== 10
        || cancellableAutoResult.serialAfter?.warehouseId != null) {
        throw new Error(`Cancelling an unused InternalAuto opening source is inconsistent: ${JSON.stringify(cancellableAutoResult)}`);
    }

    const englishGridHeaders = await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid')?.ej2_instances?.[0];
        return window.GridExportManager.getExportColumns(grid).map(column => column.headerText);
    });
    const exportDownload = page.waitForEvent('download');
    const exportError = page.waitForSelector('.swal2-icon-error', { timeout: 30000 })
        .then(async () => `Excel export error: ${await page.locator('.swal2-html-container').innerText()}`)
        .catch(() => null);
    await page.locator('#MainGrid_excelexport').click();
    const exported = await Promise.race([exportDownload, exportError.then(message => {
        if (message) throw new Error(message);
        return new Promise(() => {});
    })]);
    const exportPath = path.join(tempDir, 'products-export.xlsx');
    await exported.saveAs(exportPath);
    const exportWorkbook = readWorkbook(exportPath);
    const exportRows = rowsOf(exportWorkbook, exportWorkbook.SheetNames[0]);
    if (!exportRows.length) throw new Error('Excel export did not contain product rows.');
    const exportHeaders = Object.keys(exportRows[0]);
    if (exportHeaders.some(header => /^id$/i.test(header) || /action/i.test(header))) {
        throw new Error(`Excel export contains technical/action columns: ${exportHeaders.join(', ')}`);
    }
    if (JSON.stringify(exportHeaders) !== JSON.stringify(englishGridHeaders)) {
        throw new Error(`English Excel headers do not match the current grid: ${exportHeaders.join(', ')}`);
    }

    await page.evaluate(() => window.UiLocalization.setLocale('vi'));
    await waitForUi(500);
    const vietnameseGridHeaders = await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid')?.ej2_instances?.[0];
        return window.GridExportManager.getExportColumns(grid).map(column => column.headerText);
    });
    const vietnameseExportDownload = page.waitForEvent('download');
    await page.locator('#MainGrid_excelexport').click();
    const vietnameseExport = await vietnameseExportDownload;
    const vietnameseExportPath = path.join(tempDir, 'products-export-vi.xlsx');
    await vietnameseExport.saveAs(vietnameseExportPath);
    const vietnameseExportWorkbook = readWorkbook(vietnameseExportPath);
    const vietnameseExportRows = rowsOf(vietnameseExportWorkbook, vietnameseExportWorkbook.SheetNames[0]);
    const vietnameseExportHeaders = Object.keys(vietnameseExportRows[0] || {});
    if (JSON.stringify(vietnameseExportHeaders) !== JSON.stringify(vietnameseGridHeaders)) {
        throw new Error(`Vietnamese Excel headers do not match the current grid: ${vietnameseExportHeaders.join(', ')}`);
    }
    await page.evaluate(() => window.UiLocalization.setLocale('en'));
    await waitForUi(300);

    await page.goto(`${baseUrl}/Customers/CustomerList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForSelector('#ExcelImportTemplateCustom', { timeout: 20000 });
    const customerSetup = await page.evaluate(async () => {
        const groupsResponse = await AxiosManager.get('/CustomerGroup/GetCustomerGroupList', {});
        const groups = groupsResponse?.data?.content?.data || [];
        const ensureGroup = async name => {
            const existing = groups.find(item => item.name === name);
            if (existing) return { group: existing, created: false };
            const response = await AxiosManager.post('/CustomerGroup/CreateCustomerGroup', {
                name,
                description: 'Unicode Excel lookup smoke',
                createdById: StorageManager.getUserId()
            });
            return { group: response?.data?.content?.data, created: true };
        };
        const accented = await ensureGroup('Đá');
        const ascii = await ensureGroup('Da');
        const categoriesResponse = await AxiosManager.get('/CustomerCategory/GetCustomerCategoryList', {});
        const category = (categoriesResponse?.data?.content?.data || [])[0];
        return { accented, ascii, category };
    });
    if (!customerSetup.accented?.group?.id || !customerSetup.ascii?.group?.id || !customerSetup.category?.id
        || customerSetup.accented.group.id === customerSetup.ascii.group.id) {
        throw new Error(`Customer import setup is incomplete: ${JSON.stringify(customerSetup)}`);
    }
    if (customerSetup.accented.created) createdCustomerGroupIds.push(customerSetup.accented.group.id);
    if (customerSetup.ascii.created) createdCustomerGroupIds.push(customerSetup.ascii.group.id);

    await page.evaluate(() => window.UiLocalization.setLocale('en'));
    await waitForUi(200);
    const englishCustomerTemplateDownload = page.waitForEvent('download');
    await page.locator('#ExcelImportTemplateCustom').click();
    const englishCustomerTemplate = await englishCustomerTemplateDownload;
    const englishCustomerTemplatePath = path.join(tempDir, 'customers-template-en.xlsx');
    await englishCustomerTemplate.saveAs(englishCustomerTemplatePath);
    const englishCustomerTemplateWorkbook = readWorkbook(englishCustomerTemplatePath);
    const englishCustomerHeaders = headerRowOf(englishCustomerTemplateWorkbook, 'Data');

    await page.evaluate(() => window.UiLocalization.setLocale('vi'));
    await waitForUi(200);
    const vietnameseCustomerTemplateDownload = page.waitForEvent('download');
    await page.locator('#ExcelImportTemplateCustom').click();
    const vietnameseCustomerTemplate = await vietnameseCustomerTemplateDownload;
    const vietnameseCustomerTemplatePath = path.join(tempDir, 'customers-template-vi.xlsx');
    await vietnameseCustomerTemplate.saveAs(vietnameseCustomerTemplatePath);
    const vietnameseCustomerTemplateWorkbook = readWorkbook(vietnameseCustomerTemplatePath);
    const vietnameseCustomerHeaders = headerRowOf(vietnameseCustomerTemplateWorkbook, 'Data');
    const expectedVietnameseCustomerHeaders = await page.evaluate(headers => headers.map(header => {
        const required = /\s\*$/.test(header);
        const canonical = header.replace(/\s*\*$/, '');
        return `${window.UiLocalization.translateText(canonical, 'vi')}${required ? ' *' : ''}`;
    }), englishCustomerHeaders);
    if (JSON.stringify(vietnameseCustomerHeaders) !== JSON.stringify(expectedVietnameseCustomerHeaders)) {
        throw new Error(`Vietnamese Customer template headers do not match UI localization: ${vietnameseCustomerHeaders.join(', ')}`);
    }

    const customerNames = [`${testKey}-CUSTOMER-EN`, `${testKey}-CUSTOMER-VI`];
    const customerValues = name => ({
        Name: name,
        'Customer Group': 'Đá',
        'Customer Category': customerSetup.category.name
    });
    const customerWorkbookPath = (headersForFile, values, fileName) => {
        const canonicalHeaders = englishCustomerHeaders.map(header => header.replace(/\s*\*$/, ''));
        const row = headersForFile.map((header, index) => values[canonicalHeaders[index]] ?? '');
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headersForFile, row]), 'Data');
        const filePath = path.join(tempDir, fileName);
        writeWorkbook(workbook, filePath);
        return filePath;
    };
    const englishCustomerImportPath = customerWorkbookPath(
        englishCustomerHeaders, customerValues(customerNames[0]), 'customers-import-en.xlsx');
    const vietnameseCustomerImportPath = customerWorkbookPath(
        vietnameseCustomerHeaders, customerValues(customerNames[1]), 'customers-import-vi.xlsx');

    chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#ExcelImportCustom').click();
    await (await chooserPromise).setFiles(englishCustomerImportPath);
    await page.locator('.swal2-confirm').click();
    await page.waitForSelector('.swal2-icon-success', { timeout: 30000 });
    await confirmSuccessAndWaitForReload();
    await page.waitForSelector('#MainGrid.e-grid');

    await page.evaluate(() => window.UiLocalization.setLocale('en'));
    await waitForUi(200);
    chooserPromise = page.waitForEvent('filechooser');
    await page.locator('#ExcelImportCustom').click();
    await (await chooserPromise).setFiles(vietnameseCustomerImportPath);
    await page.locator('.swal2-confirm').click();
    await page.waitForSelector('.swal2-icon-success', { timeout: 30000 });
    const importedCustomers = await page.evaluate(async names => {
        const response = await AxiosManager.get('/Customer/GetCustomerList', {});
        return (response?.data?.content?.data || []).filter(item => names.includes(item.name));
    }, customerNames);
    if (importedCustomers.length !== 2
        || importedCustomers.some(item => item.customerGroupId !== customerSetup.accented.group.id)
        || importedCustomers.some(item => item.street || item.city || item.state || item.zipCode)) {
        throw new Error(`Unicode/optional-address Customer import failed: ${JSON.stringify(importedCustomers)}`);
    }
    createdCustomerIds.push(...importedCustomers.map(item => item.id));
    await confirmSuccessAndWaitForReload();

    const costCustomerId = await page.evaluate(async importedNames => {
        const response = await AxiosManager.get('/Customer/GetCustomerList', {});
        return (response?.data?.content?.data || [])
            .find(item => !importedNames.includes(item.name))?.id || null;
    }, customerNames);
    if (!costCustomerId) {
        throw new Error('Opening-stock cost smoke requires an existing seeded customer.');
    }

    const salesOpeningCostResult = await page.evaluate(async ({ productId, warehouseId, customerId, testKey }) => {
        const userId = StorageManager.getUserId();
        const dataOf = response => response?.data?.content?.data || [];
        const taxes = dataOf(await AxiosManager.get('/Tax/GetTaxList', {}));
        const tax = taxes[0];
        if (!tax?.id) throw new Error('Opening-stock profit smoke requires a tax record.');

        const orderDate = new Date().toISOString();
        const vendors = dataOf(await AxiosManager.get('/Vendor/GetVendorList', {}));
        const vendor = vendors[0];
        if (!vendor?.id) throw new Error('Weighted opening-stock cost smoke requires a vendor.');

        const createPurchaseResponse = await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate,
            orderStatus: '0',
            description: `${testKey} opening and purchase FIFO cost`,
            vendorId: vendor.id,
            createdById: userId
        });
        const purchaseOrderId = createPurchaseResponse?.data?.content?.data?.id;
        await AxiosManager.post('/PurchaseOrderItem/CreatePurchaseOrderItem', {
            purchaseOrderId,
            productId,
            warehouseId,
            summary: 'Confirmed source at 200',
            taxId: tax.id,
            supplierWarrantyMonths: 6,
            unitPrice: 200,
            quantity: 5.5,
            createdById: userId
        });
        const purchaseHeader = dataOf(await AxiosManager.get('/PurchaseOrder/GetPurchaseOrderList', {}))
            .find(item => item.id === purchaseOrderId);
        if (!purchaseHeader) throw new Error('Weighted purchase source setup failed.');
        await AxiosManager.post('/PurchaseOrder/UpdatePurchaseOrder', {
            id: purchaseHeader.id,
            orderDate: purchaseHeader.orderDate,
            orderStatus: '2',
            description: purchaseHeader.description,
            vendorId: purchaseHeader.vendorId,
            updatedById: userId
        });

        const createOrderResponse = await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
            orderDate,
            orderStatus: '0',
            description: `${testKey} opening stock cost snapshot`,
            customerId,
            salesType: 1,
            createdById: userId
        });
        const salesOrderId = createOrderResponse?.data?.content?.data?.id;
        const createItemResponse = await AxiosManager.post('/SalesOrderItem/CreateSalesOrderItem', {
            salesOrderId,
            productId,
            warehouseId,
            summary: 'Opening stock cost snapshot',
            taxId: tax.id,
            warrantyMonths: 0,
            unitPrice: 250,
            quantity: 1,
            productSerialIds: [],
            createdById: userId
        });
        const salesOrderItemId = createItemResponse?.data?.content?.data?.id;
        const orderHeader = dataOf(await AxiosManager.get('/SalesOrder/GetSalesOrderList', {}))
            .find(item => item.id === salesOrderId);
        if (!orderHeader || !salesOrderItemId) throw new Error('Opening-stock Sales Order setup failed.');

        try {
            await AxiosManager.post('/SalesOrder/UpdateSalesOrder', {
                id: orderHeader.id,
                orderDate: orderHeader.orderDate,
                orderStatus: '2',
                description: orderHeader.description,
                customerId: orderHeader.customerId,
                salesType: orderHeader.salesType,
                updatedById: userId
            });
        } catch (error) {
            throw new Error(`Opening-stock Sales Order confirmation failed: ${JSON.stringify({
                message: error?.message,
                status: error?.response?.status,
                data: error?.response?.data
            })}`);
        }

        const storedLine = dataOf(await AxiosManager.get(
            `/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(salesOrderId)}`, {}))
            .find(item => item.id === salesOrderItemId);
        const reportLine = dataOf(await AxiosManager.get('/SalesOrderItem/GetInventoryProfitReport', {}))
            .find(item => item.salesOrderItemId === salesOrderItemId);
        const remainingStock = dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0;

        return { purchaseOrderId, salesOrderId, salesOrderItemId, storedLine, reportLine, remainingStock };
    }, {
        productId: openingResult.noneId,
        warehouseId: openingWarehouse.id,
        customerId: costCustomerId,
        testKey
    });
    if (!salesOpeningCostResult.purchaseOrderId
        || !salesOpeningCostResult.salesOrderId
        || !salesOpeningCostResult.salesOrderItemId
        || salesOpeningCostResult.storedLine?.cogsAmount !== 100
        || salesOpeningCostResult.storedLine?.profitAmount !== 150
        || salesOpeningCostResult.reportLine?.unitCost !== 100
        || salesOpeningCostResult.reportLine?.totalCost !== 100
        || salesOpeningCostResult.reportLine?.profit !== 150
        || salesOpeningCostResult.reportLine?.isFallbackCost !== false
        || !/tồn đầu kỳ/i.test(salesOpeningCostResult.reportLine?.costSource || '')
        || salesOpeningCostResult.remainingStock !== 10) {
        throw new Error(`Opening-stock Sales Order cost/profit is inconsistent: ${JSON.stringify(salesOpeningCostResult)}`);
    }

    expectHttpError('/StockCount/UpdateStockCount', 409);
    const materialOpeningCostResult = await page.evaluate(async ({ productId, secondaryProductId, warehouseId, customerId, referenceCode, testKey }) => {
        const userId = StorageManager.getUserId();
        const dataOf = response => response?.data?.content?.data || [];
        const products = dataOf(await AxiosManager.get('/Product/GetProductList', {}));
        const product = products.find(item => item.id === productId);
        if (!product) throw new Error('InternalAuto opening product was not found.');

        await AxiosManager.post('/Product/UpdateProduct', {
            id: product.id,
            name: product.name,
            referenceCode: product.referenceCode,
            unitPrice: product.unitPrice,
            costPrice: 777,
            imageUrl: product.imageUrl,
            physical: product.physical,
            serialTrackingMode: product.serialTrackingMode,
            internalSerialFixedCode: product.internalSerialFixedCode,
            defaultWarehouseId: product.defaultWarehouseId,
            defaultWarrantyMonths: product.defaultWarrantyMonths,
            description: product.description,
            productGroupId: product.productGroupId,
            unitMeasureName: product.unitMeasureName,
            openingStockQuantity: null,
            updatedById: userId
        });

        const picker = dataOf(await AxiosManager.get(
            `/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(productId)}&warehouseId=${encodeURIComponent(warehouseId)}`, {}));
        const selectedSerial = picker[0];
        if (!selectedSerial?.id || picker.length !== 3) {
            throw new Error(`Expected three opening serials before Material Export, got ${picker.length}.`);
        }

        const exportDate = new Date().toISOString();
        const createExportResponse = await AxiosManager.post('/MaterialExport/CreateMaterialExport', {
            materialExportDate: exportDate,
            warehouseId,
            customerId,
            status: '0',
            description: `${testKey} InternalAuto opening serial cost`,
            createdById: userId
        });
        const materialExportId = createExportResponse?.data?.content?.data?.id;
        const createLineResponse = await AxiosManager.post('/InventoryTransaction/MaterialExportCreateInvenTrans', {
            moduleId: materialExportId,
            productId,
            movement: 1,
            productSerialIds: [selectedSerial.id],
            createdById: userId
        });
        const materialExportLineId = createLineResponse?.data?.content?.data?.id;
        const secondaryLineResponse = await AxiosManager.post('/InventoryTransaction/MaterialExportCreateInvenTrans', {
            moduleId: materialExportId,
            productId: secondaryProductId,
            movement: 1,
            productSerialIds: [],
            createdById: userId
        });
        const secondaryMaterialExportLineId = secondaryLineResponse?.data?.content?.data?.id;
        const exportHeader = dataOf(await AxiosManager.get('/MaterialExport/GetMaterialExportList', {}))
            .find(item => item.id === materialExportId);
        if (!exportHeader || !materialExportLineId || !secondaryMaterialExportLineId) {
            throw new Error('Material Export setup failed.');
        }

        await AxiosManager.post('/MaterialExport/UpdateMaterialExport', {
            id: exportHeader.id,
            materialExportDate: exportHeader.materialExportDate,
            warehouseId: exportHeader.warehouseId,
            customerId: exportHeader.customerId,
            status: '1',
            description: exportHeader.description,
            updatedById: userId
        });

        const costTransactions = dataOf(await AxiosManager.get('/CashTransaction/GetCashTransactionList', {}))
            .filter(item => item.sourceModule === 'MaterialExport' && item.sourceModuleId === materialExportId);
        const profitReport = dataOf(await AxiosManager.get(
            `/CashTransaction/GetCustomerProfitReport?customerId=${encodeURIComponent(customerId)}`, {}
        ));
        const materialCostReport = profitReport.find(item =>
            item.sourceType === 'MaterialExport' && item.sourceModuleId === materialExportId);
        const stockAfterExport = dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0;
        const selectedAfter = dataOf(await AxiosManager.get(
            `/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(productId)}`
            + `&moduleName=MaterialExport&moduleId=${encodeURIComponent(materialExportId)}`
            + `&moduleItemId=${encodeURIComponent(materialExportLineId)}`, {}))
            .find(item => item.id === selectedSerial.id);

        const transactions = dataOf(await AxiosManager.get('/InventoryTransaction/GetInventoryTransactionList', {}));
        const sourceTransaction = transactions.find(item =>
            item.productReferenceCode === referenceCode && item.moduleCode === 'PRODUCT_OPENING');
        const stockCounts = dataOf(await AxiosManager.get('/StockCount/GetStockCountList', {}));
        const sourceHeader = stockCounts.find(item => item.id === sourceTransaction?.moduleId);
        if (!sourceHeader) throw new Error('InternalAuto opening Stock Count source was not found.');

        let sourceCancelStatus;
        let sourceCancelMessage = '';
        try {
            await AxiosManager.post('/StockCount/UpdateStockCount', {
                id: sourceHeader.id,
                countDate: sourceHeader.countDate,
                status: '1',
                description: sourceHeader.description,
                warehouseId: sourceHeader.warehouseId,
                updatedById: userId
            });
            sourceCancelStatus = 200;
        } catch (error) {
            sourceCancelStatus = error?.response?.status ?? 0;
            sourceCancelMessage = String(error?.response?.data?.message || error?.response?.data || error?.message || '');
        }

        const sourceStatusAfter = dataOf(await AxiosManager.get('/StockCount/GetStockCountList', {}))
            .find(item => item.id === sourceHeader.id)?.status;
        const productAfter = dataOf(await AxiosManager.get('/Product/GetProductList', {}))
            .find(item => item.id === productId);

        return {
            materialExportId,
            materialExportLineId,
            secondaryMaterialExportLineId,
            selectedBefore: selectedSerial,
            selectedAfter,
            costTransactions: costTransactions.map(item => ({
                amount: item.amount,
                description: item.description,
                sourceModule: item.sourceModule,
                sourceModuleId: item.sourceModuleId
            })),
            materialCostReport,
            stockAfterExport,
            openingAfterExport: productAfter?.openingStockQuantity,
            currentCostPrice: productAfter?.costPrice,
            sourceCancelStatus,
            sourceCancelMessage,
            sourceStatusAfter
        };
    }, {
        productId: openingResult.autoId,
        secondaryProductId: openingResult.noneId,
        warehouseId: openingWarehouse.id,
        customerId: costCustomerId,
        referenceCode: openingResult.auto.referenceCode,
        testKey
    });
    if (!materialOpeningCostResult.materialExportId
        || !materialOpeningCostResult.materialExportLineId
        || !materialOpeningCostResult.secondaryMaterialExportLineId
        || materialOpeningCostResult.costTransactions.length !== 0
        || materialOpeningCostResult.materialCostReport?.projectCost !== 200
        || materialOpeningCostResult.currentCostPrice !== 777
        || materialOpeningCostResult.stockAfterExport !== 2
        || materialOpeningCostResult.openingAfterExport !== 3
        || materialOpeningCostResult.selectedBefore?.status !== 1
        || materialOpeningCostResult.selectedAfter?.status !== 9
        || materialOpeningCostResult.selectedAfter?.warehouseId != null
        || materialOpeningCostResult.sourceCancelStatus !== 409
        || materialOpeningCostResult.sourceStatusAfter !== 2) {
        throw new Error(`InternalAuto opening Material Export cost/dependency is inconsistent: ${JSON.stringify(materialOpeningCostResult)}`);
    }

    const pdfDefinitions = [
        ['SalesOrder', '/SalesOrder/GetSalesOrderList', '/SalesOrders/SalesOrderPdf'],
        ['PurchaseOrder', '/PurchaseOrder/GetPurchaseOrderList', '/PurchaseOrders/PurchaseOrderPdf'],
        ['SalesReturn', '/SalesReturn/GetSalesReturnList', '/SalesReturns/SalesReturnPdf'],
        ['PurchaseReturn', '/PurchaseReturn/GetPurchaseReturnList', '/PurchaseReturns/PurchaseReturnPdf'],
        ['TransferOut', '/TransferOut/GetTransferOutList', '/TransferOuts/TransferOutPdf'],
        ['TransferIn', '/TransferIn/GetTransferInList', '/TransferIns/TransferInPdf'],
        ['Scrapping', '/Scrapping/GetScrappingList', '/Scrappings/ScrappingPdf'],
        ['StockCount', '/StockCount/GetStockCountList', '/StockCounts/StockCountPdf'],
        ['MaterialExport', '/MaterialExport/GetMaterialExportList', '/MaterialExports/MaterialExportPdf']
    ];
    let pdfCount = 0;
    for (const [name, endpoint, route] of pdfDefinitions) {
        const id = await page.evaluate(async url => {
            const response = await AxiosManager.get(url, {});
            return response?.data?.content?.data?.[0]?.id || null;
        }, endpoint);
        if (!id) continue;
        await page.goto(`${baseUrl}${route}?id=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#download-pdf:not([disabled])', { timeout: 20000 });
        const downloadPromise = page.waitForEvent('download');
        await page.locator('#download-pdf').click();
        const download = await downloadPromise;
        const pdfPath = path.join(tempDir, `${name}.pdf`);
        await download.saveAs(pdfPath);
        const bytes = fs.readFileSync(pdfPath);
        if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error(`${name} did not download a valid PDF.`);
        pdfCount += 1;
    }
    if (pdfCount < 3) throw new Error(`Only ${pdfCount} seeded PDF document types could be verified.`);

    await page.evaluate(async ({ productIds, customerIds, customerGroupIds }) => {
        for (const id of customerIds) {
            await AxiosManager.post('/Customer/DeleteCustomer', { id, deletedById: StorageManager.getUserId() });
        }
        for (const id of customerGroupIds) {
            await AxiosManager.post('/CustomerGroup/DeleteCustomerGroup', { id, deletedById: StorageManager.getUserId() });
        }
        for (const id of productIds) {
            await AxiosManager.post('/Product/DeleteProduct', { id, deletedById: StorageManager.getUserId() });
        }
    }, { productIds: createdProductIds, customerIds: createdCustomerIds, customerGroupIds: createdCustomerGroupIds });

    if (consoleErrors.length) throw new Error(`Unexpected console errors: ${consoleErrors.join(' | ')}`);
    if (failedRequests.length) throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
    if (httpErrors.length) throw new Error(`Unexpected HTTP errors: ${httpErrors.join(' | ')}`);
    if (expectedHttpErrors.length) throw new Error(`Expected validation responses were not observed: ${JSON.stringify(expectedHttpErrors)}`);
    process.stdout.write(JSON.stringify({
        templateLocales: ['en', 'vi'],
        atomicImport: true,
        openingStock: true,
        openingStockCountLifecycle: true,
        openingStockProfitCost: true,
        internalAutoOpeningMaterialCost: true,
        materialExportSingleCashTransaction: true,
        unicodeCustomerLookup: true,
        exportRows: exportRows.length,
        pdfCount
    }, null, 2));
    await browser.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
})().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
