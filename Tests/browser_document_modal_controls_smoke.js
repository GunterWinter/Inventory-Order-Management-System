const { chromium } = require('playwright');

const baseUrl = process.env.BASE_URL || 'http://localhost:5000';

async function login(page) {
    await page.goto(`${baseUrl}/Accounts/Login`, { waitUntil: 'domcontentloaded' });
    await page.locator('#Email').fill('admin@root.com');
    await page.locator('#Password').fill('123456');
    await page.locator('button[type="submit"]').click({ noWaitAfter: true });
    await page.waitForURL('**/Dashboards/DefaultDashboard', { waitUntil: 'commit', timeout: 15000 });
}

async function openDocumentPage(page, pagePath) {
    await page.goto(`${baseUrl}${pagePath}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForSelector('#SecondaryGrid.e-grid', { state: 'attached' });
    await page.waitForFunction(() => {
        const grid = document.querySelector('#MainGrid')?.ej2_instances?.[0];
        const secondaryGrid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
        return grid && secondaryGrid && Array.isArray(grid.dataSource);
    });
}

async function openAddModal(page) {
    await page.evaluate(async () => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        await grid.toolbarClick({ item: { id: 'AddCustom' } });
    });
    await page.waitForSelector('#MainModal.show');
}

async function setLocale(page, locale) {
    await page.goto(`${baseUrl}/Dashboards/DefaultDashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(window.UiLocalization?.getLocale));
    await page.locator(`[data-language-switch="${locale}"]`).click();
    await page.waitForFunction(expectedLocale => (
        window.UiLocalization?.getLocale?.() === expectedLocale
        && document.documentElement.lang === expectedLocale
    ), locale);
}

async function assertDatePickerUsable(page, pageName, locale) {
    const input = page.locator('#MainModal .e-datepicker').first();
    await input.waitFor();
    const beforeSelection = await input.evaluate(element => {
        const picker = element.ej2_instances?.[0];
        return {
            timestamp: picker?.value instanceof Date ? picker.value.getTime() : null,
            format: picker?.format,
            uiLocale: window.UiLocalization?.getLocale?.()
        };
    });
    const expectedFormat = locale === 'vi' ? 'dd/MM/yyyy' : 'MM/dd/yyyy';
    if (beforeSelection.uiLocale !== locale || beforeSelection.format !== expectedFormat) {
        throw new Error(`${pageName} date picker did not adopt ${locale}: ${JSON.stringify(beforeSelection)}`);
    }

    await input.locator('xpath=..').locator('.e-date-icon').click();

    const popup = page.locator('body > .e-popup.e-popup-open').filter({ has: page.locator('.e-calendar') }).last();
    await popup.waitFor();
    const stacking = await popup.evaluate(element => ({
        popup: Number.parseInt(getComputedStyle(element).zIndex, 10) || 0,
        modal: Number.parseInt(getComputedStyle(document.querySelector('#MainModal')).zIndex, 10) || 0
    }));
    if (stacking.popup <= stacking.modal) {
        throw new Error(`${pageName} date picker is behind the document modal: ${JSON.stringify(stacking)}`);
    }

    const selectableDate = popup.locator('td.e-cell:not(.e-disabled):not(.e-other-month):not(.e-selected)').first();
    await selectableDate.click();

    await page.waitForFunction(previousTimestamp => {
        const element = document.querySelector('#MainModal .e-datepicker');
        const value = element?.ej2_instances?.[0]?.value;
        return value instanceof Date
            && !Number.isNaN(value.getTime())
            && value.getTime() !== previousTimestamp;
    }, beforeSelection.timestamp);
    const selectedValue = await input.inputValue();
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(selectedValue)) {
        throw new Error(`${pageName} date picker did not update the document date in ${expectedFormat}: ${selectedValue}`);
    }
}

async function openEditableDocument(page) {
    const draft = await page.evaluate(async () => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        grid.groupSettings = { ...grid.groupSettings, columns: [] };
        grid.dataBind();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const rows = grid.getCurrentViewRecords();
        const rowIndex = rows.findIndex(row => String(row.orderStatus) === '0');
        if (rowIndex < 0) return null;
        const draft = rows[rowIndex];
        const getSelectedRecords = grid.getSelectedRecords;
        grid.getSelectedRecords = () => [draft];
        try {
            await grid.toolbarClick({ item: { id: 'EditCustom' } });
        } finally {
            grid.getSelectedRecords = getSelectedRecords;
        }
        return { id: draft.id };
    });

    if (!draft?.id) throw new Error('No seeded draft document was available for Item grid testing.');
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await page.waitForFunction(() => {
        const grid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
        return grid && Array.isArray(grid.dataSource) && grid.dataSource.length > 0;
    });
}

async function assertItemGridUsable(page, pageName) {
    const layout = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const contents = [...grid.element.querySelectorAll('.e-content')]
            .filter(element => getComputedStyle(element).display !== 'none');
        const scroller = contents.find(element => element.scrollWidth > element.clientWidth + 1);
        const before = scroller?.scrollLeft ?? 0;
        if (scroller) {
            scroller.scrollLeft = Math.min(160, scroller.scrollWidth - scroller.clientWidth);
            scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
        }

        return {
            expectedRows: grid.getCurrentViewRecords().length,
            renderedRows: grid.element.querySelectorAll('.e-content tbody tr.e-row').length,
            hasFrozenContent: Boolean(grid.element.querySelector('.e-frozencontent, .e-rightfreeze')),
            canScrollHorizontally: Boolean(scroller && scroller.scrollLeft !== before),
            scrollWidth: scroller?.scrollWidth ?? 0,
            clientWidth: scroller?.clientWidth ?? 0
        };
    });

    if (layout.hasFrozenContent || layout.renderedRows < layout.expectedRows || !layout.canScrollHorizontally) {
        throw new Error(`${pageName} Item grid is clipped or cannot scroll: ${JSON.stringify(layout)}`);
    }

    await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        grid.editCell(0, 'productId');
    });
    // Resolve, open and measure the current editor in one browser task. During a
    // Batch rebind Syncfusion can replace the input or popup between separate calls.
    const popupStateHandle = await page.waitForFunction(() => {
        const editor = document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')
            ?.ej2_instances?.[0];
        if (!editor || editor.isDestroyed) return false;
        editor.showPopup();
        const popup = editor.popupObj?.element;
        if (!popup?.classList.contains('e-popup-open')) return false;

        const popupState = {
            items: popup.querySelectorAll('.e-list-item').length,
            popupZIndex: Number.parseInt(getComputedStyle(popup).zIndex, 10) || 0,
            modalZIndex: Number.parseInt(getComputedStyle(document.querySelector('#MainModal')).zIndex, 10) || 0
        };
        return popupState.items > 0 && popupState.popupZIndex > popupState.modalZIndex
            ? popupState
            : false;
    });
    const popupState = await popupStateHandle.jsonValue();
    if (!popupState.items || popupState.popupZIndex <= popupState.modalZIndex) {
        throw new Error(`${pageName} Item dropdown is hidden behind the modal: ${JSON.stringify(popupState)}`);
    }
}

(async () => {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
    const consoleErrors = [];
    const pageErrors = [];
    const failedRequests = [];
    const serverErrors = [];

    page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', error => pageErrors.push(error.stack || error.message));
    page.on('requestfailed', request => {
        if (request.url().startsWith(baseUrl)) failedRequests.push(`${request.url()} :: ${request.failure()?.errorText}`);
    });
    page.on('response', response => {
        if (response.url().startsWith(baseUrl) && response.status() >= 400) {
            serverErrors.push(`${response.status()} ${response.url()}`);
        }
    });

    try {
        await login(page);
        for (const [pageName, pagePath] of [
            ['Sales Order', '/SalesOrders/SalesOrderList'],
            ['Purchase Order', '/PurchaseOrders/PurchaseOrderList']
        ]) {
            for (const locale of ['en', 'vi']) {
                await setLocale(page, locale);
                await openDocumentPage(page, pagePath);
                await openAddModal(page);
                await assertDatePickerUsable(page, pageName, locale);
                await page.locator('#MainModal .btn-close').click();
                await page.waitForSelector('#MainModal', { state: 'hidden' });
            }

            await setLocale(page, 'en');
            await openDocumentPage(page, pagePath);
            await openEditableDocument(page);
            await assertItemGridUsable(page, pageName);
        }

        if (consoleErrors.length) throw new Error(`Console errors: ${consoleErrors.join('\n')}`);
        if (pageErrors.length) throw new Error(`Page errors: ${pageErrors.join('\n')}`);
        if (failedRequests.length) throw new Error(`Failed requests: ${failedRequests.join('\n')}`);
        if (serverErrors.length) throw new Error(`HTTP errors: ${serverErrors.join('\n')}`);
        console.log('Document modal controls browser smoke test passed.');
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exit(1);
});
