const { chromium } = require('playwright');

function parseMoney(value) {
    const normalized = String(value ?? '').replace(/[^\d-]/g, '');
    return normalized ? Number(normalized) : 0;
}

(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    const failedRequests = [];
    const uniqueDescription = `BROWSER ALLOCATION ${Date.now()}`;
    let createdTransactionId = null;
    let lastCreateRequest = null;

    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => {
        if (request.url().startsWith(baseUrl)) {
            failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
        }
    });
    page.on('request', request => {
        if (request.url().includes('/api/CashTransaction/CreateCashTransaction')) {
            lastCreateRequest = request.postDataJSON();
        }
    });

    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit', timeout: 20000 });
    await page.waitForLoadState('domcontentloaded');
    await page.waitForFunction(() => window.UiLocalization?.getLocale);
    await page.evaluate(() => window.UiLocalization.setLocale('vi'));
    await page.waitForFunction(() => window.UiLocalization?.getLocale?.() === 'vi');

    await page.goto(`${baseUrl}/CashTransactions/CashTransactionList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');

    const allocationToggle = page.getByRole('button', { name: 'Chi tiết phân bổ', exact: true });
    await allocationToggle.waitFor({ state: 'visible' });
    await page.evaluate(async () => {
        const dropdown = document.querySelector('#TransactionTypeDropDown')?.ej2_instances?.[0];
        dropdown.value = 0;
        dropdown.dataBind();
        await dropdown.change({ value: 0 });
    });
    await allocationToggle.waitFor({ state: 'visible' });
    await page.evaluate(async () => {
        const dropdown = document.querySelector('#TransactionTypeDropDown')?.ej2_instances?.[0];
        dropdown.value = 1;
        dropdown.dataBind();
        await dropdown.change({ value: 1 });
    });
    await allocationToggle.waitFor({ state: 'visible' });
    await page.evaluate(async () => {
        const dropdown = document.querySelector('#TransactionTypeDropDown')?.ej2_instances?.[0];
        dropdown.value = 0;
        dropdown.dataBind();
        await dropdown.change({ value: 0 });
    });

    await allocationToggle.click();
    const addAllocationButton = page.locator('#MainModal .allocation-panel__header button');
    await addAllocationButton.waitFor({ state: 'visible' });
    await addAllocationButton.click();
    await addAllocationButton.click();

    const allocationRows = page.locator('#MainModal .allocation-row');
    await allocationRows.first().waitFor();
    if (await allocationRows.count() !== 2) throw new Error('The allocation panel did not create two detail rows.');
    const customerSelects = allocationRows.locator('select');
    if (!await customerSelects.first().evaluate(select => select.classList.contains('form-control'))) {
        throw new Error('Allocation customer select is not using the Bootstrap 4 compatible form control style.');
    }
    const firstOptions = await customerSelects.nth(0).locator('option').evaluateAll(options => options
        .map(option => option.value)
        .filter(value => value && value !== 'null'));
    if (firstOptions.length < 2) throw new Error('The demo data does not contain two customers for allocation testing.');
    await customerSelects.nth(0).selectOption(firstOptions[0]);
    await customerSelects.nth(1).selectOption(firstOptions[1]);
    const selectedCustomers = await customerSelects.evaluateAll(selects => selects.map(select => select.value));
    if (selectedCustomers.some(value => !value)) {
        throw new Error(`Customer allocation selection did not bind: ${JSON.stringify(selectedCustomers)}`);
    }
    await allocationRows.nth(0).locator('input[type="number"]').fill('100000');
    await allocationRows.nth(1).locator('input[type="number"]').fill('200000');
    await page.locator('#Description').fill(uniqueDescription);

    await page.evaluate(() => {
        const amount = document.querySelector('#AmountInput')?.ej2_instances?.[0];
        amount.value = 999999;
        amount.dataBind();
        amount.change({ value: 999999 });
    });
    await page.locator('#MainSaveButton').click();
    await page.waitForSelector('.swal2-popup');
    await page.locator('.swal2-confirm').click();
    if (!await page.locator('#MainModal').evaluate(element => element.classList.contains('show'))) {
        throw new Error('A mismatched allocation total was saved instead of being rejected.');
    }

    await page.evaluate(() => {
        const amount = document.querySelector('#AmountInput')?.ej2_instances?.[0];
        amount.value = 300000;
        amount.dataBind();
        amount.change({ value: 300000 });
    });
    const createResponsePromise = page.waitForResponse(response => response.url().includes('/api/CashTransaction/CreateCashTransaction'));
    await page.locator('#MainSaveButton').click();
    const createResponse = await createResponsePromise;
    const createPayload = await createResponse.json();
    if (createResponse.status() !== 200 || createPayload?.code !== 200) {
        throw new Error(`Unable to create allocated receipt: ${createResponse.status()} ${JSON.stringify(createPayload)} Request: ${JSON.stringify(lastCreateRequest)}`);
    }
    createdTransactionId = createPayload?.content?.data?.id;
    await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10000 });

    const createdListRow = await page.evaluate(async description => {
        const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
        return (response?.data?.content?.data ?? []).find(item => item.description === description) ?? null;
    }, uniqueDescription);
    if (!createdListRow || createdListRow.allocations?.length !== 2) {
        throw new Error(`Allocated receipt was not returned with two details: ${JSON.stringify(createdListRow)}`);
    }

    await page.evaluate(description => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.search(description), uniqueDescription);
    await page.waitForSelector('#MainGrid .e-row');
    await page.locator('#MainGrid .e-row').first().dblclick();
    await page.waitForSelector('#MainModal.show');
    if (await page.locator('#MainModal .allocation-row').count() !== 2) {
        throw new Error('Viewing the saved receipt did not show its allocation details.');
    }
    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });

    await page.goto(`${baseUrl}/SalesOrders/SalesOrderList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    const salesOrderDateState = await page.evaluate(() => ({
        format: document.querySelector('#MainGrid')?.ej2_instances?.[0]?.getColumnByField('orderDate')?.format,
        locale: window.UiLocalization?.getLocale?.()
    }));
    const salesOrderDateFormat = salesOrderDateState.format;
    if (salesOrderDateFormat !== 'dd/MM/yyyy') {
        throw new Error(`Sales order date column is not formatted for the active locale: ${JSON.stringify(salesOrderDateState)}`);
    }
    const salesPaymentButton = page.locator('#MainGrid .payment-status-action:visible').first();
    await salesPaymentButton.waitFor();
    await salesPaymentButton.click();
    await page.waitForSelector('.sales-order-payment-popup');
    const salesPopupStyle = await page.locator('.sales-order-payment-popup #swal-account').evaluate(select => ({
        compatibleClass: select.classList.contains('form-control'),
        width: getComputedStyle(select).width,
        display: getComputedStyle(select).display
    }));
    if (!salesPopupStyle.compatibleClass || salesPopupStyle.display !== 'block' || Number.parseFloat(salesPopupStyle.width) < 200) {
        throw new Error(`Sales payment account control is not styled correctly: ${JSON.stringify(salesPopupStyle)}`);
    }
    if ((await page.locator('.sales-order-payment-popup .swal2-title').textContent()).includes('Sales Order Payment')) {
        throw new Error('Sales payment title remained in English while Vietnamese is active.');
    }
    await page.locator('.sales-order-payment-popup .swal2-cancel').click();

    await page.goto(`${baseUrl}/PurchaseOrders/PurchaseOrderList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForFunction(() => Array.isArray(document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource));
    const purchasePaymentButton = page.locator('#MainGrid .payment-status-action:visible').first();
    if (await purchasePaymentButton.count()) {
        await purchasePaymentButton.click();
        await page.waitForSelector('.purchase-order-payment-popup');
        const purchasePopupStyle = await page.locator('.purchase-order-payment-popup #swal-account').evaluate(select => ({
            compatibleClass: select.classList.contains('form-control'),
            width: getComputedStyle(select).width,
            display: getComputedStyle(select).display
        }));
        if (!purchasePopupStyle.compatibleClass || purchasePopupStyle.display !== 'block' || Number.parseFloat(purchasePopupStyle.width) < 200) {
            throw new Error(`Purchase payment account control is not styled correctly: ${JSON.stringify(purchasePopupStyle)}`);
        }
        if ((await page.locator('.purchase-order-payment-popup .swal2-title').textContent()).startsWith('Payment ')) {
            throw new Error('Purchase payment title remained in English while Vietnamese is active.');
        }
        await page.locator('.purchase-order-payment-popup .swal2-cancel').click();
    }

    await page.goto(`${baseUrl}/CashTransactions/CashCategoryReport`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForFunction(() => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource?.length > 0);
    const report = await page.evaluate(() => {
        const rows = document.querySelector('#MainGrid').ej2_instances[0].dataSource;
        return {
            rowReceipt: rows.reduce((sum, row) => sum + Number(row.receiptAmount || 0), 0),
            rowExpense: rows.reduce((sum, row) => sum + Number(row.expenseAmount || 0), 0),
            rowNet: rows.reduce((sum, row) => sum + Number(row.netCashFlow || 0), 0),
            accountId: document.querySelector('#CashAccountDropDown').ej2_instances[0].dataSource[0]?.id
        };
    });
    const cardValues = {
        receipt: parseMoney(await page.locator('#TotalReceiptValue').textContent()),
        expense: parseMoney(await page.locator('#TotalExpenseValue').textContent()),
        net: parseMoney(await page.locator('#NetCashFlowValue').textContent())
    };
    if (cardValues.receipt !== report.rowReceipt || cardValues.expense !== report.rowExpense || cardValues.net !== report.rowNet) {
        throw new Error(`Category report cards do not reconcile with rows: ${JSON.stringify({ cardValues, report })}`);
    }
    if (!report.accountId) throw new Error('No cash account is available for the report filter test.');
    const filteredResponsePromise = page.waitForResponse(response => response.url().includes('/api/CashTransaction/GetCashCategorySummary?') && response.url().includes('cashAccountId='));
    await page.evaluate(async accountId => {
        const dropdown = document.querySelector('#CashAccountDropDown').ej2_instances[0];
        dropdown.value = accountId;
        dropdown.dataBind();
        await dropdown.change({ value: accountId });
    }, report.accountId);
    if ((await filteredResponsePromise).status() !== 200) throw new Error('Cash account filtering failed.');

    await page.locator('[data-language-switch="vi"]').click();
    await page.waitForSelector('h3:text-is("Báo Cáo Thu Chi Theo Danh Mục")');

    await page.goto(`${baseUrl}/CashTransactions/CustomerFinanceReport`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForFunction(() => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource?.length > 0, null, { timeout: 20000 });
    await page.waitForTimeout(250);
    const groupedState = await page.evaluate(() => {
        const visibleRecordRows = [...document.querySelectorAll('#MainGrid .e-content tr.e-row')]
            .filter(row => row.getClientRects().length > 0).length;
        const toggles = [...document.querySelectorAll('#MainGrid [class*="e-recordplus"]')];
        return {
            visibleRecordRows,
            toggleCount: toggles.length,
            groupColumns: [...(document.querySelector('#MainGrid').ej2_instances[0].groupSettings?.columns || [])],
            toggleClasses: toggles.map(toggle => toggle.className)
        };
    });
    if (!groupedState.groupColumns.length || !groupedState.toggleCount || groupedState.visibleRecordRows !== 0) {
        throw new Error(`Grouped finance rows did not start collapsed: ${JSON.stringify(groupedState)}`);
    }
    await page.locator('#MainGrid [class*="e-recordplus"]').first().click();
    await page.waitForTimeout(150);
    const afterSingleExpand = await page.evaluate(() => ({
        visibleRecordRows: [...document.querySelectorAll('#MainGrid .e-content tr.e-row')]
            .filter(row => row.getClientRects().length > 0).length,
        toggleClasses: [...document.querySelectorAll('#MainGrid [class*="e-recordplus"]')].map(toggle => toggle.className)
    }));
    if (afterSingleExpand.visibleRecordRows < 1) {
        throw new Error(`Expanding one group changed other groups: ${JSON.stringify(afterSingleExpand)}`);
    }

    if (createdTransactionId) {
        await page.evaluate(async id => {
            await AxiosManager.post('/CashTransaction/DeleteCashTransaction', {
                id,
                deletedById: StorageManager.getUserId()
            });
        }, createdTransactionId);
    }

    const unexpectedConsoleErrors = consoleErrors.filter(message => message !== 'Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED');
    if (unexpectedConsoleErrors.length) throw new Error(`Unexpected console errors: ${unexpectedConsoleErrors.join(' | ')}`);
    if (failedRequests.length) throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);

    process.stdout.write(JSON.stringify({
        allocatedReceipt: createdListRow.number,
        reportGroups: groupedState.toggleCount,
        categoryTotals: cardValues,
        groupedState,
        afterSingleExpand,
        localization: true
    }, null, 2));
    await browser.close();
})().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
