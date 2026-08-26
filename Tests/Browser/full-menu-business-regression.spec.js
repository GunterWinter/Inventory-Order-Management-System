const { test, expect, login } = require('./fixtures');
const fs = require('node:fs');
const path = require('node:path');

async function expandMenu(page) {
    for (let pass = 0; pass < 100; pass += 1) {
        const icons = page.locator('#mainMenu .e-icon-expandable:visible');
        if (await icons.count() === 0) return;
        await icons.first().click({ force: true });
        await page.waitForTimeout(40);
    }
}

async function waitForPage(page) {
    await page.waitForLoadState('domcontentloaded');
    if (await page.locator('#app').count()) {
        await page.locator('#app:not([v-cloak])').waitFor({ state: 'attached' });
    }
    await expect(page.locator('body')).not.toContainText('Invalid Date');
    await expect(page.locator('body')).not.toContainText('[object Object]');
    await expect(page.locator('#DashboardBootError:visible, #app > .alert-danger:visible')).toHaveCount(0);
}

test('every authorized sidebar page renders through real browser navigation with screenshot evidence', async ({ monitoredPage: page }, testInfo) => {
    test.setTimeout(600_000);
    await login(page, 'vi');
    await waitForPage(page);
    await expandMenu(page);

    const routes = await page.locator('#mainMenu a[href]').evaluateAll(links => [...new Set(links
        .map(link => new URL(link.href).pathname)
        .filter(route => route && route !== '/' && !route.startsWith('/Accounts/')))]);
    expect(routes.length, 'The full-menu gate must discover the authorized application menu.').toBeGreaterThan(10);

    const evidenceDirectory = process.env.BROWSER_EVIDENCE_DIR || testInfo.outputPath('full-menu');
    fs.mkdirSync(evidenceDirectory, { recursive: true });

    for (const [index, route] of routes.entries()) {
        await expandMenu(page);
        const link = page.locator(`#mainMenu a[href="${route}"]`).first();
        await link.scrollIntoViewIfNeeded();
        await expect(link, `Sidebar route ${route} must be visible and clickable.`).toBeVisible();
        await link.click();
        await page.waitForURL(url => url.pathname === route);
        await waitForPage(page);

        const mainGrid = page.locator('#MainGrid.e-grid:visible');
        if (await mainGrid.count()) {
            await expect.poll(() => mainGrid.evaluate(element => {
                const grid = element.ej2_instances?.[0];
                const content = element.querySelector('.e-gridcontent');
                const footer = document.querySelector('.main-footer, footer');
                const footerHeight = footer?.getBoundingClientRect?.().height ?? 0;
                return {
                    contentHeight: content?.getBoundingClientRect?.().height ?? 0,
                    bottomGap: window.innerHeight - footerHeight - element.getBoundingClientRect().bottom,
                    configuredHeight: Number(grid?.height ?? 0)
                };
            })).toMatchObject({
                contentHeight: expect.any(Number),
                bottomGap: expect.any(Number),
                configuredHeight: expect.any(Number)
            });
            const gridMetrics = await mainGrid.evaluate(element => {
                const grid = element.ej2_instances?.[0];
                const content = element.querySelector('.e-gridcontent');
                const footer = document.querySelector('.main-footer, footer');
                const footerHeight = footer?.getBoundingClientRect?.().height ?? 0;
                return {
                    contentHeight: content?.getBoundingClientRect?.().height ?? 0,
                    bottomGap: window.innerHeight - footerHeight - element.getBoundingClientRect().bottom,
                    configuredHeight: Number(grid?.height ?? 0)
                };
            });
            expect(gridMetrics.contentHeight, `${route} grid content must use the remaining viewport.`).toBeGreaterThanOrEqual(250);
            expect(gridMetrics.configuredHeight, `${route} grid must receive a viewport height.`).toBeGreaterThanOrEqual(250);
            expect(Math.abs(gridMetrics.bottomGap), `${route} grid must end near the viewport footer.`).toBeLessThanOrEqual(80);
        }

        const fileName = `${String(index + 1).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.png`;
        await page.screenshot({ path: path.join(evidenceDirectory, fileName), fullPage: true });
    }
});

test('cash allocation renders exactly one searchable customer control per row', async ({ monitoredPage: page }) => {
    await login(page, 'vi');
    await page.goto('/CashTransactions/CashTransactionList', { waitUntil: 'domcontentloaded' });
    await waitForPage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');

    const detailsButton = page.locator('#MainModal button').filter({ hasText: /Chi tiết phân bổ/i }).first();
    if (await detailsButton.isVisible()) await detailsButton.click();
    const addRowButton = page.locator('#MainModal .allocation-panel__header button');
    await addRowButton.click();
    await expect(page.locator('#MainModal .allocation-row')).toHaveCount(1);
    await expect.poll(() => page.locator('#MainModal .allocation-row .app-searchable-native-dropdown:visible').count()).toBe(1);
    await expect(page.locator('#MainModal .allocation-row select[data-searchable-dropdown]:visible')).toHaveCount(0);

    await page.locator('#MainModal .allocation-remove-button').click();
    await expect(page.locator('#MainModal .allocation-row')).toHaveCount(0);
});
