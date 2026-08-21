const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

const dataOf = response => response?.data?.content?.data;

async function login(page) {
    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit', timeout: 20000 });
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    let salesOrderId = null;
    const createItemRequests = [];
    const createItemResponses = [];
    const browserErrors = [];
    const failedRequests = [];
    const httpErrors = [];
    const baseOrigin = new URL(baseUrl).origin;

    page.on('request', request => {
        if (request.url().includes('/api/SalesOrderItem/CreateSalesOrderItem')) {
            createItemRequests.push(request.postDataJSON());
        }
    });
    page.on('response', response => {
        if (response.url().includes('/api/SalesOrderItem/CreateSalesOrderItem')) {
            createItemResponses.push({ status: response.status(), url: response.url() });
        }
        const url = new URL(response.url());
        if (url.origin === baseOrigin && url.pathname.startsWith('/api/') && response.status() >= 400) {
            httpErrors.push(`${response.status()} ${url.pathname}`);
        }
    });
    page.on('pageerror', error => browserErrors.push(error.stack || error.message));
    page.on('console', message => {
        if (message.type() === 'error') browserErrors.push(`${message.text()} @ ${message.location()?.url || 'unknown'}`);
    });
    page.on('requestfailed', request => {
        const url = new URL(request.url());
        if (url.origin === baseOrigin) {
            failedRequests.push(`${url.pathname} :: ${request.failure()?.errorText || 'request failed'}`);
        }
    });

    try {
        await login(page);
        await page.goto(`${baseUrl}/SalesOrders/SalesOrderList`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
        await page.waitForFunction(() => {
            const main = document.querySelector('#MainGrid')?.ej2_instances?.[0];
            const items = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
            return main && items && Array.isArray(main.dataSource);
        });

        const fixture = await page.evaluate(async () => {
            const unwrap = response => response?.data?.content?.data ?? [];
            const safeGet = async path => {
                try {
                    return { data: unwrap(await AxiosManager.get(path, {})) };
                } catch (error) {
                    return { error: { path, message: error?.message, status: error?.response?.status, data: error?.response?.data } };
                }
            };
            const productResult = await safeGet('/Product/GetProductList');
            const stockResult = await safeGet('/InventoryTransaction/GetInventoryStockList');
            const taxResult = await safeGet('/Tax/GetTaxList');
            const customerResult = await safeGet('/Customer/GetCustomerList');
            const lookupError = [productResult, stockResult, taxResult, customerResult].find(result => result.error)?.error;
            if (lookupError) return { fixtureError: lookupError };
            const products = productResult.data;
            const stock = stockResult.data;
            const taxes = taxResult.data;
            const customers = customerResult.data;
            const stockedIds = new Set(stock
                .filter(item => Number(item.stock ?? 0) > 0)
                .map(item => String(item.productId)));
            const product = products.find(item => item.physical === false && Number(item.unitPrice) > 0)
                ?? products.find(item => stockedIds.has(String(item.id))
                    && Number(item.serialTrackingMode ?? 0) === 0
                    && Number(item.unitPrice) > 0);
            const tax = taxes[0];
            const customer = customers[0];
            if (!product || !tax || !customer) return null;

            try {
                const response = await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
                    orderDate: new Date().toISOString(),
                    description: `SO item UI regression ${Date.now()}`,
                    orderStatus: '0',
                    customerId: customer.id,
                    salesType: 1,
                    createdById: StorageManager.getUserId()
                });
                return { order: unwrap(response), product, tax };
            } catch (error) {
                return { fixtureError: { path: '/SalesOrder/CreateSalesOrder', message: error?.message, status: error?.response?.status, data: error?.response?.data } };
            }
        });
        if (!fixture?.order?.id) throw new Error(`Unable to create draft SO fixture: ${JSON.stringify(fixture)}`);
        salesOrderId = fixture.order.id;

        await page.reload({ waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
        await page.waitForFunction(id => {
            const grid = document.querySelector('#MainGrid')?.ej2_instances?.[0];
            return grid?.dataSource?.some?.(item => item.id === id);
        }, salesOrderId);

        await page.evaluate(async id => {
            const grid = document.querySelector('#MainGrid').ej2_instances[0];
            const record = grid.dataSource.find(item => item.id === id);
            const original = grid.getSelectedRecords;
            grid.getSelectedRecords = () => [record];
            try {
                await grid.toolbarClick({ item: { id: 'EditCustom' } });
            } finally {
                grid.getSelectedRecords = original;
            }
        }, salesOrderId);
        await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
        await page.waitForTimeout(300);

        await page.evaluate(() => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            window.__soItemEvents = [];
            const originalActionBegin = grid.actionBegin;
            const originalActionComplete = grid.actionComplete;
            grid.actionBegin = args => {
                window.__soItemEvents.push({ phase: 'begin', requestType: args?.requestType, action: args?.action, data: { ...(args?.data ?? {}) } });
                return originalActionBegin?.(args);
            };
            grid.actionComplete = async args => {
                window.__soItemEvents.push({ phase: 'complete', requestType: args?.requestType, action: args?.action, data: { ...(args?.data ?? {}) } });
                return await originalActionComplete?.(args);
            };
        });
        await page.locator('#SecondaryGrid_add').click();
        await page.waitForFunction(() => Boolean(
            document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
        ));

        await page.evaluate(() => {
            const dropdown = document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist').ej2_instances[0];
            dropdown.showPopup();
        });
        const productOption = page.locator('body > .e-ddl.e-popup.e-popup-open .e-list-item', {
            hasText: fixture.product.name
        }).first();
        await productOption.waitFor();
        await productOption.click();
        await page.waitForTimeout(100);
        await page.evaluate(() => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            grid.editCell(0, 'unitPrice');
        });
        await page.waitForTimeout(100);

        const selectedRow = await page.evaluate(() => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            const changes = grid.getBatchChanges?.() ?? {};
            const row = changes.addedRecords?.[0]
                ?? grid.getCurrentViewRecords?.()[0]
                ?? grid.getRowsObject()[0]?.data;
            const priceColumnIndex = grid.getColumnIndexByField('unitPrice');
            const priceCell = [...grid.element.querySelectorAll('.e-content tbody tr.e-row')]
                .flatMap(element => [...element.children])
                .find(element => Number(element.getAttribute('data-colindex')) === priceColumnIndex);
            return {
                row,
                priceText: priceCell?.innerText ?? '',
                changes,
                currentRows: grid.getCurrentViewRecords?.(),
                rowObjects: grid.getRowsObject?.().map(item => item.data),
                htmlText: grid.element.innerText,
                events: window.__soItemEvents,
                productEditorValue: document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]?.value,
                productInputValue: document.querySelector('#SecondaryGrid td.e-editedbatchcell input')?.value
            };
        });
        const priceWasAutoFilled = Number(selectedRow.row?.unitPrice) === Number(fixture.product.unitPrice);

        await page.evaluate(product => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            const priceInput = document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-numerictextbox');
            const priceEditor = priceInput?.ej2_instances?.[0];
            if (priceEditor && Number(priceEditor.value ?? 0) !== Number(product.unitPrice)) {
                priceEditor.value = Number(product.unitPrice);
                priceEditor.dataBind();
            }
            grid.editCell(0, 'taxId');
        }, fixture.product);
        await page.waitForFunction(() => Boolean(
            document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
        ));
        await page.evaluate(() => {
            document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist').ej2_instances[0].showPopup();
        });
        const taxOption = page.locator('body > .e-ddl.e-popup.e-popup-open .e-list-item', {
            hasText: fixture.tax.name
        }).first();
        await taxOption.waitFor();
        await taxOption.click();
        const saved = await page.evaluate(async () => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            return await GridInteractionManager.save(grid);
        });
        if (!saved) {
            const diagnostics = await page.evaluate(() => {
                const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
                return {
                    isEdit: grid.isEdit,
                    changes: grid.getBatchChanges?.(),
                    rowObjects: grid.getRowsObject?.().map(item => item.data),
                    events: window.__soItemEvents,
                    swal: document.querySelector('.swal2-html-container')?.innerText,
                    gridText: grid.element.innerText
                };
            });
            throw new Error(`GridInteractionManager rejected the complete SO item row: ${JSON.stringify({ diagnostics, createItemRequests, createItemResponses })}`);
        }

        const persistedItems = await page.evaluate(async id => (
            (await AxiosManager.get(`/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(id)}`, {}))
                ?.data?.content?.data ?? []
        ), salesOrderId);
        if (persistedItems.length !== 1) {
            throw new Error(`SO item disappeared after save: ${JSON.stringify({ createItemRequests, persistedItems })}`);
        }
        const persisted = persistedItems[0];
        if (persisted.productId !== fixture.product.id
            || Number(persisted.unitPrice) !== Number(fixture.product.unitPrice)
            || persisted.taxId !== fixture.tax.id) {
            throw new Error(`SO item payload was not persisted intact: ${JSON.stringify({ createItemRequests, persisted })}`);
        }
        if (!priceWasAutoFilled) {
            throw new Error(`Selecting a Product did not copy Unit Price: ${JSON.stringify({ selectedRow, product: fixture.product, createItemRequests, createItemResponses })}`);
        }
        if (browserErrors.length) throw new Error(`Browser errors: ${browserErrors.join('\n')}`);
        if (failedRequests.length) throw new Error(`Failed requests: ${failedRequests.join('\n')}`);
        if (httpErrors.length) throw new Error(`Unexpected API responses: ${httpErrors.join('\n')}`);

        console.log('Sales Order item UI browser regression passed.');
    } finally {
        if (salesOrderId) {
            await page.evaluate(async id => {
                try {
                    await AxiosManager.post('/SalesOrder/DeleteSalesOrder', {
                        id,
                        deletedById: StorageManager.getUserId()
                    });
                } catch { }
            }, salesOrderId).catch(() => { });
        }
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
