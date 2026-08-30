window.ProductSerialPicker = (() => {
    const ensureModal = () => {
        let modal = document.getElementById('ProductSerialPickerModal');
        if (modal) {
            return modal;
        }

        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'ProductSerialPickerModal';
        modal.tabIndex = -1;
        modal.setAttribute('data-bs-backdrop', 'static');
        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-xl">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Chọn mã thiết bị</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-md-8">
                                <input type="text" class="form-control" id="ProductSerialPickerSearch" placeholder="Tìm theo mã thiết bị...">
                            </div>
                            <div class="col-md-4 text-end">
                                <span id="ProductSerialPickerSummary" class="text-muted"></span>
                            </div>
                        </div>
                        <div class="table-responsive" style="max-height: 420px; overflow:auto;">
                            <table class="table table-sm table-hover align-middle">
                                <thead>
                                    <tr>
                                        <th style="width:48px;"></th>
                                        <th>Mã thiết bị</th>
                                        <th>Sản phẩm</th>
                                        <th>Kho</th>
                                        <th>Trạng thái</th>
                                        <th class="text-end">Unit Cost</th>
                                        <th>Hạn BH</th>
                                    </tr>
                                </thead>
                                <tbody id="ProductSerialPickerBody"></tbody>
                            </table>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Đóng</button>
                        <button type="button" class="btn btn-primary" id="ProductSerialPickerApply">Áp dụng</button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('hidden.bs.modal', () => {
            if (document.querySelector('.modal.show')) {
                document.body.classList.add('modal-open');
                document.body.style.overflow = 'hidden';
            }
        });

        return modal;
    };

    const formatDate = (value) => value ? DateFormatManager.formatToLocale(new Date(value)) : '';
    const formatCost = (value) => NumberFormatManager.formatToLocale(value ?? 0, 0, 6);

    const updateSummary = (items, selectedIds) => {
        const selected = items.filter(item => selectedIds.has(item.id));
        const total = selected.reduce((sum, item) => sum + Number(item.unitCost ?? 0), 0);
        const average = selected.length ? total / selected.length : 0;
        document.getElementById('ProductSerialPickerSummary').textContent =
            `Đã chọn ${selected.length} / ${items.length} | Tổng giá vốn: ${formatCost(total)} | Bình quân: ${formatCost(average)}`;
    };

    const buildUrl = (options) => {
        const params = new URLSearchParams();
        ['productId', 'warehouseId', 'moduleName', 'moduleId', 'moduleItemId', 'sourceItemId'].forEach(key => {
            if (options[key]) {
                params.append(key, options[key]);
            }
        });
        return `/ProductSerial/GetProductSerialPickerList?${params.toString()}`;
    };

    const renderRows = (items, selectedIds, searchText) => {
        const body = document.getElementById('ProductSerialPickerBody');
        const search = (searchText ?? '').toLowerCase();
        const filtered = items.filter(item => (item.internalSerialNumber ?? '').toLowerCase().includes(search));

        body.innerHTML = filtered.map(item => {
            const checked = selectedIds.has(item.id) ? 'checked' : '';
            return `
                <tr>
                    <td class="text-center" style="width: 48px; vertical-align: middle;">
                        <input type="checkbox" class="form-check-input product-serial-picker-check" value="${item.id}" ${checked} style="margin: 0 !important; float: none !important; position: static !important; cursor: pointer;">
                    </td>
                    <td>${item.internalSerialNumber ?? ''}</td>
                    <td>${item.productName ?? ''}</td>
                    <td>${item.warehouseName ?? ''}</td>
                    <td>${item.statusName ?? ''}</td>
                    <td class="text-end">${formatCost(item.unitCost)}</td>
                    <td>${formatDate(item.customerWarrantyEndDate ?? item.supplierWarrantyEndDate)}</td>
                </tr>`;
        }).join('');

        updateSummary(items, selectedIds);

        body.querySelectorAll('.product-serial-picker-check').forEach(check => {
            check.addEventListener('change', () => {
                if (check.checked) {
                    selectedIds.add(check.value);
                } else {
                    selectedIds.delete(check.value);
                }
                updateSummary(items, selectedIds);
            });
        });
    };

    const isSerialTrackedProduct = (productList, productId) => {
        const product = (productList ?? []).find(item => item.id === productId);
        return product?.physical === true && Number(product?.serialTrackingMode ?? 0) > 0;
    };

    const applySelectionToRow = (rowData, selectedSerials, quantityField) => {
        if (!selectedSerials) {
            return;
        }

        rowData.productSerialIds = selectedSerials.map(item => item.id);
        rowData.productSerialNumbers = selectedSerials.map(item => item.internalSerialNumber).join(', ');
        rowData[quantityField] = selectedSerials.length;
        rowData.totalCost = selectedSerials.reduce((sum, item) => sum + Number(item.unitCost ?? 0), 0);
        rowData.unitCost = selectedSerials.length ? rowData.totalCost / selectedSerials.length : null;
    };

    const serialText = value => (Array.isArray(value) ? value : [value])
        .map(item => typeof item === 'string'
            ? item
            : item?.internalSerialNumber ?? item?.manufacturerSerialNumber ?? item?.serialNumber ?? '')
        .filter(Boolean)
        .join(', ');

    const createGridColumn = (options) => {
        let activeRowData = null;

        return ({
        field: 'productSerialNumbers',
        headerText: options.headerText ?? 'Serial thiết bị',
        width: options.width ?? 220,
        valueAccessor: (field, data) => serialText(data.productSerialNumbers)
            || (data.productSerialIds?.length ? `${data.productSerialIds.length} serial` : ''),
        edit: {
            create: () => {
                const wrapper = document.createElement('div');
                wrapper.className = 'd-flex gap-2 align-items-center';
                wrapper.innerHTML = '<button type="button" class="btn btn-outline-primary btn-sm">Chọn serial</button><span class="text-muted serial-count"></span>';
                return wrapper;
            },
            read: () => activeRowData?.productSerialNumbers ?? '',
            write: (args) => {
                activeRowData = args.rowData;
                const button = args.element.querySelector('button');
                const label = args.element.querySelector('.serial-count');
                const productList = options.productListGetter?.() ?? [];
                const quantityField = options.quantityField ?? 'movement';
                const serialEnabled = isSerialTrackedProduct(productList, args.rowData.productId);
                const grid = options.gridGetter?.();
                let stableRowIndex = -1;
                let rowUid = null;
                const captureRowContext = () => {
                    const editorRow = args.element?.closest?.('tr');
                    const renderedRows = grid?.getRows?.() ?? [];
                    const currentIndex = editorRow ? renderedRows.indexOf(editorRow) : -1;
                    if (currentIndex >= 0) stableRowIndex = currentIndex;
                    rowUid = editorRow?.getAttribute?.('data-uid') ?? rowUid;
                };
                captureRowContext();
                if (!serialEnabled) {
                    button.disabled = true;
                    button.classList.add('disabled');
                    button.setAttribute('title', 'Hàng hóa không theo dõi serial');
                }
                const refreshLabel = () => {
                    const count = args.rowData.productSerialIds?.length ?? 0;
                    label.textContent = count ? `${count} serial` : 'Chưa chọn';
                };

                refreshLabel();
                button.addEventListener('click', async () => {
                    captureRowContext();
                    if (!serialEnabled) {
                        Swal.fire({
                            icon: 'info',
                            title: 'Không theo dõi serial',
                            text: 'Hàng hóa này không sử dụng theo dõi số seri.'
                        });
                        return;
                    }

                    const quantityObj = options.quantityObjGetter?.();

                    const warehouseId = options.warehouseIdGetter?.(args.rowData);
                    if (!args.rowData.productId || (options.requireWarehouse !== false && !warehouseId)) {
                        Swal.fire({
                            icon: 'warning',
                            title: 'Thiếu dữ liệu',
                            text: 'Làm ơn chọn sản phẩm và kho trước khi chọn số seri.'
                        });
                        return;
                    }

                    const selectedSerials = await open({
                        productId: args.rowData.productId,
                        warehouseId,
                        moduleName: options.moduleName,
                        moduleId: options.moduleIdGetter?.(args.rowData),
                        moduleItemId: options.moduleItemIdGetter?.(args.rowData) ?? args.rowData.id,
                        sourceItemId: options.sourceItemIdGetter?.(args.rowData),
                        selectedIds: args.rowData.productSerialIds ?? []
                    });

                    if (selectedSerials === null) {
                        return;
                    }

                    applySelectionToRow(args.rowData, selectedSerials, quantityField);
                    if (grid && window.GridInteractionManager?.syncBatchRowValues) {
                        GridInteractionManager.syncBatchRowValues(grid, {
                            rowData: args.rowData,
                            editorElement: args.element,
                            rowIndex: stableRowIndex,
                            rowUid,
                            values: {
                                productSerialIds: [...args.rowData.productSerialIds],
                                productSerialNumbers: args.rowData.productSerialNumbers,
                                unitCost: args.rowData.unitCost,
                                totalCost: args.rowData.totalCost,
                                [quantityField]: args.rowData[quantityField]
                            },
                            formatters: {
                                productSerialNumbers: value => serialText(value),
                                [quantityField]: value => window.NumberFormatManager?.formatToLocale?.(value ?? 0) ?? value
                            }
                        });
                    }
                    options.onSelectionApplied?.({
                        rowData: args.rowData,
                        editorElement: args.element,
                        rowIndex: stableRowIndex,
                        rowUid,
                        serialIds: [...args.rowData.productSerialIds],
                        serialNumbers: args.rowData.productSerialNumbers,
                        quantity: args.rowData[quantityField],
                        unitCost: args.rowData.unitCost,
                        totalCost: args.rowData.totalCost
                    });
                    if (quantityObj && quantityObj.isDestroyed !== true) {
                        quantityObj.value = args.rowData[quantityField] ?? 0;
                        quantityObj.readonly = selectedSerials.length > 0 && options.allowQuantityOverride !== true;
                        quantityObj.dataBind();
                    }
                    refreshLabel();
                });
            }
        }
        });
    };

    const validateGridSave = (args, options) => {
        if (String(args.requestType ?? '').toLowerCase() !== 'save' || args.managedBatch !== true) {
            return true;
        }

        const data = args.data ?? {};
        const fail = text => {
            args.cancel = true;
            Swal.fire({ icon: 'warning', title: 'Thiếu thông tin bắt buộc', text, confirmButtonText: 'Đồng ý' });
            return false;
        };
        if (!data.productId) return fail('Vui lòng chọn hàng hóa trước khi lưu.');

        if (options.warehouseField && !data[options.warehouseField]) {
            return fail('Vui lòng chọn kho hàng trước khi lưu.');
        }

        const quantityField = options.quantityField ?? 'movement';
        const quantity = Number(data[quantityField]);
        const invalidQuantity = !Number.isFinite(quantity)
            || (options.allowZeroQuantity === true ? quantity < 0 : quantity <= 0);
        if (invalidQuantity) {
            return fail(options.allowZeroQuantity === true
                ? 'Số lượng không được nhỏ hơn 0.'
                : 'Số lượng phải lớn hơn 0.');
        }

        const productList = options.productListGetter?.() ?? [];
        if (quantity === 0 && options.allowZeroQuantity === true) {
            return true;
        }
        if (!isSerialTrackedProduct(productList, data.productId)) {
            return true;
        }

        const selectedCount = data.productSerialIds?.length ?? 0;
        if (selectedCount === 0 && options.allowEmptySelection !== true) {
            return fail('Vui lòng chọn serial thiết bị trước khi lưu.');
        }

        if (selectedCount > 0 && options.allowQuantityOverride !== true) {
            data[quantityField] = selectedCount;
        }
        return true;
    };

    const open = async (options) => {
        const modalElement = ensureModal();
        const modal = bootstrap.Modal.getOrCreateInstance(modalElement);
        const selectedIds = new Set(options.selectedIds ?? []);
        const response = await AxiosManager.get(buildUrl(options), {});
        const items = response?.data?.content?.data ?? [];
        const searchInput = document.getElementById('ProductSerialPickerSearch');
        const applyButton = document.getElementById('ProductSerialPickerApply');

        searchInput.value = '';
        renderRows(items, selectedIds, '');

        return await new Promise(resolve => {
            const onSearch = () => renderRows(items, selectedIds, searchInput.value);
            const onApply = () => {
                cleanup();
                modal.hide();
                const selected = items.filter(item => selectedIds.has(item.id));
                resolve(selected);
            };
            const onHidden = () => {
                cleanup();
                resolve(null);
            };
            const cleanup = () => {
                searchInput.removeEventListener('input', onSearch);
                applyButton.removeEventListener('click', onApply);
                modalElement.removeEventListener('hidden.bs.modal', onHidden);
            };

            searchInput.addEventListener('input', onSearch);
            applyButton.addEventListener('click', onApply);
            modalElement.addEventListener('hidden.bs.modal', onHidden, { once: true });
            modal.show();
        });
    };

    return { open, createGridColumn, validateGridSave, isSerialTrackedProduct };
})();
