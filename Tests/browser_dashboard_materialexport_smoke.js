const { chromium } = require('playwright');

(async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:5000';
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const consoleErrors = [];
    const failedRequests = [];
    const apiResponses = [];

    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('requestfailed', request => failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`));
    page.on('response', response => {
        if (response.url().includes('/api/Dashboard/') || response.url().includes('GetCustomerProfitReport')) {
            apiResponses.push(`${response.status()} ${response.url()}`);
        }
    });

    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click();
    await page.waitForURL('**/Dashboards/DefaultDashboard', { timeout: 15000 });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('.dashboard-hero');
    await page.waitForSelector('.e-grid');

    const dashboardScriptUrl = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(item => item.name)
        .find(url => url.includes('/FrontEnd/Pages/Dashboards/DefaultDashboard.cshtml.js')) || '');
    if (!/[?&]v=\d+/.test(dashboardScriptUrl)) throw new Error(`Dashboard script is not versioned: ${dashboardScriptUrl}`);
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
    if (await page.locator('.e-grid').count() < 2) throw new Error('Successful Dashboard grids disappeared after one API failed.');
    await page.unroute('**/api/Dashboard/GetPurchaseDashboard');
    await page.locator('button', { hasText: 'Retry' }).click();
    await page.waitForTimeout(800);
    if (await page.locator('text=Injected purchase panel failure').count()) throw new Error('Dashboard Retry did not recover the failed panel.');

    await page.goto(`${baseUrl}/CashTransactions/CashTransactionList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid');
    if (await page.locator('#app > .row.mb-3 .card').count()) throw new Error('Cash Transaction summary cards are still present.');

    await page.goto(`${baseUrl}/CashTransactions/CustomerFinanceReport`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 15000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForSelector('h3:text-is("Customer Profit Report")');
    await page.waitForSelector('#CustomerDropDown.e-control');
    const financeScriptUrl = await page.evaluate(() => performance.getEntriesByType('resource')
        .map(item => item.name)
        .find(url => url.includes('/FrontEnd/Pages/CashTransactions/CustomerFinanceReport.cshtml.js')) || '');
    if (!/[?&]v=/.test(financeScriptUrl)) throw new Error(`Customer profit report script is not versioned: ${financeScriptUrl}`);
    const summaryValues = await page.locator('.card h4').evaluateAll(nodes => nodes.slice(0, 3).map(node => node.textContent.trim()));
    if (summaryValues.length !== 3 || summaryValues.some(value => !value)) {
        throw new Error(`Customer profit summary did not render: ${JSON.stringify(summaryValues)}`);
    }
    if (summaryValues[0] === '0' || summaryValues[1] === '0') {
        throw new Error(`Seeded actual received/project cost were not loaded: ${JSON.stringify(summaryValues)}`);
    }
    await page.locator('[data-language-switch="vi"]').click();
    await page.waitForSelector('h3:text-is("Báo Cáo Lợi Nhuận Khách Hàng")');
    await page.locator('[data-language-switch="en"]').click();
    await page.waitForSelector('h3:text-is("Customer Profit Report")');

    const unexpectedConsoleErrors = consoleErrors.filter(message =>
        !message.includes('Injected purchase panel failure') &&
        !message.startsWith('Dashboard purchase load error:') &&
        !message.includes('Failed to load resource: the server responded with a status of 500'));
    if (unexpectedConsoleErrors.length) throw new Error(`Unexpected Console errors: ${unexpectedConsoleErrors.join(' | ')}`);
    if (failedRequests.length) throw new Error(`Failed browser requests: ${failedRequests.join(' | ')}`);
    const expectedInjectedFailureObserved = apiResponses.some(item => item.startsWith('500 ') && item.includes('GetPurchaseDashboard'));
    if (!expectedInjectedFailureObserved) throw new Error('The isolated Dashboard failure scenario was not observed.');

    process.stdout.write(JSON.stringify({
        dashboardScriptUrl,
        financeScriptUrl,
        summaryValues,
        apiResponses,
        expectedInjectedFailureObserved,
        cashTransactionSummaryCards: 0,
        localizationRoundTrip: true
    }, null, 2));
    await browser.close();
})().catch(async error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
