const {
    test,
    expect,
    login,
    waitForVuePage,
    openSelectedDocument
} = require('./fixtures');

const dataOf = response => response?.data?.content?.data ?? [];

async function enterDate(page, displayDate) {
    const dateInput = page.locator('#TransactionDatePicker');
    await expect(dateInput).toBeEnabled();
    await dateInput.click();
    await dateInput.press('Control+A');
    await dateInput.pressSequentially(displayDate);
    await dateInput.press('Tab');
    await expect(dateInput).toHaveValue(displayDate);
}

async function enterPaidAmount(page, amount) {
    const paidAmountInput = page.locator('#PaidAmountInput');
    await paidAmountInput.click();
    await paidAmountInput.press('Control+A');
    await paidAmountInput.pressSequentially(new Intl.NumberFormat('vi-VN').format(amount));
    await paidAmountInput.press('Tab');
}

async function selectCashAccount(page, accountName) {
    const accountInput = page.locator('#MainModal label[for="CashAccount"]')
        .locator('xpath=..')
        .locator('input.e-input')
        .first();
    await accountInput.locator('xpath=..').click();
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await expect(popup).toBeVisible();
    await popup.locator('.e-list-item').filter({ hasText: accountName }).first().click();
    await expect(popup).toBeHidden();
}

test('Cash Transaction cho sửa ngày giao dịch ở trạng thái chưa, một phần và đã thanh toán', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    await page.goto('/CashTransactions/CashTransactionList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForSelector('#MainGrid.e-grid');

    const fixture = await page.evaluate(async () => {
        const [cashResponse, accountResponse] = await Promise.all([
            AxiosManager.get('/CashTransaction/GetCashTransactionList', {}),
            AxiosManager.get('/CashAccount/GetCashAccountList', {})
        ]);
        const transactions = cashResponse?.data?.content?.data ?? [];
        const accounts = accountResponse?.data?.content?.data ?? [];
        const transaction = transactions.find(item => item.sourceModule
            && Number(item.paidAmount ?? 0) === 0
            && Number.isInteger(Number(item.amount))
            && Number(item.amount) > 2);
        return {
            transaction: transaction ? {
                id: transaction.id,
                amount: Number(transaction.amount),
                number: transaction.number
            } : null,
            account: accounts[0] ? { id: accounts[0].id, name: accounts[0].name } : null
        };
    });

    expect(fixture.transaction, 'Cần một giao dịch sinh từ chứng từ nguồn đang chưa thanh toán.').not.toBeNull();
    expect(fixture.account, 'Cần một tài khoản quỹ để chuyển qua trạng thái thanh toán.').not.toBeNull();

    const cases = [
        {
            status: /Chưa thanh toán|Unpaid/i,
            displayDate: '20/08/2026',
            apiDate: '2026-08-20',
            paidAmount: 0
        },
        {
            status: /Thanh toán một phần|Partially Paid/i,
            displayDate: '21/08/2026',
            apiDate: '2026-08-21',
            paidAmount: Math.floor(fixture.transaction.amount / 2)
        },
        {
            status: /Đã thanh toán|Paid/i,
            displayDate: '22/08/2026',
            apiDate: '2026-08-22',
            paidAmount: fixture.transaction.amount
        }
    ];

    for (let index = 0; index < cases.length; index += 1) {
        const current = cases[index];

        if (index > 0) {
            await openSelectedDocument(page, '#MainGrid', fixture.transaction.id);
            await page.waitForSelector('#MainModal.show');
            await enterPaidAmount(page, current.paidAmount);
            if (index === 1) await selectCashAccount(page, fixture.account.name);

            const paymentResponsePromise = page.waitForResponse(response =>
                response.url().includes('/api/CashTransaction/UpdateCashTransaction')
                && response.request().method() === 'POST');
            await page.locator('#MainSaveButton').click();
            expect((await paymentResponsePromise).status()).toBe(200);
            await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10_000 });
        }

        await openSelectedDocument(page, '#MainGrid', fixture.transaction.id);
        await page.waitForSelector('#MainModal.show');
        await expect(page.locator('#MainModal .form-control-plaintext')).toContainText(current.status);
        await enterDate(page, current.displayDate);

        const updateResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/CashTransaction/UpdateCashTransaction')
            && response.request().method() === 'POST');
        await page.locator('#MainSaveButton').click();
        const updateResponse = await updateResponsePromise;
        expect(updateResponse.status()).toBe(200);
        expect(updateResponse.request().postDataJSON()?.transactionDate).toBe(current.apiDate);
        await page.waitForSelector('#MainModal', { state: 'hidden', timeout: 10_000 });

        const persisted = await page.evaluate(async id => {
            const response = await AxiosManager.get('/CashTransaction/GetCashTransactionList', {});
            return (response?.data?.content?.data ?? []).find(item => item.id === id) ?? null;
        }, fixture.transaction.id);
        expect(persisted?.transactionDate?.slice(0, 10)).toBe(current.apiDate);
        expect(Number(persisted?.paidAmount)).toBe(current.paidAmount);

        await openSelectedDocument(page, '#MainGrid', fixture.transaction.id);
        await page.waitForSelector('#MainModal.show');
        await expect(page.locator('#TransactionDatePicker')).toHaveValue(current.displayDate);
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
    }
});
