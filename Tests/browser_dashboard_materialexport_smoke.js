const { chromium } = require('playwright');

(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const apiResponses = [];

    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
        if (request.url().startsWith(baseUrl)) {
            failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
        }
    });
    page.on('response', response => {
        if (response.url().includes('/api/Dashboard/') || response.url().includes('GetCustomerProfitReport')) {
            apiResponses.push(`${response.status()} ${response.url()}`);
        }
    });

    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit', timeout: 15000 });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('.dashboard-hero');
    await page.waitForSelector('.e-grid');
    const defaultLocale = await page.evaluate(() => UiLocalization.getLocale());
    if (defaultLocale !== 'vi') throw new Error(`Vietnamese must be the default locale, received ${defaultLocale}.`);
    const readVisibleDates = panel => panel.locator('.e-row').evaluateAll(rows => rows.map(row => (
        [...row.querySelectorAll('td')].find(cell => getComputedStyle(cell).display !== 'none')?.textContent?.trim() ?? ''
    )));
    const recentOrderDates = await readVisibleDates(page.locator('.dashboard-panel').nth(0));
    recentOrderDates.push(...await readVisibleDates(page.locator('.dashboard-panel').nth(1)));
    if (!recentOrderDates.length || recentOrderDates.some(value => !/^\d{2}\/\d{2}\/\d{4}$/.test(value.trim()))) {
        throw new Error(`Dashboard order dates are not valid Vietnamese dates: ${JSON.stringify(recentOrderDates)}`);
    }
    if (recentOrderDates.some(value => /Invalid Date|^[A-Za-z]{3}\s/.test(value))) {
        throw new Error(`Dashboard rendered an invalid or weekday date: ${JSON.stringify(recentOrderDates)}`);
    }
    const inventoryDates = await readVisibleDates(page.locator('.dashboard-panel').nth(2));
    if (!inventoryDates.length || inventoryDates.some(value => !/^\d{2}\/\d{2}\/\d{4}\s\d{2}:\d{2}(?::\d{2})?$/.test(value.trim()))) {
        throw new Error(`Dashboard inventory dates are not valid Vietnamese date-times: ${JSON.stringify(inventoryDates)}`);
    }
    await page.evaluate(() => UiLocalization.setLocale('en'));
    await page.waitForSelector('text=Operations Overview');

    const dashboardScriptUrl = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(item => item.name)
        .find(url => url.includes('/FrontEnd/Pages/Dashboards/DefaultDashboard.cshtml.js')) || '');
    const dashboardAssetVersion = dashboardScriptUrl
        ? new URL(dashboardScriptUrl).searchParams.get('v')
        : '';
    if (!dashboardAssetVersion) throw new Error(`Dashboard script is not versioned: ${dashboardScriptUrl}`);
    if (await page.locator('#DashboardBootError:visible').count()) throw new Error('Dashboard boot error is visible during normal load.');
    if (await page.locator('.dashboard-kpi').count() < 7) throw new Error('Dashboard KPI cards did not render.');

    await page.route('**/api/Dashboard/GetPurchaseDashboard', route => route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ code: 500, message: 'Injected purchase panel failure' })
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('text=Injected purchase panel failure');
    if (await page.locator('.dashboard-kpi').count() < 7) throw new Error('Successful Dashboard panels disappeared after one API failed.');
    await page.waitForFunction(() => document.querySelectorAll('.e-grid').length >= 2, null, { timeout: 15000 });
    await page.unroute('**/api/Dashboard/GetPurchaseDashboard');
    await page.locator('button', { hasText: 'Retry' }).click();
    await page.waitForTimeout(800);
    if (await page.locator('text=Injected purchase panel failure').count()) throw new Error('Dashboard Retry did not recover the failed panel.');

    await page.goto(`${baseUrl}/SalesOrders/SalesOrderList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid').catch(error => {
        throw new Error(`${error.message}\nSales Order console errors: ${consoleErrors.join(' | ')}\nSales Order page errors: ${pageErrors.join(' | ')}`);
    });
    await page.waitForSelector('#SecondaryGrid.e-grid', { state: 'attached' });

    await page.goto(`${baseUrl}/CashTransactions/CashTransactionList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid');
    if (await page.locator('#app > .row.mb-3 .card').count()) throw new Error('Cash Transaction summary cards are still present.');

    await page.goto(`${baseUrl}/WarrantyLookups/WarrantyLookup`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid');
    const warrantySerial = await page.evaluate(async () => {
        const response = await AxiosManager.get('/ProductSerial/GetWarrantyLookup?search=&page=1&pageSize=20', {});
        const content = response?.data?.content;
        if (!content || content.totalCount < 1 || !Array.isArray(content.data)) return '';
        const first = content.data[0];
        return first?.manufacturerSerialNumber || first?.internalSerialNumber || '';
    });
    if (!warrantySerial) throw new Error('No seeded serial was available for Warranty Lookup.');
    await page.locator('#app .card-body input.e-input').fill(warrantySerial);
    const [searchResponse] = await Promise.all([
        page.waitForResponse(response => response.url().includes('/ProductSerial/GetWarrantyLookup?search=')),
        page.getByRole('button', { name: /^Search$/ }).click()
    ]);
    const searchPayload = await searchResponse.json();
    if (searchPayload?.content?.totalCount !== 1) {
        throw new Error(`Warranty server search returned ${searchPayload?.content?.totalCount ?? 'unknown'} rows for ${warrantySerial}.`);
    }
    await page.waitForTimeout(1000);
    const warrantyRows = await page.locator('#MainGrid .e-row').allTextContents();
    if (!warrantyRows.some(row => row.includes(warrantySerial))) {
        throw new Error(`Warranty grid did not render ${warrantySerial}. Rows: ${JSON.stringify(warrantyRows)}`);
    }

    await page.goto(`${baseUrl}/CashTransactions/CustomerFinanceReport`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForSelector('h3:text-is("Project Finance Report")');
    await page.waitForSelector('#CustomerDropDown.e-control', { state: 'attached' });
    const financeScriptUrl = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(item => item.name)
        .find(url => url.includes('/FrontEnd/Pages/CashTransactions/CustomerFinanceReport.cshtml.js')) || '');
    if (!/[?&]v=/.test(financeScriptUrl)) throw new Error(`Customer profit report script is not versioned: ${financeScriptUrl}`);
    await page.waitForFunction(() => {
        const values = [...document.querySelectorAll('.card h4')].slice(0, 3)
            .map(node => NumberFormatManager.parseLocaleNumber(node.textContent));
        return values.length === 3 && values[0] !== 0 && values[1] !== 0;
    }, null, { timeout: 15000 });
    const summaryValues = await page.locator('.card h4').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.textContent.trim()));
    if (summaryValues.length !== 3 || summaryValues.some(value => !value)) {
        throw new Error(`Customer profit summary did not render: ${JSON.stringify(summaryValues)}`);
    }
    if (summaryValues[0] === '0' || summaryValues[1] === '0') {
        throw new Error(`Seeded revenue/project cost were not loaded: ${JSON.stringify(summaryValues)}`);
    }
    const financePayload = await page.evaluate(async () => {
        const response = await AxiosManager.get('/CashTransaction/GetCustomerProfitReport', {});
        if (response?.status !== 200) throw new Error(`Finance report API returned ${response?.status}`);
        return response.data;
    });
    const financeRows = financePayload?.content?.data ?? [];
    const demoRevenue = financeRows.find(row => row.description === 'DEMO ACCRUAL PROJECT 2000000');
    if (!demoRevenue?.customerId) throw new Error('The accrual project demo revenue row was not seeded.');
    await page.evaluate(async customerId => {
        const dropdown = document.querySelector('#CustomerDropDown')?.ej2_instances?.[0];
        if (!dropdown) throw new Error('Customer finance filter was not initialized.');
        dropdown.value = customerId;
        dropdown.dataBind();
        await dropdown.change({ value: customerId });
    }, demoRevenue.customerId);
    await page.waitForFunction(() => {
        const values = [...document.querySelectorAll('.card h4')].slice(0, 3)
            .map(node => NumberFormatManager.parseLocaleNumber(node.textContent));
        return values[0] === 2000000 && values[1] === 500000 && values[2] === 1500000;
    });
    const demoSummaryValues = await page.locator('.card h4').evaluateAll(nodes =>
        nodes.slice(0, 3).map(node => node.textContent.trim()));
    await page.locator('[data-language-switch="vi"]').click();
    await page.waitForSelector('h3:text-is("Báo Cáo Tài Chính Công Trình")');
    await page.locator('[data-language-switch="en"]').click();
    await page.waitForSelector('h3:text-is("Project Finance Report")');

    await page.goto(`${baseUrl}/VendorDebtReports/VendorDebtReportList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('h3:text-is("Debt Report")');
    await page.waitForSelector('#MainGrid.e-grid');
    await page.locator('button', { hasText: 'Vendors' }).click();
    await page.waitForTimeout(500);
    if (await page.locator('#MainGrid .e-row').count() === 0) throw new Error('Vendor debt tab did not render data.');

    const unexpectedConsoleErrors = consoleErrors.filter(message =>
        !message.includes('Injected purchase panel failure') &&
        !message.startsWith('Dashboard purchase load error:') &&
        !message.includes('Failed to load resource: the server responded with a status of 500') &&
        message !== 'Failed to load resource: net::ERR_NETWORK_ACCESS_DENIED');
    if (unexpectedConsoleErrors.length) throw new Error(`Unexpected Console errors: ${unexpectedConsoleErrors.join(' | ')}`);
    if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join(' | ')}`);
    if (failedRequests.length) throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
    const expectedInjectedFailureObserved = apiResponses.some(item => item.startsWith('500 ') && item.includes('GetPurchaseDashboard'));
    if (!expectedInjectedFailureObserved) throw new Error('The isolated Dashboard failure scenario was not observed.');

    process.stdout.write(JSON.stringify({
        dashboardScriptUrl,
        financeScriptUrl,
        summaryValues,
        demoCustomer: demoRevenue.customerName,
        demoSummaryValues,
        apiResponses,
        expectedInjectedFailureObserved,
        cashTransactionSummaryCards: 0,
        localizationRoundTrip: true,
        defaultLocale
    }, null, 2));
    await browser.close();
})().catch(async error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
