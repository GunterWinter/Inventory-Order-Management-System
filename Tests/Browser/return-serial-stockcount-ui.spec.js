const { test, expect, login, waitForVuePage } = require('./fixtures');

async function openDocumentFromGrid(page, number) {
    const row = page.locator('#MainGrid .e-row', { hasText: number }).first();
    await expect(row).toBeVisible();
    await row.click();
    await page.locator('#EditCustom').click();
    await page.waitForSelector('#MainModal.show');
}

async function gridCellByHeader(grid, headerText) {
    const headers = grid.locator('.e-headercell:visible');
    for (let index = 0; index < await headers.count(); index += 1) {
        if (headerText.test((await headers.nth(index).innerText()).trim()))
            return grid.locator('.e-row').first().locator('td.e-rowcell:visible').nth(index);
    }
    throw new Error(`Không tìm thấy cột ${headerText}.`);
}

async function selectEditedDropdown(page, text) {
    const editor = page.locator('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist');
    await expect(editor).toBeVisible();
    const editorId = await editor.getAttribute('id');
    await editor.locator('xpath=..').click();
    const popup = page.locator(`#${editorId}_popup`);
    await expect(popup).toBeVisible();
    const filter = popup.locator('input.e-input-filter');
    if (await filter.count()) await filter.fill(text);
    await popup.locator('.e-list-item', { hasText: text }).first().click();
}

async function selectHeaderDropdown(page, labelFor, text) {
    const input = page.locator(`#MainModal label[for="${labelFor}"]`)
        .locator('xpath=..').locator('input.e-dropdownlist');
    await expect(input).toBeEnabled();
    const inputId = await input.getAttribute('id');
    await input.locator('xpath=..').click();
    const popup = page.locator(`#${inputId}_popup`);
    await expect(popup).toBeVisible();
    await popup.locator('.e-list-item').filter({ hasText: text }).first().click();
}

async function submitDocumentStatus(page, endpoint) {
    const response = page.waitForResponse(item => item.url().includes(endpoint) && item.request().method() === 'POST');
    await page.locator('#MainSaveButton').click();
    const confirmation = page.locator('.swal2-confirm');
    if (await confirmation.isVisible().catch(() => false)) await confirmation.click();
    expect((await response).status()).toBe(200);
    await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });
}

test('PO nhập ba serial nhà sản xuất bằng UI, lưu/reload và Confirm tạo đủ serial', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-PO-MANUFACTURER-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const data = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groups, warehouses, vendors, taxes] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Vendor/GetVendorList', {}),
            AxiosManager.get('/Tax/GetTaxList', {})
        ]);
        const group = data(groups)[0];
        const warehouse = data(warehouses).find(item => item.systemWarehouse === false);
        const vendor = data(vendors)[0];
        const tax = data(taxes)[0];
        const product = data(await AxiosManager.post('/Product/CreateProduct', {
            name: key,
            referenceCode: `${key}-REF`,
            unitPrice: 150000,
            costPrice: 120000,
            physical: true,
            serialTrackingMode: 2,
            internalSerialFixedCode: 'MFS',
            defaultWarehouseId: warehouse.id,
            defaultWarrantyMonths: 6,
            unitMeasureName: 'Cái',
            productGroupId: group.id,
            openingStockQuantity: 0,
            createdById: userId
        }));
        const order = data(await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate: new Date().toISOString(),
            orderStatus: '0',
            description: key,
            vendorId: vendor.id,
            createdById: userId
        }));
        return { product, order, tax };
    }, key);

    await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await openDocumentFromGrid(page, fixture.order.number);
    const grid = page.locator('#SecondaryGrid');
    await page.locator('#SecondaryGrid_add').click();
    await selectEditedDropdown(page, key);

    const serialCell = await gridCellByHeader(grid, /Serial nhà sản xuất/i);
    await serialCell.dblclick();
    await grid.locator('td.e-editedbatchcell button', { hasText: 'Sửa serial' }).click();
    await expect(page.locator('.swal2-popup')).toBeVisible();
    for (let index = 0; index < 3; index += 1) {
        await page.locator('#manufacturer-serial-add').click();
    }
    const serials = [`${key}-01`, `${key}-02`, `${key}-03`];
    const inputs = page.locator('.manufacturer-serial');
    await expect(inputs).toHaveCount(3);
    for (let index = 0; index < serials.length; index += 1) await inputs.nth(index).fill(serials[index]);
    await page.locator('.swal2-confirm').click();
    await expect(page.locator('.swal2-popup')).toBeHidden();

    const row = grid.locator('.e-row').first();
    await expect(row).toContainText(serials[0]);
    await expect(row).toContainText(serials[2]);
    const quantityCell = await gridCellByHeader(grid, /Số lượng|Quantity/i);
    await expect(quantityCell).toHaveText(/3/);

    const taxCell = await gridCellByHeader(grid, /Thuế|Tax/i);
    await taxCell.dblclick();
    await selectEditedDropdown(page, fixture.tax.name);
    const createLine = page.waitForRequest(request => request.url().includes('/PurchaseOrderItem/CreatePurchaseOrderItem'));
    await page.locator('#SecondaryGrid_update').click();
    const payload = (await createLine).postDataJSON();
    expect(Number(payload.quantity)).toBe(3);
    expect(payload.manufacturerSerialNumbers).toEqual(serials);
    await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await openDocumentFromGrid(page, fixture.order.number);
    await expect(page.locator('#SecondaryGrid .e-row').first()).toContainText(serials[1]);
    await expect(await gridCellByHeader(page.locator('#SecondaryGrid'), /Số lượng|Quantity/i)).toHaveText(/3/);

    await selectHeaderDropdown(page, 'OrderStatus', /Đã xác nhận|Confirmed/i);
    const confirmResponse = page.waitForResponse(response => response.url().includes('/PurchaseOrder/UpdatePurchaseOrder'));
    await page.locator('#MainSaveButton').click();
    const confirmation = page.locator('.swal2-confirm');
    if (await confirmation.isVisible().catch(() => false)) await confirmation.click();
    expect((await confirmResponse).status()).toBe(200);

    const storedSerials = await page.evaluate(async serials => {
        const rows = [];
        for (const serial of serials) {
            const response = await AxiosManager.get(`/ProductSerial/GetWarrantyLookup?search=${encodeURIComponent(serial)}&page=1&pageSize=20`, {});
            rows.push(...(response?.data?.content?.data ?? []));
        }
        return rows.map(item => item.manufacturerSerialNumber);
    }, serials);
    expect(new Set(storedSerials)).toEqual(new Set(serials));
});

test('Purchase/Sales Return hiện toàn bộ dòng nguồn ở 0 và trừ phần Draft đã giữ chỗ', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-RETURN-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const one = response => response?.data?.content?.data;
        const list = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groups, warehouses, vendors, customers, taxes] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Vendor/GetVendorList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {}),
            AxiosManager.get('/Tax/GetTaxList', {})
        ]);
        const group = list(groups)[0];
        const warehouse = list(warehouses).find(item => item.systemWarehouse === false);
        const vendor = list(vendors)[0];
        const customer = list(customers)[0];
        const tax = list(taxes)[0];
        const createProduct = (name, openingStockQuantity) => AxiosManager.post('/Product/CreateProduct', {
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
        const purchaseProduct = one(await createProduct(`${key}-PURCHASE`, 0));
        const salesProduct = one(await createProduct(`${key}-SALES`, 10));
        const now = new Date().toISOString();

        const po = one(await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate: now, orderStatus: '0', description: key, vendorId: vendor.id, createdById: userId
        }));
        const poItem = one(await AxiosManager.post('/PurchaseOrderItem/CreatePurchaseOrderItem', {
            purchaseOrderId: po.id, productId: purchaseProduct.id, warehouseId: warehouse.id,
            summary: key, taxId: tax.id, supplierWarrantyMonths: 0, unitPrice: 80000,
            quantity: 10, createdById: userId
        }));
        await AxiosManager.post('/PurchaseOrder/UpdatePurchaseOrder', {
            id: po.id, orderDate: po.orderDate, orderStatus: '2', description: po.description,
            vendorId: po.vendorId, updatedById: userId
        });
        const previousPurchaseReturn = one(await AxiosManager.post('/PurchaseReturn/CreatePurchaseReturn', {
            returnDate: now, status: '0', description: `${key}-PR-PREV`, purchaseOrderId: po.id, createdById: userId
        }));
        await AxiosManager.post('/InventoryTransaction/PurchaseReturnCreateInvenTrans', {
            moduleId: previousPurchaseReturn.id, sourceItemId: poItem.id, movement: 4,
            createdById: userId, productSerialIds: []
        });
        const purchaseReturn = one(await AxiosManager.post('/PurchaseReturn/CreatePurchaseReturn', {
            returnDate: now, status: '0', description: `${key}-PR-CURRENT`, purchaseOrderId: po.id, createdById: userId
        }));

        const so = one(await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
            orderDate: now, orderStatus: '0', description: key, customerId: customer.id,
            salesType: 1, createdById: userId
        }));
        const soItem = one(await AxiosManager.post('/SalesOrderItem/CreateSalesOrderItem', {
            salesOrderId: so.id, productId: salesProduct.id, warehouseId: warehouse.id,
            summary: key, taxId: tax.id, warrantyMonths: 0, unitPrice: 100000,
            quantity: 10, productSerialIds: [], createdById: userId
        }));
        await AxiosManager.post('/SalesOrder/UpdateSalesOrder', {
            id: so.id, orderDate: so.orderDate, orderStatus: '2', description: so.description,
            customerId: so.customerId, salesType: so.salesType, updatedById: userId
        });
        const previousSalesReturn = one(await AxiosManager.post('/SalesReturn/CreateSalesReturn', {
            returnDate: now, status: '0', description: `${key}-SR-PREV`, salesOrderId: so.id, createdById: userId
        }));
        await AxiosManager.post('/InventoryTransaction/SalesReturnCreateInvenTrans', {
            moduleId: previousSalesReturn.id, sourceItemId: soItem.id, movement: 4,
            createdById: userId, productSerialIds: []
        });
        const salesReturn = one(await AxiosManager.post('/SalesReturn/CreateSalesReturn', {
            returnDate: now, status: '0', description: `${key}-SR-CURRENT`, salesOrderId: so.id, createdById: userId
        }));

        return { purchaseReturn, salesReturn, purchaseProduct, salesProduct };
    }, key);

    for (const scenario of [
        {
            route: '/PurchaseReturns/PurchaseReturnList',
            number: fixture.purchaseReturn.number,
            product: fixture.purchaseProduct.name,
            createUrl: '/InventoryTransaction/PurchaseReturnCreateInvenTrans',
            sourceLabel: /Purchase Order|Đơn mua hàng/i
        },
        {
            route: '/SalesReturns/SalesReturnList',
            number: fixture.salesReturn.number,
            product: fixture.salesProduct.name,
            createUrl: '/InventoryTransaction/SalesReturnCreateInvenTrans',
            sourceLabel: /Sales Order|Đơn bán hàng/i
        }
    ]) {
        await page.goto(scenario.route, { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await openDocumentFromGrid(page, scenario.number);
        const grid = page.locator('#SecondaryGrid');
        const row = grid.locator('.e-row', { hasText: scenario.product }).first();
        await expect(row).toBeVisible();
        await expect(await gridCellByHeader(grid, /Có thể trả/i)).toHaveText(/6/);
        await expect(await gridCellByHeader(grid, /Số lượng trả lần này/i)).toHaveText(/0/);

        const sourceInput = page.locator('#MainModal label').filter({ hasText: scenario.sourceLabel })
            .locator('xpath=..').locator('input.e-dropdownlist');
        await expect(sourceInput).toBeDisabled();

        const movementCell = await gridCellByHeader(grid, /Số lượng trả lần này/i);
        await movementCell.dblclick();
        const movementInput = grid.locator('td.e-editedbatchcell input.e-numerictextbox');
        await movementInput.fill('');
        await movementInput.pressSequentially('2,5');
        await expect(movementInput).toHaveValue('2,5');
        const createLine = page.waitForRequest(request => request.url().includes(scenario.createUrl));
        await page.locator('#SecondaryGrid_update').click();
        expect(Number((await createLine).postDataJSON().movement)).toBe(2.5);
        await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await openDocumentFromGrid(page, scenario.number);
        await expect(await gridCellByHeader(page.locator('#SecondaryGrid'), /Số lượng trả lần này/i)).toHaveText(/2,5/);
    }
});

test('Stock Count thao tác grid thật, giữ snapshot và không áp tồn lần hai khi Archive/restore', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-STOCK-COUNT-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const one = response => response?.data?.content?.data;
        const list = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groups, warehouses] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {})
        ]);
        const group = list(groups)[0];
        const warehouse = list(warehouses).find(item => item.systemWarehouse === false);
        const product = one(await AxiosManager.post('/Product/CreateProduct', {
            name: key,
            referenceCode: `${key}-REF`,
            unitPrice: 100000,
            costPrice: 80000,
            physical: true,
            serialTrackingMode: 0,
            defaultWarehouseId: warehouse.id,
            defaultWarrantyMonths: 0,
            unitMeasureName: 'Cái',
            productGroupId: group.id,
            openingStockQuantity: 5.5,
            createdById: userId
        }));
        return { product, warehouse };
    }, key);

    const readStock = () => page.evaluate(async ({ productId, warehouseId }) => {
        const response = await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {});
        return Number((response?.data?.content?.data ?? [])
            .find(item => item.productId === productId && item.warehouseId === warehouseId)?.stock ?? 0);
    }, { productId: fixture.product.id, warehouseId: fixture.warehouse.id });

    await page.goto('/StockCounts/StockCountList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    const countDate = page.locator('#MainModal label[for="CountDate"]')
        .locator('xpath=..').locator('input.e-datepicker');
    await countDate.fill('26/08/2026');
    await countDate.press('Tab');
    await selectHeaderDropdown(page, 'WarehouseId', fixture.warehouse.name);
    const createHeader = page.waitForResponse(response => response.url().includes('/StockCount/CreateStockCount'));
    await page.locator('#MainSaveButton').click();
    expect((await createHeader).status()).toBe(200);
    await expect(page.locator('#ComplexDiv')).toBeVisible();
    const number = await page.locator('#MainModal label[for="Number"]')
        .locator('xpath=..').locator('input.e-textbox').inputValue();

    const grid = page.locator('#SecondaryGrid');
    await page.locator('#SecondaryGrid_add').click();
    await selectEditedDropdown(page, key);
    await expect(await gridCellByHeader(grid, /Tồn hệ thống/i)).toHaveText(/5,5/);
    await expect(await gridCellByHeader(grid, /Chênh lệch/i)).toHaveText(/-5,5/);
    const counted = await gridCellByHeader(grid, /Số lượng thực đếm/i);
    await counted.dblclick();
    const countedInput = grid.locator('td.e-editedbatchcell input.e-numerictextbox');
    await countedInput.fill('');
    await countedInput.pressSequentially('2,123456');
    await expect(countedInput).toHaveValue('2,123456');
    const createLine = page.waitForRequest(request => request.url().includes('/InventoryTransaction/StockCountCreateInvenTrans'));
    await page.locator('#SecondaryGrid_update').click();
    expect(Number((await createLine).postDataJSON().qtySCCount)).toBe(2.123456);
    await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await openDocumentFromGrid(page, number);
    const reloadedGrid = page.locator('#SecondaryGrid');
    await expect(await gridCellByHeader(reloadedGrid, /Tồn hệ thống/i)).toHaveText(/5,5/);
    await expect(await gridCellByHeader(reloadedGrid, /Số lượng thực đếm/i)).toHaveText(/2,123456/);

    await selectHeaderDropdown(page, 'Status', /Đã xác nhận/i);
    await submitDocumentStatus(page, '/StockCount/UpdateStockCount');
    expect(await readStock()).toBe(2.123456);

    await selectHeaderDropdown(page, 'Status', /Đã lưu trữ/i);
    await submitDocumentStatus(page, '/StockCount/UpdateStockCount');
    expect(await readStock()).toBe(2.123456);

    await selectHeaderDropdown(page, 'Status', /Đã xác nhận/i);
    await submitDocumentStatus(page, '/StockCount/UpdateStockCount');
    expect(await readStock()).toBe(2.123456);

    await selectHeaderDropdown(page, 'Status', /Đã hủy/i);
    await submitDocumentStatus(page, '/StockCount/UpdateStockCount');
    expect(await readStock()).toBe(5.5);
    await expect(page.locator('#MainSaveButton')).toHaveCount(0);
});
