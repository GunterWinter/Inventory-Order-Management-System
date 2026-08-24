const {
    test,
    expect,
    login,
    waitForVuePage,
    selectOpenDropdownOption,
    openSelectedDocument
} = require('./fixtures');
const fs = require('node:fs');
const path = require('node:path');

const dataOf = response => response?.data?.content?.data;

async function selectTaxAndSaveItem(page, taxName) {
    await page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].editCell(0, 'taxId'));
    await page.waitForFunction(() => Boolean(
        document.querySelector('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist')?.ej2_instances?.[0]
    ));
    await page.locator('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist').locator('xpath=..').click();
    await selectOpenDropdownOption(page, taxName);

    const quantityAfterTax = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('quantity'));
        return {
            row: Number(grid.getRowsObject()[0]?.data?.quantity),
            rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? '')
        };
    });

    const saved = await page.evaluate(async () => (
        GridInteractionManager.save(document.querySelector('#SecondaryGrid').ej2_instances[0])
    ));
    expect(saved).toBe(true);
    return quantityAfterTax;
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

async function searchAndSelectProduct(page, searchText, expectedProductName) {
    const editorSelector = '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist';
    const editorSettings = await page.evaluate(selector => {
        const dropdown = document.querySelector(selector)?.ej2_instances?.[0];
        return {
            allowFiltering: dropdown?.allowFiltering,
            filterBarPlaceholder: dropdown?.filterBarPlaceholder,
            locale: window.UiLocalization?.getLocale?.()
        };
    }, editorSelector);
    const expectedSearchPlaceholder = editorSettings.locale === 'en' ? 'Search' : 'Tìm kiếm';
    expect(editorSettings.allowFiltering).toBe(true);
    expect(editorSettings.filterBarPlaceholder).toBe(expectedSearchPlaceholder);

    await page.locator(editorSelector).locator('xpath=..').click();
    const popup = page.locator('.e-ddl.e-popup:visible').last();
    await popup.waitFor({ state: 'visible' });
    const options = page.locator('.e-ddl.e-popup:visible .e-list-item:visible');
    await expect.poll(() => options.count()).toBeGreaterThan(0);
    const filterInput = page.locator('input.e-input-filter:visible').last();
    await expect(filterInput).toHaveAttribute('placeholder', expectedSearchPlaceholder);

    await expect(filterInput).toBeFocused();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(searchText, { delay: 20 });
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(expectedProductName);
    await options.first().click();
}

async function beginProductItemEdit(page) {
    const editor = page.locator('#SecondaryGrid td.e-editedbatchcell .e-dropdownlist');
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await page.locator('#SecondaryGrid_add').click();
        try {
            await editor.waitFor({ state: 'attached', timeout: 4_000 });
            return;
        } catch {
            const rowCount = await page.evaluate(() => (
                document.querySelector('#SecondaryGrid')?.ej2_instances?.[0]?.getRowsObject?.().length ?? 0
            ));
            if (rowCount > 0) {
                await page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].editCell(0, 'productId'));
                await editor.waitFor({ state: 'attached', timeout: 4_000 });
                return;
            }
        }
    }
    throw new Error('Product item editor did not open after using the Add toolbar action.');
}

test('Product tồn đầu kỳ giữ giá và PO/SO hiển thị đúng giá ngay khi chọn hàng', async ({ monitoredPage: page }) => {
    let salesOrderId = null;
    let purchaseOrderId = null;
    const key = `E2E-PRICE-${Date.now()}`;
    const productName = `Dây điện ${key}`;
    const productSearchText = `DAY DIEN ${key.toUpperCase()}`;
    const expectedSalesPrice = 345000.75;
    const expectedCostPrice = 234000.25;
    const expectedOpeningStock = 2.5;
    const expectedSalesQuantity = 1.25;

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
    await page.locator('input[placeholder="Enter Name"]').fill(productName);
    await page.locator('input[placeholder="Enter Reference Code (SKU/Custom)"]').fill(`${key}-REF`);
    const costPriceInput = page.locator('input[placeholder="Enter Cost Price"]');
    const salesPriceInput = page.locator('input[placeholder="Enter Unit Price"]');
    await costPriceInput.pressSequentially('234000,25');
    await salesPriceInput.pressSequentially('345000,75');
    await expect(costPriceInput).toHaveValue('234.000,25');
    await expect(salesPriceInput).toHaveValue('345.000,75');
    await page.locator('input[placeholder="Enter Unit Measure"]').fill('PCS');

    await page.locator('input[placeholder="Select a Product Group"]').locator('xpath=..').click();
    await selectOpenDropdownOption(page, lookup.group.name);
    await page.locator('input[placeholder="Select a Warehouse"]').locator('xpath=..').click();
    await selectOpenDropdownOption(page, lookup.warehouse.name);

    // Save immediately after editing the last NumericTextBox. This guards against
    // stale reactive state when Syncfusion has not emitted its delayed change event.
    const openingStockInput = page.locator('#OpeningStockQuantity');
    await openingStockInput.fill('');
    await openingStockInput.pressSequentially('2,5');
    await expect(openingStockInput).toHaveValue('2,5');
    const productRequestPromise = page.waitForRequest(request => request.url().includes('/api/Product/CreateProduct'));
    const productResponsePromise = page.waitForResponse(response => response.url().includes('/api/Product/CreateProduct'));
    await page.locator('#MainSaveButton').click();
    const productRequest = await productRequestPromise;
    const productResponse = await productResponsePromise;
    expect(productResponse.status()).toBe(200);
    const productPayload = productRequest.postDataJSON();
    expect(productPayload.unitPrice).toBe(expectedSalesPrice);
    expect(productPayload.costPrice).toBe(expectedCostPrice);
    expect(productPayload.openingStockQuantity).toBe(expectedOpeningStock);

    const productResponseJson = await productResponse.json();
    const productId = productResponseJson?.content?.data?.id;
    expect(productId).toBeTruthy();
    const storedProduct = await page.evaluate(async id => (
        (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data ?? []
    ).find(item => item.id === id), productId);
    expect(storedProduct.unitPrice).toBe(expectedSalesPrice);
    expect(storedProduct.costPrice).toBe(expectedCostPrice);
    expect(storedProduct.openingStockQuantity).toBe(expectedOpeningStock);

    await page.goto('/StockReports/StockReportList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.productId === id), productId);
    const stockView = await page.evaluate(id => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        const record = grid.dataSource.find(item => item.productId === id);
        return {
            groupColumns: grid.groupSettings?.columns ?? [],
            stock: record.stock
        };
    }, productId);
    expect(stockView.groupColumns).toEqual(['warehouseName', 'productName']);
    expect(stockView.stock).toBe(expectedOpeningStock);
    await expect(page.locator('#MainGrid .e-row', { hasText: key }).first()).toContainText('2,5');

    await page.goto('/TransactionReports/TransactionReportList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(() => document.querySelector('#MainGrid')?.ej2_instances?.[0]?.dataSource?.length > 0);
    const transactionView = await page.evaluate(() => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        return { groupColumns: grid.groupSettings?.columns ?? [], dataCount: grid.dataSource.length };
    });
    expect(transactionView.groupColumns).toEqual(['productName']);
    expect(transactionView.dataCount).toBeGreaterThan(0);
    await expect(page.locator('#MainGrid tr', { hasText: key }).first()).toContainText('2.50');
    expect(await page.locator('#MainGrid .e-row').count()).toBeGreaterThan(0);

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
    await beginProductItemEdit(page);
    await searchAndSelectProduct(page, productSearchText, productName);

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

    await page.evaluate(() => document.querySelector('#SecondaryGrid').ej2_instances[0].editCell(0, 'quantity'));
    const salesQuantityInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await salesQuantityInput.fill('');
    await salesQuantityInput.pressSequentially('1,25');
    await expect(salesQuantityInput).toHaveValue('1,25');
    expect(await salesQuantityInput.evaluate(element => element.ej2_instances?.[0]?.value)).toBe(expectedSalesQuantity);

    const salesQuantityAfterTax = await selectTaxAndSaveItem(page, lookup.tax.name);
    expect(salesQuantityAfterTax).toEqual({ row: expectedSalesQuantity, rendered: expectedSalesQuantity });
    const renderedSalesRow = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const productCell = grid.getCellFromIndex(0, grid.getColumnIndexByField('productId'));
        const stockCell = grid.getCellFromIndex(0, grid.getColumnIndexByField('availableStock'));
        return {
            product: productCell?.innerText?.trim() ?? '',
            availableStock: NumberFormatManager.parseLocaleNumber(stockCell?.innerText ?? '')
        };
    });
    expect(renderedSalesRow.product).toContain(key);
    expect(renderedSalesRow.product).not.toContain(productId);
    expect(renderedSalesRow.availableStock).toBe(expectedOpeningStock);
    await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });
    await page.evaluate(() => {
        const content = document.querySelector('#SecondaryGrid .e-content');
        if (content) content.scrollLeft = 0;
    });
    const screenshotDirectory = path.resolve('artifacts/screenshots');
    fs.mkdirSync(screenshotDirectory, { recursive: true });
    await page.locator('#MainModal .modal-content').screenshot({
        path: path.join(screenshotDirectory, 'sales-order-stock-and-lookup.png')
    });
    const persistedSalesItems = await page.evaluate(async id => (
        (await AxiosManager.get(`/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), salesOrderId);
    expect(persistedSalesItems).toHaveLength(1);
    expect(persistedSalesItems[0].productId).toBe(productId);
    expect(persistedSalesItems[0].unitPrice).toBe(expectedSalesPrice);
    expect(persistedSalesItems[0].quantity).toBe(expectedSalesQuantity);
    expect(persistedSalesItems[0].taxId).toBe(lookup.tax.id);

    const reloadedSalesItem = await reloadAndReadItem(page, '/SalesOrders/SalesOrderList', salesOrderId);
    expect(reloadedSalesItem.productId).toBe(productId);
    expect(reloadedSalesItem.unitPrice).toBe(expectedSalesPrice);
    expect(reloadedSalesItem.quantity).toBe(expectedSalesQuantity);

    await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
    await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await beginProductItemEdit(page);
    await searchAndSelectProduct(page, productSearchText, productName);

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

test('Sales Order hiển thị số lượng bằng số serial đã chọn', async ({ monitoredPage: page }) => {
    const key = `E2E-SERIAL-QTY-${Date.now()}`;
    const unitPrice = 125000;

    await login(page);
    const fixture = await page.evaluate(async ({ key, unitPrice }) => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groups, warehouses, customers, taxes] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {}),
            AxiosManager.get('/Tax/GetTaxList', {})
        ]);
        const group = unwrap(groups)[0];
        const warehouse = unwrap(warehouses).find(item => item.systemWarehouse === false);
        const customer = unwrap(customers)[0];
        const tax = unwrap(taxes)[0];
        const productResponse = await AxiosManager.post('/Product/CreateProduct', {
            name: key,
            referenceCode: `${key}-REF`,
            unitPrice,
            costPrice: 100000,
            physical: true,
            serialTrackingMode: 1,
            internalSerialFixedCode: 'E2E',
            defaultWarehouseId: warehouse.id,
            defaultWarrantyMonths: 0,
            unitMeasureName: 'PCS',
            productGroupId: group.id,
            openingStockQuantity: 3,
            createdById: userId
        });
        const salesResponse = await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
            orderDate: new Date().toISOString(),
            orderStatus: '0',
            description: `${key} SO`,
            customerId: customer.id,
            salesType: 1,
            createdById: userId
        });
        return {
            product: productResponse?.data?.content?.data,
            salesOrder: salesResponse?.data?.content?.data,
            tax
        };
    }, { key, unitPrice });
    expect(fixture.product?.id).toBeTruthy();
    expect(fixture.salesOrder?.id).toBeTruthy();

    await page.goto('/SalesOrders/SalesOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), fixture.salesOrder.id);
    await openSelectedDocument(page, '#MainGrid', fixture.salesOrder.id);
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await beginProductItemEdit(page);
    await page.evaluate(() => document.querySelector(
        '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist'
    ).ej2_instances[0].showPopup());
    await selectOpenDropdownOption(page, key);
    await page.waitForFunction(() => {
        const button = document.querySelector('#SecondaryGrid .so-serial-picker');
        return button && !button.disabled;
    });

    await page.locator('#SecondaryGrid .so-serial-picker').click();
    await page.waitForSelector('#ProductSerialPickerModal.show');
    const serialChecks = page.locator('#ProductSerialPickerBody .product-serial-picker-check');
    await expect(serialChecks).toHaveCount(3);
    await serialChecks.nth(0).check();
    await serialChecks.nth(1).check();
    await page.locator('#ProductSerialPickerApply').click();
    await page.waitForSelector('#ProductSerialPickerModal', { state: 'hidden' });

    const selectedState = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const row = grid.getRowsObject()[0]?.data;
        const added = grid.getBatchChanges().addedRecords[0];
        const quantityCell = grid.getCellFromIndex(0, grid.getColumnIndexByField('quantity'));
        return {
            rowQuantity: Number(row?.quantity),
            rowSerialCount: row?.productSerialIds?.length ?? 0,
            addedQuantity: Number(added?.quantity),
            addedSerialCount: added?.productSerialIds?.length ?? 0,
            renderedQuantity: NumberFormatManager.parseLocaleNumber(quantityCell?.innerText ?? '')
        };
    });
    expect(selectedState).toEqual({
        rowQuantity: 2,
        rowSerialCount: 2,
        addedQuantity: 2,
        addedSerialCount: 2,
        renderedQuantity: 2
    });

    const quantityAfterTax = await selectTaxAndSaveItem(page, fixture.tax.name);
    expect(quantityAfterTax).toEqual({ row: 2, rendered: 2 });
    const persisted = await page.evaluate(async id => (
        (await AxiosManager.get(`/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), fixture.salesOrder.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].quantity).toBe(2);
    expect(persisted[0].productSerialIds).toHaveLength(2);
});
