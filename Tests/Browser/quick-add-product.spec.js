const {
    test,
    expect,
    login,
    waitForVuePage,
    openSelectedDocument
} = require('./fixtures');

test('Purchase Order quick-add hàng hóa đồng bộ serial và tồn đầu kỳ', async ({ monitoredPage: page }) => {
    let purchaseOrderId = null;
    const key = `E2E-QUICK-PRODUCT-${Date.now()}`;

    await login(page);
    const fixture = await page.evaluate(async keyValue => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const [groups, warehouses, vendors] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Vendor/GetVendorList', {})
        ]);
        const group = unwrap(groups)[0];
        const warehouse = unwrap(warehouses).find(item => item.systemWarehouse === false);
        const vendor = unwrap(vendors)[0];
        const purchaseOrder = (await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate: new Date().toISOString(),
            orderStatus: '0',
            description: keyValue,
            vendorId: vendor?.id,
            createdById: StorageManager.getUserId()
        }))?.data?.content?.data;
        return { group, warehouse, vendor, purchaseOrder };
    }, key);

    expect(fixture.group?.id).toBeTruthy();
    expect(fixture.warehouse?.id).toBeTruthy();
    expect(fixture.vendor?.id).toBeTruthy();
    expect(fixture.purchaseOrder?.id).toBeTruthy();
    purchaseOrderId = fixture.purchaseOrder.id;

    try {
        await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
        await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
        await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');

        await page.locator('#SecondaryGrid_add').click();
        await page.waitForSelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist');
        await page.locator('#QuickAddProductBtn').click();
        await page.waitForSelector('.swal2-popup #qa-p-name');

        await expect(page.locator('#qa-p-serial-none')).toBeChecked();
        await expect(page.locator('input[name="qa-p-serial"]')).toHaveCount(3);
        await expect(page.locator('#qa-p-opening-stock')).toBeEnabled();
        await expect(page.locator('#qa-p-opening-stock')).toHaveValue('0');
        await expect(page.locator('#qa-p-fixedcode-section')).toBeHidden();

        await page.locator('#qa-p-name').fill(key);
        await page.locator('#qa-p-unit').fill('PCS');
        await page.locator('#qa-p-costprice').fill('1000');
        await page.locator('#qa-p-unitprice').fill('1500');
        await page.evaluate(groupId => {
            const select = document.getElementById('qa-p-group');
            select.value = groupId;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, fixture.group.id);

        await page.locator('#qa-p-serial-auto').check();
        await expect(page.locator('#qa-p-fixedcode-section')).toBeVisible();
        await page.locator('#qa-p-opening-stock').fill('1,5');
        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#swal2-validation-message'))
            .toContainText('Opening stock must be a whole number');
        await page.locator('#qa-p-fixedcode').fill('A');
        await page.locator('#qa-p-opening-stock').fill('2');
        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#swal2-validation-message'))
            .toContainText('Fixed Code must be 2-4 letters or digits');

        await page.locator('#qa-p-serial-manufacturer').check();
        await expect(page.locator('#qa-p-fixedcode-section')).toBeHidden();
        await expect(page.locator('#qa-p-opening-stock')).toBeDisabled();
        await expect(page.locator('#qa-p-opening-stock')).toHaveValue('0');
        await expect(page.locator('#qa-p-opening-stock-help'))
            .toContainText('must be entered through a Purchase Order');

        await page.locator('#qa-p-physical').uncheck();
        await expect(page.locator('#qa-p-serial-section')).toBeHidden();
        await expect(page.locator('#qa-p-serial-none')).toBeChecked();
        await expect(page.locator('#qa-p-opening-stock-help'))
            .toContainText('Non-physical products do not have stock');

        await page.locator('#qa-p-physical').check();
        await page.locator('#qa-p-opening-stock').fill('-1');
        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#swal2-validation-message'))
            .toContainText('Opening stock must be zero or greater');
        await page.locator('#qa-p-opening-stock').fill('2,5');

        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#swal2-validation-message'))
            .toContainText('Default warehouse is required');

        await page.evaluate(warehouseId => {
            const select = document.getElementById('qa-p-warehouse');
            select.value = warehouseId;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, fixture.warehouse.id);

        const requestPromise = page.waitForRequest(request => request.url().includes('/api/Product/CreateProduct'));
        const responsePromise = page.waitForResponse(response => response.url().includes('/api/Product/CreateProduct'));
        await page.locator('.swal2-confirm').click();
        const [request, response] = await Promise.all([requestPromise, responsePromise]);
        expect(response.status()).toBe(200);
        expect(request.postDataJSON()).toMatchObject({
            name: key,
            physical: true,
            serialTrackingMode: 0,
            internalSerialFixedCode: null,
            openingStockQuantity: 2.5,
            defaultWarehouseId: fixture.warehouse.id
        });

        const responseBody = await response.json();
        const productId = responseBody?.content?.data?.id;
        expect(productId).toBeTruthy();
        await page.waitForFunction(id => {
            const editor = document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0];
            return editor?.value === id;
        }, productId);

        const storedProduct = await page.evaluate(async id => (
            (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data ?? []
        ).find(item => item.id === id), productId);
        expect(storedProduct?.serialTrackingMode).toBe(0);
        expect(storedProduct?.openingStockQuantity).toBe(2.5);
        expect(storedProduct?.openingStockWarehouseId).toBe(fixture.warehouse.id);

        await page.locator('.swal2-popup').waitFor({ state: 'hidden' });
        await page.locator('#QuickAddProductBtn').click();
        await page.waitForSelector('.swal2-popup #qa-p-name');
        await page.locator('#qa-p-name').fill(`${key}-AUTO`);
        await page.locator('#qa-p-unit').fill('PCS');
        await page.locator('#qa-p-costprice').fill('1000');
        await page.locator('#qa-p-unitprice').fill('1500');
        await page.evaluate(({ groupId, warehouseId }) => {
            const group = document.getElementById('qa-p-group');
            const warehouse = document.getElementById('qa-p-warehouse');
            group.value = groupId;
            group.dispatchEvent(new Event('change', { bubbles: true }));
            warehouse.value = warehouseId;
            warehouse.dispatchEvent(new Event('change', { bubbles: true }));
        }, { groupId: fixture.group.id, warehouseId: fixture.warehouse.id });
        await page.locator('#qa-p-serial-auto').check();
        await page.locator('#qa-p-fixedcode').fill('E2E');
        await page.locator('#qa-p-opening-stock').fill('2');

        const autoRequestPromise = page.waitForRequest(request => request.url().includes('/api/Product/CreateProduct'));
        const autoResponsePromise = page.waitForResponse(response => response.url().includes('/api/Product/CreateProduct'));
        await page.locator('.swal2-confirm').click();
        const [autoRequest, autoResponse] = await Promise.all([autoRequestPromise, autoResponsePromise]);
        expect(autoResponse.status()).toBe(200);
        expect(autoRequest.postDataJSON()).toMatchObject({
            name: `${key}-AUTO`,
            physical: true,
            serialTrackingMode: 1,
            internalSerialFixedCode: 'E2E',
            openingStockQuantity: 2,
            defaultWarehouseId: fixture.warehouse.id
        });

        await page.locator('.swal2-popup').waitFor({ state: 'hidden' });
        await page.locator('#QuickAddProductBtn').click();
        await page.waitForSelector('.swal2-popup #qa-p-name');
        await page.locator('#qa-p-name').fill(`${key}-MANUFACTURER`);
        await page.locator('#qa-p-unit').fill('PCS');
        await page.locator('#qa-p-costprice').fill('1000');
        await page.locator('#qa-p-unitprice').fill('1500');
        await page.evaluate(groupId => {
            const group = document.getElementById('qa-p-group');
            group.value = groupId;
            group.dispatchEvent(new Event('change', { bubbles: true }));
        }, fixture.group.id);
        await page.locator('#qa-p-serial-manufacturer').check();

        const manufacturerRequestPromise = page.waitForRequest(request => request.url().includes('/api/Product/CreateProduct'));
        const manufacturerResponsePromise = page.waitForResponse(response => response.url().includes('/api/Product/CreateProduct'));
        await page.locator('.swal2-confirm').click();
        const [manufacturerRequest, manufacturerResponse] = await Promise.all([
            manufacturerRequestPromise,
            manufacturerResponsePromise
        ]);
        expect(manufacturerResponse.status()).toBe(200);
        expect(manufacturerRequest.postDataJSON()).toMatchObject({
            name: `${key}-MANUFACTURER`,
            physical: true,
            serialTrackingMode: 2,
            internalSerialFixedCode: null,
            openingStockQuantity: null
        });
    } finally {
        if (purchaseOrderId) {
            await page.evaluate(async id => {
                await AxiosManager.post('/PurchaseOrder/DeletePurchaseOrder', {
                    id,
                    deletedById: StorageManager.getUserId()
                });
            }, purchaseOrderId);
        }
    }
});
