const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('../Presentation/ASPNET/wwwroot/lib/vendor-export/xlsx.full.min.js');

const readWorkbook = filePath => XLSX.read(fs.readFileSync(filePath), { type: 'buffer', cellDates: true });
const writeWorkbook = (workbook, filePath) => fs.writeFileSync(filePath,
    XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
const rowsOf = (workbook, sheetName) => XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const consoleErrors = [];
    const failedRequests = [];
    const createdProductIds = [];
    const testKey = `E2E-FILE-${Date.now()}`;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wms-file-smoke-'));

    page.on('console', message => {
        const locationUrl = message.location()?.url || 'unknown';
        const isExpectedRollbackResponse = locationUrl.includes('/api/Products/ImportExcel')
            && /status of 400|400 \(Bad Request\)/i.test(message.text());
        if (message.type() === 'error' && !isExpectedRollbackResponse) {
            consoleErrors.push(`${message.text()} @ ${locationUrl}`);
        }
    });
    page.on('requestfailed', request => {
        failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
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
    const productGroupRow = rowsOf(templateWorkbook, 'ProductGroups')[0];
    const productGroup = productGroupRow?.Name;
    if (!productGroup || !productGroupRow?.Id) throw new Error('Product template does not contain a usable ProductGroups lookup.');

    const headers = [
        'Name *', 'Ref Code', 'Unit Price *', 'Cost Price', 'Physical Product *',
        'Serial Tracking Mode *', 'Internal Serial Fixed Code', 'Default Warehouse',
        'Default Warranty Months', 'Product Group *', 'Unit Measure', 'Description'
    ];
    const makeWorkbook = rows => {
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Data');
        return workbook;
    };

    const invalidNames = [`${testKey}-INVALID-A`, `${testKey}-INVALID-B`];
    const invalidPath = path.join(tempDir, 'invalid-products.xlsx');
    writeWorkbook(makeWorkbook([
        [invalidNames[0], `${testKey}-IA`, 100, 50, 'TRUE', 'None', '', '', 0, productGroup, 'PCS', ''],
        [invalidNames[1], `${testKey}-IB`, 100, 50, 'TRUE', 'Internal Auto', '', '', 0, productGroup, 'PCS', '']
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
    const rollbackResult = await page.evaluate(async ({ name, productGroupId }) => {
        const createdById = StorageManager.getUserId();
        let status = 0;
        try {
            await AxiosManager.post('/Products/ImportExcel', { rows: [
                { name, unitPrice: 100, costPrice: 50, physical: false, serialTrackingMode: 0, productGroupId, createdById },
                { name: '', unitPrice: 100, physical: false, serialTrackingMode: 0, productGroupId, createdById }
            ] });
            status = 200;
        } catch (error) {
            status = error?.response?.status ?? 0;
        }
        const products = await AxiosManager.get('/Product/GetProductList', {});
        return {
            status,
            createdCount: (products?.data?.content?.data || []).filter(item => item.name === name).length
        };
    }, { name: serverRollbackName, productGroupId: productGroupRow.Id });
    if (rollbackResult.status !== 400 || rollbackResult.createdCount !== 0) {
        throw new Error(`Backend workbook rollback failed: ${JSON.stringify(rollbackResult)}`);
    }

    const validNames = [`${testKey}-VALID-A`, `${testKey}-VALID-B`];
    const validPath = path.join(tempDir, 'valid-products.xlsx');
    writeWorkbook(makeWorkbook([
        [validNames[0], `${testKey}-VA`, 100, 50, 'TRUE', 'None', '', '', 12, productGroup, 'PCS', ''],
        [validNames[1], `${testKey}-VB`, 200, 0, 'FALSE', 'None', '', '', '', productGroup, 'SERVICE', '']
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

    await page.locator('.swal2-confirm').click();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#MainGrid.e-grid');
    const exportDownload = page.waitForEvent('download');
    await page.locator('#MainGrid_excelexport').click();
    const exported = await exportDownload;
    const exportPath = path.join(tempDir, 'products-export.xlsx');
    await exported.saveAs(exportPath);
    const exportWorkbook = readWorkbook(exportPath);
    const exportRows = rowsOf(exportWorkbook, exportWorkbook.SheetNames[0]);
    if (!exportRows.length) throw new Error('Excel export did not contain product rows.');
    const exportHeaders = Object.keys(exportRows[0]);
    if (exportHeaders.some(header => /^id$/i.test(header) || /action/i.test(header))) {
        throw new Error(`Excel export contains technical/action columns: ${exportHeaders.join(', ')}`);
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

    await page.evaluate(async ids => {
        for (const id of ids) {
            await AxiosManager.post('/Product/DeleteProduct', { id, deletedById: StorageManager.getUserId() });
        }
    }, createdProductIds);

    if (consoleErrors.length) throw new Error(`Unexpected console errors: ${consoleErrors.join(' | ')}`);
    if (failedRequests.length) throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
    process.stdout.write(JSON.stringify({ template: true, atomicImport: true, exportRows: exportRows.length, pdfCount }, null, 2));
    await browser.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
})().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
