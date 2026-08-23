const { test, expect, login, waitForVuePage } = require('./fixtures');

const reportRoutes = [
    '/StockReports/StockReportList',
    '/MovementReports/MovementReportList',
    '/VendorDebtReports/VendorDebtReportList'
];

test('ERP shell không tràn ngang và modal Thu chi giữ footer trong viewport', async ({ monitoredPage: page }) => {
    await login(page);

    for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(viewport);
        for (const route of [...reportRoutes, '/Products/ProductList', '/SalesOrders/SalesOrderList', '/PurchaseOrders/PurchaseOrderList']) {
            await page.goto(route, { waitUntil: 'domcontentloaded' });
            await waitForVuePage(page);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
            expect(overflow, `${route} không được làm body tràn ngang tại ${viewport.width}px`).toBeLessThanOrEqual(1);
        }
    }

    await page.goto('/CashTransactions/CashTransactionList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(() => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.getCurrentViewRecords?.().length > 0);
    await page.locator('#MainGrid .e-row').first().click();
    await page.locator('#ViewCustom').click();
    await page.waitForSelector('#MainModal.show');
    await expect(page.locator('#MainModal .modal-footer')).toBeInViewport();

    for (const route of reportRoutes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await expect(page.locator('#app > .row > .col-12 > .alert-info')).toHaveCount(0);
    }
});
