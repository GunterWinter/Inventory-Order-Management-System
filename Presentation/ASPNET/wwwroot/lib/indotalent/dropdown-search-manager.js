(function (root, factory) {
    'use strict';

    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.DropdownSearchManager = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const patchedComponents = new WeakSet();
    const initializedRoots = new WeakSet();
    const trackedInstances = new Set();
    const nativeInstances = new WeakMap();
    const nativeRecords = new Set();
    const NATIVE_SELECT_SELECTOR = 'select[data-searchable-dropdown]';
    let observer = null;
    let refreshQueued = false;

    const normalizeText = value => {
        const text = String(value ?? '');
        const decomposed = typeof text.normalize === 'function' ? text.normalize('NFD') : text;
        return decomposed
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'D')
            .toLowerCase()
            .trim();
    };

    const resolveSource = source => {
        const value = typeof source === 'function' ? source() : source;
        return Array.isArray(value) ? value : [];
    };

    const resolveItemText = (item, textField) => {
        if (typeof textField === 'function') return textField(item);
        if (item === null || item === undefined) return '';
        if (typeof item !== 'object') return item;
        return item[textField || 'text'];
    };

    const filterItems = (items, searchText, textField = 'text') => {
        const source = resolveSource(items);
        const normalizedSearchText = normalizeText(searchText);
        if (!normalizedSearchText) return source;

        return source.filter(item => normalizeText(resolveItemText(item, textField)).includes(normalizedSearchText));
    };

    const createFilteringHandler = (source, options = {}) => {
        const handler = event => {
            event.preventDefaultAction = true;
            event.updateData(filterItems(source, event.text, options.textField || 'name'));
        };
        handler.__dropdownSearchManagerHandler = true;
        return handler;
    };

    const getLocale = context => {
        const locale = context?.UiLocalization?.getLocale?.()
            ?? context?.document?.documentElement?.lang
            ?? 'vi';
        return String(locale).toLowerCase().startsWith('en') ? 'en' : 'vi';
    };

    const getSearchPlaceholder = context => getLocale(context) === 'en' ? 'Search' : 'T\u00ecm ki\u1ebfm';

    const getTextField = instance => instance?.fields?.text || 'text';

    const wrapExistingFilteringHandler = instance => {
        const existingHandler = instance.filtering;
        if (typeof existingHandler !== 'function'
            || existingHandler.__dropdownSearchManagerHandler
            || existingHandler.__dropdownSearchManagerWrapped) {
            return;
        }

        const wrappedHandler = function (event) {
            const originalUpdateData = event.updateData?.bind(event);
            if (typeof originalUpdateData !== 'function') {
                return existingHandler.call(this, event);
            }

            let updateCalled = false;
            event.updateData = (source, query, fields) => {
                updateCalled = true;
                if (Array.isArray(source)) {
                    event.preventDefaultAction = true;
                    return originalUpdateData(filterItems(source, event.text, getTextField(instance)));
                }
                return originalUpdateData(source, query, fields);
            };

            try {
                const result = existingHandler.call(this, event);
                if (!updateCalled && Array.isArray(instance.dataSource)) {
                    event.preventDefaultAction = true;
                    originalUpdateData(filterItems(instance.dataSource, event.text, getTextField(instance)));
                }
                return result;
            } finally {
                event.updateData = originalUpdateData;
            }
        };
        wrappedHandler.__dropdownSearchManagerWrapped = true;
        wrappedHandler.__dropdownSearchManagerOriginal = existingHandler;
        instance.filtering = wrappedHandler;
    };

    const addDefaultFilteringHandler = instance => {
        if (typeof instance.filtering === 'function') return;

        const handler = event => {
            const source = Array.isArray(instance.dataSource) ? instance.dataSource : [];
            event.preventDefaultAction = true;
            event.updateData(filterItems(source, event.text, getTextField(instance)));
        };
        handler.__dropdownSearchManagerHandler = true;
        instance.filtering = handler;
    };

    const configureInstance = (instance, context = root) => {
        if (!instance) return instance;

        instance.allowFiltering = true;
        instance.filterType = 'Contains';
        instance.ignoreAccent = true;
        instance.filterBarPlaceholder = getSearchPlaceholder(context);
        wrapExistingFilteringHandler(instance);
        addDefaultFilteringHandler(instance);
        trackedInstances.add(instance);
        return instance;
    };

    const patchComponent = (component, context) => {
        if (!component?.prototype || patchedComponents.has(component)) return;

        const originalAppendTo = component.prototype.appendTo;
        if (typeof originalAppendTo === 'function') {
            component.prototype.appendTo = function (selector) {
                configureInstance(this, context);
                return originalAppendTo.call(this, selector);
            };
        }

        const originalDestroy = component.prototype.destroy;
        if (typeof originalDestroy === 'function') {
            component.prototype.destroy = function () {
                trackedInstances.delete(this);
                return originalDestroy.call(this);
            };
        }

        patchedComponents.add(component);
    };

    const refreshLocalizedPlaceholders = (context = root) => {
        const placeholder = getSearchPlaceholder(context);
        trackedInstances.forEach(instance => {
            if (!instance || instance.isDestroyed) {
                trackedInstances.delete(instance);
                return;
            }
            instance.allowFiltering = true;
            instance.filterBarPlaceholder = placeholder;
            instance.dataBind?.();
        });
    };

    const optionDataSource = select => Array.from(select.options ?? []).map(option => ({
        value: option.value,
        text: option.textContent ?? option.text ?? '',
        disabled: !!option.disabled
    }));

    const dispatchNativeChange = (select, context) => {
        const EventConstructor = context?.Event ?? root?.Event;
        if (typeof EventConstructor === 'function') {
            select.dispatchEvent(new EventConstructor('change', { bubbles: true }));
        }
    };

    const refreshNativeSelect = select => {
        const record = nativeInstances.get(select);
        if (!record) return enhanceNativeSelect(select, select?.ownerDocument?.defaultView ?? root);

        record.syncing = true;
        try {
            record.instance.dataSource = optionDataSource(select);
            record.instance.value = select.value;
            record.instance.enabled = !select.disabled;
            configureInstance(record.instance, record.context);
            record.instance.dataBind?.();
        } finally {
            record.syncing = false;
        }
        return record.instance;
    };

    const enhanceNativeSelect = (select, context = root) => {
        if (!select || select.multiple || select.dataset?.dropdownSearch === 'off') return null;
        if (nativeInstances.has(select)) return nativeInstances.get(select).instance;
        if (select.ej2_instances?.length) return select.ej2_instances[0];

        const DropDownList = context?.ej?.dropdowns?.DropDownList;
        if (typeof DropDownList !== 'function') return null;

        const document = select.ownerDocument ?? context?.document;
        const host = document?.createElement?.('input') ?? select;
        const usesSeparateHost = host !== select;
        if (usesSeparateHost) {
            host.type = 'text';
            host.setAttribute('data-dropdown-search-host', '');
            select.insertAdjacentElement?.('afterend', host);
        }

        const record = {
            select,
            context,
            host,
            instance: null,
            syncing: false,
            nativeChangeHandler: null,
            originalDisplay: select.style?.display ?? ''
        };
        const instance = new DropDownList({
            dataSource: optionDataSource(select),
            fields: { value: 'value', text: 'text', disabled: 'disabled' },
            value: select.value,
            enabled: !select.disabled,
            width: '100%',
            cssClass: 'app-searchable-native-dropdown',
            allowFiltering: true,
            filtering: createFilteringHandler(() => optionDataSource(select), { textField: 'text' }),
            change: args => {
                if (record.syncing || args?.isInteracted === false) return;
                const nextValue = args?.value === null || args?.value === undefined ? '' : String(args.value);
                record.syncing = true;
                select.value = nextValue;
                record.syncing = false;
                dispatchNativeChange(select, context);
            }
        });

        record.instance = instance;
        record.nativeChangeHandler = () => {
            if (record.syncing) return;
            record.syncing = true;
            try {
                instance.value = select.value;
                instance.enabled = !select.disabled;
                instance.dataBind?.();
            } finally {
                record.syncing = false;
            }
        };
        select.addEventListener?.('change', record.nativeChangeHandler);
        nativeInstances.set(select, record);
        nativeRecords.add(record);
        if (usesSeparateHost && select.style) select.style.display = 'none';
        record.syncing = true;
        try {
            instance.appendTo(host);
            if (usesSeparateHost) select.ej2_instances = [instance];
        } finally {
            record.syncing = false;
        }
        return instance;
    };

    const destroyNativeSelect = select => {
        const record = nativeInstances.get(select);
        if (!record) return;
        select.removeEventListener?.('change', record.nativeChangeHandler);
        nativeInstances.delete(select);
        nativeRecords.delete(record);
        record.instance?.destroy?.();
        if (record.host !== select) {
            record.host?.remove?.();
            if (select.style) select.style.display = record.originalDisplay;
            if (select.ej2_instances?.[0] === record.instance) delete select.ej2_instances;
        }
    };

    const collectSelects = node => {
        if (!node || node.nodeType !== 1) return [];
        const selects = [];
        if (node.matches?.(NATIVE_SELECT_SELECTOR)) selects.push(node);
        if (typeof node.querySelectorAll === 'function') selects.push(...node.querySelectorAll(NATIVE_SELECT_SELECTOR));
        return selects;
    };

    const refresh = (scope, context = root) => {
        const target = scope ?? context?.document;
        if (!target) return;
        const selects = target.matches?.(NATIVE_SELECT_SELECTOR)
            ? [target]
            : Array.from(target.querySelectorAll?.(NATIVE_SELECT_SELECTOR) ?? []);
        selects.forEach(select => nativeInstances.has(select)
            ? refreshNativeSelect(select)
            : enhanceNativeSelect(select, context));
    };

    const queueRefresh = (context, selects) => {
        selects.forEach(select => select.__dropdownSearchNeedsRefresh = true);
        if (refreshQueued) return;
        refreshQueued = true;
        const schedule = context?.queueMicrotask ?? (callback => Promise.resolve().then(callback));
        schedule(() => {
            refreshQueued = false;
            nativeRecords.forEach(record => {
                if (!record.select.__dropdownSearchNeedsRefresh) return;
                delete record.select.__dropdownSearchNeedsRefresh;
                if (record.select.isConnected !== false) refreshNativeSelect(record.select);
            });
        });
    };

    const observeNativeSelects = context => {
        const document = context?.document;
        const MutationObserverConstructor = context?.MutationObserver;
        if (!document || typeof MutationObserverConstructor !== 'function' || observer) return;

        observer = new MutationObserverConstructor(mutations => {
            const selectsToRefresh = new Set();
            mutations.forEach(mutation => {
                if (mutation.type === 'attributes') {
                    const select = mutation.target?.matches?.(NATIVE_SELECT_SELECTOR)
                        ? mutation.target
                        : mutation.target?.closest?.(NATIVE_SELECT_SELECTOR);
                    if (select) selectsToRefresh.add(select);
                    return;
                }

                mutation.addedNodes?.forEach(node => {
                    collectSelects(node).forEach(select => enhanceNativeSelect(select, context));
                });
                mutation.removedNodes?.forEach(node => {
                    collectSelects(node).forEach(select => {
                        if (select.isConnected === false) destroyNativeSelect(select);
                    });
                });

            });
            if (selectsToRefresh.size) queueRefresh(context, selectsToRefresh);
        });

        observer.observe(document.documentElement ?? document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['disabled']
        });
    };

    const initialize = (context = root) => {
        if (!context || initializedRoots.has(context)) return;
        initializedRoots.add(context);
        patchComponent(context.ej?.dropdowns?.DropDownList, context);
        patchComponent(context.ej?.dropdowns?.ComboBox, context);
        refresh(context.document, context);
        observeNativeSelects(context);
        context.addEventListener?.('ui:languagechanged', () => refreshLocalizedPlaceholders(context));
    };

    if (root?.document) {
        initialize(root);
        if (root.document.readyState === 'loading') {
            root.document.addEventListener('DOMContentLoaded', () => {
                initialize(root);
                refresh(root.document, root);
            }, { once: true });
        }
    }

    return {
        normalizeText,
        filterItems,
        createFilteringHandler,
        configureInstance,
        enhanceNativeSelect,
        refreshNativeSelect,
        destroyNativeSelect,
        refresh,
        refreshLocalizedPlaceholders,
        initialize
    };
});
