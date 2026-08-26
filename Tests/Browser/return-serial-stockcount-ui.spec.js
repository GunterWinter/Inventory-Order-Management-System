const { test, expect, login, waitForVuePage } = require('./fixtures');

async function openDocumentFromGrid(page, number) {
    const row = page.locator('#MainGrid .e-row', { hasText: number }).first();
    await expect(row).toBeVisible();
    await row.click();
    await page.locator('#EditCustom').locator('xpath=..').click();
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
    const editor = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-input').first();
    await expect(editor).toBeVisible();
    const editorId = await editor.getAttribute('id');
    await editor.locator('xpath=..').click();
    const popup = page.locator(`#${editorId}_popup`);
    await expect(popup).toBeVisible();
    const filter = popup.locator('input.e-input-filter');
    if (await filter.count()) {
        await filter.click();
        await filter.press('Control+A');
        await filter.pressSequentially(text, { delay: 20 });
    }
    await popup.locator('.e-list-item', { hasText: text }).first().click();
}

async function selectHeaderDropdown(page, labelFor, text) {
    const input = page.locator(`#MainModal label[for="${labelFor}"]`)
        .locator('xpath=..').locator('input.e-input').first();
    await expect(input).toBeEnabled();
    await input.locator('xpath=..').click();
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await expect(popup).toBeVisible();
    await popup.locator('.e-list-item').filter({ hasText: text }).first().click();
}

async function submitDocumentStatus(page, endpoint) {
    const response = page.waitForResponse(item => item.url().includes(endpoint) && item.request().method() === 'POST');
    await page.locator('#MainSaveButton').click();
    const confirmation = page.locator('.swal2-confirm');
    const confirmationOpened = await confirmation.waitFor({ state: 'visible', timeout: 2_000 })
        .then(() => true, () => false);
    if (confirmationOpened) await confirmation.click();
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
    const createLine = page.waitForResponse(response => response.url().includes('/PurchaseOrderItem/CreatePurchaseOrderItem')
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    const createLineResponse = await createLine;
    expect(createLineResponse.status()).toBe(200);
    const payload = createLineResponse.request().postDataJSON();
    expect(Number(payload.quantity)).toBe(3);
    expect(payload.manufacturerSerialNumbers).toEqual(serials);
    await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await openDocumentFromGrid(page, fixture.order.number);
    await expect(page.locator('#SecondaryGrid .e-row').first()).toContainText(serials[1]);
    await expect(await gridCellByHeader(page.locator('#SecondaryGrid'), /Số lượng|Quantity/i)).toHaveText(/3/);

    await selectHeaderDropdown(page, 'OrderStatus', /Đã xác nhận|Confirmed/i);
    const confirmResponse = page.waitForResponse(response => response.url().includes('/PurchaseOrder/UpdatePurchaseOrder')
        && response.request().method() === 'POST' && response.status() === 200);
    await page.locator('#MainSaveButton').click();
    const confirmation = page.locator('.swal2-confirm');
    await expect(confirmation).toBeVisible();
    await confirmation.click();
    const confirmed = await confirmResponse;
    expect((await confirmed.json())?.code).toBe(200);

    const storedSerials = await page.evaluate(async serials => {
        const rows = [];
        for (const serial of serials) {
            const response = await AxiosManager.get(`/ProductSerial/GetWarrantyLookup?search=${encodeURIComponent(serial)}&page=1&pageSize=20`, {});
            rows.push(...(response?.data?.content?.data ?? []));
        }
        return rows.map(item => item.manufacturerSerialNumber);
    }, serials);
    expect(new Set(storedSerials)).toEqual(new Set(serials));

    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });
    const deleteRequests = [];
    const collectDeleteRequest = request => {
        if (request.url().includes('/PurchaseOrder/DeletePurchaseOrder')) deleteRequests.push(request);
    };
    page.on('request', collectDeleteRequest);
    const confirmedRow = page.locator('#MainGrid .e-row', { hasText: fixture.order.number }).first();
    await confirmedRow.getByRole('checkbox').check();
    await page.locator('#DeleteCustom').click();
    const deleteWarning = page.locator('.swal2-popup');
    await expect(deleteWarning).toBeVisible();
    await expect(deleteWarning.locator('.swal2-title')).toHaveText('Không thể xóa đơn mua hàng');
    await expect(deleteWarning.locator('.swal2-html-container')).toHaveText(
        'Chỉ đơn mua hàng Nháp mới được xóa. Đơn đã xác nhận phải dùng chức năng Hủy.'
    );
    await deleteWarning.locator('.swal2-confirm').click();
    await page.waitForTimeout(250);
    page.off('request', collectDeleteRequest);
    expect(deleteRequests).toHaveLength(0);
    await expect(confirmedRow).toBeVisible();
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
        const saleSource = (await AxiosManager.get(
            `/SalesReturn/GetSourceLineList?salesOrderId=${encodeURIComponent(so.id)}&salesReturnId=`
        ))?.data?.content?.[0];
        const previousSalesReturn = one(await AxiosManager.post('/SalesReturn/CreateSalesReturn', {
            returnDate: now, status: '0', description: `${key}-SR-PREV`, salesOrderId: so.id, createdById: userId
        }));
        await AxiosManager.post('/InventoryTransaction/SalesReturnCreateInvenTrans', {
            moduleId: previousSalesReturn.id, sourceItemId: soItem.id, movement: 4,
            createdById: userId, productSerialIds: [],
            costLayers: [{ sourceCostAllocationId: saleSource.costLayers[0].sourceCostAllocationId, quantity: 4 }]
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
            .locator('xpath=..').locator('input.e-input').first();
        await expect(sourceInput).toBeDisabled();

        const createLine = page.waitForResponse(response => response.url().includes(scenario.createUrl)
            && response.request().method() === 'POST');
        if (scenario.route.includes('SalesReturns')) {
            await grid.locator('.sales-return-cost-layer-picker').first().click();
            const layerInput = page.locator('.inventory-cost-layer-quantity').first();
            await layerInput.fill('');
            await layerInput.pressSequentially('2,5');
            await page.locator('.swal2-confirm').click();
            await expect(page.locator('.swal2-popup')).toBeHidden();
        } else {
            const movementCell = await gridCellByHeader(grid, /Số lượng trả lần này/i);
            await movementCell.dblclick();
            const movementInput = grid.locator('td.e-editedbatchcell input.e-numerictextbox');
            await movementInput.fill('');
            await movementInput.pressSequentially('2,5');
            await expect(movementInput).toHaveValue('2,5');
            await page.locator('#MainModal .modal-title').click();
            await expect(page.locator('#SecondaryGrid_update')).toBeEnabled();
        }
        await page.locator('#SecondaryGrid_update').click();
        const createLineResponse = await createLine;
        expect(createLineResponse.status()).toBe(200);
        expect(Number(createLineResponse.request().postDataJSON().movement)).toBe(2.5);
        await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await openDocumentFromGrid(page, scenario.number);
        await expect(await gridCellByHeader(page.locator('#SecondaryGrid'), /Số lượng trả lần này/i)).toHaveText(/2,5/);
    }

    await page.goto('/MovementReports/MovementReportList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    const profitRow = page.locator('#MainGrid .e-row', { hasText: fixture.salesProduct.name }).first();
    await expect(profitRow).toBeVisible();
    const frozenProfit = await page.evaluate(productId => {
        const rows = document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource ?? [];
        const row = rows.find(item => item.productId === productId);
        return row && { totalCost: row.totalCost, totalSales: row.totalSales, totalProfit: row.totalProfit };
    }, fixture.salesProduct.id);
    expect(frozenProfit).toEqual({ totalCost: 800000, totalSales: 1000000, totalProfit: 200000 });
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
    const createLine = page.waitForResponse(response => response.url().includes('/InventoryTransaction/StockCountCreateInvenTrans')
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    const createLineResponse = await createLine;
    expect(createLineResponse.status()).toBe(200);
    expect(Number(createLineResponse.request().postDataJSON().qtySCCount)).toBe(2.123456);
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

test('Stock Count đổi hàng serial sang hàng thường sẽ release serial cũ và xóa serial khỏi payload', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-STOCK-SERIAL-SWITCH-${Date.now()}`;
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
        const createProduct = (name, serialTrackingMode, openingStockQuantity) => AxiosManager.post('/Product/CreateProduct', {
            name,
            referenceCode: `${name}-REF`,
            unitPrice: 100000,
            costPrice: 80000,
            physical: true,
            serialTrackingMode,
            internalSerialFixedCode: serialTrackingMode ? 'SCS' : '',
            defaultWarehouseId: warehouse.id,
            defaultWarrantyMonths: 0,
            unitMeasureName: 'Cái',
            productGroupId: group.id,
            openingStockQuantity,
            createdById: userId
        });
        const serialProduct = one(await createProduct(`${key}-SERIAL`, 1, 1));
        const plainProduct = one(await createProduct(`${key}-PLAIN`, 0, 4));
        const serials = list(await AxiosManager.get(
            `/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(serialProduct.id)}`
            + `&warehouseId=${encodeURIComponent(warehouse.id)}`, {}
        ));
        return { serialProduct, plainProduct, warehouse, serial: serials[0] };
    }, key);
    expect(fixture.serial?.id).toBeTruthy();

    await page.goto('/StockCounts/StockCountList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    const countDate = page.locator('#MainModal label[for="CountDate"]')
        .locator('xpath=..').locator('input.e-datepicker');
    await countDate.fill('26/08/2026');
    await countDate.press('Tab');
    await selectHeaderDropdown(page, 'WarehouseId', fixture.warehouse.name);
    const createHeader = page.waitForResponse(response => response.url().includes('/StockCount/CreateStockCount')
        && response.request().method() === 'POST');
    await page.locator('#MainSaveButton').click();
    const createHeaderResponse = await createHeader;
    expect(createHeaderResponse.status()).toBe(200);
    const stockCount = (await createHeaderResponse.json())?.content?.data;
    expect(stockCount?.id).toBeTruthy();

    const grid = page.locator('#SecondaryGrid');
    await page.locator('#SecondaryGrid_add').click();
    const newProductCell = await gridCellByHeader(grid, /Hàng hóa|Product/i);
    if (await grid.locator('td.e-editedbatchcell input.e-input').count() === 0) {
        await page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].editModule?.editModule?.saveCell?.());
        await newProductCell.dblclick();
    }
    await selectEditedDropdown(page, fixture.serialProduct.name);
    const serialCell = await gridCellByHeader(grid, /Serial/i);
    await serialCell.dblclick();
    await grid.locator('td.e-editedbatchcell button').click();
    await page.waitForSelector('#ProductSerialPickerModal.show');
    const serialCheck = page.locator(`#ProductSerialPickerBody .product-serial-picker-check[value="${fixture.serial.id}"]`);
    await expect(serialCheck).toBeVisible();
    await serialCheck.check();
    await page.locator('#ProductSerialPickerApply').click();
    await page.waitForSelector('#ProductSerialPickerModal', { state: 'hidden' });

    const createLine = page.waitForResponse(response => response.url().includes('/InventoryTransaction/StockCountCreateInvenTrans')
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    const createLineResponse = await createLine;
    expect(createLineResponse.status()).toBe(200);
    expect(createLineResponse.request().postDataJSON().productSerialIds).toEqual([fixture.serial.id]);
    const line = (await createLineResponse.json())?.content?.data;
    expect(line?.id).toBeTruthy();
    await expect(page.locator('.swal2-popup')).toBeHidden({ timeout: 10_000 });

    const reserved = await page.evaluate(async serialNumber => {
        const response = await AxiosManager.get(
            `/ProductSerial/GetWarrantyLookup?search=${encodeURIComponent(serialNumber)}&page=1&pageSize=20`, {}
        );
        return (response?.data?.content?.data ?? [])[0]?.statusName;
    }, fixture.serial.internalSerialNumber);
    expect(reserved).toBe('Reserved');

    const productCell = await gridCellByHeader(grid, /Hàng hóa|Product/i);
    await productCell.dblclick();
    await selectEditedDropdown(page, fixture.plainProduct.name);
    const clearedRow = await page.evaluate(() => {
        const row = document.querySelector('#SecondaryGrid').ej2_instances[0].getRowsObject()[0]?.data;
        const changed = document.querySelector('#SecondaryGrid').ej2_instances[0].getBatchChanges().changedRecords[0];
        return {
            rowIds: row?.productSerialIds ?? [],
            rowText: row?.productSerialNumbers ?? '',
            changedIds: changed?.productSerialIds ?? [],
            changedText: changed?.productSerialNumbers ?? ''
        };
    });
    expect(clearedRow).toEqual({ rowIds: [], rowText: '', changedIds: [], changedText: '' });
    const updateLine = page.waitForResponse(response => response.url().includes('/InventoryTransaction/StockCountUpdateInvenTrans')
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    const updateLineResponse = await updateLine;
    expect(updateLineResponse.status()).toBe(200);
    const updatePayload = updateLineResponse.request().postDataJSON();
    expect(updatePayload.id).toBe(line.id);
    expect(updatePayload.productId).toBe(fixture.plainProduct.id);
    expect(updatePayload.productSerialIds).toEqual([]);

    await expect.poll(() => page.evaluate(async ({ stockCountId, lineId, serialProductId, warehouseId, serialId }) => {
        const [linesResponse, pickerResponse] = await Promise.all([
            AxiosManager.get(`/InventoryTransaction/StockCountGetInvenTransList?moduleId=${encodeURIComponent(stockCountId)}`, {}),
            AxiosManager.get(`/ProductSerial/GetProductSerialPickerList?productId=${encodeURIComponent(serialProductId)}`
                + `&warehouseId=${encodeURIComponent(warehouseId)}`, {})
        ]);
        const lines = linesResponse?.data?.content?.data ?? [];
        const persistedLine = lines.find(item => item.id === lineId);
        const picker = pickerResponse?.data?.content?.data ?? [];
        const releasedSerial = picker.find(item => item.id === serialId);
        return {
            productId: persistedLine?.productId,
            productSerialIds: persistedLine?.productSerialIds ?? [],
            serialStatus: releasedSerial?.statusName,
            serialWarehouseId: releasedSerial?.warehouseId
        };
    }, {
        stockCountId: stockCount.id,
        lineId: line.id,
        serialProductId: fixture.serialProduct.id,
        warehouseId: fixture.warehouse.id,
        serialId: fixture.serial.id
    })).toEqual({
        productId: fixture.plainProduct.id,
        productSerialIds: [],
        serialStatus: 'InStock',
        serialWarehouseId: fixture.warehouse.id
    });
});
