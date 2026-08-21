const {
    test,
    expect,
    login,
    waitForVuePage,
    selectOpenDropdownOption,
    openSelectedDocument
} = require('./fixtures');

const dataOf = response => response?.data?.content?.data;

async function selectTaxAndSaveItem(page, taxName) {
    await page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].editCell(0, 'taxId'));
    await page.waitForFunction(() => Boolean(
        document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
    ));
    await page.evaluate(() => document.querySelector(
        '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist'
    ).ej2_instances[0].showPopup());
    await selectOpenDropdownOption(page, taxName);

    const saved = await page.evaluate(async () => (
        GridInteractionManager.save(document.querySelector('#SecondaryGrid').ej2_instances[0])
    ));
    expect(saved).toBe(true);
}

async function reloadAndReadItem(page, route, documentId) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), documentId);
    await openSelectedDocument(page, '#MainGrid', documentId);
    await page.waitForFunction(() => (
        document.querySelector('#MainModal.show #SecondaryGrid')?.ej2_instances?.[0]?.dataSource?.length > 0
    ));
    return page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].dataSource[0]);
}

test('Product tồn đầu kỳ giữ giá và PO/SO hiển thị đúng giá ngay khi chọn hàng', async ({ monitoredPage: page }) => {
    let salesOrderId = null;
    let purchaseOrderId = null;
    const key = `E2E-PRICE-${Date.now()}`;
    const expectedSalesPrice = 345000;
    const expectedCostPrice = 234000;

    await login(page);
    await page.goto('/Products/ProductList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);

    const lookup = await page.evaluate(async () => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const [groups, warehouses, customers, vendors, taxes] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {}),
            AxiosManager.get('/Vendor/GetVendorList', {}),
            AxiosManager.get('/Tax/GetTaxList', {})
        ]);
        return {
            group: unwrap(groups)[0],
            warehouse: unwrap(warehouses).find(item => item.systemWarehouse === false),
            customer: unwrap(customers)[0],
            vendor: unwrap(vendors)[0],
            tax: unwrap(taxes)[0]
        };
    });
    expect(lookup.group?.id).toBeTruthy();
    expect(lookup.warehouse?.id).toBeTruthy();
    expect(lookup.customer?.id).toBeTruthy();
    expect(lookup.vendor?.id).toBeTruthy();
    expect(lookup.tax?.id).toBeTruthy();

    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    await page.locator('input[placeholder="Enter Name"]').fill(key);
    await page.locator('input[placeholder="Enter Reference Code (SKU/Custom)"]').fill(`${key}-REF`);
    await page.locator('input[placeholder="Enter Cost Price"]').fill(String(expectedCostPrice));
    await page.locator('input[placeholder="Enter Unit Price"]').fill(String(expectedSalesPrice));
    await page.locator('input[placeholder="Enter Unit Measure"]').fill('PCS');

    await page.locator('input[placeholder="Select a Product Group"]').locator('xpath=..').click();
    await selectOpenDropdownOption(page, lookup.group.name);
    await page.locator('input[placeholder="Select a Warehouse"]').locator('xpath=..').click();
    await selectOpenDropdownOption(page, lookup.warehouse.name);

    // Save immediately after editing the last NumericTextBox. This guards against
    // stale reactive state when Syncfusion has not emitted its delayed change event.
    await page.locator('#OpeningStockQuantity').fill('2');
    const productRequestPromise = page.waitForRequest(request => request.url().includes('/api/Product/CreateProduct'));
    const productResponsePromise = page.waitForResponse(response => response.url().includes('/api/Product/CreateProduct'));
    await page.locator('#MainSaveButton').click();
    const productRequest = await productRequestPromise;
    const productResponse = await productResponsePromise;
    expect(productResponse.status()).toBe(200);
    const productPayload = productRequest.postDataJSON();
    expect(productPayload.unitPrice).toBe(expectedSalesPrice);
    expect(productPayload.costPrice).toBe(expectedCostPrice);
    expect(productPayload.openingStockQuantity).toBe(2);

    const productResponseJson = await productResponse.json();
    const productId = productResponseJson?.content?.data?.id;
    expect(productId).toBeTruthy();
    const storedProduct = await page.evaluate(async id => (
        (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data ?? []
    ).find(item => item.id === id), productId);
    expect(storedProduct.unitPrice).toBe(expectedSalesPrice);
    expect(storedProduct.costPrice).toBe(expectedCostPrice);
    expect(storedProduct.openingStockQuantity).toBe(2);

    const documents = await page.evaluate(async ({ customerId, vendorId, key }) => {
        const unwrap = response => response?.data?.content?.data;
        const userId = StorageManager.getUserId();
        const orderDate = new Date().toISOString();
        const sales = unwrap(await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
            orderDate,
            orderStatus: '0',
            description: `${key} SO`,
            customerId,
            salesType: 1,
            createdById: userId
        }));
        const purchase = unwrap(await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate,
            orderStatus: '0',
            description: `${key} PO`,
            vendorId,
            createdById: userId
        }));
        return { sales, purchase };
    }, { customerId: lookup.customer.id, vendorId: lookup.vendor.id, key });
    salesOrderId = documents.sales.id;
    purchaseOrderId = documents.purchase.id;

    await page.goto('/SalesOrders/SalesOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), salesOrderId);
    await openSelectedDocument(page, '#MainGrid', salesOrderId);
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await page.locator('#SecondaryGrid_add').click();
    await page.waitForFunction(() => Boolean(
        document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
    ));
    await page.evaluate(() => document.querySelector(
        '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist'
    ).ej2_instances[0].showPopup());
    await selectOpenDropdownOption(page, key);

    const salesRow = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const priceColumn = grid.getColumnIndexByField('unitPrice');
        const cell = grid.getCellFromIndex(0, priceColumn);
        return {
            row: grid.getRowsObject()[0]?.data,
            priceText: cell?.innerText ?? cell?.textContent ?? '',
            parsedPrice: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? cell?.textContent ?? ''),
            isEdit: grid.isEdit,
            activeLabel: document.querySelector('#SecondaryGrid td.e-editedbatchcell')?.getAttribute('aria-label') ?? ''
        };
    });
    expect(salesRow.isEdit).toBe(true);
    expect(salesRow.activeLabel).toContain('Product');
    expect(salesRow.row.productId).toBe(productId);
    expect(salesRow.row.unitPrice).toBe(expectedSalesPrice);
    expect(salesRow.parsedPrice).toBe(expectedSalesPrice);

    await selectTaxAndSaveItem(page, lookup.tax.name);
    const persistedSalesItems = await page.evaluate(async id => (
        (await AxiosManager.get(`/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), salesOrderId);
    expect(persistedSalesItems).toHaveLength(1);
    expect(persistedSalesItems[0].productId).toBe(productId);
    expect(persistedSalesItems[0].unitPrice).toBe(expectedSalesPrice);
    expect(persistedSalesItems[0].taxId).toBe(lookup.tax.id);

    const reloadedSalesItem = await reloadAndReadItem(page, '/SalesOrders/SalesOrderList', salesOrderId);
    expect(reloadedSalesItem.productId).toBe(productId);
    expect(reloadedSalesItem.unitPrice).toBe(expectedSalesPrice);

    await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
    await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await page.locator('#SecondaryGrid_add').click();
    await page.waitForFunction(() => Boolean(
        document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
    ));
    await page.evaluate(() => document.querySelector(
        '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist'
    ).ej2_instances[0].showPopup());
    await selectOpenDropdownOption(page, key);

    const purchaseRow = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const priceColumn = grid.getColumnIndexByField('unitPrice');
        const cell = grid.getCellFromIndex(0, priceColumn);
        return {
            row: grid.getRowsObject()[0]?.data,
            parsedPrice: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? cell?.textContent ?? ''),
            isEdit: grid.isEdit
        };
    });
    expect(purchaseRow.isEdit).toBe(true);
    expect(purchaseRow.row.productId).toBe(productId);
    expect(purchaseRow.row.unitPrice).toBe(expectedCostPrice);
    expect(purchaseRow.parsedPrice).toBe(expectedCostPrice);

    await selectTaxAndSaveItem(page, lookup.tax.name);
    const persistedPurchaseItems = await page.evaluate(async id => (
        (await AxiosManager.get(`/PurchaseOrderItem/GetPurchaseOrderItemByPurchaseOrderIdList?purchaseOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), purchaseOrderId);
    expect(persistedPurchaseItems).toHaveLength(1);
    expect(persistedPurchaseItems[0].productId).toBe(productId);
    expect(persistedPurchaseItems[0].unitPrice).toBe(expectedCostPrice);
    expect(persistedPurchaseItems[0].taxId).toBe(lookup.tax.id);

    const reloadedPurchaseItem = await reloadAndReadItem(
        page,
        '/PurchaseOrders/PurchaseOrderList',
        purchaseOrderId
    );
    expect(reloadedPurchaseItem.productId).toBe(productId);
    expect(reloadedPurchaseItem.unitPrice).toBe(expectedCostPrice);

    await page.evaluate(async ({ salesOrderId, purchaseOrderId }) => {
        const userId = StorageManager.getUserId();
        await AxiosManager.post('/SalesOrder/DeleteSalesOrder', { id: salesOrderId, deletedById: userId });
        await AxiosManager.post('/PurchaseOrder/DeletePurchaseOrder', { id: purchaseOrderId, deletedById: userId });
    }, { salesOrderId, purchaseOrderId });
    salesOrderId = null;
    purchaseOrderId = null;
});
