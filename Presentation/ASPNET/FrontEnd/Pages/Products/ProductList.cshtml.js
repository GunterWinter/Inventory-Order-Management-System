const App = {
    setup() {
        const state = Vue.reactive({
            mainData: [],
            deleteMode: false,
            productGroupListLookupData: [],
            unitMeasureListLookupData: [],
            warehouseListLookupData: [],
            mainTitle: null,
            id: '',
            name: '',
            number: '',
            referenceCode: '',
            unitPrice: '',
            costPrice: '',
            imageUrl: '',
            defaultWarehouseId: null,
            defaultWarrantyMonths: '',
            description: '',
            productGroupId: null,
            physical: true,
            serialTrackingMode: 0,
            originalSerialTrackingMode: 0,
            internalSerialFixedCode: 'CAM',
            openingStockQuantity: 0,
            openingStockWarehouseId: null,
            openingStockWarehouseName: '',
            hasOpeningStockHistory: false,
            openingStockDirty: false,
            errors: {
                name: '',
                referenceCode: '',
                unitPrice: '',
                costPrice: '',
                defaultWarrantyMonths: '',
                internalSerialFixedCode: '',
                openingStockQuantity: '',
                productGroupId: '',
                unitMeasureName: ''
            },
            isSubmitting: false
        });

        const mainGridRef = Vue.ref(null);
        const mainModalRef = Vue.ref(null);
        const productGroupIdRef = Vue.ref(null);
        const defaultWarehouseIdRef = Vue.ref(null);
        const nameRef = Vue.ref(null);
        const numberRef = Vue.ref(null);
        const referenceCodeRef = Vue.ref(null);
        const unitPriceRef = Vue.ref(null);
        const costPriceRef = Vue.ref(null);
        const imageFileRef = Vue.ref(null);
        const defaultWarrantyMonthsRef = Vue.ref(null);
        const openingStockQuantityRef = Vue.ref(null);

        const getImageUrl = (name) => {
            if (!name) return '/noimage.png';
            if (name.startsWith('http://') || name.startsWith('https://')) return name;
            return '/api/FileImage/GetImage?imageName=' + encodeURIComponent(name);
        };
        const normalizeInternalSerialFixedCode = (value) => (value ?? '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
        const getEffectiveSerialTrackingMode = () => state.physical ? Number(state.serialTrackingMode ?? 0) : 0;
        const getEffectiveInternalSerialFixedCode = () => getEffectiveSerialTrackingMode() === 1 ? normalizeInternalSerialFixedCode(state.internalSerialFixedCode) : null;
        const isOpeningStockEditable = () => {
            if (state.deleteMode || !state.physical) {
                return false;
            }

            const serialTrackingMode = getEffectiveSerialTrackingMode();
            if (state.id !== '') {
                return Number(state.originalSerialTrackingMode ?? 0) === 0 && serialTrackingMode === 0;
            }

            return serialTrackingMode === 0 || serialTrackingMode === 1;
        };
        const getInternalSerialPreview = () => {
            const fixedCode = getEffectiveInternalSerialFixedCode() || 'CAM';
            const randomLength = Math.max(0, 12 - fixedCode.length);
            return `${'D2FIAS923X'.slice(0, randomLength)}${fixedCode}`;
        };
        const getUnitPriceValue = () => {
            if (typeof state.unitPrice === 'number') {
                return state.unitPrice;
            }

            return NumberFormatManager.parseLocaleNumber(state.unitPrice);
        };

        const getCostPriceValue = () => {
            if (typeof state.costPrice === 'number') {
                return state.costPrice;
            }

            return NumberFormatManager.parseLocaleNumber(state.costPrice);
        };

        const getDefaultWarrantyMonthsValue = () => {
            if (state.defaultWarrantyMonths === '' || state.defaultWarrantyMonths == null) {
                return null;
            }

            return Number(state.defaultWarrantyMonths);
        };

        const getOpeningStockValue = () => {
            if (state.openingStockQuantity === '' || state.openingStockQuantity == null) {
                return null;
            }

            if (typeof state.openingStockQuantity === 'number') {
                return Number.isFinite(state.openingStockQuantity) ? state.openingStockQuantity : null;
            }

            return NumberFormatManager.parseLocaleNumber(state.openingStockQuantity);
        };

        const getOpeningStockPayloadValue = () => {
            if (state.id !== '' && !state.openingStockDirty) {
                return undefined;
            }

            if (!isOpeningStockEditable()) {
                return state.id === '' ? null : undefined;
            }

            return getOpeningStockValue() ?? 0;
        };

        const readNumericEditorValue = (editor, fallback) => {
            if (!editor) return fallback;
            if (typeof editor.value === 'number' && Number.isFinite(editor.value)) {
                return editor.value;
            }
            const inputValue = editor.element?.value;
            if (inputValue !== undefined && inputValue !== null && inputValue !== '') {
                const parsed = NumberFormatManager.parseLocaleNumber(inputValue);
                if (parsed !== null && Number.isFinite(parsed)) return parsed;
            }
            return editor.value ?? fallback;
        };

        const snapshotProductEditors = () => {
            state.name = nameText.obj?.value ?? state.name;
            state.referenceCode = referenceCodeText.obj?.value ?? state.referenceCode;
            state.unitPrice = readNumericEditorValue(unitPriceNumber.obj, state.unitPrice) ?? '';
            state.costPrice = readNumericEditorValue(costPriceNumber.obj, state.costPrice) ?? '';
            state.defaultWarrantyMonths = readNumericEditorValue(
                defaultWarrantyMonthsNumber.obj,
                state.defaultWarrantyMonths
            ) ?? '';
            state.defaultWarehouseId = defaultWarehouseListLookup.obj?.value ?? state.defaultWarehouseId;

            if (isOpeningStockEditable()) {
                const previousOpeningStock = getOpeningStockValue() ?? 0;
                const currentOpeningStock = readNumericEditorValue(
                    openingStockNumber.obj,
                    state.openingStockQuantity
                ) ?? 0;
                state.openingStockQuantity = currentOpeningStock;
                if (state.id !== '' && Math.abs(currentOpeningStock - previousOpeningStock) > 0.000001) {
                    state.openingStockDirty = true;
                }
            }
        };

        const validateForm = function () {
            state.errors.name = '';
            state.errors.referenceCode = '';
            state.errors.unitPrice = '';
            state.errors.costPrice = '';
            state.errors.defaultWarrantyMonths = '';
            state.errors.internalSerialFixedCode = '';
            state.errors.openingStockQuantity = '';
            state.errors.productGroupId = '';

            let isValid = true;

            if (!state.name) {
                state.errors.name = 'Name is required.';
                isValid = false;
            }
            const unitPriceValue = getUnitPriceValue();
            if (unitPriceValue != null && unitPriceValue < 0) {
                state.errors.unitPrice = 'Unit price must be zero or greater.';
                isValid = false;
            }
            const costPriceValue = getCostPriceValue();
            if (costPriceValue != null && costPriceValue < 0) {
                state.errors.costPrice = 'Cost price must be zero or greater.';
                isValid = false;
            }
            const defaultWarrantyMonthsValue = getDefaultWarrantyMonthsValue();
            if (defaultWarrantyMonthsValue != null && defaultWarrantyMonthsValue < 0) {
                state.errors.defaultWarrantyMonths = 'Warranty months must be zero or greater.';
                isValid = false;
            }
            if (state.physical && getEffectiveSerialTrackingMode() === 1) {
                const fixedCode = getEffectiveInternalSerialFixedCode();
                if (!fixedCode || fixedCode.length < 2 || fixedCode.length > 4) {
                    state.errors.internalSerialFixedCode = 'Fixed Code must be 2-4 letters or digits.';
                    isValid = false;
                }
            }
            if (isOpeningStockEditable()) {
                const openingStockValue = getOpeningStockValue() ?? 0;
                if (openingStockValue < 0) {
                    state.errors.openingStockQuantity = 'Opening stock must be zero or greater.';
                    isValid = false;
                } else if (getEffectiveSerialTrackingMode() === 1 && !Number.isInteger(openingStockValue)) {
                    state.errors.openingStockQuantity = 'Opening stock must be a whole number for auto-generated internal codes.';
                    isValid = false;
                }

                if (openingStockValue > 0 && !state.hasOpeningStockHistory && costPriceValue == null) {
                    state.errors.costPrice = 'Cost price is required when opening stock is greater than zero.';
                    isValid = false;
                }

                if (openingStockValue > 0 && !state.hasOpeningStockHistory && !state.defaultWarehouseId) {
                    state.errors.openingStockQuantity = 'Default warehouse is required when opening stock is greater than zero.';
                    isValid = false;
                }
            }
            if (!state.productGroupId) {
                state.errors.productGroupId = 'ProductGroup is required.';
                isValid = false;
            }
            if (!state.unitMeasureName) {
                state.errors.unitMeasureName = 'UnitMeasure is required.';
                isValid = false;
            }

            return isValid;
        };

        const resetFormState = () => {
            state.id = '';
            state.name = '';
            state.number = '';
            state.referenceCode = '';
            state.unitPrice = '';
            state.costPrice = '';
            state.imageUrl = '';
            state.defaultWarehouseId = null;
            state.defaultWarrantyMonths = '';
            state.description = '';
            state.productGroupId = null;
            state.unitMeasureName = '';
            state.physical = true;
            state.serialTrackingMode = 0;
            state.originalSerialTrackingMode = 0;
            state.internalSerialFixedCode = 'CAM';
            state.openingStockQuantity = 0;
            state.openingStockWarehouseId = null;
            state.openingStockWarehouseName = '';
            state.hasOpeningStockHistory = false;
            state.openingStockDirty = false;
            state.errors = {
                name: '',
                referenceCode: '',
                unitPrice: '',
                costPrice: '',
                defaultWarrantyMonths: '',
                internalSerialFixedCode: '',
                openingStockQuantity: '',
                productGroupId: '',
                unitMeasureName: ''
            };
            if (imageFileRef.value) {
                imageFileRef.value.value = '';
            }
        };

        const services = {
            getMainData: async () => {
                try {
                    const response = await AxiosManager.get('/Product/GetProductList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            createMainData: async (name, referenceCode, unitPrice, costPrice, imageUrl, physical, serialTrackingMode, internalSerialFixedCode, defaultWarehouseId, defaultWarrantyMonths, description, productGroupId, unitMeasureName, openingStockQuantity, createdById) => {
                try {
                    const payload = {
                        name, referenceCode, unitPrice, costPrice, imageUrl, physical, serialTrackingMode, internalSerialFixedCode, defaultWarehouseId, defaultWarrantyMonths, description, productGroupId, unitMeasureName, createdById
                    };
                    if (openingStockQuantity !== undefined) {
                        payload.openingStockQuantity = openingStockQuantity;
                    }
                    const response = await AxiosManager.post('/Product/CreateProduct', payload);
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            updateMainData: async (id, name, referenceCode, unitPrice, costPrice, imageUrl, physical, serialTrackingMode, internalSerialFixedCode, defaultWarehouseId, defaultWarrantyMonths, description, productGroupId, unitMeasureName, openingStockQuantity, updatedById) => {
                try {
                    const payload = {
                        id, name, referenceCode, unitPrice, costPrice, imageUrl, physical, serialTrackingMode, internalSerialFixedCode, defaultWarehouseId, defaultWarrantyMonths, description, productGroupId, unitMeasureName, updatedById
                    };
                    if (openingStockQuantity !== undefined) {
                        payload.openingStockQuantity = openingStockQuantity;
                    }
                    const response = await AxiosManager.post('/Product/UpdateProduct', payload);
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            uploadImage: async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                try {
                    const response = await AxiosManager.post('/FileImage/UploadImage', formData, {
                        headers: {
                            'Content-Type': 'multipart/form-data'
                        }
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            deleteMainData: async (id, deletedById) => {
                try {
                    const response = await AxiosManager.post('/Product/DeleteProduct', {
                        id, deletedById
                    });
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getProductGroupListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/ProductGroup/GetProductGroupList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
            getWarehouseListLookupData: async () => {
                try {
                    const response = await AxiosManager.get('/Warehouse/GetWarehouseList', {});
                    return response;
                } catch (error) {
                    throw error;
                }
            },
        };

        const methods = {
            populateProductGroupListLookupData: async () => {
                const response = await services.getProductGroupListLookupData();
                state.productGroupListLookupData = response?.data?.content?.data;
            },
            populateWarehouseListLookupData: async () => {
                const response = await services.getWarehouseListLookupData();
                state.warehouseListLookupData = response?.data?.content?.data?.filter(item => item.systemWarehouse === false) ?? [];
            },
            populateMainData: async () => {
                const response = await services.getMainData();
                state.mainData = response?.data?.content?.data.map(item => ({
                    ...item,
                    createdAtUtc: DateFormatManager.parseServerDate(item.createdAtUtc)
                }));
            },
        };

        const productGroupListLookup = {
            obj: null,
            create: () => {
                if (state.productGroupListLookupData && Array.isArray(state.productGroupListLookupData)) {
                    productGroupListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.productGroupListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select a Product Group',
                        popupHeight: '200px',
                        change: (e) => {
                            state.productGroupId = e.value;
                        }
                    });
                    productGroupListLookup.obj.appendTo(productGroupIdRef.value);
                } else {
                    console.error('ProductGroup list lookup data is not available or invalid.');
                }
            },
            refresh: () => {
                if (productGroupListLookup.obj) {
                    productGroupListLookup.obj.value = state.productGroupId;
                }
            },
        };

        const defaultWarehouseListLookup = {
            obj: null,
            create: () => {
                if (state.warehouseListLookupData && Array.isArray(state.warehouseListLookupData)) {
                    defaultWarehouseListLookup.obj = new ej.dropdowns.DropDownList({
                        dataSource: state.warehouseListLookupData,
                        fields: { value: 'id', text: 'name' },
                        placeholder: 'Select a Warehouse',
                        popupHeight: '200px',
                        allowFiltering: true,
                        showClearButton: true,
                        footerTemplate: '<div class="p-2"><button type="button" class="btn btn-sm btn-outline-primary w-100" id="quickAddWarehouseProductBtn"><i class="fas fa-plus me-1"></i>Quick Add Warehouse</button></div>',
                        open: (e) => {
                            const btn = e.popup.element.querySelector('#quickAddWarehouseProductBtn');
                            if (btn) {
                                btn.onclick = async () => {
                                    defaultWarehouseListLookup.obj.hidePopup();
                                    await QuickAddHelper.simpleQuickAdd({
                                        title: 'Quick Add Warehouse',
                                        apiUrl: '/Warehouse/CreateWarehouse',
                                        dropdownObj: defaultWarehouseListLookup.obj,
                                        refreshLookup: methods.populateWarehouseListLookupData,
                                        state: state,
                                        stateKey: 'defaultWarehouseId',
                                        lookupKey: 'warehouseListLookupData'
                                    });
                                };
                            }
                        },
                        change: (e) => {
                            state.defaultWarehouseId = e.value || null;
                        }
                    });
                    defaultWarehouseListLookup.obj.appendTo(defaultWarehouseIdRef.value);
                } else {
                    console.error('Warehouse list lookup data is not available or invalid.');
                }
            },
            refresh: () => {
                if (defaultWarehouseListLookup.obj) {
                    defaultWarehouseListLookup.obj.value = state.defaultWarehouseId;
                }
            },
        };
        const nameText = {
            obj: null,
            create: () => {
                nameText.obj = new ej.inputs.TextBox({
                    placeholder: 'Enter Name',
                });
                nameText.obj.appendTo(nameRef.value);
            },
            refresh: () => {
                if (nameText.obj) {
                    nameText.obj.value = state.name;
                }
            }
        };

        const numberText = {
            obj: null,
            create: () => {
                numberText.obj = new ej.inputs.TextBox({
                    placeholder: '[auto]',
                    readonly: true
                });
                numberText.obj.appendTo(numberRef.value);
            },
            refresh: () => {
                if (numberText.obj) {
                    numberText.obj.value = state.number;
                }
            }
        };

        const referenceCodeText = {
            obj: null,
            create: () => {
                referenceCodeText.obj = new ej.inputs.TextBox({
                    placeholder: 'Enter Reference Code (SKU/Custom)',
                });
                referenceCodeText.obj.appendTo(referenceCodeRef.value);
            },
            refresh: () => {
                if (referenceCodeText.obj) {
                    referenceCodeText.obj.value = state.referenceCode;
                }
            }
        };

        const defaultWarrantyMonthsNumber = {
            obj: null,
            create: () => {
                defaultWarrantyMonthsNumber.obj = new ej.inputs.NumericTextBox({
                    format: 'n0',
                    placeholder: 'Enter Warranty Months',
                    min: 0,
                    decimals: 0,
                    validateDecimalOnType: false,
                    change: (e) => {
                        state.defaultWarrantyMonths = e.value ?? '';
                    }
                });
                defaultWarrantyMonthsNumber.obj.appendTo(defaultWarrantyMonthsRef.value);
            },
            refresh: () => {
                if (defaultWarrantyMonthsNumber.obj) {
                    defaultWarrantyMonthsNumber.obj.value = getDefaultWarrantyMonthsValue();
                    defaultWarrantyMonthsNumber.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(defaultWarrantyMonthsNumber.obj);
                }
            }
        };
        const openingStockNumber = {
            obj: null,
            create: () => {
                openingStockNumber.obj = new ej.inputs.NumericTextBox({
                    value: getOpeningStockValue() ?? 0,
                    format: 'n6',
                    min: 0,
                    decimals: 6,
                    validateDecimalOnType: false,
                    enabled: isOpeningStockEditable(),
                    change: (e) => {
                        state.openingStockQuantity = e.value ?? 0;
                        state.openingStockDirty = true;
                        state.errors.openingStockQuantity = '';
                    }
                });
                openingStockNumber.obj.appendTo(openingStockQuantityRef.value);
            },
            refresh: () => {
                if (!openingStockNumber.obj) {
                    return;
                }

                const requiresWholeNumber = getEffectiveSerialTrackingMode() === 1;
                openingStockNumber.obj.setProperties({
                    value: getOpeningStockValue() ?? 0,
                    format: requiresWholeNumber ? 'n0' : 'n6',
                    decimals: requiresWholeNumber ? 0 : 6,
                    validateDecimalOnType: requiresWholeNumber,
                    enabled: isOpeningStockEditable()
                }, true);
                openingStockNumber.obj.dataBind();
                NumberFormatManager.refreshNumericTextBox(openingStockNumber.obj);
            }
        };
        const costPriceNumber = {
            obj: null,
            create: () => {
                costPriceNumber.obj = new ej.inputs.NumericTextBox({
                    format: 'n6',
                    placeholder: 'Enter Cost Price',
                    min: 0,
                    step: 0.01,
                    decimals: 6,
                    validateDecimalOnType: false,
                    change: (e) => {
                        state.costPrice = e.value ?? '';
                    }
                });
                costPriceNumber.obj.appendTo(costPriceRef.value);
            },
            refresh: () => {
                if (costPriceNumber.obj) {
                    costPriceNumber.obj.value = getCostPriceValue();
                    costPriceNumber.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(costPriceNumber.obj);
                }
            }
        };
        const unitPriceNumber = {
            obj: null,
            create: () => {
                unitPriceNumber.obj = new ej.inputs.NumericTextBox({
                    format: 'n6',
                    placeholder: 'Enter Unit Price',
                    min: 0,
                    step: 0.01,
                    decimals: 6,
                    validateDecimalOnType: false,
                    change: (e) => {
                        state.unitPrice = e.value ?? '';
                    }
                });
                unitPriceNumber.obj.appendTo(unitPriceRef.value);
            },
            refresh: () => {
                if (unitPriceNumber.obj) {
                    unitPriceNumber.obj.value = getUnitPriceValue();
                    unitPriceNumber.obj.dataBind();
                    NumberFormatManager.refreshNumericTextBox(unitPriceNumber.obj);
                }
            }
        };

        Vue.watch(
            () => state.name,
            (newVal, oldVal) => {
                state.errors.name = '';
                nameText.refresh();
            }
        );

        Vue.watch(
            () => state.number,
            (newVal, oldVal) => {
                numberText.refresh();
            }
        );

        Vue.watch(
            () => state.referenceCode,
            (newVal, oldVal) => {
                state.errors.referenceCode = '';
                referenceCodeText.refresh();
            }
        );

        Vue.watch(
            () => state.defaultWarrantyMonths,
            (newVal, oldVal) => {
                state.errors.defaultWarrantyMonths = '';
                if (document.activeElement !== defaultWarrantyMonthsNumber.obj?.element) {
                    defaultWarrantyMonthsNumber.refresh();
                }
            }
        );

        Vue.watch(
            () => state.unitPrice,
            (newVal, oldVal) => {
                state.errors.unitPrice = '';
                if (document.activeElement !== unitPriceNumber.obj?.element) {
                    unitPriceNumber.refresh();
                }
            }
        );

        Vue.watch(
            () => state.costPrice,
            (newVal, oldVal) => {
                state.errors.costPrice = '';
                if (document.activeElement !== costPriceNumber.obj?.element) {
                    costPriceNumber.refresh();
                }
            }
        );

        Vue.watch(
            () => state.physical,
            (newVal) => {
                if (!newVal) {
                    state.serialTrackingMode = 0;
                    state.internalSerialFixedCode = '';
                    state.errors.internalSerialFixedCode = '';
                    if (state.id === '') {
                        state.openingStockQuantity = 0;
                    }
                }
                Vue.nextTick(() => openingStockNumber.refresh());
            }
        );

        Vue.watch(
            () => state.serialTrackingMode,
            (newVal) => {
                state.errors.openingStockQuantity = '';
                if (state.id === '' && Number(newVal) === 2) {
                    state.openingStockQuantity = 0;
                }
                Vue.nextTick(() => openingStockNumber.refresh());
            }
        );

        Vue.watch(
            () => state.openingStockQuantity,
            () => {
                state.errors.openingStockQuantity = '';
                if (document.activeElement !== openingStockNumber.obj?.element) {
                    openingStockNumber.refresh();
                }
            }
        );

        Vue.watch(
            () => state.id,
            () => Vue.nextTick(() => openingStockNumber.refresh())
        );

        Vue.watch(
            () => state.internalSerialFixedCode,
            () => {
                state.errors.internalSerialFixedCode = '';
            }
        );

        Vue.watch(
            () => state.productGroupId,
            (newVal, oldVal) => {
                state.errors.productGroupId = '';
                productGroupListLookup.refresh();
            }
        );

        Vue.watch(
            () => state.defaultWarehouseId,
            (newVal, oldVal) => {
                defaultWarehouseListLookup.refresh();
            }
        );

        Vue.watch(
            () => state.unitMeasureName,
            (newVal, oldVal) => {
                state.errors.unitMeasureName = '';
            }
        );

        const handler = {
            handleInternalSerialFixedCodeInput: function () {
                const normalized = normalizeInternalSerialFixedCode(state.internalSerialFixedCode);
                if (state.internalSerialFixedCode !== normalized) {
                    state.internalSerialFixedCode = normalized;
                }
            },
            quickAddProductGroup: async function () {
                await QuickAddHelper.simpleQuickAdd({
                    title: 'Quick Add Product Group',
                    apiUrl: '/ProductGroup/CreateProductGroup',
                    dropdownObj: productGroupListLookup.obj,
                    refreshLookup: methods.populateProductGroupListLookupData,
                    state: state,
                    stateKey: 'productGroupId',
                    lookupKey: 'productGroupListLookupData'
                });
            },
            quickAddWarehouse: async function () {
                await QuickAddHelper.simpleQuickAdd({
                    title: 'Quick Add Warehouse',
                    apiUrl: '/Warehouse/CreateWarehouse',
                    dropdownObj: defaultWarehouseListLookup.obj,
                    refreshLookup: methods.populateWarehouseListLookupData,
                    state: state,
                    stateKey: 'defaultWarehouseId',
                    lookupKey: 'warehouseListLookupData'
                });
            },
            handleImageUpload: async function (e) {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const response = await services.uploadImage(file);
                    if (response?.data?.content?.imageName) {
                        state.imageUrl = response.data.content.imageName;
                    }
                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'Image Upload Failed',
                        text: error.response?.data ?? 'Could not upload image file.'
                    });
                }
            },
            handleSubmit: async function () {
                try {
                    state.isSubmitting = true;

                    if (!state.deleteMode) snapshotProductEditors();

                    if (!validateForm()) {
                        return;
                    }

                    const response = state.id === ''
                        ? await services.createMainData(state.name, state.referenceCode, getUnitPriceValue(), getCostPriceValue(), state.imageUrl, state.physical, getEffectiveSerialTrackingMode(), getEffectiveInternalSerialFixedCode(), state.defaultWarehouseId, getDefaultWarrantyMonthsValue(), state.description, state.productGroupId, state.unitMeasureName, getOpeningStockPayloadValue(), StorageManager.getUserId())
                        : state.deleteMode
                            ? await services.deleteMainData(state.id, StorageManager.getUserId())
                            : await services.updateMainData(state.id, state.name, state.referenceCode, getUnitPriceValue(), getCostPriceValue(), state.imageUrl, state.physical, getEffectiveSerialTrackingMode(), getEffectiveInternalSerialFixedCode(), state.defaultWarehouseId, getDefaultWarrantyMonthsValue(), state.description, state.productGroupId, state.unitMeasureName, getOpeningStockPayloadValue(), StorageManager.getUserId());

                    if (response.data.code === 200) {
                        await methods.populateMainData();
                        mainGrid.refresh();

                        if (!state.deleteMode) {
                            const responseProduct = response?.data?.content?.data;
                            const savedProduct = state.mainData.find(item => item.id === responseProduct?.id) ?? responseProduct ?? {};
                            state.mainTitle = 'Edit Product';
                            state.id = savedProduct.id ?? '';
                            state.number = savedProduct.number ?? '';
                            state.referenceCode = savedProduct.referenceCode ?? '';
                            state.name = savedProduct.name ?? '';
                            state.unitPrice = savedProduct.unitPrice ?? '';
                            state.costPrice = savedProduct.costPrice ?? '';
                            state.imageUrl = savedProduct.imageUrl ?? '';
                            state.defaultWarehouseId = savedProduct.defaultWarehouseId ?? null;
                            state.defaultWarrantyMonths = savedProduct.defaultWarrantyMonths ?? '';
                            state.description = savedProduct.description ?? '';
                            state.productGroupId = savedProduct.productGroupId ?? '';
                            state.unitMeasureName = savedProduct.unitMeasureName ?? '';
                            state.physical = savedProduct.physical ?? true;
                            state.serialTrackingMode = savedProduct.serialTrackingMode ?? 0;
                            state.originalSerialTrackingMode = state.serialTrackingMode;
                            state.internalSerialFixedCode = savedProduct.internalSerialFixedCode ?? (state.physical ? 'CAM' : '');
                            state.openingStockQuantity = savedProduct.openingStockQuantity ?? state.openingStockQuantity ?? 0;
                            state.openingStockWarehouseId = savedProduct.openingStockWarehouseId ?? null;
                            state.openingStockWarehouseName = savedProduct.openingStockWarehouseName ?? '';
                            state.hasOpeningStockHistory = savedProduct.hasOpeningStockHistory ?? false;
                            state.openingStockDirty = false;

                            Swal.fire({
                                icon: 'success',
                                title: state.deleteMode ? 'Delete Successful' : 'Save Successful',
                                text: 'Form will be closed...',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            setTimeout(() => {
                                mainModal.obj.hide();
                            }, 2000);

                        } else {
                            Swal.fire({
                                icon: 'success',
                                title: 'Delete Successful',
                                text: 'Form will be closed...',
                                timer: 2000,
                                showConfirmButton: false
                            });
                            setTimeout(() => {
                                mainModal.obj.hide();
                                resetFormState();
                            }, 2000);
                        }

                    } else {
                        Swal.fire({
                            icon: 'error',
                            title: state.deleteMode ? 'Delete Failed' : 'Save Failed',
                            text: response.data.message ?? 'Please check your data.',
                            confirmButtonText: 'Try Again'
                        });
                    }

                } catch (error) {
                    Swal.fire({
                        icon: 'error',
                        title: 'An Error Occurred',
                        text: error.response?.data?.message ?? 'Please try again.',
                        confirmButtonText: 'OK'
                    });
                } finally {
                    state.isSubmitting = false;
                }
            },
        };

        Vue.onMounted(async () => {
            try {
                await SecurityManager.authorizePage(['Products']);
                await SecurityManager.validateToken();

                await methods.populateMainData();
                await mainGrid.create(state.mainData);
                await methods.populateProductGroupListLookupData();
                productGroupListLookup.create();
                await methods.populateWarehouseListLookupData();
                defaultWarehouseListLookup.create();

                nameText.create();
                numberText.create();
                referenceCodeText.create();
                costPriceNumber.create();
                unitPriceNumber.create();
                defaultWarrantyMonthsNumber.create();
                openingStockNumber.create();

                mainModal.create();
                mainModalRef.value?.addEventListener('hidden.bs.modal', resetFormState);

            } catch (e) {
                console.error('page init error:', e);
            } finally {

            }
        });

        Vue.onUnmounted(() => {
            mainModalRef.value?.removeEventListener('hidden.bs.modal', resetFormState);
        });

        const mainGrid = {
            obj: null,
            create: async (dataSource) => {
                mainGrid.obj = new ej.grids.Grid({
                    height: '240px',
                    dataSource: dataSource,
                    allowFiltering: true,
                    allowSorting: true,
                    allowSelection: true,
                    allowGrouping: true,
                    groupSettings: {
                        columns: ['productGroupName']
                    },
                    allowTextWrap: true,
                    allowResizing: true,
                    allowPaging: true,
                    allowExcelExport: true,
                    filterSettings: { type: 'CheckBox' },
                    sortSettings: { columns: [{ field: 'createdAtUtc', direction: 'Descending' }] },
                    pageSettings: { currentPage: 1, pageSize: 50, pageSizes: ["10", "20", "50", "100", "200", "All"] },
                    selectionSettings: { persistSelection: true, type: 'Multiple', checkboxOnly: true },
                    autoFit: true,
                    showColumnMenu: true,
                    gridLines: 'Horizontal',
                    columns: [
                        { type: 'checkbox', width: 60 },
                        {
                            field: 'id', isPrimaryKey: true, headerText: 'Id', visible: false
                        },
                        {
                            field: 'imageUrl',
                            headerText: 'Image',
                            width: 100,
                            minWidth: 100,
                            textAlign: 'Center',
                            allowFiltering: false,
                            allowSorting: false,
                            disableHtmlEncode: false,
                            valueAccessor: (field, data) => {
                                if (!data[field]) {
                                    return '<span class="d-inline-flex align-items-center justify-content-center rounded bg-light text-muted" style="width: 38px; height: 38px;" title="No product image"><i class="far fa-image"></i></span>';
                                }
                                const url = getImageUrl(data[field]);
                                return `<img src="${url}" alt="Product Image" class="rounded" style="width: 38px; height: 38px; object-fit: cover;" />`;
                            }
                        },
                        { field: 'number', headerText: 'Number', width: 180, minWidth: 180 },
                        { field: 'referenceCode', headerText: 'Ref Code', width: 150, minWidth: 150 },
                        { field: 'name', headerText: 'Name', width: 200, minWidth: 200 },
                        { field: 'productGroupName', headerText: 'Product Group', width: 150, minWidth: 150 },
                        { field: 'costPrice', headerText: 'Cost Price', width: 160, minWidth: 160, format: 'N0' },
                        { field: 'unitPrice', headerText: 'Sales Price', width: 170, minWidth: 170, format: 'N0' },
                        { field: 'unitMeasureName', headerText: 'Unit Measure', width: 150, minWidth: 150 },
                        { field: 'defaultWarehouseName', headerText: 'Warehouse', width: 180, minWidth: 180 },
                        { field: 'defaultWarrantyMonths', headerText: 'Warranty Months', width: 210, minWidth: 210, type: 'number', format: 'N0' },
                        { field: 'physical', headerText: 'Physical Product', width: 180, minWidth: 180, textAlign: 'Center', type: 'boolean', displayAsCheckBox: true },
                        { field: 'internalSerialFixedCode', headerText: 'Device Code', width: 150, minWidth: 150 },
                        { field: 'openingStockQuantity', headerText: 'Opening Stock', width: 160, minWidth: 160, type: 'number', format: 'N2' },
                        { field: 'openingStockWarehouseName', headerText: 'Opening Stock Warehouse', width: 220, minWidth: 220 },
                        { field: 'createdAtUtc', headerText: 'Created At', width: 150, format: 'yyyy-MM-dd HH:mm' }
                    ],
                    toolbar: [
                        'ExcelExport', 'Search',
                        { type: 'Separator' },
                        { text: 'Add', tooltipText: 'Add', prefixIcon: 'e-add', id: 'AddCustom' },
                        { text: 'Edit', tooltipText: 'Edit', prefixIcon: 'e-edit', id: 'EditCustom' },
                        { text: 'Delete', tooltipText: 'Delete', prefixIcon: 'e-delete', id: 'DeleteCustom' },
                        { type: 'Separator' },
                    ],
                    beforeDataBound: () => { },
                    dataBound: function () {
                        mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        mainGrid.obj.autoFitColumns(['number', 'referenceCode', 'name', 'productGroupName', 'costPrice', 'unitPrice', 'unitMeasureName', 'defaultWarehouseName', 'defaultWarrantyMonths', 'physical', 'internalSerialFixedCode', 'openingStockQuantity', 'openingStockWarehouseName', 'createdAtUtc']);
                    },
                    excelExportComplete: () => { },
                    rowSelected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        }
                    },
                    rowDeselected: () => {
                        if (mainGrid.obj.getSelectedRecords().length == 1) {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], true);
                        } else {
                            mainGrid.obj.toolbarModule.enableItems(['EditCustom', 'DeleteCustom'], false);
                        }
                    },
                    rowSelecting: () => {
                        if (mainGrid.obj.getSelectedRecords().length) {
                            mainGrid.obj.clearSelection();
                        }
                    },
                    toolbarClick: async (args) => {
                        if (args.item.id === 'MainGrid_excelexport') {
                            mainGrid.obj.excelExport();
                        }

                        if (args.item.id === 'AddCustom') {
                            state.deleteMode = false;
                            state.mainTitle = 'Add Product';
                            resetFormState();
                            mainModal.obj.show();
                        }

                        if (args.item.id === 'EditCustom') {
                            state.deleteMode = false;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Edit Product';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.referenceCode = selectedRecord.referenceCode ?? '';
                                state.name = selectedRecord.name ?? '';
                                state.unitPrice = selectedRecord.unitPrice ?? '';
                                state.costPrice = selectedRecord.costPrice ?? '';
                                state.imageUrl = selectedRecord.imageUrl ?? '';
                                state.defaultWarehouseId = selectedRecord.defaultWarehouseId ?? null;
                                state.defaultWarrantyMonths = selectedRecord.defaultWarrantyMonths ?? '';
                                state.description = selectedRecord.description ?? '';
                                state.productGroupId = selectedRecord.productGroupId ?? '';
                                state.unitMeasureName = selectedRecord.unitMeasureName ?? '';
                                state.physical = selectedRecord.physical ?? true;
                                state.serialTrackingMode = selectedRecord.serialTrackingMode ?? 0;
                                state.originalSerialTrackingMode = state.serialTrackingMode;
                                state.internalSerialFixedCode = selectedRecord.internalSerialFixedCode ?? (state.physical ? 'CAM' : '');
                                state.openingStockQuantity = selectedRecord.openingStockQuantity ?? 0;
                                state.openingStockWarehouseId = selectedRecord.openingStockWarehouseId ?? null;
                                state.openingStockWarehouseName = selectedRecord.openingStockWarehouseName ?? '';
                                state.hasOpeningStockHistory = selectedRecord.hasOpeningStockHistory ?? false;
                                state.openingStockDirty = false;
                                mainModal.obj.show();
                            }
                        }

                        if (args.item.id === 'DeleteCustom') {
                            const selected = mainGrid.obj.getSelectedRecords();
                            if (!selected.length) return;
                            const result = await Swal.fire({
                                icon: 'warning',
                                title: 'Confirm Delete',
                                text: 'Are you sure you want to delete the selected products?',
                                showCancelButton: true,
                                confirmButtonText: 'Delete',
                                cancelButtonText: 'Cancel',
                                heightAuto: false
                            });
                            if (!result.isConfirmed) return;
                            for (const record of selected) {
                                await services.deleteMainData(record.id, StorageManager.getUserId());
                            }
                            await methods.populateMainData();
                            mainGrid.refresh();
                            Swal.fire({
                                icon: 'success',
                                title: 'Delete Successful',
                                text: 'Selected products were deleted.',
                                heightAuto: false
                            });
                            return;
                            state.deleteMode = true;
                            if (mainGrid.obj.getSelectedRecords().length) {
                                const selectedRecord = mainGrid.obj.getSelectedRecords()[0];
                                state.mainTitle = 'Delete Product?';
                                state.id = selectedRecord.id ?? '';
                                state.number = selectedRecord.number ?? '';
                                state.referenceCode = selectedRecord.referenceCode ?? '';
                                state.name = selectedRecord.name ?? '';
                                state.unitPrice = selectedRecord.unitPrice ?? '';
                                state.costPrice = selectedRecord.costPrice ?? '';
                                state.imageUrl = selectedRecord.imageUrl ?? '';
                                state.defaultWarehouseId = selectedRecord.defaultWarehouseId ?? null;
                                state.defaultWarrantyMonths = selectedRecord.defaultWarrantyMonths ?? '';
                                state.description = selectedRecord.description ?? '';
                                state.productGroupId = selectedRecord.productGroupId ?? '';
                                state.unitMeasureName = selectedRecord.unitMeasureName ?? '';
                                state.physical = selectedRecord.physical ?? true;
                                state.serialTrackingMode = selectedRecord.serialTrackingMode ?? 0;
                                state.originalSerialTrackingMode = state.serialTrackingMode;
                                state.internalSerialFixedCode = selectedRecord.internalSerialFixedCode ?? (state.physical ? 'CAM' : '');
                                state.openingStockQuantity = selectedRecord.openingStockQuantity ?? 0;
                                state.openingStockWarehouseId = selectedRecord.openingStockWarehouseId ?? null;
                                state.openingStockWarehouseName = selectedRecord.openingStockWarehouseName ?? '';
                                state.hasOpeningStockHistory = selectedRecord.hasOpeningStockHistory ?? false;
                                state.openingStockDirty = false;
                                mainModal.obj.show();
                            }
                        }
                    }
                });
                mainGrid.obj.appendTo(mainGridRef.value);
            },
            refresh: () => {
                mainGrid.obj.setProperties({ dataSource: state.mainData });
            }
        };

        const mainModal = {
            obj: null,
            create: () => {
                mainModal.obj = new bootstrap.Modal(mainModalRef.value, {
                    backdrop: 'static',
                    keyboard: false
                });
            }
        };

        return {
            mainGridRef,
            mainModalRef,
            productGroupIdRef,
            defaultWarehouseIdRef,
            nameRef,
            numberRef,
            referenceCodeRef,
            unitPriceRef,
            costPriceRef,
            imageFileRef,
            defaultWarrantyMonthsRef,
            openingStockQuantityRef,
            getInternalSerialPreview,
            getImageUrl,
            state,
            handler,
        };
    }
};

Vue.createApp(App).mount('#app');


