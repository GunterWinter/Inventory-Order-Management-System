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

async function openActiveGridDropdown(page, editorSelector) {
    const editor = page.locator(editorSelector);
    const editorId = await editor.getAttribute('id');
    const popup = editorId ? page.locator(`#${editorId}_popup`) : page.locator('.e-ddl.e-popup').last();
    await expect.poll(() => editor.evaluate(element => element.ej2_instances?.[0]?.dataSource?.length ?? 0))
        .toBeGreaterThan(0);
    if (await popup.isVisible().catch(() => false)) return popup;

    const icon = editor.locator('xpath=..').locator('.e-ddl-icon');
    await icon.click();
    try {
        await popup.waitFor({ state: 'visible', timeout: 1_000 });
    } catch {
        await icon.click();
    }
    await popup.waitFor({ state: 'visible' });
    return popup;
}

async function gridCellByHeader(page, headerText) {
    const grid = page.locator('#SecondaryGrid');
    const headers = grid.locator('.e-headercell:visible');
    for (let index = 0; index < await headers.count(); index += 1) {
        if (headerText.test((await headers.nth(index).innerText()).trim())) {
            return grid.locator('.e-row').first().locator('td.e-rowcell:visible').nth(index);
        }
    }
    throw new Error(`Không tìm thấy cột ${headerText}.`);
}

async function gridCellByHeaderIn(page, gridSelector, headerText) {
    const grid = page.locator(gridSelector);
    const headers = grid.locator('.e-headercell:visible');
    for (let index = 0; index < await headers.count(); index += 1) {
        if (headerText.test((await headers.nth(index).innerText()).trim())) {
            return grid.locator('.e-row').first().locator('td.e-rowcell:visible').nth(index);
        }
    }
    throw new Error(`Không tìm thấy cột ${headerText} trong ${gridSelector}.`);
}

async function selectTaxAndSaveItem(page, taxName, taxId) {
    const taxCell = await gridCellByHeader(page, /Thuế|Tax/i);
    await taxCell.dblclick();
    const editorSelector = '#SecondaryGrid td.e-editedbatchcell input.e-input';
    const popup = await openActiveGridDropdown(page, editorSelector);
    await popup.locator('.e-list-item:visible').filter({ hasText: taxName }).first().click();

    const quantityAfterTax = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('quantity'));
        return {
            row: Number(grid.getRowsObject()[0]?.data?.quantity),
            rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? '')
        };
    });

    const endpoint = page.url().includes('/PurchaseOrders/')
        ? '/PurchaseOrderItem/CreatePurchaseOrderItem'
        : '/SalesOrderItem/CreateSalesOrderItem';
    const responsePromise = page.waitForResponse(response => response.url().includes(endpoint)
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    expect((await responsePromise).status()).toBe(200);
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

async function searchAndSelectProduct(page, _searchText, expectedProductName) {
    const editorSelector = '#SecondaryGrid td.e-editedbatchcell input.e-input';
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

    const popup = await openActiveGridDropdown(page, editorSelector);
    const filterInput = popup.locator('input.e-input-filter');
    await expect(filterInput).toHaveAttribute('placeholder', expectedSearchPlaceholder);
    const options = popup.locator('.e-list-item:visible').filter({ hasText: expectedProductName });
    await expect(options).toHaveCount(1);
    await expect(options.first()).toContainText(expectedProductName);
    await options.first().click();
}

async function beginProductItemEdit(page) {
    const editor = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-input');
    await page.waitForFunction(() => {
        const modal = document.querySelector('#MainModal.show');
        const dialog = modal?.querySelector('.modal-dialog');
        return dialog && getComputedStyle(dialog).transform === 'none';
    });

    const addButton = page.locator('#SecondaryGrid_add');
    await expect(addButton).toBeEnabled();
    await addButton.click();
    await editor.waitFor({ state: 'visible', timeout: 8_000 });
}

async function selectStatusByLabel(page, labelFor, text) {
    const input = page.locator(`#MainModal label[for="${labelFor}"]`)
        .locator('xpath=..')
        .locator('input.e-input')
        .first();
    await expect(input).toBeEnabled();
    await input.locator('xpath=..').click();
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await expect(popup).toBeVisible();
    await popup.locator('.e-list-item').filter({ hasText: text }).first().click();
}

test('Product tồn đầu kỳ giữ giá và PO/SO hiển thị đúng giá ngay khi chọn hàng', async ({ monitoredPage: page }) => {
    test.slow();
    let salesOrderId = null;
    let purchaseOrderId = null;
    const key = `E2E-PRICE-${Date.now()}`;
    const productName = `Dây điện ${key}`;
    const productSearchText = `DAY DIEN ${key.toUpperCase()}`;
    const expectedSalesPrice = 345000.75;
    const expectedCostPrice = 1232.2323;
    const expectedOpeningStock = 2.5;
    const expectedSalesQuantity = 1.25;
    const editedSalesPrice = 456789.125;
    const editedPurchasePrice = 321987.625;
    const editedPurchaseQuantity = 2.5;
    const allocatedPurchasePrice = 2232.2323;
    const fifoPurchaseQuantity = 3;
    const allocatedPurchaseQuantity = 1;
    const fifoExportQuantity = 3;
    const fifoTotalCost = expectedOpeningStock * expectedCostPrice
        + (fifoExportQuantity - expectedOpeningStock) * allocatedPurchasePrice;
    const fifoAverageCost = Number((fifoTotalCost / fifoExportQuantity).toFixed(6));
    const today = new Date();
    const expectedOpeningDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

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

    await page.waitForFunction(() => Boolean(
        bootstrap.Modal.getInstance(document.querySelector('#MainModal'))
    ));
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    const expectedOpeningDateText = await page.evaluate(() => DateFormatManager.formatToLocale(
        new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    ));
    await expect(page.locator('#MainModal')).toContainText(expectedOpeningDateText);
    await page.locator('input[placeholder="Enter Name"]').fill(productName);
    await page.locator('input[placeholder="Enter Reference Code (SKU/Custom)"]').fill(`${key}-REF`);
    const costPriceInput = page.locator('input[placeholder="Enter Cost Price"]');
    const salesPriceInput = page.locator('input[placeholder="Enter Unit Price"]');
    await costPriceInput.pressSequentially('1232,2323');
    await salesPriceInput.pressSequentially('345000,75');
    await expect(costPriceInput).toHaveValue('1.232,2323');
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
    expect(String(storedProduct.openingStockDate).slice(0, 10)).toBe(expectedOpeningDate);

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
    expect(stockView.groupColumns).toEqual(['warehouseName', 'productGroupName', 'productName']);
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
    await expect(page.locator('#MainGrid tr', { hasText: key }).first()).toContainText('2,5');
    const transactionRecord = await page.evaluate(id => {
        const grid = document.querySelector('#MainGrid').ej2_instances[0];
        const record = grid.dataSource.find(item => item.productId === id);
        return {
            productName: record?.productName,
            movement: record?.movement,
            stock: record?.stock,
            height: Number(grid.height)
        };
    }, productId);
    expect(transactionRecord.productName).toBe(productName);
    expect(transactionRecord.movement).toBe(expectedOpeningStock);
    expect(transactionRecord.stock).toBe(expectedOpeningStock);
    expect(transactionRecord.height).toBeGreaterThanOrEqual(420);
    expect(await page.locator('#MainGrid .e-row').count()).toBeGreaterThan(0);

    await test.step('Material Export previews decimal warehouse stock as soon as a product is selected', async () => {
        await page.goto('/MaterialExports/MaterialExportList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.locator('#AddCustom').click();
        await page.waitForSelector('#MainModal.show');

        const exportDateInput = page.locator('#MainModal .e-datepicker').first();
        const locale = await page.evaluate(() => window.UiLocalization?.getLocale?.() ?? 'vi');
        await exportDateInput.fill(locale === 'vi' ? '25/08/2026' : '08/25/2026');
        await exportDateInput.press('Tab');
        const stockLookupResponsePromise = page.waitForResponse(response => (
            response.url().includes('/MaterialExport/GetWarehouseProductStock') && response.status() === 200
        ));
        await page.locator('#MainModal input[placeholder="Chọn Kho"]').locator('xpath=..').click();
        await selectOpenDropdownOption(page, lookup.warehouse.name);
        await stockLookupResponsePromise;
        await page.locator('#MainModal input[placeholder="Chọn Khách hàng"]').locator('xpath=..').click();
        await selectOpenDropdownOption(page, lookup.customer.name);

        const materialExportResponsePromise = page.waitForResponse(response => (
            response.url().includes('/MaterialExport/CreateMaterialExport') && response.status() === 200
        ));
        await page.locator('#MainModal .modal-footer .btn-primary').click();
        const materialExportResponse = await materialExportResponsePromise;
        const materialExport = (await materialExportResponse.json())?.content?.data;
        expect(materialExport?.id).toBeTruthy();
        await expect(page.locator('#MainModal #ComplexDiv')).toBeVisible();
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });

        await beginProductItemEdit(page);
        await searchAndSelectProduct(page, productSearchText, productName);
        await expect.poll(async () => page.evaluate(() => {
            const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
            const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('remainingDisplay'));
            const row = grid.getRowsObject()[0]?.data;
            return {
                rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? ''),
                rowProductId: row?.productId ?? null
            };
        })).toEqual({ rendered: expectedOpeningStock, rowProductId: productId });

        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
        const materialExportRow = page.locator('#MainGrid .e-row', { hasText: materialExport.number }).first();
        await materialExportRow.click();
        await page.locator('#DeleteCustom').click();
        await page.locator('.swal2-confirm').click();
        await expect(materialExportRow).toHaveCount(0);
    });

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
            parsedPrice: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? cell?.textContent ?? '')
        };
    });
    expect(salesRow.row.productId).toBe(productId);
    expect(salesRow.row.unitPrice).toBe(expectedSalesPrice);
    expect(salesRow.parsedPrice).toBe(expectedSalesPrice);

    await (await gridCellByHeader(page, /Unit Price|Đơn giá/i)).dblclick();
    const orderSalesPriceInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await orderSalesPriceInput.click();
    await orderSalesPriceInput.press('Control+A');
    await orderSalesPriceInput.pressSequentially('456789,125');
    await expect(orderSalesPriceInput).toHaveValue('456.789,125');
    await page.locator('#MainModal .modal-title').click();
    await expect.poll(() => page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('unitPrice'));
        return {
            row: Number(grid.getRowsObject()[0]?.data?.unitPrice),
            rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? '')
        };
    })).toEqual({ row: editedSalesPrice, rendered: editedSalesPrice });

    await (await gridCellByHeader(page, /Quantity|Số lượng/i)).dblclick();
    const salesQuantityInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await salesQuantityInput.click();
    await salesQuantityInput.press('Control+A');
    await salesQuantityInput.pressSequentially('1,25');
    await expect(salesQuantityInput).toHaveValue('1,25');
    expect(await salesQuantityInput.evaluate(element => element.ej2_instances?.[0]?.value)).toBe(expectedSalesQuantity);

    const salesQuantityAfterTax = await selectTaxAndSaveItem(page, lookup.tax.name, lookup.tax.id);
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
    expect(persistedSalesItems[0].unitPrice).toBe(editedSalesPrice);
    expect(persistedSalesItems[0].quantity).toBe(expectedSalesQuantity);
    expect(persistedSalesItems[0].taxId).toBe(lookup.tax.id);

    const reloadedSalesItem = await reloadAndReadItem(page, '/SalesOrders/SalesOrderList', salesOrderId);
    expect(reloadedSalesItem.productId).toBe(productId);
    expect(reloadedSalesItem.unitPrice).toBe(editedSalesPrice);
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
            parsedPrice: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? cell?.textContent ?? '')
        };
    });
    expect(purchaseRow.row.productId).toBe(productId);
    expect(purchaseRow.row.unitPrice).toBe(expectedCostPrice);
    expect(purchaseRow.parsedPrice).toBe(expectedCostPrice);

    await (await gridCellByHeader(page, /Unit Price|Đơn giá/i)).dblclick();
    const purchasePriceInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await purchasePriceInput.click();
    await purchasePriceInput.press('Control+A');
    await purchasePriceInput.pressSequentially('321987,625');
    await expect(purchasePriceInput).toHaveValue('321.987,625');
    await page.locator('#MainModal .modal-title').click();
    await expect.poll(() => page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('unitPrice'));
        return {
            row: Number(grid.getRowsObject()[0]?.data?.unitPrice),
            rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? '')
        };
    })).toEqual({ row: editedPurchasePrice, rendered: editedPurchasePrice });

    // Restore the product's exact cost after exercising the six-decimal editor.
    // Opening stock and the PO then share one source cost, so weighted costing
    // must remain 1.232,2323 instead of producing 1.232,231232.
    await (await gridCellByHeader(page, /Unit Price|Đơn giá/i)).dblclick();
    const exactPurchasePriceInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await exactPurchasePriceInput.click();
    await exactPurchasePriceInput.press('Control+A');
    await exactPurchasePriceInput.pressSequentially('1232,2323');
    await expect(exactPurchasePriceInput).toHaveValue('1.232,2323');
    await page.locator('#MainModal .modal-title').click();
    await expect.poll(() => page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = grid.getCellFromIndex(0, grid.getColumnIndexByField('unitPrice'));
        return {
            row: Number(grid.getRowsObject()[0]?.data?.unitPrice),
            rendered: NumberFormatManager.parseLocaleNumber(cell?.innerText ?? '')
        };
    })).toEqual({ row: expectedCostPrice, rendered: expectedCostPrice });

    await (await gridCellByHeader(page, /Quantity|Số lượng/i)).dblclick();
    const purchaseQuantityInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await purchaseQuantityInput.click();
    await purchaseQuantityInput.press('Control+A');
    await purchaseQuantityInput.pressSequentially('2,5');
    await expect(purchaseQuantityInput).toHaveValue('2,5');

    await selectTaxAndSaveItem(page, lookup.tax.name, lookup.tax.id);
    const persistedPurchaseItems = await page.evaluate(async id => (
        (await AxiosManager.get(`/PurchaseOrderItem/GetPurchaseOrderItemByPurchaseOrderIdList?purchaseOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), purchaseOrderId);
    expect(persistedPurchaseItems).toHaveLength(1);
    expect(persistedPurchaseItems[0].productId).toBe(productId);
    expect(persistedPurchaseItems[0].unitPrice).toBe(expectedCostPrice);
    expect(persistedPurchaseItems[0].quantity).toBe(editedPurchaseQuantity);
    expect(persistedPurchaseItems[0].taxId).toBe(lookup.tax.id);

    const reloadedPurchaseItem = await reloadAndReadItem(
        page,
        '/PurchaseOrders/PurchaseOrderList',
        purchaseOrderId
    );
    expect(reloadedPurchaseItem.productId).toBe(productId);
    expect(reloadedPurchaseItem.unitPrice).toBe(expectedCostPrice);
    expect(reloadedPurchaseItem.quantity).toBe(editedPurchaseQuantity);

    // Keep the decimal persistence coverage above, then make this receipt a
    // distinct integer-priced lot so part of that newer lot remains in stock.
    // The later material export must consume the older opening layer first.
    await (await gridCellByHeader(page, /Unit Price|Đơn giá/i)).dblclick();
    const allocatedPriceInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await allocatedPriceInput.click();
    await allocatedPriceInput.press('Control+A');
    await allocatedPriceInput.pressSequentially('2232,2323');
    await page.locator('#MainModal .modal-title').click();
    await (await gridCellByHeader(page, /Quantity|Số lượng/i)).dblclick();
    const allocatedQuantityInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await allocatedQuantityInput.click();
    await allocatedQuantityInput.press('Control+A');
    await allocatedQuantityInput.pressSequentially(String(fifoPurchaseQuantity));
    await page.locator('#MainModal .modal-title').click();
    const updatePurchaseItemPromise = page.waitForResponse(response => response.url().includes('/PurchaseOrderItem/UpdatePurchaseOrderItem')
        && response.request().method() === 'POST');
    await page.locator('#SecondaryGrid_update').click();
    const updatePurchaseItemResponse = await updatePurchaseItemPromise;
    expect(updatePurchaseItemResponse.status()).toBe(200);
    expect(updatePurchaseItemResponse.request().postDataJSON()).toEqual(expect.objectContaining({
        unitPrice: allocatedPurchasePrice,
        quantity: fifoPurchaseQuantity
    }));

    await test.step('Material Export uses FIFO instead of averaging an older opening layer with a newer PO lot', async () => {
        const purchaseDateInput = page.locator('#MainModal .e-datepicker').first();
        const purchaseLocale = await page.evaluate(() => window.UiLocalization?.getLocale?.() ?? 'vi');
        await purchaseDateInput.fill(purchaseLocale === 'vi' ? '10/08/2026' : '08/10/2026');
        await purchaseDateInput.press('Tab');
        await selectStatusByLabel(page, 'OrderStatus', /Confirmed|Đã xác nhận/i);
        const confirmPoPromise = page.waitForResponse(response => response.url().includes('/PurchaseOrder/UpdatePurchaseOrder')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#MainSaveButton').click();
        await page.locator('.swal2-confirm').click();
        const confirmPoResponse = await confirmPoPromise;
        expect(String(confirmPoResponse.request().postDataJSON().orderDate).slice(0, 10)).toBe('2026-08-10');
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });

        await expect(page.locator('#CostAllocateCustom')).toBeEnabled();
        await page.locator('#CostAllocateCustom').click();
        await page.waitForSelector('#CostAllocationModal.show');
        const allocationCustomerCell = await gridCellByHeaderIn(page, '#CostAllocationPreviewGrid', /Customer|Khách hàng/i);
        await allocationCustomerCell.dblclick();
        const allocationCustomerEditor = '#CostAllocationPreviewGrid td.e-editedbatchcell input.e-input';
        const allocationCustomerPopup = await openActiveGridDropdown(page, allocationCustomerEditor);
        await allocationCustomerPopup.locator('.e-list-item:visible').filter({ hasText: lookup.customer.name }).first().click();

        const allocationQuantityCell = await gridCellByHeaderIn(page, '#CostAllocationPreviewGrid', /Allocation Quantity|Số lượng phân bổ/i);
        await allocationQuantityCell.dblclick();
        const allocationQuantityInput = page.locator('#CostAllocationPreviewGrid td.e-editedbatchcell input.e-numerictextbox');
        await allocationQuantityInput.click();
        await allocationQuantityInput.press('Control+A');
        await allocationQuantityInput.pressSequentially(String(allocatedPurchaseQuantity));
        await page.locator('#CostAllocationModal .modal-title').click();

        const allocationPromise = page.waitForResponse(response => response.url().includes('/PurchaseOrder/AllocatePurchaseOrderCosts')
            && response.request().method() === 'POST');
        await page.locator('#CostAllocationSaveButton').click();
        const allocationResponse = await allocationPromise;
        expect(allocationResponse.status()).toBe(200);
        expect(allocationResponse.request().postDataJSON().items).toEqual([
            expect.objectContaining({
                customerId: lookup.customer.id,
                quantity: allocatedPurchaseQuantity
            })
        ]);
        await page.waitForSelector('#CostAllocationModal', { state: 'hidden' });
        await page.locator('.swal2-cancel').click();
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });

        await page.goto('/MaterialExports/MaterialExportList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.locator('#AddCustom').click();
        await page.waitForSelector('#MainModal.show');
        const exportDateInput = page.locator('#MainModal .e-datepicker').first();
        const exportLocale = await page.evaluate(() => window.UiLocalization?.getLocale?.() ?? 'vi');
        await exportDateInput.fill(exportLocale === 'vi' ? '20/08/2026' : '08/20/2026');
        await exportDateInput.press('Tab');
        const stockLookupPromise = page.waitForResponse(response => response.url().includes('/MaterialExport/GetWarehouseProductStock')
            && response.status() === 200);
        await page.locator('#MainModal input[placeholder="Chọn Kho"]').locator('xpath=..').click();
        await selectOpenDropdownOption(page, lookup.warehouse.name);
        await stockLookupPromise;
        await page.locator('#MainModal input[placeholder="Chọn Khách hàng"]').locator('xpath=..').click();
        await selectOpenDropdownOption(page, lookup.customer.name);
        const createExportPromise = page.waitForResponse(response => response.url().includes('/MaterialExport/CreateMaterialExport')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#MainModal .modal-footer .btn-primary').click();
        const materialExport = (await (await createExportPromise).json())?.content?.data;
        expect(materialExport?.id).toBeTruthy();
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });

        await beginProductItemEdit(page);
        await searchAndSelectProduct(page, productSearchText, productName);
        const movementCell = await gridCellByHeader(page, /Quantity|Số lượng/i);
        await movementCell.dblclick();
        const movementInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
        await movementInput.click();
        await movementInput.press('Control+A');
        await movementInput.pressSequentially(String(fifoExportQuantity));
        await page.locator('#MainModal .modal-title').click();
        const createLinePromise = page.waitForResponse(response => response.url().includes('/InventoryTransaction/MaterialExportCreateInvenTrans')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#SecondaryGrid_update').click();
        const createLineResponse = await createLinePromise;
        expect(Number(createLineResponse.request().postDataJSON().movement)).toBe(fifoExportQuantity);

        await selectStatusByLabel(page, 'Status', /Confirmed|Đã xác nhận/i);
        const confirmExportPromise = page.waitForResponse(response => response.url().includes('/MaterialExport/UpdateMaterialExport')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#MainModal .modal-footer .btn-primary').click();
        await page.locator('.swal2-confirm').click();
        await confirmExportPromise;

        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), materialExport.id);
        await openSelectedDocument(page, '#MainGrid', materialExport.id);
        await page.waitForFunction(() => (
            document.querySelector('#MainModal.show #SecondaryGrid')?.ej2_instances?.[0]?.dataSource?.length === 1
        ));

        await expect(await gridCellByHeader(page, /Product|Hàng hóa/i)).toContainText(productName);
        await expect(await gridCellByHeader(page, /Reference Code|Mã Tham Khảo/i)).toContainText(`${key}-REF`);
        await expect(await gridCellByHeader(page, /Inventory|Tồn kho|Kho/i)).toHaveText(/^1[,.]5(?:0+)?$/);
        await expect.poll(async () => (await gridCellByHeader(page, /Average Cost|Giá Vốn Bình Quân/i))
            .evaluate(element => NumberFormatManager.parseLocaleNumber(element.innerText))).toBe(fifoAverageCost);
        await expect.poll(async () => (await gridCellByHeader(page, /Total Cost|Tổng Giá Vốn/i))
            .evaluate(element => NumberFormatManager.parseLocaleNumber(element.innerText))).toBe(fifoTotalCost);
        await expect(await gridCellByHeader(page, /Cost Status|Trạng Thái Giá Vốn/i)).toContainText(/Đã chốt/i);
        await page.locator('#SecondaryGrid .cost-layer-details').click();
        await expect(page.locator('.swal2-popup tbody tr')).toHaveCount(2);
        await page.locator('.swal2-confirm').click();

        const downstream = await page.evaluate(async exportId => {
            const lines = (await AxiosManager.get(
                `/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=${encodeURIComponent(exportId)}`, {}))
                ?.data?.content?.data ?? [];
            const header = (await AxiosManager.get('/MaterialExport/GetMaterialExportList', {}))
                ?.data?.content?.data?.find(item => item.id === exportId);
            const lookup = header
                ? (await AxiosManager.get(
                    `/MaterialExport/GetWarehouseProductStock?warehouseId=${encodeURIComponent(header.warehouseId)}`
                    + `&materialExportId=${encodeURIComponent(exportId)}`, {}))
                    ?.data?.content?.data ?? []
                : [];
            const transactions = (await AxiosManager.get('/CashTransaction/GetCashTransactionList', {}))
                ?.data?.content?.data ?? [];
            const cash = transactions.find(item => item.sourceModule === 'MaterialExport'
                && item.sourceModuleId === exportId);
            const sourceItems = cash
                ? (await AxiosManager.get(
                    `/CashTransaction/GetCashTransactionSourceItems?cashTransactionId=${encodeURIComponent(cash.id)}`, {}))
                    ?.data?.content?.data ?? []
                : [];
            return { line: lines[0], lookupItem: lookup.find(item => item.productId === lines[0]?.productId), cash, sourceItem: sourceItems[0] };
        }, materialExport.id);
        expect(downstream.line.unitCost).toBe(fifoAverageCost);
        expect(downstream.line.costAllocations).toHaveLength(2);
        expect(downstream.lookupItem?.productName).toBe(productName);
        expect(downstream.lookupItem?.referenceCode).toBe(`${key}-REF`);
        expect(downstream.lookupItem?.stockQuantity).toBe(expectedOpeningStock + fifoPurchaseQuantity - allocatedPurchaseQuantity - fifoExportQuantity);
        expect(downstream.cash.amount).toBe(fifoTotalCost);
        expect(downstream.sourceItem.unitPrice).toBe(fifoAverageCost);
        expect(downstream.sourceItem.quantity).toBe(fifoExportQuantity);
        expect(downstream.sourceItem.total).toBe(fifoTotalCost);

        // Return the confirmed fixtures to Draft through the visible lifecycle controls
        // so the remainder of this scenario can still exercise Draft-only source rules.
        await selectStatusByLabel(page, 'Status', /Draft|Nháp/i);
        const reopenExportPromise = page.waitForResponse(response => response.url().includes('/MaterialExport/UpdateMaterialExport')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#MainModal .modal-footer .btn-primary').click();
        await reopenExportPromise;
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
        const exportRow = page.locator('#MainGrid .e-row', { hasText: materialExport.number }).first();
        await exportRow.getByRole('checkbox').check();
        await page.locator('#DeleteCustom').click();
        await page.locator('.swal2-confirm').click();
        await expect(exportRow).toHaveCount(0);

        await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
        await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
        await page.waitForSelector('#MainModal.show');
        await selectStatusByLabel(page, 'OrderStatus', /Draft|Nháp/i);
        const reopenPoPromise = page.waitForResponse(response => response.url().includes('/PurchaseOrder/UpdatePurchaseOrder')
            && response.request().method() === 'POST' && response.status() === 200);
        await page.locator('#MainSaveButton').click();
        await reopenPoPromise;
        await expect(page.locator('.swal2-container')).toBeHidden({ timeout: 10000 });
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
    });

    for (const [route, draftOrderId] of [
        ['/SalesReturns/SalesReturnList', salesOrderId],
        ['/PurchaseReturns/PurchaseReturnList', purchaseOrderId]
    ]) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.locator('#AddCustom').click();
        await page.waitForSelector('#MainModal.show');
        const sourceIds = await page.locator('#MainModal .e-dropdownlist').first().evaluate(element => (
            element.ej2_instances?.[0]?.dataSource?.map?.(item => item.id) ?? []
        ));
        expect(sourceIds).not.toContain(draftOrderId);
        await page.locator('#MainModal .btn-close').click();
        await page.waitForSelector('#MainModal', { state: 'hidden' });
    }

    await page.goto('/StockCounts/StockCountList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');
    await expect.poll(() => page.locator('#MainModal .e-dropdownlist').last()
        .evaluate(element => element.ej2_instances?.[0]?.value ?? null)).toBe('0');
    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });

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
    await expect.poll(() => page.evaluate(async productId => (
        ((await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))?.data?.content?.data ?? [])
            .some(item => item.productId === productId && Number(item.stock) === 3)
    ), fixture.product.id)).toBe(true);

    await page.goto('/SalesOrders/SalesOrderList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
        ?.dataSource?.some?.(item => item.id === id), fixture.salesOrder.id);
    await openSelectedDocument(page, '#MainGrid', fixture.salesOrder.id);
    await page.waitForSelector('#MainModal.show #SecondaryGrid.e-grid');
    await page.waitForTimeout(500);
    await beginProductItemEdit(page);
    await searchAndSelectProduct(page, key, key);
    await page.waitForFunction(() => {
        const button = document.querySelector('#SecondaryGrid .so-serial-picker');
        return button && !button.disabled;
    });

    await page.locator('#SecondaryGrid .so-serial-picker').click();
    await page.waitForSelector('#ProductSerialPickerModal.show');
    const serialChecks = page.locator('#ProductSerialPickerBody .product-serial-picker-check');
    await expect(serialChecks).toHaveCount(3);
    await expect(page.locator('#ProductSerialPickerModal th')
        .filter({ hasText: /Unit Cost|Giá Vốn Đơn Vị/i })).toHaveCount(1);
    await serialChecks.nth(0).check();
    await serialChecks.nth(1).check();
    await expect(page.locator('#ProductSerialPickerSummary')).toContainText('200.000');
    await expect(page.locator('#ProductSerialPickerSummary')).toContainText('100.000');
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

    const quantityAfterTax = await selectTaxAndSaveItem(page, fixture.tax.name, fixture.tax.id);
    expect(quantityAfterTax).toEqual({ row: 2, rendered: 2 });
    const persisted = await page.evaluate(async id => (
        (await AxiosManager.get(`/SalesOrderItem/GetSalesOrderItemBySalesOrderIdList?salesOrderId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), fixture.salesOrder.id);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].quantity).toBe(2);
    expect(persisted[0].productSerialIds).toHaveLength(2);
});

test('Material Export keeps selected serials in added and changed batch records when Update is clicked immediately', async ({ monitoredPage: page }) => {
    const key = `E2E-MATERIAL-EXPORT-SERIAL-${Date.now()}`;

    await login(page);
    const fixture = await page.evaluate(async key => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groups, warehouses, customers] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {})
        ]);
        const group = unwrap(groups)[0];
        const warehouse = unwrap(warehouses).find(item => item.systemWarehouse === false);
        const customer = unwrap(customers)[0];
        const productResponse = await AxiosManager.post('/Product/CreateProduct', {
            name: key,
            referenceCode: `${key}-REF`,
            unitPrice: 125000,
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
        return {
            product: productResponse?.data?.content?.data,
            warehouse,
            customer
        };
    }, key);
    expect(fixture.product?.id).toBeTruthy();
    expect(fixture.warehouse?.id).toBeTruthy();
    expect(fixture.customer?.id).toBeTruthy();

    await expect.poll(() => page.evaluate(async productId => (
        ((await AxiosManager.get('/InventoryTransaction/GetInventoryStockList', {}))?.data?.content?.data ?? [])
            .some(item => item.productId === productId && Number(item.stock) === 3)
    ), fixture.product.id)).toBe(true);

    await page.goto('/MaterialExports/MaterialExportList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');

    const exportDateInput = page.locator('#MainModal .e-datepicker').first();
    const locale = await page.evaluate(() => window.UiLocalization?.getLocale?.() ?? 'vi');
    await exportDateInput.fill(locale === 'vi' ? '25/08/2026' : '08/25/2026');
    await exportDateInput.press('Tab');

    const headerDropdowns = page.locator('#MainModal .e-dropdownlist');
    const stockLookupResponsePromise = page.waitForResponse(response => (
        response.url().includes('/MaterialExport/GetWarehouseProductStock') && response.status() === 200
    ));
    await headerDropdowns.nth(0).locator('xpath=..').click();
    await selectOpenDropdownOption(page, fixture.warehouse.name);
    await stockLookupResponsePromise;
    await headerDropdowns.nth(1).locator('xpath=..').click();
    await selectOpenDropdownOption(page, fixture.customer.name);

    const createHeaderResponsePromise = page.waitForResponse(response => (
        response.url().includes('/MaterialExport/CreateMaterialExport') && response.status() === 200
    ));
    await page.locator('#MainModal .modal-footer .btn-primary').click();
    const materialExport = (await (await createHeaderResponsePromise).json())?.content?.data;
    expect(materialExport?.id).toBeTruthy();
    await expect(page.locator('#MainModal #ComplexDiv')).toBeVisible();

    const transientCrudRequests = [];
    const collectTransientCrud = request => {
        if (/\/InventoryTransaction\/MaterialExport(?:Create|Update|Delete)InvenTrans/.test(request.url())) {
            transientCrudRequests.push(request);
        }
    };
    page.on('request', collectTransientCrud);
    await beginProductItemEdit(page);
    await searchAndSelectProduct(page, key, key);
    const transientRow = page.locator('#SecondaryGrid .e-row').first();
    await transientRow.click();
    await page.locator('#SecondaryGrid_delete').click();
    await expect(page.locator('#SecondaryGrid .e-row')).toHaveCount(0);
    await expect(page.locator('.swal2-popup')).toBeHidden();
    await page.waitForTimeout(250);
    page.off('request', collectTransientCrud);
    expect(transientCrudRequests).toHaveLength(0);

    await beginProductItemEdit(page);
    await searchAndSelectProduct(page, key, key);

    // Serial-tracked quantities are derived from the picker and must remain integer/read-only.
    const quantityCellBeforeSerial = page.locator('#SecondaryGrid').getByRole('gridcell', {
        name: /column header Quantity/
    }).first();
    await quantityCellBeforeSerial.dblclick();
    const quantityInputBeforeSerial = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await expect(quantityInputBeforeSerial).toBeVisible();
    await expect(quantityInputBeforeSerial).toHaveAttribute('readonly', '');

    let serialCell = page.locator('#SecondaryGrid').getByRole('gridcell', {
        name: /column header Serial Numbers/
    }).first();
    await serialCell.dblclick();
    const serialPickerButton = page.locator('#SecondaryGrid td.e-editedbatchcell button');
    await expect(serialPickerButton).toBeEnabled();
    await serialPickerButton.click();
    await page.waitForSelector('#ProductSerialPickerModal.show');

    const pickerRows = page.locator('#ProductSerialPickerBody tr');
    await expect(pickerRows).toHaveCount(3);
    const selectedSerials = await pickerRows.evaluateAll(rows => rows.slice(0, 2).map(row => ({
        id: row.querySelector('.product-serial-picker-check')?.value,
        number: row.cells[1]?.textContent?.trim()
    })));
    await pickerRows.nth(0).locator('.product-serial-picker-check').check();
    await pickerRows.nth(1).locator('.product-serial-picker-check').check();
    await page.locator('#ProductSerialPickerApply').click();
    await page.waitForSelector('#ProductSerialPickerModal', { state: 'hidden' });

    const selectedState = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const row = grid.getRowsObject()[0]?.data;
        const added = grid.getBatchChanges().addedRecords[0];
        const serialCell = grid.getCellFromIndex(0, grid.getColumnIndexByField('productSerialNumbers'));
        const quantityCell = grid.getCellFromIndex(0, grid.getColumnIndexByField('movement'));
        return {
            rowIds: [...(row?.productSerialIds ?? [])],
            rowText: row?.productSerialNumbers ?? '',
            rowQuantity: Number(row?.movement),
            addedIds: [...(added?.productSerialIds ?? [])],
            addedText: added?.productSerialNumbers ?? '',
            addedQuantity: Number(added?.movement),
            renderedSerials: serialCell?.innerText ?? '',
            renderedQuantity: NumberFormatManager.parseLocaleNumber(quantityCell?.innerText ?? '')
        };
    });
    const selectedIds = selectedSerials.map(item => item.id);
    expect(selectedState.rowIds).toEqual(selectedIds);
    expect(selectedState.addedIds).toEqual(selectedIds);
    expect(selectedState.rowText).toBe(selectedSerials.map(item => item.number).join(', '));
    expect(selectedState.addedText).toBe(selectedState.rowText);
    expect(selectedState.rowQuantity).toBe(2);
    expect(selectedState.addedQuantity).toBe(2);
    expect(selectedState.renderedSerials).toContain(selectedSerials[0].number);
    expect(selectedState.renderedSerials).toContain(selectedSerials[1].number);
    expect(selectedState.renderedQuantity).toBe(2);

    const createLineResponsePromise = page.waitForResponse(response => (
        response.url().includes('/InventoryTransaction/MaterialExportCreateInvenTrans')
            && response.request().method() === 'POST'
    ));
    await page.locator('#MainModal .modal-footer .btn-primary').click();
    const createLineResponse = await createLineResponsePromise;
    expect(createLineResponse.status()).toBe(200);
    const createPayload = createLineResponse.request().postDataJSON();
    expect(createPayload.productSerialIds).toEqual(selectedIds);
    expect(Number(createPayload.movement)).toBe(2);
    await expect(page.locator('.swal2-popup', { hasText: 'Vui lòng chọn serial thiết bị trước khi lưu' })).toHaveCount(0);

    await expect.poll(() => page.evaluate(async id => (
        (await AxiosManager.get(`/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), materialExport.id)).toHaveLength(1);
    let persisted = await page.evaluate(async id => (
        (await AxiosManager.get(`/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? []
    ), materialExport.id);
    expect([...persisted[0].productSerialIds].sort()).toEqual([...selectedIds].sort());
    expect(persisted[0].movement).toBe(2);

    await expect.poll(() => page.evaluate(() => (
        document.querySelector('#SecondaryGrid').ej2_instances[0].dataSource?.length ?? 0
    ))).toBe(1);
    serialCell = page.locator('#SecondaryGrid').getByRole('gridcell', {
        name: /column header Serial Numbers/
    }).first();
    await serialCell.dblclick();
    await expect(serialPickerButton).toBeEnabled();
    await serialPickerButton.click();
    await page.waitForSelector('#ProductSerialPickerModal.show');
    const checkedSerials = page.locator('#ProductSerialPickerBody .product-serial-picker-check:checked');
    await expect(checkedSerials).toHaveCount(2);
    const removedSerialId = await checkedSerials.first().getAttribute('value');
    await checkedSerials.first().uncheck();
    await page.locator('#ProductSerialPickerApply').click();
    await page.waitForSelector('#ProductSerialPickerModal', { state: 'hidden' });
    const remainingId = selectedIds.find(id => id !== removedSerialId);

    const changedState = await page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const row = grid.getRowsObject()[0]?.data;
        const changed = grid.getBatchChanges().changedRecords[0];
        return {
            rowIds: [...(row?.productSerialIds ?? [])],
            rowQuantity: Number(row?.movement),
            changedIds: [...(changed?.productSerialIds ?? [])],
            changedQuantity: Number(changed?.movement)
        };
    });
    expect(changedState).toEqual({
        rowIds: [remainingId],
        rowQuantity: 1,
        changedIds: [remainingId],
        changedQuantity: 1
    });

    const updateLineResponsePromise = page.waitForResponse(response => (
        response.url().includes('/InventoryTransaction/MaterialExportUpdateInvenTrans')
            && response.request().method() === 'POST'
    ));
    await page.locator('#SecondaryGrid_update').click();
    const updateLineResponse = await updateLineResponsePromise;
    expect(updateLineResponse.status()).toBe(200);
    const updatePayload = updateLineResponse.request().postDataJSON();
    expect(updatePayload.productSerialIds).toEqual([remainingId]);
    expect(Number(updatePayload.movement)).toBe(1);

    await expect.poll(() => page.evaluate(async ({ id, serialId }) => {
        const rows = (await AxiosManager.get(
            `/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=${encodeURIComponent(id)}`, {}))
            ?.data?.content?.data ?? [];
        return rows.length === 1
            && Number(rows[0].movement) === 1
            && rows[0].productSerialIds?.length === 1
            && rows[0].productSerialIds[0] === serialId;
    }, { id: materialExport.id, serialId: remainingId })).toBe(true);

    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });
    const materialExportRow = page.locator('#MainGrid .e-row', { hasText: materialExport.number }).first();
    await materialExportRow.click();
    await page.locator('#DeleteCustom').click();
    await page.locator('.swal2-confirm').click();
    await expect(materialExportRow).toHaveCount(0);
});

test('Material Export đã xác nhận trở về Nháp để sửa, nhưng bị chặn khi đã thanh toán', async ({ monitoredPage: page }) => {
    test.slow();
    await login(page, 'vi');
    const key = `UI-MATERIAL-REOPEN-${Date.now()}`;
    const fixture = await page.evaluate(async key => {
        const one = response => response?.data?.content?.data;
        const list = response => response?.data?.content?.data ?? [];
        const userId = StorageManager.getUserId();
        const [groupsResponse, warehousesResponse, customersResponse] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {})
        ]);
        const group = list(groupsResponse)[0];
        const warehouse = list(warehousesResponse).find(item => item.systemWarehouse === false);
        const customer = list(customersResponse)[0];
        const product = one(await AxiosManager.post('/Product/CreateProduct', {
            name: `${key}-PRODUCT`, referenceCode: `${key}-REF`, unitPrice: 100000, costPrice: 80000,
            physical: true, serialTrackingMode: 0, internalSerialFixedCode: '',
            defaultWarehouseId: warehouse.id, defaultWarrantyMonths: 0, unitMeasureName: 'Cái',
            productGroupId: group.id, openingStockQuantity: 10, createdById: userId
        }));
        const createConfirmed = async suffix => {
            const document = one(await AxiosManager.post('/MaterialExport/CreateMaterialExport', {
                MaterialExportDate: '2026-08-26', description: `${key}-${suffix}`, status: '0',
                warehouseId: warehouse.id, customerId: customer.id, createdById: userId
            }));
            const line = one(await AxiosManager.post('/InventoryTransaction/MaterialExportCreateInvenTrans', {
                moduleId: document.id, productId: product.id, movement: 1, createdById: userId, productSerialIds: []
            }));
            const confirmed = one(await AxiosManager.post('/MaterialExport/UpdateMaterialExport', {
                id: document.id, MaterialExportDate: document.exportDate ?? document.materialExportDate,
                description: document.description, status: '1', warehouseId: document.warehouseId,
                customerId: document.customerId, updatedById: userId
            }));
            return { document: confirmed, line };
        };
        const unpaid = await createConfirmed('UNPAID');
        const paid = await createConfirmed('PAID');

        const [cashResponse, accountsResponse] = await Promise.all([
            AxiosManager.get('/CashTransaction/GetCashTransactionList', {}),
            AxiosManager.get('/CashAccount/GetCashAccountList', {})
        ]);
        const cash = list(cashResponse).find(item => item.sourceModule === 'MaterialExport'
            && item.sourceModuleId === paid.document.id);
        const account = list(accountsResponse)[0];
        await AxiosManager.post('/CashTransaction/UpdateCashTransaction', {
            id: cash.id, transactionDate: cash.transactionDate, paymentDate: '2026-08-26',
            transactionType: cash.transactionType, amount: cash.amount, paidAmount: 1,
            description: cash.description, cashAccountId: account.id, cashCategoryId: cash.cashCategoryId,
            customerId: cash.customerId, vendorId: cash.vendorId, sourceModule: cash.sourceModule,
            sourceModuleId: cash.sourceModuleId, sourceModuleNumber: cash.sourceModuleNumber,
            updatedById: userId, allocations: []
        });
        return { unpaid, paid, product };
    }, key);

    const selectMainRecord = async number => {
        const row = page.locator('#MainGrid .e-row', { hasText: number }).first();
        await expect(row).toBeVisible();
        await row.locator('td.e-rowcell').first().click();
        await expect(page.locator('#EditCustom')).toBeEnabled();
        await page.locator('#EditCustom').locator('xpath=..').click();
        await page.waitForSelector('#MainModal.show');
    };
    const selectStatus = async text => {
        const input = page.locator('#MainModal label[for="Status"]').locator('xpath=..').locator('input.e-input').first();
        await input.locator('xpath=..').click();
        const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
        await expect(popup).toBeVisible();
        await popup.locator('.e-list-item').filter({ hasText: text }).first().click();
    };

    await page.goto('/MaterialExports/MaterialExportList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await selectMainRecord(fixture.unpaid.document.number);
    await expect(page.locator('#SecondaryGrid_add')).toHaveCount(0);
    await selectStatus(/Nháp|Draft/i);
    const reopenResponsePromise = page.waitForResponse(response => response.url().includes('/MaterialExport/UpdateMaterialExport')
        && response.request().method() === 'POST' && response.status() === 200);
    await page.locator('#MainModal .modal-footer .btn-primary').click();
    expect((await reopenResponsePromise).status()).toBe(200);
    await expect(page.locator('#SecondaryGrid_add')).toBeVisible();

    const quantityCell = await gridCellByHeader(page, /Số lượng|Quantity/i);
    await quantityCell.dblclick();
    const quantityInput = page.locator('#SecondaryGrid td.e-editedbatchcell input.e-numerictextbox');
    await quantityInput.click();
    await quantityInput.press('Control+A');
    await quantityInput.pressSequentially('2,5');
    await page.locator('#MainModal .modal-header').click();
    await expect(quantityCell).toContainText('2,5');
    const updateLinePromise = page.waitForResponse(response => response.url().includes('/InventoryTransaction/MaterialExportUpdateInvenTrans')
        && response.request().method() === 'POST' && response.status() === 200);
    await page.locator('#SecondaryGrid_update').click();
    const updateLineResponse = await updateLinePromise;
    expect(Number(updateLineResponse.request().postDataJSON().movement)).toBe(2.5);
    await expect.poll(() => page.evaluate(async id => {
        const response = await AxiosManager.get(`/InventoryTransaction/MaterialExportGetInvenTransList?moduleId=${encodeURIComponent(id)}`, {});
        return Number(response?.data?.content?.data?.[0]?.movement);
    }, fixture.unpaid.document.id)).toBe(2.5);

    await page.locator('#MainModal .btn-close').click();
    await page.waitForSelector('#MainModal', { state: 'hidden' });
    await selectMainRecord(fixture.paid.document.number);
    await selectStatus(/Nháp|Draft/i);
    page.expectHttpError('/MaterialExport/UpdateMaterialExport');
    const blockedResponsePromise = page.waitForResponse(response => response.url().includes('/MaterialExport/UpdateMaterialExport')
        && response.request().method() === 'POST' && response.status() >= 400);
    await page.locator('#MainModal .modal-footer .btn-primary').click();
    await blockedResponsePromise;
    const warning = page.locator('.swal2-popup');
    await expect(warning).toBeVisible();
    await expect(warning.locator('.swal2-html-container')).toContainText('đã có thanh toán');
    await expect(warning.locator('.swal2-html-container')).toContainText('hoàn tác thanh toán trước');
    const paidStatus = await page.evaluate(async id => {
        const response = await AxiosManager.get('/MaterialExport/GetMaterialExportList', {});
        return response?.data?.content?.data?.find(item => item.id === id)?.status;
    }, fixture.paid.document.id);
    expect(Number(paidStatus)).toBe(1);
});
