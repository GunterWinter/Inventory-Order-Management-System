const { test, expect, login, waitForVuePage } = require('./fixtures');

test('Product bulk delete shows the backend reason when one selected product has inventory history', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-DELETE-ERROR-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const list = response => response?.data?.content?.data ?? [];
        const one = response => response?.data?.content?.data;
        const userId = StorageManager.getUserId();
        const [groups, warehouses] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {})
        ]);
        const group = list(groups)[0];
        const warehouse = list(warehouses).find(item => item.systemWarehouse === false);
        const create = (name, openingStockQuantity) => AxiosManager.post('/Product/CreateProduct', {
            name,
            referenceCode: `${name}-REF`,
            unitPrice: 100000,
            costPrice: 80000,
            physical: true,
            serialTrackingMode: 0,
            defaultWarehouseId: warehouse.id,
            defaultWarrantyMonths: 0,
            unitMeasureName: 'Cái',
            productGroupId: group.id,
            openingStockQuantity,
            createdById: userId
        });
        return {
            blocked: one(await create(`${key}-BLOCKED`, 1)),
            free: one(await create(`${key}-FREE`, 0))
        };
    }, key);

    await page.goto('/Products/ProductList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(ids => {
        const records = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.getCurrentViewRecords?.() ?? [];
        return ids.every(id => records.some(item => item.id === id));
    }, [fixture.blocked.id, fixture.free.id]);

    for (const name of [`${key}-BLOCKED`, `${key}-FREE`]) {
        const row = page.locator('#MainGrid .e-content tr.e-row', { hasText: name }).first();
        await expect(row).toBeVisible();
        await row.locator('.e-checkbox-wrapper').first().click();
    }
    page.expectHttpError('/api/Product/DeleteProduct', 409);
    await page.locator('#DeleteCustom').click();
    await page.locator('.swal2-confirm').click();

    const error = page.locator('.swal2-popup');
    await expect(error).toBeVisible();
    await expect(error.locator('.swal2-title')).toHaveText('Không thể thực hiện thao tác');
    await expect(error.locator('.swal2-html-container')).toContainText(/không thể xóa hàng hóa|lịch sử kho|đang được sử dụng/i);
    await expect(error.locator('.swal2-html-container')).not.toHaveText('Vui lòng thử lại.');
    await error.locator('.swal2-confirm').click();

    await page.waitForFunction(id => {
        const records = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.getCurrentViewRecords?.() ?? [];
        return records.some(item => item.id === id);
    }, fixture.blocked.id);
});

test('Purchase Order bulk delete explains why a mixed Draft and Confirmed selection is blocked', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-PO-DELETE-ERROR-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const one = response => response?.data?.content?.data;
        const list = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const vendors = await AxiosManager.get('/Vendor/GetVendorList', {});
        const vendor = list(vendors)[0];
        const create = suffix => AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate: new Date().toISOString(),
            orderStatus: '0',
            description: `${key}-${suffix}`,
            vendorId: vendor.id,
            createdById: userId
        });
        const draft = one(await create('DRAFT'));
        const confirmed = one(await create('CONFIRMED'));
        await AxiosManager.post('/PurchaseOrder/UpdatePurchaseOrder', {
            id: confirmed.id,
            orderDate: confirmed.orderDate,
            orderStatus: '2',
            description: confirmed.description,
            vendorId: confirmed.vendorId,
            updatedById: userId
        });
        return { draft, confirmed };
    }, key);

    await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(ids => {
        const records = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.getCurrentViewRecords?.() ?? [];
        return ids.every(id => records.some(item => item.id === id));
    }, [fixture.draft.id, fixture.confirmed.id]);
    for (const number of [fixture.draft.number, fixture.confirmed.number]) {
        const row = page.locator('#MainGrid .e-content tr.e-row', { hasText: number }).first();
        await expect(row).toBeVisible();
        await row.locator('.e-checkbox-wrapper').first().click();
    }

    const deleteRequests = [];
    const collectDeleteRequest = request => {
        if (request.url().includes('/PurchaseOrder/DeletePurchaseOrder')) deleteRequests.push(request);
    };
    page.on('request', collectDeleteRequest);
    await page.locator('#DeleteCustom').click();
    const warning = page.locator('.swal2-popup');
    await expect(warning).toBeVisible();
    await expect(warning.locator('.swal2-title')).toHaveText('Không thể xóa đơn mua hàng');
    await expect(warning.locator('.swal2-html-container')).toHaveText(
        'Chỉ đơn mua hàng Nháp mới được xóa. Đơn đã xác nhận phải dùng chức năng Hủy.'
    );
    await warning.locator('.swal2-confirm').click();
    page.off('request', collectDeleteRequest);
    expect(deleteRequests).toHaveLength(0);
});
