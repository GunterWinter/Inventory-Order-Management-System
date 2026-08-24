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

        const fileName = `${String(index + 1).padStart(2, '0')}-${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}.png`;
        await page.screenshot({ path: path.join(evidenceDirectory, fileName), fullPage: true });
    }
});
