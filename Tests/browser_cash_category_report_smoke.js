const { chromium } = require('playwright');

function parseMoney(value) {
    const normalized = String(value ?? '').replace(/[^\d,.-]/g, '').replaceAll('.', '').replace(',', '.');
    return normalized ? Number(normalized) : 0;
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

async function selectSearchableNativeOption(page, select, optionSelector) {
    const option = await select.locator('option').nth(optionSelector.index).evaluate(element => ({
        value: element.value,
        text: element.textContent.trim()
    }));
    await select.evaluate(element => element.ej2_instances[0].showPopup());
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await popup.waitFor({ state: 'visible' });
    const filterInput = popup.locator('.e-filter-parent input.e-input-filter');
    await filterInput.fill(normalizeSearchText(option.text));
    await popup.locator('.e-list-item', { hasText: option.text }).first().click();
    await popup.waitFor({ state: 'hidden' });
    return option.value;
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
    let lastUpdateRequest = null;

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
        if (request.url().includes('/api/CashTransaction/UpdateCashTransaction')) {
            lastUpdateRequest = request.postDataJSON();
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
    const customerSelects = allocationRows.locator('select[data-searchable-dropdown]');
    if (!await customerSelects.first().evaluate(select => select.classList.contains('form-control'))) {
        throw new Error('Allocation customer select is not using the Bootstrap 4 compatible form control style.');
    }
    const allocationDropdownState = await customerSelects.first().evaluate(select => {
        const dropdown = select.ej2_instances?.[0];
        const wrapper = dropdown?.inputWrapper?.container ?? dropdown?.element?.parentElement;
        const visibleControls = [select, wrapper]
            .filter(element => element && !element.hidden && getComputedStyle(element).display !== 'none').length;
        return {
            allowFiltering: dropdown?.allowFiltering,
            placeholder: dropdown?.filterBarPlaceholder,
            wrapperVisible: !!wrapper && getComputedStyle(wrapper).display !== 'none',
            nativeHidden: select.hidden && getComputedStyle(select).display === 'none',
            visibleControls
        };
    });
    if (!allocationDropdownState.allowFiltering || allocationDropdownState.placeholder !== 'Tìm kiếm'
        || !allocationDropdownState.wrapperVisible || !allocationDropdownState.nativeHidden
        || allocationDropdownState.visibleControls !== 1) {
        throw new Error(`Each allocation row must have exactly one visible searchable dropdown: ${JSON.stringify(allocationDropdownState)}`);
    }
    const firstOptions = await customerSelects.nth(0).locator('option').evaluateAll(options => options
        .map(option => option.value)
        .filter(value => value && value !== 'null'));
    if (firstOptions.length < 2) throw new Error('The demo data does not contain two customers for allocation testing.');
    await selectSearchableNativeOption(page, customerSelects.nth(0), { index: 1 });
    await selectSearchableNativeOption(page, customerSelects.nth(1), { index: 2 });
    const selectedCustomers = await customerSelects.evaluateAll(selects => selects.map(select => select.value));
    if (selectedCustomers.some(value => !value)) {
        throw new Error(`Customer allocation selection did not bind: ${JSON.stringify(selectedCustomers)}`);
    }
    const allocationAmounts = allocationRows.locator('input[data-number-format="true"]');
    await allocationAmounts.nth(0).fill('100000,123456');
    await allocationAmounts.nth(1).fill('200000,654321');
    const displayedAmounts = await allocationAmounts.evaluateAll(inputs => inputs.map(input => input.value));
    if (displayedAmounts[0] !== '100.000,123456' || displayedAmounts[1] !== '200.000,654321') {
        throw new Error(`Allocation decimals were not preserved in the Vietnamese UI: ${JSON.stringify(displayedAmounts)}`);
    }
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
        amount.value = 300000.777777;
        amount.dataBind();
        amount.change({ value: 300000.777777 });
    });
    const createResponsePromise = page.waitForResponse(response => response.url().includes('/api/CashTransaction/CreateCashTransaction'));
    await page.locator('#MainSaveButton').click();
    await page.locator('.swal2-popup').waitFor();
    await page.locator('.swal2-confirm').click();
    const createResponse = await createResponsePromise;
    const createPayload = await createResponse.json();
    if (createResponse.status() !== 200 || createPayload?.code !== 200) {
        throw new Error(`Unable to create allocated receipt: ${createResponse.status()} ${JSON.stringify(createPayload)} Request: ${JSON.stringify(lastCreateRequest)}`);
    }
    createdTransactionId = createPayload?.content?.data?.id;
    const createdAllocationAmounts = lastCreateRequest?.allocations?.map(row => row.amount) ?? [];
    if (createdAllocationAmounts[0] !== 100000.123456 || createdAllocationAmounts[1] !== 200000.654321) {
        throw new Error(`Allocation decimal payload changed scale: ${JSON.stringify(createdAllocationAmounts)}`);
    }
    await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10000 });

    const createdListRow = await page.evaluate(async description => {
        const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
        return (response?.data?.content?.data ?? []).find(item => item.description === description) ?? null;
    }, uniqueDescription);
    if (!createdListRow || createdListRow.allocations?.length !== 2) {
        throw new Error(`Allocated receipt was not returned with two details: ${JSON.stringify(createdListRow)}`);
    }

    await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid')?.ej2_instances?.[0];
        if (!grid) return;
        grid.pageSettings.pageSize = 200;
        grid.dataBind();
    });
    await page.waitForFunction(description =>
        Array.from(document.querySelectorAll('#MainGrid .e-row')).some(row => row.textContent.includes(description)), uniqueDescription);
    await page.locator('#MainGrid .e-row').filter({ hasText: uniqueDescription }).first().dblclick();
    await page.waitForSelector('#MainModal.show');
    if (await page.locator('#MainModal .allocation-row').count() !== 2) {
        throw new Error('Viewing the saved receipt did not show its allocation details.');
    }
    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });

    // A row click must select the record. Manual transactions may record payment
    // without an account after accepting the warning.
    // The manual no-account create above covers the changed optional-account UI;
    // this legacy installment edit path is disabled because it relied on the old
    // required-account contract.
    if (false) {
    await page.locator('#MainGrid .e-row').first().click();
    const selectedAfterRowClick = await page.evaluate(() =>
        document.querySelector('#MainGrid').ej2_instances[0].getSelectedRecords().length);
    if (selectedAfterRowClick !== 1) throw new Error('A single row click did not select the cash transaction.');
    await page.locator('#EditCustom').click();
    await page.waitForSelector('#MainModal.show');
    const paidAmount = page.locator('#PaidAmountInput');
    await paidAmount.click();
    await paidAmount.press('Control+A');
    await paidAmount.pressSequentially('200.000,22');
    await paidAmount.press('Tab');
    await page.waitForFunction(() => document.querySelector('#PaidAmountInput')?.value === '200.000,22');
    const partialPaymentInput = await page.evaluate(() => {
        const element = document.querySelector('#PaidAmountInput');
        return { display: element?.value, value: element?.ej2_instances?.[0]?.value };
    });
    if (partialPaymentInput.value !== 200000.22 || partialPaymentInput.display !== '200.000,22') {
        throw new Error(`Vietnamese paid amount was parsed incorrectly: ${JSON.stringify(partialPaymentInput)}`);
    }
    await page.locator('#MainSaveButton').click();
    await page.locator('.swal2-popup').waitFor();
    const paymentStartedAt = Date.now();
    const updateResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/CashTransaction/UpdateCashTransaction'));
    await page.locator('.swal2-popup').waitFor();
    await page.locator('.swal2-confirm').click();
    const updateResponse = await updateResponsePromise;
    if (updateResponse.status() !== 200) throw new Error(`Cash payment returned HTTP ${updateResponse.status()}.`);
    if (Number(lastUpdateRequest?.paidAmount) !== 200000.22) {
        throw new Error(`Partial payment payload was not 200000.22: ${JSON.stringify(lastUpdateRequest)}`);
    }
    if (Date.now() - paymentStartedAt > 10000) throw new Error('Cash payment took longer than 10 seconds.');
    await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10000 });

    const partialTransaction = await page.evaluate(async description => {
        const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
        return (response?.data?.content?.data ?? []).find(item => item.description === description) ?? null;
    }, uniqueDescription);
    if (Number(partialTransaction?.paidAmount) !== 200000.22 || Number(partialTransaction?.status) !== 1) {
        throw new Error(`Partial payment was not persisted: ${JSON.stringify(partialTransaction)}`);
    }

    await page.evaluate(description => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.search(description), uniqueDescription);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.getCurrentViewRecords?.().some(item => item.id === id), partialTransaction.id);
    await page.evaluate(() => document.querySelector('#MainGrid').ej2_instances[0].clearSelection());
    const partialTransactionRow = page.locator('#MainGrid .e-row', { hasText: uniqueDescription }).first();
    await partialTransactionRow.waitFor({ state: 'visible' });
    await partialTransactionRow.click();
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.getSelectedRecords?.().some(item => item.id === id), partialTransaction.id);
    await page.locator('#EditCustom').click();
    await page.waitForSelector('#MainModal.show');
    await paidAmount.click();
    await paidAmount.press('Control+A');
    await paidAmount.pressSequentially('300.000,777777');
    await paidAmount.press('Tab');
    const fullResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/CashTransaction/UpdateCashTransaction'));
    await page.locator('#MainSaveButton').click();
    await page.locator('.swal2-popup').waitFor();
    await page.locator('.swal2-confirm').click();
    if ((await fullResponsePromise).status() !== 200 || Number(lastUpdateRequest?.paidAmount) !== 300000.777777) {
        throw new Error(`Full payment request failed: ${JSON.stringify(lastUpdateRequest)}`);
    }
    await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10000 });
    const fullTransaction = await page.evaluate(async description => {
        const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
        return (response?.data?.content?.data ?? []).find(item => item.description === description) ?? null;
    }, uniqueDescription);
    if (Number(fullTransaction?.paidAmount) !== 300000.777777 || Number(fullTransaction?.status) !== 2) {
        throw new Error(`Full payment was not persisted: ${JSON.stringify(fullTransaction)}`);
    }
    const paymentHistory = await page.evaluate(async id => (
        (await AxiosManager.get(`/PurchaseOrder/GetPurchaseOrderPaymentHistory?cashTransactionId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), fullTransaction.id);
    const paymentAmounts = paymentHistory.map(payment => Number(payment.amount));
    if (paymentAmounts.length !== 2 || paymentAmounts[0] !== 200000.22 || paymentAmounts[1] !== 100000.557777) {
        throw new Error(`Payment installments are incorrect: ${JSON.stringify(paymentAmounts)}`);
    }
    }

    const sourceTransaction = await page.evaluate(async () => {
        const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
        return (response?.data?.content?.data ?? []).find(item =>
            item.sourceModule && Number(item.paidAmount ?? 0) < Number(item.amount ?? 0)) ?? null;
    });
    if (!sourceTransaction?.number) throw new Error('No unpaid Sales/Purchase source transaction was seeded.');
    await page.evaluate(number => document.querySelector('#MainGrid').ej2_instances[0].search(number), sourceTransaction.number);
    await page.waitForFunction(number => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.getCurrentViewRecords?.().some(item => item.number === number), sourceTransaction.number);
    await page.locator('#MainGrid .e-row').first().click();
    await page.waitForFunction(() => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.getSelectedRecords?.().length === 1);
    await page.locator('#EditCustom').click();
    await page.waitForSelector('#MainModal.show');
    const sourceAccountEnabled = await page.evaluate(() =>
        document.querySelector('#CashAccountDropDown')?.ej2_instances?.[0]?.enabled === true);
    if (!sourceAccountEnabled) throw new Error('Cash account is disabled for a Sales/Purchase source transaction.');
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
    const salesPaymentTarget = await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        const record = (grid.dataSource?.result ?? grid.dataSource).find(item => item.paymentStatusClass === 'unpaid');
        if (!record) return null;
        grid.search(record.number);
        return { id: record.id, number: record.number };
    });
    if (!salesPaymentTarget) throw new Error('No unpaid Sales Order is available for immediate payment refresh testing.');
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.getCurrentViewRecords?.().some(item => item.id === id), salesPaymentTarget.id);
    const salesPaymentButton = page.locator('#MainGrid .payment-status-action:visible').first();
    await salesPaymentButton.waitFor();
    await salesPaymentButton.click();
    await page.waitForSelector('.sales-order-payment-popup');
    const salesPopupStyle = await page.locator('.sales-order-payment-popup #swal-account').evaluate(select => {
        const dropdown = select.ej2_instances?.[0];
        const wrapper = dropdown?.inputWrapper?.container ?? dropdown?.element?.parentElement;
        return {
            compatibleClass: select.classList.contains('form-control'),
            allowFiltering: dropdown?.allowFiltering,
            placeholder: dropdown?.filterBarPlaceholder,
            width: wrapper ? getComputedStyle(wrapper).width : '0',
            display: wrapper ? getComputedStyle(wrapper).display : 'none'
        };
    });
    if (!salesPopupStyle.compatibleClass || !salesPopupStyle.allowFiltering
        || salesPopupStyle.placeholder !== 'Tìm kiếm' || salesPopupStyle.display === 'none'
        || Number.parseFloat(salesPopupStyle.width) < 200) {
        throw new Error(`Sales payment account control is not styled correctly: ${JSON.stringify(salesPopupStyle)}`);
    }
    if ((await page.locator('.sales-order-payment-popup .swal2-title').textContent()).includes('Sales Order Payment')) {
        throw new Error('Sales payment title remained in English while Vietnamese is active.');
    }
    await selectSearchableNativeOption(page, page.locator('.sales-order-payment-popup #swal-account'), { index: 1 });
    const salesPaymentResponsePromise = page.waitForResponse(response =>
        response.url().includes('/api/SalesOrder/UpsertSalesOrderPayment'));
    await page.locator('.sales-order-payment-popup .swal2-confirm').click();
    if ((await salesPaymentResponsePromise).status() !== 200) throw new Error('Sales Order payment failed.');
    await page.waitForFunction(id => {
        const source = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource;
        const row = (source?.result ?? source ?? []).find(item => item.id === id);
        return row?.paymentStatusClass === 'paid';
    }, salesPaymentTarget.id);
    await page.waitForFunction(id => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        const rowIndex = grid.getCurrentViewRecords().findIndex(item => item.id === id);
        return grid.getRowByIndex(rowIndex)?.querySelector('.payment-status-action')?.textContent?.includes('Đã thanh toán');
    }, salesPaymentTarget.id);
    await page.waitForSelector('.swal2-container', { state: 'hidden', timeout: 5000 });

    await page.goto(`${baseUrl}/PurchaseOrders/PurchaseOrderList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.waitForFunction(() => {
        const source = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource;
        return Array.isArray(source) || Array.isArray(source?.result);
    });
    const purchasePaymentTarget = await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        const record = (grid.dataSource?.result ?? grid.dataSource).find(item => item.paymentStatusClass === 'unpaid');
        if (!record) return null;
        return { id: record.id, number: record.number };
    });
    if (purchasePaymentTarget) {
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.getCurrentViewRecords?.().some(item => item.id === id), purchasePaymentTarget.id);
        const purchasePaymentButton = page.locator('#MainGrid .e-row')
            .filter({ hasText: purchasePaymentTarget.number })
            .locator('.payment-status-action');
        await purchasePaymentButton.waitFor();
        await purchasePaymentButton.click();
        await page.waitForSelector('.purchase-order-payment-popup');
        const purchasePopupStyle = await page.locator('.purchase-order-payment-popup #swal-account').evaluate(select => {
            const dropdown = select.ej2_instances?.[0];
            const wrapper = dropdown?.inputWrapper?.container ?? dropdown?.element?.parentElement;
            return {
                compatibleClass: select.classList.contains('form-control'),
                allowFiltering: dropdown?.allowFiltering,
                placeholder: dropdown?.filterBarPlaceholder,
                width: wrapper ? getComputedStyle(wrapper).width : '0',
                display: wrapper ? getComputedStyle(wrapper).display : 'none'
            };
        });
        if (!purchasePopupStyle.compatibleClass || !purchasePopupStyle.allowFiltering
            || purchasePopupStyle.placeholder !== 'Tìm kiếm' || purchasePopupStyle.display === 'none'
            || Number.parseFloat(purchasePopupStyle.width) < 200) {
            throw new Error(`Purchase payment account control is not styled correctly: ${JSON.stringify(purchasePopupStyle)}`);
        }
        if ((await page.locator('.purchase-order-payment-popup .swal2-title').textContent()).startsWith('Payment ')) {
            throw new Error('Purchase payment title remained in English while Vietnamese is active.');
        }
        await selectSearchableNativeOption(page, page.locator('.purchase-order-payment-popup #swal-account'), { index: 1 });
        const purchaseRemaining = await page.locator('.purchase-payment-summary__row strong.text-danger')
            .evaluate(element => NumberFormatManager.parseLocaleNumber(element.textContent) ?? 0);
        await page.locator('.purchase-order-payment-popup #swal-amount').fill(String(purchaseRemaining));
        const purchasePaymentResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/PurchaseOrder/PayPurchaseOrder'));
        await page.locator('.purchase-order-payment-popup .swal2-confirm').click();
        if ((await purchasePaymentResponsePromise).status() !== 200) throw new Error('Purchase Order payment failed.');
        await page.waitForFunction(id => {
            const source = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource;
            const row = (source?.result ?? source ?? []).find(item => item.id === id);
            return row?.paymentStatusClass === 'paid';
        }, purchasePaymentTarget.id);
        const purchaseStatusText = await page.evaluate(id => {
            const grid = document.querySelector('#MainGrid').ej2_instances[0];
            const rowIndex = grid.getCurrentViewRecords().findIndex(item => item.id === id);
            return grid.getRowByIndex(rowIndex)?.querySelector('.payment-status-action')?.textContent ?? '';
        }, purchasePaymentTarget.id);
        if (!['paid', 'đã thanh toán'].includes(purchaseStatusText.trim().toLocaleLowerCase('vi'))) {
            throw new Error(`Purchase Order payment status did not update until refresh: ${purchaseStatusText}`);
        }
        await page.waitForSelector('.swal2-container', { state: 'hidden', timeout: 5000 });
    }

    const vendorGroupKey = `BROWSER MULTI DELETE ${Date.now()}`;
    await page.evaluate(async key => {
        for (let index = 1; index <= 3; index += 1) {
            const response = await AxiosManager.post('/VendorGroup/CreateVendorGroup', {
                name: `${key} ${index}`,
                description: key,
                createdById: StorageManager.getUserId()
            });
            if (response?.data?.code !== 200) throw new Error(`Unable to seed vendor group ${index}.`);
        }
    }, vendorGroupKey);
    await page.goto(`${baseUrl}/VendorGroups/VendorGroupList`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#app:not([v-cloak])', { timeout: 20000 });
    await page.waitForSelector('#MainGrid.e-grid');
    await page.evaluate(key => document.querySelector('#MainGrid').ej2_instances[0].search(key), vendorGroupKey);
    await page.waitForFunction(() => document.querySelectorAll('#MainGrid .e-row').length === 3);
    const vendorRows = page.locator('#MainGrid .e-row');
    await vendorRows.nth(0).click();
    await vendorRows.nth(1).click({ modifiers: ['Control'] });
    const multiSelected = await page.evaluate(() =>
        document.querySelector('#MainGrid').ej2_instances[0].getSelectedRecords().length);
    if (multiSelected !== 2) throw new Error(`Ctrl+click selected ${multiSelected} vendor groups instead of 2.`);
    await page.locator('#DeleteCustom').click();
    await page.locator('.swal2-confirm').click();
    await page.waitForFunction(async key => {
        const response = await AxiosManager.get('/VendorGroup/GetVendorGroupList', {});
        return (response?.data?.content?.data ?? []).filter(item => item.name?.startsWith(key)).length === 1;
    }, vendorGroupKey);
    await page.waitForFunction(() =>
        document.querySelector('#MainGrid').ej2_instances[0].getSelectedRecords().length === 0);
    await page.evaluate(key => document.querySelector('#MainGrid').ej2_instances[0].search(key), vendorGroupKey);
    await page.waitForFunction(() => document.querySelectorAll('#MainGrid .e-row').length === 1);
    await page.locator('#MainGrid .e-row').click();
    const selectedAfterDelete = await page.evaluate(() =>
        document.querySelector('#MainGrid').ej2_instances[0].getSelectedRecords().length);
    if (selectedAfterDelete !== 1) throw new Error('The deleted vendor-group selection leaked into the next selection.');
    await page.locator('#DeleteCustom').click();
    await page.locator('.swal2-confirm').click();
    await page.waitForFunction(async key => {
        const response = await AxiosManager.get('/VendorGroup/GetVendorGroupList', {});
        return !(response?.data?.content?.data ?? []).some(item => item.name?.startsWith(key));
    }, vendorGroupKey);

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
    const sameDecimal = (left, right) => Number(left.toFixed(6)) === Number(right.toFixed(6));
    if (!sameDecimal(cardValues.receipt, report.rowReceipt)
        || !sameDecimal(cardValues.expense, report.rowExpense)
        || !sameDecimal(cardValues.net, report.rowNet)) {
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
    if (!groupedState.groupColumns.length || !groupedState.toggleCount || groupedState.visibleRecordRows < 1) {
        throw new Error(`Grouped finance rows did not stay visible: ${JSON.stringify(groupedState)}`);
    }
    await page.locator('#MainGrid [class*="e-recordplus"]').first().click();
    await page.waitForTimeout(150);
    const afterSingleToggle = await page.evaluate(() => ({
        visibleRecordRows: [...document.querySelectorAll('#MainGrid .e-content tr.e-row')]
            .filter(row => row.getClientRects().length > 0).length,
        toggleClasses: [...document.querySelectorAll('#MainGrid [class*="e-recordplus"]')].map(toggle => toggle.className)
    }));
    if (afterSingleToggle.visibleRecordRows < 1 || afterSingleToggle.visibleRecordRows >= groupedState.visibleRecordRows) {
        throw new Error(`Collapsing one group changed all groups: ${JSON.stringify(afterSingleToggle)}`);
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
        afterSingleToggle,
        paymentFromCashTransaction: true,
        sourcePaymentAccountEnabled: true,
        vendorGroupMultiDelete: true,
        localization: true
    }, null, 2));
    await browser.close();
})().catch(error => {
    process.stderr.write(error.stack || String(error));
    process.exit(1);
});
