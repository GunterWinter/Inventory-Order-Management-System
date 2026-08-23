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

    const buildUrl = (options) => {
        const params = new URLSearchParams();
        ['productId', 'warehouseId', 'moduleName', 'moduleId', 'moduleItemId'].forEach(key => {
            if (options[key]) {
                params.append(key, options[key]);
            }
        });
        return `/ProductSerial/GetProductSerialPickerList?${params.toString()}`;
    };

    const renderRows = (items, selectedIds, searchText) => {
        const body = document.getElementById('ProductSerialPickerBody');
        const summary = document.getElementById('ProductSerialPickerSummary');
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
                    <td>${formatDate(item.customerWarrantyEndDate ?? item.supplierWarrantyEndDate)}</td>
                </tr>`;
        }).join('');

        summary.textContent = `Đã chọn ${selectedIds.size} / ${items.length}`;

        body.querySelectorAll('.product-serial-picker-check').forEach(check => {
            check.addEventListener('change', () => {
                if (check.checked) {
                    selectedIds.add(check.value);
                } else {
                    selectedIds.delete(check.value);
                }
                summary.textContent = `Đã chọn ${selectedIds.size} / ${items.length}`;
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
    };

    const createGridColumn = (options) => ({
        field: 'productSerialNumbers',
        headerText: options.headerText ?? 'Device Serials',
        width: options.width ?? 220,
        valueAccessor: (field, data) => data.productSerialNumbers || (data.productSerialIds?.length ? `${data.productSerialIds.length} serials` : ''),
        edit: {
            create: () => {
                const wrapper = document.createElement('div');
                wrapper.className = 'd-flex gap-2 align-items-center';
                wrapper.innerHTML = '<button type="button" class="btn btn-outline-primary btn-sm">Choose serials</button><span class="text-muted serial-count"></span>';
                return wrapper;
            },
            read: () => '',
            write: (args) => {
                const button = args.element.querySelector('button');
                const label = args.element.querySelector('.serial-count');
                const productList = options.productListGetter?.() ?? [];
                const quantityField = options.quantityField ?? 'movement';
                const serialEnabled = isSerialTrackedProduct(productList, args.rowData.productId);
                if (!serialEnabled) {
                    button.disabled = true;
                    button.classList.add('disabled');
                    button.setAttribute('title', 'Hàng hóa không theo dõi serial');
                }
                const refreshLabel = () => {
                    const count = args.rowData.productSerialIds?.length ?? 0;
                    label.textContent = count ? `${count} serials` : 'None';
                };

                refreshLabel();
                button.addEventListener('click', async () => {
                    if (!serialEnabled) {
                        Swal.fire({
                            icon: 'info',
                            title: 'No serial tracking',
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
                        moduleItemId: args.rowData.id,
                        selectedIds: args.rowData.productSerialIds ?? []
                    });

                    if (selectedSerials === null) {
                        return;
                    }

                    applySelectionToRow(args.rowData, selectedSerials, quantityField);
                    if (quantityObj) {
                        quantityObj.value = args.rowData[quantityField] ?? 0;
                        quantityObj.readonly = selectedSerials.length > 0;
                        quantityObj.dataBind();
                    }
                    refreshLabel();
                });
            }
        }
    });

    const validateGridSave = (args, options) => {
        if (args.requestType !== 'save') {
            return true;
        }

        const data = args.data ?? {};
        const productList = options.productListGetter?.() ?? [];
        if (!isSerialTrackedProduct(productList, data.productId)) {
            return true;
        }

        const quantityField = options.quantityField ?? 'movement';
        const selectedCount = data.productSerialIds?.length ?? 0;
        if (selectedCount === 0 && options.allowEmptySelection !== true) {
            args.cancel = true;
            Swal.fire({
                icon: 'warning',
                title: 'Lưu thất bại',
                text: 'Làm ơn chọn số seri thiết bị trước khi lưu.',
                confirmButtonText: 'OK'
            });
            return false;
        }

        if (selectedCount > 0) {
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
