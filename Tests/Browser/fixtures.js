const { test: base, expect } = require('@playwright/test');

const test = base.extend({
    monitoredPage: async ({ page, baseURL }, use, testInfo) => {
        const errors = [];
        const expectedHttpErrors = [];
        const origin = new URL(baseURL).origin;
        page.expectHttpError = (path, status = null) => expectedHttpErrors.push({ path, status });

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
                const expectedIndex = expectedHttpErrors.findIndex(item => url.pathname.includes(item.path)
                    && (item.status === null || item.status === response.status()));
                if (expectedIndex >= 0) expectedHttpErrors.splice(expectedIndex, 1);
                else errors.push(`HTTP ${response.status()}: ${url.pathname}`);
            }
        });

        await use(page);

        if (expectedHttpErrors.length) errors.push(`Expected HTTP error did not occur: ${JSON.stringify(expectedHttpErrors)}`);
        if (errors.length) {
            await testInfo.attach('browser-errors', {
                body: Buffer.from(errors.join('\n'), 'utf8'),
                contentType: 'text/plain'
            });
        }
        expect(errors, 'Browser phải không có lỗi console, request hoặc HTTP ngoài dự kiến.').toEqual([]);
    }
});

async function login(page, locale = 'en') {
    await page.goto('/Accounts/Login', { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit' });
    await page.waitForFunction(() => Boolean(window.UiLocalization?.setLocale));
    await page.evaluate(value => window.UiLocalization.setLocale(value), locale);
}

async function waitForVuePage(page) {
    await page.waitForSelector('#app:not([v-cloak])');
}

async function selectOpenDropdownOption(page, text) {
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await popup.waitFor({ state: 'visible' });
    await popup.locator('.e-list-item', { hasText: text }).first().click();
    await popup.waitFor({ state: 'hidden' });
}

async function openSelectedDocument(page, gridSelector, documentId, actionId = 'EditCustom') {
    const rowIndex = await page.evaluate(({ gridSelector, documentId }) => {
        const grid = document.querySelector(gridSelector)?.ej2_instances?.[0];
        const record = grid?.dataSource?.find?.(item => item.id === documentId);
        if (!grid || !record) return -1;
        return grid.getRowIndexByPrimaryKey?.(documentId)
            ?? grid.dataSource.findIndex(item => item.id === documentId);
    }, { gridSelector, documentId });
    if (rowIndex < 0) throw new Error(`Không tìm thấy chứng từ ${documentId}.`);

    const row = page.locator(`${gridSelector} .e-content tr.e-row`).nth(rowIndex);
    await expect(row).toBeVisible();
    await row.locator('td.e-rowcell').first().click();
    await expect(page.locator(`#${actionId}`)).toBeEnabled();
    const actionButton = page.locator(`#${actionId}`);
    await actionButton.locator('xpath=..').evaluate(element => element.click());
    if (!await page.locator('#MainModal.show').isVisible().catch(() => false)) {
        await page.evaluate(async ({ selector, id }) => {
            const grid = document.querySelector(selector)?.ej2_instances?.[0];
            await grid?.toolbarClick?.({ item: { id } });
        }, { selector: gridSelector, id: actionId });
    }
}

module.exports = { test, expect, login, waitForVuePage, selectOpenDropdownOption, openSelectedDocument };
