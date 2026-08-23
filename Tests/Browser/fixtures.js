const { test: base, expect } = require('@playwright/test');

const test = base.extend({
    monitoredPage: async ({ page, baseURL }, use, testInfo) => {
        const errors = [];
        const origin = new URL(baseURL).origin;

        page.on('pageerror', error => errors.push(`JavaScript: ${error.stack || error.message}`));
        page.on('console', message => {
            if (message.type() === 'error') {
                errors.push(`Console: ${message.text()} @ ${message.location()?.url || 'unknown'}`);
            }
        });
        page.on('requestfailed', request => {
            const url = new URL(request.url());
            if (url.origin === origin) {
                errors.push(`Request failed: ${url.pathname} :: ${request.failure()?.errorText || 'unknown'}`);
            }
        });
        page.on('response', response => {
            const url = new URL(response.url());
            if (url.origin === origin && response.status() >= 400) {
                errors.push(`HTTP ${response.status()}: ${url.pathname}`);
            }
        });

        await use(page);

        if (errors.length) {
            await testInfo.attach('browser-errors', {
                body: Buffer.from(errors.join('\n'), 'utf8'),
                contentType: 'text/plain'
            });
        }
        expect(errors, 'Browser phải không có lỗi console, request hoặc HTTP ngoài dự kiến.').toEqual([]);
    }
});

async function login(page) {
    await page.goto('/Accounts/Login', { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit' });
    await page.waitForFunction(() => Boolean(window.UiLocalization?.setLocale));
    await page.evaluate(() => window.UiLocalization.setLocale('en'));
}

async function waitForVuePage(page) {
    await page.waitForSelector('#app:not([v-cloak])');
}

async function selectOpenDropdownOption(page, text) {
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await popup.waitFor({ state: 'visible' });
    await popup.locator('.e-list-item', { hasText: text }).first().click();
}

async function openSelectedDocument(page, gridSelector, documentId, actionId = 'EditCustom') {
    await page.evaluate(async ({ gridSelector, documentId, actionId }) => {
        const grid = document.querySelector(gridSelector)?.ej2_instances?.[0];
        const record = grid?.dataSource?.find?.(item => item.id === documentId);
        if (!grid || !record) throw new Error(`Không tìm thấy chứng từ ${documentId}.`);
        const original = grid.getSelectedRecords;
        grid.getSelectedRecords = () => [record];
        try {
            await grid.toolbarClick({ item: { id: actionId } });
        } finally {
            grid.getSelectedRecords = original;
        }
    }, { gridSelector, documentId, actionId });
}

module.exports = { test, expect, login, waitForVuePage, selectOpenDropdownOption, openSelectedDocument };
