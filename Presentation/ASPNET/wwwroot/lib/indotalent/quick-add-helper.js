/**
 * QuickAddHelper - Utility for adding "Quick Add" (+) buttons next to dropdown fields.
 * Supports two modes:
 * 1. Simple: SweetAlert2 popup with Name + Description fields (for master data)
 * 2. Complex: Opens a SweetAlert2 popup with full form (for Vendor, Customer, Product)
 */
const QuickAddHelper = (() => {

    // Active parent forms register lookup refresh callbacks while a Quick Add
    // dialog is open. Inline/nested creates notify every ancestor so each
    // parent can refresh its live dropdown data source.
    const _activeRefreshCallbacks = new Set();
    const registerRefresh = (callback) => {
        if (typeof callback !== 'function') return () => { };
        _activeRefreshCallbacks.add(callback);
        return () => _activeRefreshCallbacks.delete(callback);
    };
    const _notifyLookupCreated = async (created) => {
        const callbacks = Array.from(_activeRefreshCallbacks);
        await Promise.all(callbacks.map(async callback => {
            try { await callback(created); } catch (e) { console.warn('Quick Add parent refresh failed', e); }
        }));
        document.dispatchEvent(new CustomEvent('quickadd:created', { detail: created }));
    };

    /**
     * Disable Bootstrap 5 modal focus trap so SweetAlert2 inputs can receive focus.
     * Bootstrap 5's Modal class uses an internal FocusTrap that intercepts 'focusin' events
     * and forces focus back into the modal. Simply removing tabindex is NOT enough.
     * We must deactivate the FocusTrap via the Modal instance.
     */
    let _trappedModalInstances = [];

    const _disableModalFocusTrap = () => {
        _trappedModalInstances = [];
        document.querySelectorAll('.modal.show').forEach(modalEl => {
            try {
                // Bootstrap 5: get the Modal instance and deactivate its focus trap
                const modalInstance = bootstrap.Modal.getInstance(modalEl);
                if (modalInstance && modalInstance._focustrap) {
                    modalInstance._focustrap.deactivate();
                    _trappedModalInstances.push(modalInstance);
                }
            } catch (e) {
                // Fallback: remove tabindex as a best-effort
                if (modalEl.getAttribute('tabindex') === '-1') {
                    modalEl.removeAttribute('tabindex');
                }
            }
        });
    };

    const _restoreModalFocusTrap = () => {
        const modalInstances = _trappedModalInstances;
        _trappedModalInstances = [];
        modalInstances.forEach(modalInstance => {
            try {
                if (modalInstance._focustrap) {
                    modalInstance._focustrap.activate();
                }
            } catch (e) { /* ignore */ }
        });
    };

    const _completeQuickAdd = async (config, response, fallbackName) => {
        const data = response?.data?.content?.data;
        const newId = data?.id;
        if (!newId) {
            throw new Error('Quick Add API did not return the created entity id.');
        }

        const refreshCallbacks = [
            ...(typeof config.refreshLookup === 'function' ? [config.refreshLookup] : []),
            ...(Array.isArray(config.refreshLookups) ? config.refreshLookups.filter(fn => typeof fn === 'function') : [])
        ];
        await Promise.all(refreshCallbacks.map(fn => fn()));

        if (config.state && config.stateKey) {
            config.state[config.stateKey] = newId;
        }

        const dropdownObj = config.dropdownObj;
        const canUpdateDropdown = dropdownObj
            && dropdownObj.isDestroyed !== true
            && (!dropdownObj.element || dropdownObj.element.isConnected);
        if (canUpdateDropdown) {
            if (config.state && config.lookupKey) {
                dropdownObj.dataSource = config.state[config.lookupKey] ?? [];
            }
            dropdownObj.dataBind?.();
            dropdownObj.value = newId;
            dropdownObj.dataBind?.();
        }

        const created = {
            id: newId,
            name: data?.name ?? fallbackName ?? '',
            data
        };
        await _notifyLookupCreated(created);
        if (typeof config.onSuccess === 'function') {
            await config.onSuccess(created);
        }
        return created;
    };

    /**
     * Attaches an inline quick-add form to a dropdown inside a SweetAlert2 popup.
     * @param {string} btnId - ID of the + button
     * @param {string} selectId - ID of the target <select> element
     * @param {string} apiUrl - API endpoint to create the record
     */
    const _attachInlineQuickAdd = (btnId, selectId, apiUrl) => {
        const btn = document.getElementById(btnId);
        const select = document.getElementById(selectId);
        if (!btn || !select) return;

        const wrapper = select.closest('.quick-add-wrapper');
        const fieldContainer = wrapper.parentElement;

        const inlineForm = document.createElement('div');
        inlineForm.className = 'qa-inline-form';
        inlineForm.innerHTML = `
            <input type="text" class="qa-input inline-name" placeholder="Tên *">
            <input type="text" class="qa-input inline-desc" placeholder="Description">
            <div class="d-flex gap-2 mt-1">
                <button type="button" class="btn btn-sm btn-success inline-save"><i class="fas fa-check"></i></button>
                <button type="button" class="btn btn-sm btn-secondary inline-cancel"><i class="fas fa-times"></i></button>
            </div>
        `;
        fieldContainer.appendChild(inlineForm);

        const nameInput = inlineForm.querySelector('.inline-name');
        const descInput = inlineForm.querySelector('.inline-desc');
        const saveBtn = inlineForm.querySelector('.inline-save');
        const cancelBtn = inlineForm.querySelector('.inline-cancel');

        btn.addEventListener('click', () => {
            wrapper.style.display = 'none';
            inlineForm.style.display = 'block';
            nameInput.value = '';
            descInput.value = '';
            nameInput.focus();
        });

        cancelBtn.addEventListener('click', () => {
            inlineForm.style.display = 'none';
            wrapper.style.display = 'flex';
        });

        saveBtn.addEventListener('click', async () => {
            const name = nameInput.value.trim();
            if (!name) {
                nameInput.style.borderColor = 'red';
                return;
            }
            nameInput.style.borderColor = '';

            try {
                saveBtn.disabled = true;
                const response = await AxiosManager.post(apiUrl, {
                    name,
                    description: descInput.value.trim(),
                    createdById: StorageManager.getUserId()
                });
                const data = response?.data?.content?.data;
                const newId = data?.id;
                if (newId) {
                    const option = document.createElement('option');
                    option.value = newId;
                    option.textContent = data.name || name;
                    select.appendChild(option);
                    select.value = newId;
                    window.DropdownSearchManager?.refreshNativeSelect(select);
                    await _notifyLookupCreated({ id: newId, name: data?.name || name, data, apiUrl });
                }
                inlineForm.style.display = 'none';
                wrapper.style.display = 'flex';
            } catch (error) {
                console.error('Inline quick add error', error);
                alert('Error creating record.');
            } finally {
                saveBtn.disabled = false;
            }
        });
    };

    // Inject CSS once
    const _injectCss = (() => {
        let injected = false;
        return () => {
            if (injected) return;
            injected = true;
            const style = document.createElement('style');
            style.textContent = `
                .quick-add-btn {
                    width: 30px;
                    height: 30px;
                    min-width: 30px;
                    padding: 0;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50% !important;
                    font-size: 12px;
                    line-height: 1;
                    flex-shrink: 0;
                }
                .quick-add-btn:hover {
                    transform: scale(1.1);
                    transition: transform 0.15s ease;
                }
                .quick-add-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .quick-add-wrapper > div:first-child,
                .quick-add-wrapper > input:first-child {
                    flex-grow: 1;
                    min-width: 0;
                }
                /* Fix: SweetAlert2 v11 uses .swal2-html-container, not .swal2-content (v10 theme mismatch) */
                .swal2-html-container {
                    overflow: auto !important;
                    text-align: left !important;
                    margin: 0.5em 1em !important;
                }
                /* Fix: Ensure SweetAlert2 appears above Bootstrap modals (z-index 1050) */
                .swal2-container {
                    z-index: 2000 !important;
                }

                /* ===== Quick Add Form Styling ===== */
                .qa-form {
                    text-align: left;
                    max-height: 60vh;
                    overflow-y: auto;
                    padding-right: 4px;
                }
                .qa-form .qa-section-title {
                    font-weight: 600;
                    font-size: 0.9rem;
                    color: #344767;
                    border-bottom: 2px solid #e9ecef;
                    padding-bottom: 6px;
                    margin-bottom: 12px;
                    margin-top: 8px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .qa-form .qa-section-title:first-child {
                    margin-top: 0;
                }
                .qa-form .qa-section-title i {
                    color: #1b84ff;
                    font-size: 0.85rem;
                }
                .qa-form .qa-field {
                    margin-bottom: 10px;
                }
                .qa-form .qa-label {
                    display: block;
                    font-weight: 600;
                    font-size: 0.8rem;
                    color: #495057;
                    margin-bottom: 4px;
                }
                .qa-form .qa-label .text-danger {
                    color: #dc3545 !important;
                    margin-left: 2px;
                }
                .qa-form .qa-input {
                    width: 100%;
                    height: 36px;
                    padding: 6px 10px;
                    font-size: 0.875rem;
                    line-height: 1.5;
                    color: #495057;
                    background-color: #fff;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                    transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
                    outline: none;
                    box-sizing: border-box;
                }
                .qa-form .qa-input:focus {
                    border-color: #1b84ff;
                    box-shadow: 0 0 0 3px rgba(27, 132, 255, 0.15);
                }
                .qa-form select.qa-input {
                    appearance: auto;
                    -webkit-appearance: auto;
                    cursor: pointer;
                    background-color: #fff;
                    padding-right: 24px;
                }
                .qa-form textarea.qa-input {
                    height: auto;
                    min-height: 60px;
                    resize: vertical;
                }
                .qa-form .qa-checkbox-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 0;
                }
                .qa-form .qa-checkbox-wrapper input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    accent-color: #1b84ff;
                    cursor: pointer;
                }
                .qa-form .qa-checkbox-wrapper label {
                    font-size: 0.875rem;
                    color: #495057;
                    cursor: pointer;
                    margin: 0;
                }
                .qa-form .qa-radio-group {
                    border: 1px solid #e9ecef;
                    border-radius: 6px;
                    padding: 10px 12px;
                    background-color: #f8f9fa;
                }
                .qa-form .qa-radio-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 0;
                }
                .qa-form .qa-radio-item input[type="radio"] {
                    width: 16px;
                    height: 16px;
                    accent-color: #1b84ff;
                    cursor: pointer;
                }
                .qa-form .qa-radio-item label {
                    font-size: 0.875rem;
                    color: #495057;
                    cursor: pointer;
                    margin: 0;
                }
                .qa-form .qa-fixedcode-section {
                    margin-top: 6px;
                    margin-left: 24px;
                }
                .qa-form .qa-fixedcode-section .qa-input {
                    width: 120px;
                }
                .qa-form .qa-help-text {
                    display: block;
                    margin-top: 4px;
                    color: #6c757d;
                    font-size: 0.75rem;
                    line-height: 1.35;
                }
                .qa-form .qa-input:disabled {
                    background-color: #e9ecef;
                    cursor: not-allowed;
                }
                /* Row layout for quick add forms */
                .qa-form .qa-row {
                    display: flex;
                    gap: 12px;
                    margin-bottom: 2px;
                }
                .qa-form .qa-row > .qa-field {
                    flex: 1;
                    min-width: 0;
                    margin-bottom: 10px;
                }
                .qa-form .qa-row > .qa-field.qa-col-4 {
                    flex: 0 0 calc(33.333% - 8px);
                }
                @media (max-width: 576px) {
                    .qa-form .qa-row {
                        flex-direction: column;
                        gap: 0;
                    }
                    .qa-form .qa-row > .qa-field.qa-col-4 {
                        flex: 1;
                    }
                }
                /* Inline Quick Add inside Swal forms */
                .qa-inline-form {
                    display: none;
                    margin-top: 4px;
                    padding: 8px;
                    background-color: #f8f9fa;
                    border: 1px solid #ced4da;
                    border-radius: 4px;
                }
                .qa-inline-form .qa-input {
                    height: 30px;
                    font-size: 0.8rem;
                    padding: 4px 8px;
                    margin-bottom: 4px;
                }
                .qa-inline-form .btn-sm {
                    padding: 2px 8px;
                    font-size: 0.8rem;
                }
            `;
            document.head.appendChild(style);
        };
    })();

    /**
     * Show a SweetAlert2 popup for quick-adding a simple entity (Name + Description).
     * After creation, refreshes the dropdown and auto-selects the new item.
     *
     * @param {Object} config
     * @param {string} config.title - Popup title (e.g., 'Quick Add Product Group')
     * @param {string} config.apiUrl - API endpoint for creating the entity (e.g., '/ProductGroup/CreateProductGroup')
     * @param {Object} config.dropdownObj - Syncfusion DropDownList instance
     * @param {Function} config.refreshLookup - Async function to re-fetch lookup data
     * @param {Object} config.state - Vue reactive state object
     * @param {string} config.stateKey - Key in state to set the new value (e.g., 'productGroupId')
     * @param {string} config.lookupKey - Key in state holding lookup array (e.g., 'productGroupListLookupData')
     */
    const simpleQuickAdd = async (config) => {
        const { title, apiUrl, dropdownObj, refreshLookup, state, stateKey, lookupKey } = config;

        const result = await Swal.fire({
            title: title,
            html:
                '<div class="qa-form">' +
                '<div class="qa-field">' +
                '<label class="qa-label">Tên <span class="text-danger">*</span></label>' +
                '<input id="swal-quick-add-name" class="qa-input" placeholder="Nhập tên...">' +
                '</div>' +
                '<div class="qa-field">' +
                '<label class="qa-label">Description</label>' +
                '<textarea id="swal-quick-add-description" class="qa-input" rows="2" placeholder="Description..."></textarea>' +
                '</div>' +
                '</div>',
            focusConfirm: false,
            heightAuto: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check me-1"></i> Lưu',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#198754',
            preConfirm: () => {
                const name = document.getElementById('swal-quick-add-name').value.trim();
                if (!name) {
                    Swal.showValidationMessage('Tên là bắt buộc.');
                    return false;
                }
                const description = document.getElementById('swal-quick-add-description').value.trim();
                return { name, description };
            },
            didOpen: () => {
                _disableModalFocusTrap();
                const nameInput = document.getElementById('swal-quick-add-name');
                if (nameInput) nameInput.focus();
            },
            willClose: () => {
                _restoreModalFocusTrap();
            }
        });

        if (!result.isConfirmed || !result.value) return null;

        try {
            const response = await AxiosManager.post(apiUrl, {
                name: result.value.name,
                description: result.value.description,
                createdById: StorageManager.getUserId()
            });

            const created = await _completeQuickAdd(config, response, result.value.name);

            Swal.fire({
                icon: 'success',
                title: 'Added successfully!',
                text: result.value.name,
                timer: 1500,
                showConfirmButton: false
            });
            return created;

        } catch (error) {
            console.error('Quick add error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: AxiosManager.getErrorMessage(error, 'Không thể thêm bản ghi.')
            });
            return null;
        }
    };

    /**
     * Quick-add a Vendor with full form fields via SweetAlert2.
     * @param {Object} config
     * @param {Object} config.dropdownObj - Syncfusion DropDownList for vendor
     * @param {Function} config.refreshLookup - Async function to re-fetch vendor lookup data
     * @param {Object} config.state - Vue reactive state
     * @param {string} config.stateKey - Key to set new vendor id (e.g., 'vendorId')
     * @param {string} config.lookupKey - Key holding vendor lookup array
     * @param {Function} [config.getVendorGroupList] - Async fn returning vendor group list
     * @param {Function} [config.getVendorCategoryList] - Async fn returning vendor category list
     */
    const complexQuickAddVendor = async (config) => {
        const { dropdownObj, refreshLookup, state, stateKey, lookupKey } = config;
        const unregisterParentRefresh = registerRefresh(async () => {
            await Promise.all([
            refreshLookup?.(), ...(Array.isArray(config.refreshLookups) ? config.refreshLookups : []).map(fn => typeof fn === 'function' ? fn() : null)
            ]);
            if (dropdownObj && config.state && config.lookupKey) {
                dropdownObj.dataSource = config.state[config.lookupKey] ?? [];
                dropdownObj.dataBind?.();
            }
        });

        // Fetch lookup data for dropdowns inside the form
        let vendorGroups = [];
        let vendorCategories = [];
        try {
            const [grpRes, catRes] = await Promise.all([
                AxiosManager.get('/VendorGroup/GetVendorGroupList', {}),
                AxiosManager.get('/VendorCategory/GetVendorCategoryList', {})
            ]);
            vendorGroups = grpRes?.data?.content?.data ?? [];
            vendorCategories = catRes?.data?.content?.data ?? [];
        } catch (e) { console.error('Failed to load vendor lookups', e); }

        const grpOptions = vendorGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const catOptions = vendorCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const result = await Swal.fire({
            title: 'Thêm nhanh nhà cung cấp',
            width: '700px',
            html: `
                <div class="qa-form">
                    <div class="qa-section-title"><i class="fas fa-info-circle"></i> Main Information</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Tên <span class="text-danger">*</span></label><input id="qa-v-name" class="qa-input" placeholder="Tên nhà cung cấp"></div>
                        <div class="qa-field">
                            <label class="qa-label">Vendor Group <span class="text-danger">*</span></label>
                            <div class="quick-add-wrapper">
                                <select id="qa-v-group" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${grpOptions}</select>
                                <button type="button" id="qa-v-group-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field">
                            <label class="qa-label">Vendor Category <span class="text-danger">*</span></label>
                            <div class="quick-add-wrapper">
                                <select id="qa-v-category" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${catOptions}</select>
                                <button type="button" id="qa-v-category-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                        <div class="qa-field"><label class="qa-label">Description</label><input id="qa-v-desc" class="qa-input" placeholder="Description"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-map-marker-alt"></i> Address</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Street</label><input id="qa-v-street" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">City</label><input id="qa-v-city" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">State/Province</label><input id="qa-v-state" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Postal Code</label><input id="qa-v-zip" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Country</label><input id="qa-v-country" class="qa-input"></div>
                        <div class="qa-field"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-phone-alt"></i> Contact</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Phone</label><input id="qa-v-phone" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Fax</label><input id="qa-v-fax" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Email</label><input id="qa-v-email" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Website</label><input id="qa-v-website" class="qa-input"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-share-alt"></i> Social Media</div>
                    <div class="qa-row">
                        <div class="qa-field qa-col-4"><label class="qa-label">WhatsApp</label><input id="qa-v-whatsapp" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">LinkedIn</label><input id="qa-v-linkedin" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">Facebook</label><input id="qa-v-facebook" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field qa-col-4"><label class="qa-label">Instagram</label><input id="qa-v-instagram" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">Twitter/X</label><input id="qa-v-twitterx" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">TikTok</label><input id="qa-v-tiktok" class="qa-input"></div>
                    </div>
                </div>`,
            focusConfirm: false,
            heightAuto: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check me-1"></i> Lưu',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#198754',
            preConfirm: () => {
                const name = document.getElementById('qa-v-name').value.trim();
                const vendorGroupId = document.getElementById('qa-v-group').value || null;
                const vendorCategoryId = document.getElementById('qa-v-category').value || null;
                if (!name) { Swal.showValidationMessage('Vendor name is required.'); return false; }
                if (!vendorGroupId) { Swal.showValidationMessage('Select a Vendor Group.'); return false; }
                if (!vendorCategoryId) { Swal.showValidationMessage('Select a Vendor Category.'); return false; }
                return {
                    name, vendorGroupId, vendorCategoryId,
                    description: document.getElementById('qa-v-desc').value.trim(),
                    street: document.getElementById('qa-v-street').value.trim(),
                    city: document.getElementById('qa-v-city').value.trim(),
                    state: document.getElementById('qa-v-state').value.trim(),
                    zipCode: document.getElementById('qa-v-zip').value.trim(),
                    country: document.getElementById('qa-v-country').value.trim(),
                    phoneNumber: document.getElementById('qa-v-phone').value.trim(),
                    faxNumber: document.getElementById('qa-v-fax').value.trim(),
                    emailAddress: document.getElementById('qa-v-email').value.trim(),
                    website: document.getElementById('qa-v-website').value.trim(),
                    whatsApp: document.getElementById('qa-v-whatsapp').value.trim(),
                    linkedIn: document.getElementById('qa-v-linkedin').value.trim(),
                    facebook: document.getElementById('qa-v-facebook').value.trim(),
                    instagram: document.getElementById('qa-v-instagram').value.trim(),
                    twitterX: document.getElementById('qa-v-twitterx').value.trim(),
                    tikTok: document.getElementById('qa-v-tiktok').value.trim(),
                    createdById: StorageManager.getUserId()
                };
            },
            didOpen: () => {
                _disableModalFocusTrap();
                document.getElementById('qa-v-name')?.focus();
                _attachInlineQuickAdd('qa-v-group-add', 'qa-v-group', '/VendorGroup/CreateVendorGroup');
                _attachInlineQuickAdd('qa-v-category-add', 'qa-v-category', '/VendorCategory/CreateVendorCategory');
            },
            willClose: () => {
                _restoreModalFocusTrap();
            }
        });

        unregisterParentRefresh();
        if (!result.isConfirmed || !result.value) return null;

        try {
            const response = await AxiosManager.post('/Vendor/CreateVendor', result.value);
            const created = await _completeQuickAdd(config, response, result.value.name);
            Swal.fire({ icon: 'success', title: 'Vendor added successfully!', text: result.value.name, timer: 1500, showConfirmButton: false });
            return created;
        } catch (error) {
            console.error('Quick add vendor error:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: AxiosManager.getErrorMessage(error, 'Không thể thêm nhà cung cấp.') });
            return null;
        }
    };

    /**
     * Quick-add a Customer with full form fields via SweetAlert2.
     */
    const complexQuickAddCustomer = async (config) => {
        const { dropdownObj, refreshLookup, state, stateKey, lookupKey } = config;
        const unregisterParentRefresh = registerRefresh(async () => {
            await Promise.all([
            refreshLookup?.(), ...(Array.isArray(config.refreshLookups) ? config.refreshLookups : []).map(fn => typeof fn === 'function' ? fn() : null)
            ]);
            if (dropdownObj && config.state && config.lookupKey) {
                dropdownObj.dataSource = config.state[config.lookupKey] ?? [];
                dropdownObj.dataBind?.();
            }
        });

        let customerGroups = [];
        let customerCategories = [];
        try {
            const [grpRes, catRes] = await Promise.all([
                AxiosManager.get('/CustomerGroup/GetCustomerGroupList', {}),
                AxiosManager.get('/CustomerCategory/GetCustomerCategoryList', {})
            ]);
            customerGroups = grpRes?.data?.content?.data ?? [];
            customerCategories = catRes?.data?.content?.data ?? [];
        } catch (e) { console.error('Failed to load customer lookups', e); }

        const grpOptions = customerGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const catOptions = customerCategories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

        const result = await Swal.fire({
            title: 'Thêm nhanh khách hàng',
            width: '700px',
            html: `
                <div class="qa-form">
                    <div class="qa-section-title"><i class="fas fa-info-circle"></i> Main Information</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Tên <span class="text-danger">*</span></label><input id="qa-c-name" class="qa-input" placeholder="Tên khách hàng"></div>
                        <div class="qa-field">
                            <label class="qa-label">Customer Group <span class="text-danger">*</span></label>
                            <div class="quick-add-wrapper">
                                <select id="qa-c-group" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${grpOptions}</select>
                                <button type="button" id="qa-c-group-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field">
                            <label class="qa-label">Customer Category <span class="text-danger">*</span></label>
                            <div class="quick-add-wrapper">
                                <select id="qa-c-category" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${catOptions}</select>
                                <button type="button" id="qa-c-category-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                        <div class="qa-field"><label class="qa-label">Description</label><input id="qa-c-desc" class="qa-input" placeholder="Description"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-map-marker-alt"></i> Address</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Street</label><input id="qa-c-street" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">City</label><input id="qa-c-city" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">State/Province</label><input id="qa-c-state" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Postal Code</label><input id="qa-c-zip" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Country</label><input id="qa-c-country" class="qa-input"></div>
                        <div class="qa-field"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-phone-alt"></i> Contact</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Phone</label><input id="qa-c-phone" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Fax</label><input id="qa-c-fax" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Email</label><input id="qa-c-email" class="qa-input"></div>
                        <div class="qa-field"><label class="qa-label">Website</label><input id="qa-c-website" class="qa-input"></div>
                    </div>
                    <div class="qa-section-title"><i class="fas fa-share-alt"></i> Social Media</div>
                    <div class="qa-row">
                        <div class="qa-field qa-col-4"><label class="qa-label">WhatsApp</label><input id="qa-c-whatsapp" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">LinkedIn</label><input id="qa-c-linkedin" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">Facebook</label><input id="qa-c-facebook" class="qa-input"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field qa-col-4"><label class="qa-label">Instagram</label><input id="qa-c-instagram" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">Twitter/X</label><input id="qa-c-twitterx" class="qa-input"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">TikTok</label><input id="qa-c-tiktok" class="qa-input"></div>
                    </div>
                </div>`,
            focusConfirm: false,
            heightAuto: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check me-1"></i> Lưu',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#198754',
            preConfirm: () => {
                const name = document.getElementById('qa-c-name').value.trim();
                const customerGroupId = document.getElementById('qa-c-group').value || null;
                const customerCategoryId = document.getElementById('qa-c-category').value || null;
                if (!name) { Swal.showValidationMessage('Customer name is required.'); return false; }
                if (!customerGroupId) { Swal.showValidationMessage('Select a Customer Group.'); return false; }
                if (!customerCategoryId) { Swal.showValidationMessage('Select a Customer Category.'); return false; }
                return {
                    name, customerGroupId, customerCategoryId,
                    description: document.getElementById('qa-c-desc').value.trim(),
                    street: document.getElementById('qa-c-street').value.trim(),
                    city: document.getElementById('qa-c-city').value.trim(),
                    state: document.getElementById('qa-c-state').value.trim(),
                    zipCode: document.getElementById('qa-c-zip').value.trim(),
                    country: document.getElementById('qa-c-country').value.trim(),
                    phoneNumber: document.getElementById('qa-c-phone').value.trim(),
                    faxNumber: document.getElementById('qa-c-fax').value.trim(),
                    emailAddress: document.getElementById('qa-c-email').value.trim(),
                    website: document.getElementById('qa-c-website').value.trim(),
                    whatsApp: document.getElementById('qa-c-whatsapp').value.trim(),
                    linkedIn: document.getElementById('qa-c-linkedin').value.trim(),
                    facebook: document.getElementById('qa-c-facebook').value.trim(),
                    instagram: document.getElementById('qa-c-instagram').value.trim(),
                    twitterX: document.getElementById('qa-c-twitterx').value.trim(),
                    tikTok: document.getElementById('qa-c-tiktok').value.trim(),
                    createdById: StorageManager.getUserId()
                };
            },
            didOpen: () => {
                _disableModalFocusTrap();
                document.getElementById('qa-c-name')?.focus();
                _attachInlineQuickAdd('qa-c-group-add', 'qa-c-group', '/CustomerGroup/CreateCustomerGroup');
                _attachInlineQuickAdd('qa-c-category-add', 'qa-c-category', '/CustomerCategory/CreateCustomerCategory');
            },
            willClose: () => {
                _restoreModalFocusTrap();
            }
        });

        unregisterParentRefresh();
        if (!result.isConfirmed || !result.value) return null;

        try {
            const response = await AxiosManager.post('/Customer/CreateCustomer', result.value);
            const created = await _completeQuickAdd(config, response, result.value.name);
            Swal.fire({ icon: 'success', title: 'Customer added successfully!', text: result.value.name, timer: 1500, showConfirmButton: false });
            return created;
        } catch (error) {
            console.error('Quick add customer error:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: AxiosManager.getErrorMessage(error, 'Không thể thêm khách hàng.') });
            return null;
        }
    };

    /**
     * Quick-add a Product with full form fields via SweetAlert2.
     */
    const complexQuickAddProduct = async (config) => {
        const { dropdownObj, refreshLookup, state, stateKey, lookupKey } = config;
        const unregisterParentRefresh = registerRefresh(async () => {
            await Promise.all([
            refreshLookup?.(), ...(Array.isArray(config.refreshLookups) ? config.refreshLookups : []).map(fn => typeof fn === 'function' ? fn() : null)
            ]);
            if (dropdownObj && config.state && config.lookupKey) {
                dropdownObj.dataSource = config.state[config.lookupKey] ?? [];
                dropdownObj.dataBind?.();
            }
        });

        let productGroups = [];
        let warehouses = [];
        try {
            const [pgRes, whRes] = await Promise.all([
                AxiosManager.get('/ProductGroup/GetProductGroupList', {}),
                AxiosManager.get('/Warehouse/GetWarehouseList', {})
            ]);
            productGroups = pgRes?.data?.content?.data ?? [];
            warehouses = (whRes?.data?.content?.data ?? []).filter(w => w.systemWarehouse === false);
        } catch (e) { console.error('Failed to load product lookups', e); }

        const pgOptions = productGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
        const whOptions = warehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');

        const result = await Swal.fire({
            title: 'Thêm nhanh sản phẩm',
            width: '700px',
            html: `
                <div class="qa-form">
                    <div class="qa-section-title"><i class="fas fa-info-circle"></i> Main Information</div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Tên <span class="text-danger">*</span></label><input id="qa-p-name" class="qa-input" placeholder="Tên sản phẩm"></div>
                        <div class="qa-field"><label class="qa-label">Reference Code</label><input id="qa-p-refcode" class="qa-input" placeholder="SKU Code"></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field">
                            <label class="qa-label">Product Group <span class="text-danger">*</span></label>
                            <div class="quick-add-wrapper">
                                <select id="qa-p-group" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${pgOptions}</select>
                                <button type="button" id="qa-p-group-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                        <div class="qa-field"><label class="qa-label">Unit Measure</label><input id="qa-p-unit" class="qa-input" placeholder="Piece, Box, Kg..."></div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field qa-col-4"><label class="qa-label">Cost Price</label><input id="qa-p-costprice" class="qa-input" type="text" inputmode="decimal" data-number-format="true" value="0,00"></div>
                        <div class="qa-field qa-col-4"><label class="qa-label">Unit Price</label><input id="qa-p-unitprice" class="qa-input" type="text" inputmode="decimal" data-number-format="true" value="0,00"></div>
                        <div class="qa-field qa-col-4">
                            <label class="qa-label">Warehouse</label>
                            <div class="quick-add-wrapper">
                                <select id="qa-p-warehouse" class="qa-input" data-searchable-dropdown><option value="">-- Select --</option>${whOptions}</select>
                                <button type="button" id="qa-p-warehouse-add" class="btn btn-sm btn-outline-primary quick-add-btn"><i class="fas fa-plus"></i></button>
                            </div>
                        </div>
                    </div>
                    <div class="qa-row">
                        <div class="qa-field"><label class="qa-label">Thời hạn bảo hành (tháng)</label><input id="qa-p-warranty" class="qa-input" type="number" min="0" value="0"></div>
                        <div class="qa-field" style="display:flex;align-items:flex-end;">
                            <div class="qa-checkbox-wrapper">
                                <input type="checkbox" id="qa-p-physical" checked>
                                <label for="qa-p-physical">Is Physical Product?</label>
                            </div>
                        </div>
                    </div>
                    <div id="qa-p-serial-section" class="qa-field">
                        <label class="qa-label">Device Code Management</label>
                        <div class="qa-radio-group">
                            <div class="qa-radio-item">
                                <input type="radio" name="qa-p-serial" id="qa-p-serial-none" value="0" checked>
                                <label for="qa-p-serial-none">No serial tracking</label>
                            </div>
                            <div class="qa-radio-item">
                                <input type="radio" name="qa-p-serial" id="qa-p-serial-auto" value="1">
                                <label for="qa-p-serial-auto">Auto-generate Internal Code</label>
                            </div>
                            <div class="qa-fixedcode-section" id="qa-p-fixedcode-section" style="display:none;">
                                <label class="qa-label">Fixed Code</label>
                                <input id="qa-p-fixedcode" class="qa-input" maxlength="4" placeholder="CAM" value="CAM" style="width:120px;">
                            </div>
                            <div class="qa-radio-item">
                                <input type="radio" name="qa-p-serial" id="qa-p-serial-manufacturer" value="2">
                                <label for="qa-p-serial-manufacturer">Manufacturer Serial Entry</label>
                            </div>
                        </div>
                    </div>
                    <div class="qa-field">
                        <label class="qa-label" for="qa-p-opening-stock">Opening Stock</label>
                        <input id="qa-p-opening-stock" class="qa-input" type="text" inputmode="decimal" value="0" placeholder="0">
                        <small id="qa-p-opening-stock-help" class="qa-help-text">Opening stock uses the default warehouse when first entered.</small>
                        <small class="qa-help-text">Effective date: first day of the current month.</small>
                    </div>
                    <div class="qa-field">
                        <label class="qa-label">Description</label>
                        <textarea id="qa-p-desc" class="qa-input" rows="2" placeholder="Description..."></textarea>
                    </div>
                </div>`,
            focusConfirm: false,
            heightAuto: false,
            showCancelButton: true,
            confirmButtonText: '<i class="fas fa-check me-1"></i> Lưu',
            cancelButtonText: 'Hủy',
            confirmButtonColor: '#198754',
            preConfirm: () => {
                const name = document.getElementById('qa-p-name').value.trim();
                const productGroupId = document.getElementById('qa-p-group').value || null;
                const unitMeasureName = document.getElementById('qa-p-unit').value.trim();
                if (!name) { Swal.showValidationMessage('Product name is required.'); return false; }
                if (!productGroupId) { Swal.showValidationMessage('Select a Product Group.'); return false; }
                const physical = document.getElementById('qa-p-physical').checked;
                const serialRadio = document.querySelector('input[name="qa-p-serial"]:checked');
                const serialTrackingMode = physical ? (serialRadio ? parseInt(serialRadio.value, 10) : 0) : 0;
                const fixedCode = (document.getElementById('qa-p-fixedcode')?.value ?? 'CAM').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
                const openingStockInput = document.getElementById('qa-p-opening-stock');
                const openingStockApplies = physical && serialTrackingMode !== 2;
                const openingStockRaw = openingStockInput?.value?.trim() ?? '';
                const openingStockQuantity = openingStockApplies
                    ? (openingStockRaw === '' ? 0 : NumberFormatManager.parseLocaleNumber(openingStockRaw))
                    : null;
                const costPriceRaw = document.getElementById('qa-p-costprice').value.trim();
                const costPrice = costPriceRaw === '' ? null : NumberFormatManager.parseLocaleNumber(costPriceRaw);
                const unitPriceRaw = document.getElementById('qa-p-unitprice').value.trim();
                const unitPrice = unitPriceRaw === '' ? 0 : NumberFormatManager.parseLocaleNumber(unitPriceRaw);

                if (physical && serialTrackingMode === 1 && (fixedCode.length < 2 || fixedCode.length > 4)) {
                    Swal.showValidationMessage('Fixed Code must be 2-4 letters or digits.');
                    return false;
                }
                if (openingStockApplies && openingStockQuantity == null) {
                    Swal.showValidationMessage('Opening stock must be a valid number.');
                    return false;
                }
                if (openingStockApplies && openingStockQuantity < 0) {
                    Swal.showValidationMessage('Opening stock must be zero or greater.');
                    return false;
                }
                if (costPrice == null || costPrice < 0 || unitPrice == null || unitPrice < 0) {
                    Swal.showValidationMessage('Giá vốn và giá bán phải là số hợp lệ không âm.');
                    return false;
                }
                if (openingStockApplies && serialTrackingMode === 1 && !Number.isInteger(openingStockQuantity)) {
                    Swal.showValidationMessage('Opening stock must be a whole number for auto-generated internal codes.');
                    return false;
                }
                const decimalPart = openingStockRaw.includes(',') ? openingStockRaw.split(',').pop().replace(/\D/g, '') : '';
                if (openingStockApplies && serialTrackingMode === 0 && decimalPart.length > 6) {
                    Swal.showValidationMessage('Opening stock supports up to 6 decimal places.');
                    return false;
                }
                const defaultWarehouseId = physical ? (document.getElementById('qa-p-warehouse').value || null) : null;
                if (openingStockQuantity > 0 && !defaultWarehouseId) {
                    Swal.showValidationMessage('Default warehouse is required when opening stock is greater than zero.');
                    return false;
                }
                if (openingStockQuantity > 0 && costPrice == null) {
                    Swal.showValidationMessage('Cost price is required when opening stock is greater than zero.');
                    return false;
                }
                return {
                    name, productGroupId, unitMeasureName,
                    referenceCode: document.getElementById('qa-p-refcode').value.trim(),
                    costPrice,
                    unitPrice,
                    defaultWarehouseId,
                    defaultWarrantyMonths: parseInt(document.getElementById('qa-p-warranty').value) || 0,
                    physical,
                    serialTrackingMode,
                    internalSerialFixedCode: serialTrackingMode === 1 ? fixedCode : null,
                    openingStockQuantity,
                    description: document.getElementById('qa-p-desc').value.trim(),
                    createdById: StorageManager.getUserId()
                };
            },
            didOpen: () => {
                _disableModalFocusTrap();
                document.getElementById('qa-p-name')?.focus();
                const popup = document.querySelector('.swal2-popup');
                popup?.addEventListener('keydown', event => {
                    if (event.key !== 'Enter') return;
                    const target = event.target;
                    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }, true);
                _attachInlineQuickAdd('qa-p-group-add', 'qa-p-group', '/ProductGroup/CreateProductGroup');
                _attachInlineQuickAdd('qa-p-warehouse-add', 'qa-p-warehouse', '/Warehouse/CreateWarehouse');

                const physCb = document.getElementById('qa-p-physical');
                const serialSection = document.getElementById('qa-p-serial-section');
                const serialRadios = Array.from(document.querySelectorAll('input[name="qa-p-serial"]'));
                const serialNone = document.getElementById('qa-p-serial-none');
                const fixedCodeSection = document.getElementById('qa-p-fixedcode-section');
                const fixedCodeInput = document.getElementById('qa-p-fixedcode');
                const openingStockInput = document.getElementById('qa-p-opening-stock');
                const moneyInputs = [
                    document.getElementById('qa-p-costprice'),
                    document.getElementById('qa-p-unitprice')
                ];
                const openingStockHelp = document.getElementById('qa-p-opening-stock-help');

                const refreshProductTrackingFields = () => {
                    const physical = physCb?.checked === true;
                    if (!physical && serialNone) {
                        serialNone.checked = true;
                        if (fixedCodeInput) fixedCodeInput.value = '';
                    }

                    const selectedMode = physical
                        ? parseInt(document.querySelector('input[name="qa-p-serial"]:checked')?.value ?? '0', 10)
                        : 0;
                    if (serialSection) serialSection.style.display = physical ? '' : 'none';
                    if (fixedCodeSection) fixedCodeSection.style.display = physical && selectedMode === 1 ? '' : 'none';

                    if (!openingStockInput || !openingStockHelp) return;
                    const openingStockEnabled = physical && selectedMode !== 2;
                    openingStockInput.disabled = !openingStockEnabled;
                    openingStockInput.setAttribute('inputmode', selectedMode === 1 ? 'numeric' : 'decimal');
                    if (!openingStockEnabled) openingStockInput.value = '0';

                    if (!physical) {
                        openingStockHelp.textContent = 'Non-physical products do not have stock.';
                    } else if (selectedMode === 2) {
                        openingStockHelp.textContent = 'Opening stock for manufacturer serial products must be entered through a Purchase Order.';
                    } else {
                        openingStockHelp.textContent = 'Opening stock uses the default warehouse when first entered.';
                    }
                };

                physCb?.addEventListener('change', refreshProductTrackingFields);
                serialRadios.forEach(radio => radio.addEventListener('change', refreshProductTrackingFields));
                fixedCodeInput?.addEventListener('input', () => {
                    fixedCodeInput.value = fixedCodeInput.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
                });
                openingStockInput?.addEventListener('blur', () => {
                    if (openingStockInput.disabled || openingStockInput.value.trim() === '') return;
                    const parsed = NumberFormatManager.parseLocaleNumber(openingStockInput.value);
                    if (parsed != null) openingStockInput.value = NumberFormatManager.formatToLocale(parsed);
                });
                moneyInputs.forEach(input => input?.addEventListener('blur', () => {
                    const parsed = NumberFormatManager.parseLocaleNumber(input.value);
                    if (parsed != null) input.value = NumberFormatManager.formatMoneyToLocale(parsed);
                }));
                refreshProductTrackingFields();
            },
            willClose: () => {
                _restoreModalFocusTrap();
            }
        });

        unregisterParentRefresh();
        if (!result.isConfirmed || !result.value) return null;

        try {
            const response = await AxiosManager.post('/Product/CreateProduct', result.value);
            const created = await _completeQuickAdd(config, response, result.value.name);
            Swal.fire({ icon: 'success', title: 'Product added successfully!', text: result.value.name, timer: 1500, showConfirmButton: false });
            return created;
        } catch (error) {
            console.error('Quick add product error:', error);
            Swal.fire({ icon: 'error', title: 'Error', text: AxiosManager.getErrorMessage(error, 'Không thể thêm hàng hóa.') });
            return null;
        }
    };

    _injectCss();

    return {
        simpleQuickAdd,
        complexQuickAddVendor,
        complexQuickAddCustomer,
        complexQuickAddProduct,
        registerRefresh,
        notifyCreated: _notifyLookupCreated
    };

})();
