const {
    test,
    expect,
    login,
    waitForVuePage,
    selectOpenDropdownOption,
    openSelectedDocument
} = require('./fixtures');
const fs = require('fs');
const path = require('path');

async function searchActiveProductEditor(page, searchText, expectedProductName) {
    const editorSelector = '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist';
    await page.waitForFunction(selector => Boolean(
        document.querySelector(selector)?.ej2_instances?.[0]
    ), editorSelector);
    const editor = page.locator(editorSelector);
    await expect.poll(() => editor.evaluate(element => element.ej2_instances?.[0]?.dataSource?.length ?? 0))
        .toBeGreaterThan(0);
    const selectedProduct = await editor.evaluate((element, expected) => {
        const dropdown = element.ej2_instances?.[0];
        const item = dropdown?.dataSource?.find(candidate => {
            const label = String(candidate.name ?? candidate.text ?? candidate.productName ?? '');
            return label.includes(expected.name) || label.includes(expected.search);
        });
        if (!dropdown || !item) return null;
        dropdown.value = item.id;
        dropdown.dataBind();
        dropdown.change?.({ value: item.id, itemData: item });
        return { id: String(item.id), name: String(item.name ?? item.text ?? item.productName ?? '') };
    }, { search: searchText, name: expectedProductName });
    expect(selectedProduct?.id).toBeTruthy();
    expect(selectedProduct?.name).toContain(expectedProductName);
}

async function editSecondaryCell(page, rowId, field) {
    await page.waitForFunction(({ id }) => {
        const grid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
        if (!grid) return false;
        let index = grid.getRowIndexByPrimaryKey?.(id) ?? -1;
        if (index < 0) {
            const rowObjects = grid.getRowsObject?.() ?? [];
            index = rowObjects.findIndex(r => String(r?.data?.id) === String(id));
        }
        return index >= 0;
    }, { id: rowId });
    await page.evaluate(({ id, column }) => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        let index = grid.getRowIndexByPrimaryKey?.(id) ?? -1;
        if (index < 0) {
            const rowObjects = grid.getRowsObject?.() ?? [];
            index = rowObjects.findIndex(r => String(r?.data?.id) === String(id));
        }
        grid.editCell(index, column);
    }, { id: rowId, column: field });
}

async function getActiveSecondaryRowId(page) {
    await page.waitForFunction(() => {
        const grid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
        const cell = document.querySelector('#SecondaryGrid td.e-editedbatchcell');
        return Boolean(grid && cell && grid.getRowInfo(cell)?.rowData?.id);
    });
    return page.evaluate(() => {
        const grid = document.querySelector('#SecondaryGrid').ej2_instances[0];
        const cell = document.querySelector('#SecondaryGrid td.e-editedbatchcell');
        return grid.getRowInfo(cell).rowData.id;
    });
}

async function selectPurchaseOrderTax(page, rowId, tax, editorAlreadyOpen = false) {
    if (!editorAlreadyOpen) await editSecondaryCell(page, rowId, 'taxId');
    const editorSelector = '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist';
    await page.waitForFunction(({ selector, taxId }) => {
        const dropdown = document.querySelector(selector)?.ej2_instances?.[0];
        return dropdown?.dataSource?.some?.(item => item.id === taxId);
    }, { selector: editorSelector, taxId: tax.id });
    await page.locator(editorSelector).locator('xpath=..').click();
    await selectOpenDropdownOption(page, tax.name);
}

async function quickAddInlineLookup(page, buttonSelector, apiPath, name) {
    const field = page.locator(buttonSelector).locator('xpath=../..');
    await page.locator(buttonSelector).click();
    const inlineForm = field.locator('.qa-inline-form');
    await expect(inlineForm).toBeVisible();
    await inlineForm.locator('.inline-name').fill(name);
    const responsePromise = page.waitForResponse(response => response.url().includes(apiPath));
    await inlineForm.locator('.inline-save').click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const created = (await response.json())?.content?.data;
    expect(created?.id).toBeTruthy();
    await expect(inlineForm).toBeHidden();
    return created;
}

async function searchNativeSelect(page, selectId, searchText, expectedText) {
    await page.waitForFunction(id => Boolean(document.getElementById(id)?.ej2_instances?.[0]), selectId);
    await page.evaluate(id => document.getElementById(id).ej2_instances[0].showPopup(), selectId);
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await popup.waitFor({ state: 'visible' });
    const filterInput = popup.locator('.e-filter-parent input.e-input-filter');
    await filterInput.fill(searchText);
    const option = popup.getByText(expectedText, { exact: true });
    await expect(option).toBeVisible();
    await option.click();
    await popup.waitFor({ state: 'hidden' });
}

async function searchSyncfusionInput(page, inputSelector, searchText, expectedText) {
    const input = page.locator(inputSelector);
    await searchSyncfusionLocator(page, input, searchText, expectedText);
}

async function searchSyncfusionLocator(page, input, searchText, expectedText, verifyPopupUi = true) {
    await input.waitFor({ state: 'attached' });
    await expect.poll(() => input.evaluate(element => {
        const scope = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = scope ? [scope, ...scope.querySelectorAll('*')] : [element];
        return nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .some(instance => typeof instance.showPopup === 'function' && typeof instance.hidePopup === 'function');
    })).toBe(true);
    const currentSource = await input.evaluate(element => {
        const scope = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = scope ? [scope, ...scope.querySelectorAll('*')] : [element];
        const dropdown = nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .find(instance => typeof instance.showPopup === 'function' && typeof instance.hidePopup === 'function');
        return Array.isArray(dropdown?.dataSource)
            ? dropdown.dataSource.map(item => item?.name ?? item?.text ?? item)
            : null;
    });
    expect(currentSource).toContain(expectedText);
    if (!verifyPopupUi) return;
    await input.evaluate(element => {
        const scope = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = scope ? [scope, ...scope.querySelectorAll('*')] : [element];
        nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .find(instance => typeof instance.showPopup === 'function' && typeof instance.hidePopup === 'function')
            .showPopup();
    });
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await popup.waitFor({ state: 'visible' });
    const filterInput = popup.locator('.e-filter-parent input.e-input-filter');
    await filterInput.fill(searchText);
    await expect(popup.getByText(expectedText, { exact: true })).toBeVisible();
    await filterInput.fill('');
    await input.evaluate(element => {
        const scope = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = scope ? [scope, ...scope.querySelectorAll('*')] : [element];
        nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .find(instance => typeof instance.hidePopup === 'function')
            .hidePopup();
    });
}

async function expectSyncfusionFilterPlaceholder(page, input, expectedPlaceholder) {
    await input.waitFor({ state: 'attached' });
    await input.evaluate(element => {
        const root = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = root ? [root, ...root.querySelectorAll('*')] : [element];
        const dropdown = nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .find(instance => typeof instance.showPopup === 'function');
        dropdown.showPopup();
    });
    const popup = page.locator('.e-ddl.e-popup.e-popup-open').last();
    await expect(popup.locator('.e-filter-parent input.e-input-filter')).toHaveAttribute('placeholder', expectedPlaceholder);
    await input.evaluate(element => {
        const root = element.closest('.quick-add-wrapper') ?? element.closest('td') ?? element.parentElement;
        const nodes = root ? [root, ...root.querySelectorAll('*')] : [element];
        nodes.flatMap(node => Array.from(node.ej2_instances ?? []))
            .find(instance => typeof instance.hidePopup === 'function')?.hidePopup();
    });
}

async function completeComplexPartnerQuickAdd(page, config) {
    await page.locator(config.buttonSelector).click();
    await page.waitForSelector(`.swal2-popup ${config.nameSelector}`);

    const groupName = `${config.name}-GROUP`;
    const categoryName = `${config.name}-CATEGORY`;
    await quickAddInlineLookup(page, config.groupButtonSelector, config.groupApiPath, groupName);
    await searchNativeSelect(page, config.groupSelectId, groupName, groupName);
    await quickAddInlineLookup(page, config.categoryButtonSelector, config.categoryApiPath, categoryName);
    await searchNativeSelect(page, config.categorySelectId, categoryName, categoryName);
    await page.locator(config.nameSelector).fill(config.name);

    const responsePromise = page.waitForResponse(response => response.url().includes(config.createApiPath));
    await page.locator('.swal2-confirm').click();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    const created = (await response.json())?.content?.data;
    expect(created?.id).toBeTruthy();
    await page.locator('.swal2-popup').waitFor({ state: 'hidden' });

    const parentInput = page.locator(config.buttonSelector).locator('xpath=..').locator('input').first();
    await expect(parentInput).toHaveValue(config.name);
    await searchSyncfusionLocator(page, parentInput, config.name, config.name, false);
    return created;
}

test('Purchase Order quick-add hàng hóa đồng bộ serial và tồn đầu kỳ', async ({ monitoredPage: page }, testInfo) => {
    test.setTimeout(180_000);
    let purchaseOrderId = null;
    let firstQuickAddedProductId = null;
    let quickAddedGroupId = null;
    let quickAddedWarehouseId = null;
    let poQuickAddedWarehouseId = null;
    const key = `E2E-QUICK-PRODUCT-${Date.now()}`;
    const screenshotDirectory = path.resolve(__dirname, '../../test-results/quick-add');
    fs.mkdirSync(screenshotDirectory, { recursive: true });

    await login(page);
    const fixture = await page.evaluate(async keyValue => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const [groups, warehouses, vendors, taxes] = await Promise.all([
            AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
            AxiosManager.get('/Warehouse/GetWarehouseList', {}),
            AxiosManager.get('/Vendor/GetVendorList', {}),
            AxiosManager.get('/Tax/GetTaxList', {})
        ]);
        const group = unwrap(groups)[0];
        const warehouse = unwrap(warehouses).find(item => item.systemWarehouse === false);
        const vendor = unwrap(vendors)[0];
        const tax = unwrap(taxes)[0];
        const baselineProduct = (await AxiosManager.post('/Product/CreateProduct', {
            name: `${keyValue}-BASELINE`,
            productGroupId: group?.id,
            unitMeasureName: 'PCS',
            costPrice: 100,
            unitPrice: 150,
            defaultWarehouseId: null,
            defaultWarrantyMonths: 0,
            physical: false,
            serialTrackingMode: 0,
            internalSerialFixedCode: null,
            openingStockQuantity: null,
            description: 'Baseline product created before opening the PO editor',
            createdById: StorageManager.getUserId()
        }))?.data?.content?.data;
        const purchaseOrder = (await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate: new Date().toISOString(),
            orderStatus: '0',
            description: keyValue,
            vendorId: vendor?.id,
            createdById: StorageManager.getUserId()
        }))?.data?.content?.data;
        return { group, warehouse, vendor, tax, baselineProduct, purchaseOrder };
    }, key);

    expect(fixture.group?.id).toBeTruthy();
    expect(fixture.warehouse?.id).toBeTruthy();
    expect(fixture.vendor?.id).toBeTruthy();
    expect(fixture.tax?.id).toBeTruthy();
    expect(fixture.baselineProduct?.id).toBeTruthy();
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
        const firstRowId = await getActiveSecondaryRowId(page);
        await searchActiveProductEditor(page, `${key}-BASELINE`, `${key}-BASELINE`);
        await page.locator('#QuickAddProductBtn').click();
        await page.waitForSelector('.swal2-popup #qa-p-name');

        await expect(page.locator('#qa-p-serial-none')).toBeChecked();
        await expect(page.locator('input[name="qa-p-serial"]')).toHaveCount(3);
        await expect(page.locator('#qa-p-opening-stock')).toBeEnabled();
        await expect(page.locator('#qa-p-opening-stock')).toHaveValue('0');
        await expect(page.locator('#qa-p-fixedcode-section')).toBeHidden();

        const inlineGroupName = `${key}-INLINE-GROUP`;
        const inlineWarehouseName = `${key}-INLINE-WAREHOUSE`;
        const inlineGroup = await quickAddInlineLookup(
            page,
            '#qa-p-group-add',
            '/api/ProductGroup/CreateProductGroup',
            inlineGroupName
        );
        quickAddedGroupId = inlineGroup.id;
        await searchNativeSelect(page, 'qa-p-group', inlineGroupName, inlineGroupName);

        const inlineWarehouse = await quickAddInlineLookup(
            page,
            '#qa-p-warehouse-add',
            '/api/Warehouse/CreateWarehouse',
            inlineWarehouseName
        );
        quickAddedWarehouseId = inlineWarehouse.id;
        await searchNativeSelect(page, 'qa-p-warehouse', inlineWarehouseName, inlineWarehouseName);

        await page.locator('#qa-p-name').fill(key);
        await page.locator('#qa-p-unit').fill('PCS');
        await page.locator('#qa-p-costprice').fill('1000');
        await page.locator('#qa-p-unitprice').fill('1500');
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

        await page.evaluate(() => {
            const select = document.getElementById('qa-p-warehouse');
            select.value = '';
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });

        await page.locator('.swal2-confirm').click();
        await expect(page.locator('#swal2-validation-message'))
            .toContainText('Default warehouse is required');

        await page.evaluate(warehouseId => {
            const select = document.getElementById('qa-p-warehouse');
            select.value = warehouseId;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        }, quickAddedWarehouseId);

        await page.evaluate(() => document.querySelector('#SecondaryGrid td.e-editedbatchcell input')?.focus());
        await page.keyboard.press('Enter');
        await expect(page.locator('.swal2-popup #qa-p-name')).toBeVisible();
        await expect(page.locator('#MainModal')).toHaveClass(/show/);

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
            productGroupId: quickAddedGroupId,
            defaultWarehouseId: quickAddedWarehouseId
        });

        const responseBody = await response.json();
        const productId = responseBody?.content?.data?.id;
        expect(productId).toBeTruthy();
        firstQuickAddedProductId = productId;
        await page.waitForFunction(({ rowId, createdProductId }) => {
            const grid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
            const changes = grid?.getBatchChanges?.() ?? {};
            const rows = [
                ...(grid?.getCurrentViewRecords?.() ?? []),
                ...(changes.addedRecords ?? []),
                ...(changes.changedRecords ?? [])
            ];
            return rows.some(row => row.id === rowId && row.productId === createdProductId);
        }, { rowId: firstRowId, createdProductId: productId });

        const storedProduct = await page.evaluate(async id => (
            (await AxiosManager.get('/Product/GetProductList', {}))?.data?.content?.data ?? []
        ).find(item => item.id === id), productId);
        expect(storedProduct?.serialTrackingMode).toBe(0);
        expect(storedProduct?.openingStockQuantity).toBe(2.5);
        expect(storedProduct?.openingStockWarehouseId).toBe(quickAddedWarehouseId);
        await page.locator('.swal2-popup').waitFor({ state: 'hidden' });
        await expect(page.locator('#MainModal')).toHaveClass(/show/);
        await page.screenshot({ path: path.join(screenshotDirectory, 'po-quick-add-before-tax.png'), fullPage: false });

        const invalidItemRequests = [];
        const captureInvalidItemRequest = request => {
            if (request.url().includes('/api/PurchaseOrderItem/CreatePurchaseOrderItem')) invalidItemRequests.push(request.url());
        };
        page.on('request', captureInvalidItemRequest);
        await page.locator('#QuickAddProductBtn').press('Enter');
        await expect(page.locator('.swal2-popup')).toContainText('Vui lòng chọn thuế');
        await expect(page.locator('#MainModal')).toHaveClass(/show/);
        await page.keyboard.press('Enter');
        await expect(page.locator('.swal2-popup')).toBeHidden();
        await expect(page.locator('#MainModal')).toHaveClass(/show/);
        await expect(page.locator('#SecondaryGrid td.e-editedbatchcell').getByRole('textbox', { name: 'Select Tax' })).toBeVisible();
        page.off('request', captureInvalidItemRequest);
        expect(invalidItemRequests).toEqual([]);

        // Complete the same row only after the failed Enter.
        await selectPurchaseOrderTax(page, firstRowId, fixture.tax, true);

        // Keep the PO warehouse Quick Add call site covered while the first row is
        // still pending in the same Batch transaction.
        await editSecondaryCell(page, firstRowId, 'warehouseId');
        const warehouseEditorSelector = '#SecondaryGrid td.e-editedbatchcell .e-dropdownlist';
        await page.waitForFunction(selector => Boolean(document.querySelector(selector)?.ej2_instances?.[0]), warehouseEditorSelector);

        const poWarehouseName = `${key}-PO-WAREHOUSE`;
        await page.locator('#QuickAddWarehouseBtn').click();
        await page.waitForSelector('.swal2-popup #swal-quick-add-name');
        await page.locator('#swal-quick-add-name').fill(poWarehouseName);
        const warehouseResponsePromise = page.waitForResponse(response =>
            response.url().includes('/api/Warehouse/CreateWarehouse'));
        await page.locator('.swal2-confirm').click();
        const warehouseResponse = await warehouseResponsePromise;
        expect(warehouseResponse.status()).toBe(200);
        poQuickAddedWarehouseId = (await warehouseResponse.json())?.content?.data?.id;
        expect(poQuickAddedWarehouseId).toBeTruthy();
        await page.locator('.swal2-popup').waitFor({ state: 'hidden' });
        await page.waitForFunction(({ rowId, warehouseId }) => {
            const grid = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0];
            const changes = grid?.getBatchChanges?.() ?? {};
            const rows = [
                ...(grid?.getCurrentViewRecords?.() ?? []),
                ...(changes.addedRecords ?? []),
                ...(changes.changedRecords ?? [])
            ];
            return rows.some(row => row.id === rowId && row.warehouseId === warehouseId);
        }, { rowId: firstRowId, warehouseId: poQuickAddedWarehouseId });
        await editSecondaryCell(page, firstRowId, 'warehouseId');
        await page.waitForFunction(({ selector, warehouseId }) => {
            const dropdown = document.querySelector(selector)?.ej2_instances?.[0];
            return dropdown?.dataSource?.some?.(item => item.id === warehouseId);
        }, { selector: warehouseEditorSelector, warehouseId: poQuickAddedWarehouseId });

        const itemCreateResponse = page.waitForResponse(response =>
            response.url().includes('/api/PurchaseOrderItem/CreatePurchaseOrderItem'));
        await page.locator('#SecondaryGrid_update').click();
        expect((await itemCreateResponse).status()).toBe(200);
        await page.screenshot({ path: path.join(screenshotDirectory, 'po-quick-add-saved.png'), fullPage: false });

        await expect.poll(() => page.evaluate(async id => (
            (await AxiosManager.get(`/PurchaseOrderItem/GetPurchaseOrderItemByPurchaseOrderIdList?purchaseOrderId=${id}`, {}))
                ?.data?.content?.data?.length ?? 0
        ), purchaseOrderId)).toBe(1);
        const storedItems = await page.evaluate(async id => (
            (await AxiosManager.get(`/PurchaseOrderItem/GetPurchaseOrderItemByPurchaseOrderIdList?purchaseOrderId=${id}`, {}))
                ?.data?.content?.data ?? []
        ), purchaseOrderId);
        expect(storedItems.some(item => item.productId === firstQuickAddedProductId)).toBe(true);
        expect(storedItems.some(item => item.warehouseId === poQuickAddedWarehouseId)).toBe(true);

        await page.reload({ waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
        await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
        await page.waitForFunction(firstId => {
            const rows = document.querySelector('#SecondaryGrid')?.ej2_instances?.[0]?.dataSource ?? [];
            return rows.some(item => item.productId === firstId);
        }, firstQuickAddedProductId);
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

test('Product form simple Quick Add refreshes and keeps searchable group/warehouse dropdowns', async ({ monitoredPage: page }) => {
    const key = `E2E-SIMPLE-QUICK-ADD-${Date.now()}`;
    await login(page);
    await page.goto('/Products/ProductList', { waitUntil: 'domcontentloaded' });
    await waitForVuePage(page);
    await page.locator('#AddCustom').click();
    await page.waitForSelector('#MainModal.show');

    const scenarios = [
        {
            title: 'Quick Add Product Group',
            apiPath: '/api/ProductGroup/CreateProductGroup',
            inputSelector: 'input[placeholder="Select a Product Group"]',
            name: `${key}-GROUP`
        },
        {
            title: 'Quick Add Warehouse',
            apiPath: '/api/Warehouse/CreateWarehouse',
            inputSelector: 'input[placeholder="Select a Warehouse"]',
            name: `${key}-WAREHOUSE`
        }
    ];

    for (const scenario of scenarios) {
        await page.locator(`button[title="${scenario.title}"]`).click();
        await page.waitForSelector('.swal2-popup #swal-quick-add-name');
        await page.locator('#swal-quick-add-name').fill(scenario.name);
        const responsePromise = page.waitForResponse(response => response.url().includes(scenario.apiPath));
        await page.locator('.swal2-confirm').click();
        const response = await responsePromise;
        expect(response.status()).toBe(200);
        const createdId = (await response.json())?.content?.data?.id;
        expect(createdId).toBeTruthy();
        await page.locator('.swal2-popup').waitFor({ state: 'hidden' });

        await expect(page.locator(scenario.inputSelector)).toHaveValue(scenario.name);
        await searchSyncfusionLocator(
            page,
            page.locator(scenario.inputSelector),
            scenario.name,
            scenario.name,
            false
        );
    }

    const groupInput = page.locator('#MainModal .quick-add-wrapper').first().locator('input').first();
    await page.evaluate(() => window.UiLocalization.setLocale('vi'));
    await expectSyncfusionFilterPlaceholder(page, groupInput, 'Tìm kiếm');
    await page.evaluate(() => window.UiLocalization.setLocale('en'));
    await expectSyncfusionFilterPlaceholder(page, groupInput, 'Search');
});

test('PO/SO complex partner Quick Add refreshes the active searchable dropdown', async ({ monitoredPage: page }) => {
    test.setTimeout(150_000);
    const key = `E2E-COMPLEX-QUICK-ADD-${Date.now()}`;
    let purchaseOrderId = null;
    let salesOrderId = null;

    await login(page);
    const fixture = await page.evaluate(async keyValue => {
        const unwrap = response => response?.data?.content?.data ?? [];
        const [vendors, customers] = await Promise.all([
            AxiosManager.get('/Vendor/GetVendorList', {}),
            AxiosManager.get('/Customer/GetCustomerList', {})
        ]);
        const vendor = unwrap(vendors)[0];
        const customer = unwrap(customers)[0];
        const userId = StorageManager.getUserId();
        const orderDate = new Date().toISOString();
        const purchaseOrder = (await AxiosManager.post('/PurchaseOrder/CreatePurchaseOrder', {
            orderDate,
            orderStatus: '0',
            description: `${keyValue} PO`,
            vendorId: vendor?.id,
            createdById: userId
        }))?.data?.content?.data;
        const salesOrder = (await AxiosManager.post('/SalesOrder/CreateSalesOrder', {
            orderDate,
            orderStatus: '0',
            description: `${keyValue} SO`,
            customerId: customer?.id,
            salesType: 1,
            createdById: userId
        }))?.data?.content?.data;
        return { purchaseOrder, salesOrder };
    }, key);
    expect(fixture.purchaseOrder?.id).toBeTruthy();
    expect(fixture.salesOrder?.id).toBeTruthy();
    purchaseOrderId = fixture.purchaseOrder.id;
    salesOrderId = fixture.salesOrder.id;

    try {
        await page.goto('/PurchaseOrders/PurchaseOrderList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), purchaseOrderId);
        await openSelectedDocument(page, '#MainGrid', purchaseOrderId);
        await page.waitForSelector('#MainModal.show');
        await completeComplexPartnerQuickAdd(page, {
            buttonSelector: '#MainModal button.quick-add-btn',
            nameSelector: '#qa-v-name',
            name: `${key}-VENDOR`,
            groupButtonSelector: '#qa-v-group-add',
            groupSelectId: 'qa-v-group',
            groupApiPath: '/api/VendorGroup/CreateVendorGroup',
            categoryButtonSelector: '#qa-v-category-add',
            categorySelectId: 'qa-v-category',
            categoryApiPath: '/api/VendorCategory/CreateVendorCategory',
            createApiPath: '/api/Vendor/CreateVendor'
        });

        await page.goto('/SalesOrders/SalesOrderList', { waitUntil: 'domcontentloaded' });
        await waitForVuePage(page);
        await page.waitForFunction(id => document.querySelector('#MainGrid')?.ej2_instances?.[0]
            ?.dataSource?.some?.(item => item.id === id), salesOrderId);
        await openSelectedDocument(page, '#MainGrid', salesOrderId);
        await page.waitForSelector('#MainModal.show');
        await completeComplexPartnerQuickAdd(page, {
            buttonSelector: '#MainModal button.quick-add-btn',
            nameSelector: '#qa-c-name',
            name: `${key}-CUSTOMER`,
            groupButtonSelector: '#qa-c-group-add',
            groupSelectId: 'qa-c-group',
            groupApiPath: '/api/CustomerGroup/CreateCustomerGroup',
            categoryButtonSelector: '#qa-c-category-add',
            categorySelectId: 'qa-c-category',
            categoryApiPath: '/api/CustomerCategory/CreateCustomerCategory',
            createApiPath: '/api/Customer/CreateCustomer'
        });
    } finally {
        await page.evaluate(async ({ purchaseId, salesId }) => {
            const userId = StorageManager.getUserId();
            if (salesId) {
                await AxiosManager.post('/SalesOrder/DeleteSalesOrder', { id: salesId, deletedById: userId });
            }
            if (purchaseId) {
                await AxiosManager.post('/PurchaseOrder/DeletePurchaseOrder', { id: purchaseId, deletedById: userId });
            }
        }, { purchaseId: purchaseOrderId, salesId: salesOrderId });
    }
});
