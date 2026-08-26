(function (window, document) {
    'use strict';

    // Shared interaction conventions for Syncfusion grids and document forms.
    const pending = new WeakMap();
    const configuredSelections = new WeakSet();
    const deferredBatchValidation = new WeakSet();
    const gridDiscoveryAttempts = new WeakMap();
    const modalStack = [];
    const MODAL_POPUP_Z_INDEX = 2000;
    const isGrid = value => value && typeof value.endEdit === 'function';
    const requestTypeOf = args => String(args?.requestType ?? '').toLowerCase();
    const batchChangeCount = changes => (changes?.addedRecords?.length || 0)
        + (changes?.changedRecords?.length || 0)
        + (changes?.deletedRecords?.length || 0);
    const isTransientRecord = record => {
        const id = record?.id;
        return id === null || id === undefined || id === '' || String(id).startsWith('new-');
    };
    const normalizeBatchChanges = changes => {
        const deletedRecords = [...(changes?.deletedRecords || [])];
        const transientDeletedIds = new Set(deletedRecords
            .filter(isTransientRecord)
            .map(record => record?.id)
            .filter(id => id !== null && id !== undefined && id !== '')
            .map(String));
        const deletedObjects = new Set(deletedRecords.filter(isTransientRecord));
        const wasDiscarded = record => deletedObjects.has(record)
            || (record?.id !== null && record?.id !== undefined && record?.id !== ''
                && transientDeletedIds.has(String(record.id)));

        return {
            addedRecords: [...(changes?.addedRecords || [])].filter(record => !wasDiscarded(record)),
            changedRecords: [...(changes?.changedRecords || [])].filter(record => !wasDiscarded(record)),
            deletedRecords: deletedRecords.filter(record => !isTransientRecord(record))
        };
    };
    const discardTransientRecords = (grid, records) => {
        const changes = grid.getBatchChanges?.() ?? {};
        const addedRecords = changes.addedRecords ?? [];
        const rowObjects = grid.getRowsObject?.() ?? [];
        const innerEdit = grid.editModule?.editModule;
        const targets = records.map(record => {
            const recordId = record?.id == null ? null : String(record.id);
            const rowIndex = rowObjects.findIndex(row => row?.data === record
                || (recordId !== null && String(row?.data?.id) === recordId));
            return { record, recordId, rowElement: rowIndex >= 0 ? grid.getRowByIndex?.(rowIndex) : null };
        });

        targets.forEach(({ record, recordId, rowElement }) => {
            const addedIndex = addedRecords.findIndex(item => item === record
                || (recordId !== null && String(item?.id) === recordId));
            if (addedIndex >= 0) addedRecords.splice(addedIndex, 1);

            const dataSource = Array.isArray(grid.dataSource) ? grid.dataSource : null;
            const dataIndex = dataSource?.findIndex?.(item => item === record
                || (recordId !== null && String(item?.id) === recordId)) ?? -1;
            if (dataIndex >= 0 && isTransientRecord(dataSource[dataIndex])) dataSource.splice(dataIndex, 1);

            const uid = rowElement?.getAttribute?.('data-uid');
            if (uid) innerEdit?.removeRowObjectFromUID?.(uid);
            rowElement?.remove?.();
        });

        innerEdit?.refreshRowIdx?.();
        grid.refreshHeader?.();
    };
    const pendingChanges = grid => {
        try {
            const changes = grid?.getBatchChanges?.() || {};
            return batchChangeCount(changes) > 0;
        } catch (error) {
            // Syncfusion throws while a Batch grid is mounted inside a hidden form
            // before its content rows have been rendered. Such a grid cannot contain
            // user edits yet, so it is safe and necessary to treat it as clean.
            if (!grid?.isEdit) return false;
            throw error;
        }
    };

    function displayValue(column, field, value, row) {
        if (typeof column?.valueAccessor === 'function') {
            return column.valueAccessor(field, row, column);
        }

        if (column?.foreignKeyField && column?.foreignKeyValue && Array.isArray(column.dataSource)) {
            return column.dataSource.find(item => item?.[column.foreignKeyField] === value)?.[column.foreignKeyValue] ?? value;
        }

        return value;
    }

    function syncBatchRowValues(grid, {
        rowData,
        editorElement,
        rowIndex: stableRowIndex,
        rowUid,
        values,
        formatters = {}
    } = {}) {
        if (!grid || !rowData || !values) return -1;

        const normalizedId = value => value === null || value === undefined || value === ''
            ? null
            : String(value);
        const targetId = normalizedId(rowData.id);
        const renderedRows = grid.getRows?.() ?? [];
        const editorRow = editorElement?.closest?.('tr') ?? null;
        let rowIndex = editorRow ? renderedRows.indexOf(editorRow) : -1;

        if (rowIndex < 0 && rowUid) {
            rowIndex = renderedRows.findIndex(row => row?.getAttribute?.('data-uid') === rowUid);
        }
        if (rowIndex < 0 && Number.isInteger(stableRowIndex)
            && stableRowIndex >= 0 && stableRowIndex < renderedRows.length) {
            rowIndex = stableRowIndex;
        }

        if (rowIndex < 0 && targetId && typeof grid.getRowIndexByPrimaryKey === 'function') {
            rowIndex = grid.getRowIndexByPrimaryKey(rowData.id);
        }

        const rowObjects = grid.getRowsObject?.() ?? [];
        if (rowIndex == null || rowIndex < 0) {
            rowIndex = rowObjects.findIndex(item => item?.data === rowData
                || (targetId && normalizedId(item?.data?.id) === targetId));
        }
        if (rowIndex == null || rowIndex < 0) return -1;

        const actualRow = rowObjects[rowIndex]?.data;
        let changes = grid.getBatchChanges?.() ?? {};
        let addedRecords = changes.addedRecords ?? [];
        let changedRecords = changes.changedRecords ?? [];
        let matchedBatchRecords = [...addedRecords, ...changedRecords]
            .filter(item => item === rowData
                || item === actualRow
                || (targetId && normalizedId(item?.id) === targetId));

        // Applying a custom modal editor does not always make Syncfusion create a
        // changed record until the cell later blurs. Register an existing row now
        // so an immediate Update/Main Save persists the values just applied.
        const editorIsMounted = Boolean(editorElement?.closest?.('.e-editedbatchcell'));
        const editorId = String(editorElement?.id ?? '');
        const gridId = String(grid.element?.id ?? '');
        const activeEditorField = editorId.startsWith(gridId) ? editorId.slice(gridId.length) : null;
        const deferDropdownValue = editorIsMounted
            && Boolean(activeEditorField)
            && Object.prototype.hasOwnProperty.call(values, activeEditorField)
            && Boolean(editorElement?.closest?.('.e-dropdownlist'));
        const immediateValues = deferDropdownValue
            ? Object.fromEntries(Object.entries(values).filter(([field]) => field !== activeEditorField))
            : values;
        if (matchedBatchRecords.length === 0 && targetId && !editorIsMounted && typeof grid.updateCell === 'function') {
            const valueChanged = (current, next) => {
                if (Array.isArray(current) || Array.isArray(next)) {
                    return JSON.stringify(current ?? []) !== JSON.stringify(next ?? []);
                }
                return current !== next;
            };
            const marker = Object.entries(values).find(([field, value]) => {
                const column = grid.getColumnByField?.(field);
                return column && column.allowEditing !== false
                    && !column.isPrimaryKey
                    && valueChanged(actualRow?.[field], value);
            });
            if (marker) {
                try {
                    grid.updateCell(rowIndex, marker[0], marker[1]);
                } catch (error) {
                    // The explicit row/added-record synchronization below remains
                    // authoritative if Syncfusion rejects a rendered cell refresh.
                }
                changes = grid.getBatchChanges?.() ?? changes;
                addedRecords = changes.addedRecords ?? addedRecords;
                changedRecords = changes.changedRecords ?? changedRecords;
                matchedBatchRecords = [...addedRecords, ...changedRecords]
                    .filter(item => item === rowData
                        || item === actualRow
                        || (targetId && normalizedId(item?.id) === targetId));
            }
        }

        const editBatchChanges = grid.editModule?.batchChanges;
        if (matchedBatchRecords.length === 0 && targetId
            && Array.isArray(editBatchChanges?.changedRecords)) {
            const changedRecord = { ...(actualRow ?? rowData), ...immediateValues };
            editBatchChanges.changedRecords.push(changedRecord);
            matchedBatchRecords.push(changedRecord);
        }

        Object.assign(rowData, immediateValues);
        if (actualRow && actualRow !== rowData) Object.assign(actualRow, immediateValues);

        // A newly inserted Syncfusion batch row may expose three distinct objects
        // (editor rowData, rowsObject data and addedRecords data) before it has a key.
        // In that case, use the ordinal of the keyless rendered row to locate the
        // corresponding added record instead of relying on object identity.
        if (matchedBatchRecords.length === 0 && !targetId) {
            const keylessRowOrdinal = rowObjects
                .slice(0, rowIndex + 1)
                .filter(item => !normalizedId(item?.data?.id))
                .length - 1;
            const keylessAddedRecords = addedRecords.filter(item => !normalizedId(item?.id));
            const addedRecord = keylessAddedRecords[keylessRowOrdinal];
            if (addedRecord) matchedBatchRecords.push(addedRecord);
        }

        matchedBatchRecords.forEach(item => Object.assign(item, immediateValues));

        Object.entries(values).forEach(([field, value]) => {
            const column = grid.getColumnByField?.(field);
            if (!column) return;
            const columnIndex = grid.getColumnIndexByField?.(field);
            if (columnIndex == null || columnIndex < 0) return;

            const cell = grid.getCellFromIndex?.(rowIndex, columnIndex)
                ?? renderedRows[rowIndex]?.querySelector?.(`[data-colindex="${columnIndex}"]`)
                ?? null;
            if (!cell || cell === editorElement || cell.contains?.(editorElement)) return;
            if (cell.querySelector?.('input, select, textarea, button')) return;

            const formatter = formatters[field];
            const renderedValue = typeof formatter === 'function'
                ? formatter(value, actualRow ?? rowData, field)
                : displayValue(column, field, value, actualRow ?? rowData);
            cell.textContent = renderedValue ?? '';
        });

        const updateId = `${grid.element?.id || 'SecondaryGrid'}_update`;
        grid.toolbarModule?.enableItems?.([updateId], true);
        const updateButton = document.getElementById?.(updateId);
        const updateToolbarItem = updateButton?.closest?.('.e-toolbar-item');
        updateToolbarItem?.classList?.remove?.('e-overlay');
        updateToolbarItem?.setAttribute?.('aria-disabled', 'false');
        if (updateButton) {
            updateButton.disabled = false;
            updateButton.setAttribute('aria-disabled', 'false');
        }

        // Let the editor's change callback finish before committing the active cell.
        // This registers the row in changedRecords without updateCell() tearing down
        // the dropdown/button DOM underneath Syncfusion's own saveCell bookkeeping.
        if (editorIsMounted) {
            window.setTimeout(() => {
                if (grid.isEdit && editorElement?.isConnected) {
                    grid.editModule?.editModule?.saveCell?.();
                }
                Object.assign(rowData, values);
                if (actualRow && actualRow !== rowData) Object.assign(actualRow, values);
                const committedChanges = grid.getBatchChanges?.() ?? {};
                [...(committedChanges.addedRecords ?? []), ...(committedChanges.changedRecords ?? [])]
                    .filter(item => item === rowData
                        || item === actualRow
                        || (targetId && normalizedId(item?.id) === targetId))
                    .forEach(item => Object.assign(item, values));
            }, 0);
        }

        return rowIndex;
    }

    function popupHost(selector) {
        if (typeof selector === 'string') return document.querySelector?.(selector) ?? null;
        return selector ?? null;
    }

    function patchPopupComponent(component) {
        if (!component?.prototype || component.prototype.__documentModalPopupPatched) return;

        const originalAppendTo = component.prototype.appendTo;
        if (typeof originalAppendTo !== 'function') return;

        component.prototype.appendTo = function (selector) {
            const host = popupHost(selector);
            if (host?.closest?.('.modal, .swal2-container')) {
                this.zIndex = Math.max(Number(this.zIndex) || 0, MODAL_POPUP_Z_INDEX);
            }
            return originalAppendTo.call(this, selector);
        };
        component.prototype.__documentModalPopupPatched = true;
    }

    function patchModalPopups() {
        [
            window.ej?.calendars?.DatePicker,
            window.ej?.calendars?.DateTimePicker,
            window.ej?.dropdowns?.DropDownList,
            window.ej?.dropdowns?.ComboBox,
            window.ej?.dropdowns?.MultiSelect,
            window.ej?.dropdowns?.AutoComplete
        ].forEach(patchPopupComponent);
    }

    function refreshModalGrids(modal) {
        if (!modal?.querySelectorAll) return;

        window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            modal.querySelectorAll('.e-grid').forEach(element => {
                const grid = element.ej2_instances?.[0];
                if (!grid || grid.isDestroyed) return;
                grid.refresh?.();
            });
        }));
    }

    function track(grid, options = {}) {
        if (!grid) return grid;
        if (pending.has(grid)) {
            const existingState = pending.get(grid);
            existingState.options = Object.assign({}, existingState.options, options);
            return grid;
        }
        const state = {
            dirty: false,
            options,
            batchChanges: null,
            persisting: Promise.resolve(),
            persistError: null,
            validationFailed: false,
            validationFailure: null,
            batchPrepared: false,
            batchStarted: 0,
            batchCompleted: 0
        };
        pending.set(grid, state);
        const originalActionBegin = grid.actionBegin;
        const originalAction = grid.actionComplete;
        const originalBeforeBatchSave = grid.beforeBatchSave;

        const prepareBatch = (args, changes) => {
            if (state.batchPrepared) return true;
            state.validationFailed = false;
            state.validationFailure = null;
            state.batchChanges = normalizeBatchChanges(changes);

            const saves = [
                ...state.batchChanges.addedRecords.map(data => ({ action: 'add', data })),
                ...state.batchChanges.changedRecords.map(data => ({ action: 'edit', data }))
            ];
            if (typeof originalActionBegin === 'function') {
                for (const save of saves) {
                    const validation = { requestType: 'save', action: save.action, data: save.data, rowData: save.data, cancel: false, managedBatch: true };
                    originalActionBegin(validation);
                    if (validation.cancel) {
                        if (args) args.cancel = true;
                        state.validationFailed = true;
                        state.validationFailure = {
                            data: save.data,
                            field: validation.invalidField,
                            feedback: validation.validationFeedback
                        };
                        state.batchChanges = null;
                        state.batchPrepared = false;
                        return false;
                    }
                }
            }
            state.batchPrepared = true;
            state.batchStarted += 1;
            return true;
        };
        state.prepareBatch = prepareBatch;

        grid.beforeBatchSave = args => {
            if (typeof originalBeforeBatchSave === 'function') originalBeforeBatchSave(args);
            if (args?.cancel) return;
            const gridChanges = grid.getBatchChanges?.() || {};
            const changes = batchChangeCount(gridChanges) > 0 ? gridChanges : (args?.batchChanges || gridChanges);
            prepareBatch(args, changes);
        };

        grid.actionBegin = args => {
            if (requestTypeOf(args) !== 'batchsave') {
                if (typeof originalActionBegin === 'function') originalActionBegin(args);
                return;
            }

            const gridChanges = grid.getBatchChanges?.() || {};
            const changes = batchChangeCount(gridChanges) > 0 ? gridChanges : (args.batchChanges || gridChanges);
            prepareBatch(args, changes);
        };

        grid.actionComplete = async args => {
            const requestType = requestTypeOf(args);
            if (['add', 'beginedit', 'save', 'delete', 'batchsave', 'cellsave', 'batchadd', 'batchdelete'].includes(requestType)) {
                state.dirty = requestType !== 'save' || state.dirty;
            }
            if (requestType !== 'batchsave' || typeof originalAction !== 'function') {
                if (typeof originalAction === 'function') await originalAction(args);
                return;
            }

            const changes = state.batchChanges || args.batchChanges || {};
            state.persistError = null;
            state.persisting = (async () => {
                for (const data of changes.deletedRecords || []) {
                    await originalAction({ requestType: 'delete', data: [data], rowData: data, managedBatch: true });
                }
                for (const data of changes.addedRecords || []) {
                    await originalAction({ requestType: 'save', action: 'add', data, rowData: data, managedBatch: true });
                }
                for (const data of changes.changedRecords || []) {
                    await originalAction({ requestType: 'save', action: 'edit', data, rowData: data, managedBatch: true });
                }
                if (typeof state.options.afterPersist === 'function') {
                    await state.options.afterPersist(changes, grid);
                }
            })();
            try {
                await state.persisting;
                state.dirty = false;
            } catch (error) {
                state.persistError = error;
                console.error('Unable to persist batch grid changes.', error);
            } finally {
                state.batchChanges = null;
                state.batchPrepared = false;
                state.batchCompleted = state.batchStarted;
            }
        };
        return grid;
    }

    async function commitActiveCell(grid) {
        if (!grid?.isEdit) return true;
        if (grid.editModule?.formObj?.validate?.() === false) return false;

        // In Syncfusion Batch mode endEdit() is not a reliable active-cell commit.
        // saveCell() first moves the editor value into getBatchChanges(); batchSave()
        // can then raise the batchsave event that persists the row through the page API.
        const batchEditModule = grid.editModule?.editModule ?? grid.editModule;
        if (typeof batchEditModule?.saveCell === 'function') {
            batchEditModule.saveCell();
        } else if (typeof grid.editModule?.saveCell === 'function') {
            grid.editModule.saveCell();
        } else {
            grid.endEdit?.();
        }

        const deadline = Date.now() + 1500;
        while (grid.isEdit && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        return !grid.isEdit;
    }

    async function restoreInvalidBatchEditor(grid, failure) {
        if (!failure?.field || grid?.isDestroyed) return;
        if (failure.feedback) await Promise.resolve(failure.feedback);

        const id = failure.data?.id;
        let rowIndex = id == null ? -1 : (grid.getRowIndexByPrimaryKey?.(id) ?? -1);
        if (rowIndex < 0) {
            rowIndex = (grid.getRowsObject?.() ?? []).findIndex(row => row?.data === failure.data
                || (id != null && String(row?.data?.id) === String(id)));
        }
        if (rowIndex >= 0) grid.editCell?.(rowIndex, failure.field);
    }

    async function save(grid) {
        if (!isGrid(grid)) return true;
        const state = pending.get(grid);
        if (!state) return true;
        if (!(await commitActiveCell(grid))) return false;
        const current = grid.getCurrentViewRecords?.() ?? [];
        const hadPendingChanges = pendingChanges(grid);
        const previousBatchStarted = state.batchStarted;
        if (hadPendingChanges) {
            if (!state.prepareBatch?.({}, grid.getBatchChanges?.() || {})) {
                await restoreInvalidBatchEditor(grid, state.validationFailure);
                return false;
            }
            if (typeof grid.editModule?.batchSave === 'function') {
                grid.editModule.batchSave();
            } else if (typeof grid.editModule?.editModule?.batchSave === 'function') {
                grid.editModule.editModule.batchSave();
            } else {
                grid.endEdit?.();
            }
        }
        if (state.validationFailed) return false;

        // Do not let the parent document save race ahead of Syncfusion's delayed
        // batchSave actionComplete callback. Waiting only for getBatchChanges() is
        // insufficient because Syncfusion clears it before custom CRUD is finished.
        const deadline = Date.now() + 5000;
        if (hadPendingChanges) {
            while (state.batchStarted === previousBatchStarted && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            const expectedBatch = state.batchStarted;
            while (state.batchCompleted < expectedBatch && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 20));
            }
            if (state.batchStarted === previousBatchStarted || state.batchCompleted < expectedBatch) return false;
        }
        while (pendingChanges(grid) && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        try {
            await state.persisting;
        } catch {
            return false;
        }
        if (state.persistError) return false;
        if (pendingChanges(grid)) return false;
        if (typeof state.options.saveChanges === 'function') await state.options.saveChanges(current, grid);
        state.dirty = false;
        return true;
    }

    function saveBeforeSubmit(form, grid, submit) {
        if (!form || !isGrid(grid) || typeof submit !== 'function') return;
        form.addEventListener('submit', async event => {
            if (form.dataset.gridSaved === 'true') return;
            event.preventDefault();
            const ok = await save(grid);
            if (!ok) return;
            form.dataset.gridSaved = 'true';
            await submit(event);
            form.dataset.gridSaved = 'false';
        });
    }

    function configureBatch(grid, options = {}) {
        if (!grid) return grid;
        // Syncfusion validates a Batch cell on blur. Document rows are validated
        // together in prepareBatch, so blur must remain free for lookups/quick-add.
        if (!deferredBatchValidation.has(grid)) {
            (grid.columns || []).forEach(column => {
                if (column?.validationRules) column.validationRules = {};
                if (String(column?.type ?? '').toLowerCase() === 'checkbox') column.allowEditing = false;
            });
            deferredBatchValidation.add(grid);
        }
        grid.editSettings = Object.assign(
            {},
            { allowEditing: true, mode: 'Batch', allowAdding: true, allowDeleting: true, showConfirmDialog: false },
            grid.editSettings || {},
            options.editSettings || {},
            { mode: 'Batch', showConfirmDialog: false }
        );
        grid.selectionSettings = Object.assign({ checkboxOnly: true }, grid.selectionSettings || {}, options.selectionSettings || {}, { type: 'Multiple' });
        if (Array.isArray(grid.toolbar)) {
            const custom = grid.toolbar.filter(item => item !== 'Edit');
            const actions = [];
            if (grid.editSettings.allowAdding !== false) actions.push('Add');
            if (grid.editSettings.allowDeleting !== false) actions.push('Delete');
            if (grid.editSettings.allowEditing !== false) actions.push('Update', 'Cancel');
            actions.forEach(item => { if (!custom.includes(item)) custom.push(item); });
            grid.toolbar = custom;
        }
        const updateDeleteToolbar = () => {
            const count = grid.getSelectedRecords?.().length ?? 0;
            const deleteId = `${grid.element?.id || 'SecondaryGrid'}_delete`;
            const enabled = count > 0;
            grid.toolbarModule?.enableItems?.([deleteId], enabled);

            // Syncfusion keeps the toolbar wrapper overlaid for newly-added Batch rows,
            // even though getSelectedRecords() already contains the row. Keep the DOM
            // state in sync so a transient row can be removed with the real Delete button.
            const button = document.getElementById?.(deleteId);
            const toolbarItem = button?.closest?.('.e-toolbar-item');
            toolbarItem?.classList?.toggle('e-overlay', !enabled);
            toolbarItem?.setAttribute?.('aria-disabled', String(!enabled));
            if (button) {
                button.disabled = !enabled;
                button.setAttribute('aria-disabled', String(!enabled));
            }
        };
        const originalSelected = grid.rowSelected;
        const originalDeselected = grid.rowDeselected;
        const originalToolbarClick = grid.toolbarClick;
        grid.rowSelected = args => { originalSelected?.(args); updateDeleteToolbar(); };
        grid.rowDeselected = args => { originalDeselected?.(args); updateDeleteToolbar(); };
        grid.toolbarClick = args => {
            const deleteId = `${grid.element?.id || 'SecondaryGrid'}_delete`;
            const selected = grid.getSelectedRecords?.() ?? [];
            if (args?.item?.id === deleteId && selected.length > 0 && selected.every(isTransientRecord)) {
                args.cancel = true;
                if (grid.isEdit) grid.editModule?.editModule?.saveCell?.();
                discardTransientRecords(grid, selected);
                grid.clearSelection?.();
                window.setTimeout(updateDeleteToolbar, 0);
                return;
            }
            originalToolbarClick?.(args);
        };
        grid.addEventListener?.('rowSelected', updateDeleteToolbar);
        grid.addEventListener?.('rowDeselected', updateDeleteToolbar);
        grid.element?.addEventListener?.('click', () => window.setTimeout(updateDeleteToolbar, 0));
        grid.element?.addEventListener?.('change', () => window.setTimeout(updateDeleteToolbar, 0));
        track(grid, options);
        return grid;
    }

    function configureRowSelection(grid) {
        if (!grid || configuredSelections.has(grid) || grid.editSettings?.mode === 'Batch') return grid;
        configuredSelections.add(grid);

        const selectionSettings = Object.assign({}, grid.selectionSettings || {}, {
            type: 'Multiple',
            checkboxOnly: false,
            enableSimpleMultiRowSelection: false
        });
        grid.setProperties?.({ selectionSettings }, true);
        grid.selectionSettings = selectionSettings;

        // Native multiple selection already makes a plain click replace the old row and
        // Ctrl/Shift/checkbox additive. Clearing during rowSelecting cancels the new click.
        if (typeof grid.rowSelecting === 'function' && grid.rowSelecting.toString().includes('clearSelection')) {
            grid.rowSelecting = undefined;
        }

        const updateToolbar = () => {
            const count = grid.getSelectedRecords?.().length ?? 0;
            const setEnabled = (id, enabled) => {
                grid.toolbarModule?.enableItems?.([id], enabled);
                const button = document.getElementById?.(id);
                const toolbarItem = button?.closest?.('.e-toolbar-item');
                toolbarItem?.classList?.toggle('e-overlay', !enabled);
                toolbarItem?.setAttribute?.('aria-disabled', String(!enabled));
                if (button) {
                    button.disabled = !enabled;
                    button.setAttribute('aria-disabled', String(!enabled));
                }
            };
            setEnabled('EditCustom', count === 1);
            setEnabled('DeleteCustom', count > 0);
        };
        const originalSelected = grid.rowSelected;
        const originalDeselected = grid.rowDeselected;
        grid.rowSelected = args => { originalSelected?.(args); updateToolbar(); };
        grid.rowDeselected = args => { originalDeselected?.(args); updateToolbar(); };

        const clearStaleSelection = () => {
            const data = Array.isArray(grid.dataSource) ? grid.dataSource : grid.dataSource?.result;
            if (!Array.isArray(data)) return;
            const key = grid.getPrimaryKeyFieldNames?.()[0]
                ?? grid.columns?.find(column => column?.isPrimaryKey)?.field
                ?? 'id';
            const liveKeys = new Set(data.map(row => row?.[key]));
            if ((grid.getSelectedRecords?.() ?? []).some(row => !liveKeys.has(row?.[key]))) {
                grid.clearSelection?.();
            }
            updateToolbar();
        };
        grid.addEventListener?.('dataBound', clearStaleSelection);
        grid.element?.addEventListener?.('click', () => window.setTimeout(updateToolbar, 0));
        grid.element?.addEventListener?.('change', () => window.setTimeout(updateToolbar, 0));
        return grid;
    }

    function fitMainGridToViewport(grid) {
        const element = grid?.element;
        if (!element || !/^maingrid$/i.test(element.id || '') || element.dataset?.fixedGridHeight === 'true') return;
        const rect = element.getBoundingClientRect?.();
        if (!rect || rect.height <= 0 || rect.top < 0) return;

        const footer = document.querySelector?.('.main-footer, footer');
        const footerRect = footer?.getBoundingClientRect?.();
        const footerHeight = footerRect?.height > 0 ? footerRect.height : 0;
        const content = element.querySelector?.('.e-gridcontent');
        const contentRect = content?.getBoundingClientRect?.();
        const chromeHeight = contentRect?.height > 0
            ? Math.max(0, rect.height - contentRect.height)
            : 150;
        const availableTotal = Math.max(320, (window.innerHeight || document.documentElement?.clientHeight || 900)
            - rect.top - footerHeight - 24);
        const contentHeight = Math.max(260, Math.floor(availableTotal - chromeHeight));
        if (Math.abs(Number(grid.__viewportContentHeight ?? 0) - contentHeight) < 2) return;

        grid.__viewportContentHeight = contentHeight;
        grid.setProperties?.({ height: contentHeight }, true);
        grid.height = contentHeight;
        grid.dataBind?.();
    }

    function autoConfigure() {
        document.querySelectorAll('.e-grid').forEach(element => {
            const grid = element.ej2_instances?.[0];
            if (!grid && !element.dataset.gridDiscoveryPending) {
                const attempts = (gridDiscoveryAttempts.get(element) || 0) + 1;
                gridDiscoveryAttempts.set(element, attempts);
                if (attempts <= 20) {
                    element.dataset.gridDiscoveryPending = 'true';
                    window.setTimeout(() => {
                        delete element.dataset.gridDiscoveryPending;
                        autoConfigure();
                    }, Math.min(25 * attempts, 250));
                }
            }
            window.GridExportManager?.configure?.(grid);
            // Item grids are mounted with id="SecondaryGrid" across all document pages.
            // Normalize them even when a legacy page still declares Normal mode.
            if (grid && (/^secondarygrid/i.test(element.id || '') || grid.editSettings?.mode === 'Batch') && !element.dataset.batchManaged) {
                element.dataset.batchManaged = 'true';
                configureBatch(grid);
            }
            if (!/^secondarygrid/i.test(element.id || '')) {
                configureRowSelection(grid);
                fitMainGridToViewport(grid);
            }
        });
        document.querySelectorAll('form').forEach(form => {
            if (form.dataset.gridPendingWired) return;
            const gridElement = form.querySelector('.e-grid');
            const grid = gridElement?.ej2_instances?.[0];
            if (!grid || grid.editSettings?.mode !== 'Batch') return;
            form.dataset.gridPendingWired = 'true';
            form.addEventListener('submit', async event => {
                if (form.dataset.gridSaved === 'true') return;
                event.preventDefault();
                if (await save(grid)) {
                    form.dataset.gridSaved = 'true';
                    form.requestSubmit?.();
                    form.dataset.gridSaved = 'false';
                }
            }, true);
        });
    }

    function wireKeyboard(root = document) {
        const getTopModal = () => [...modalStack].reverse().find(modal => modal.classList.contains('show'))
            ?? [...document.querySelectorAll('.modal.show')].pop()
            ?? null;
        const isOpenDropDownInteraction = target => {
            const popup = target?.closest?.('.e-ddl.e-popup.e-popup-open, .e-multi-select-list-wrapper.e-popup-open');
            if (popup) return true;

            const control = target?.closest?.('.e-ddl, .e-combobox, .e-multiselect');
            return control?.getAttribute?.('aria-expanded') === 'true';
        };

        // Syncfusion closes a popup on mousedown when its read-only input loses
        // focus inside a Bootstrap modal. Keeping focus on the control allows the
        // component's subsequent click handler to select the item normally.
        root.addEventListener('mousedown', event => {
            if (event.target?.closest?.('.e-ddl.e-popup.e-popup-open .e-list-item')) {
                event.preventDefault();
            }
        }, true);

        root.addEventListener('click', event => {
            const button = event.target?.closest?.('button[type="submit"], button[data-action="submit"], .modal .btn-primary');
            if (!button || button.dataset.batchGridSavedClick === 'true') {
                if (button) delete button.dataset.batchGridSavedClick;
                return;
            }
            const host = button.closest('.modal, [role="dialog"], .card');
            const gridElement = host?.querySelector?.('[id^="SecondaryGrid"].e-grid');
            const grid = gridElement?.ej2_instances?.[0];
            if (!grid || grid.editSettings?.mode !== 'Batch' || (!grid.isEdit && !pendingChanges(grid))) return;

            event.preventDefault();
            event.stopImmediatePropagation();
            void save(grid).then(ok => {
                if (!ok) return;
                button.dataset.batchGridSavedClick = 'true';
                button.click();
            });
        }, true);

        root.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== 'Escape') return;
            const target = event.target;
            const topModal = getTopModal();

            if (event.key === 'Enter' && window.Swal?.isVisible?.()) {
                const popup = document.querySelector?.('.swal2-popup');
                const interactive = popup?.querySelector?.('.qa-form, .qa-inline-form');
                if (interactive && popup.contains?.(target)) return;

                event.preventDefault();
                event.stopImmediatePropagation();
                if (!interactive) window.Swal.close();
                return;
            }

            if (event.key === 'Enter' && topModal) {
                if (isOpenDropDownInteraction(target)) return;

                // Focus can remain behind a nested modal because its Bootstrap focus trap
                // is relaxed. Consume that stale Enter without touching the active form.
                if (!topModal.contains(target)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    return;
                }
            }

            if (event.key === 'Enter' && target?.closest('.e-grid') && !target.closest('textarea')) {
                const gridElement = target.closest('.e-grid');
                const grid = gridElement.ej2_instances?.[0];
                if (grid?.editSettings?.mode === 'Batch') {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    if (grid.isEdit || pendingChanges(grid)) void save(grid);
                }
                return;
            }
            if (event.key === 'Escape' && window.Swal?.isVisible?.()) {
                event.preventDefault();
                window.Swal.close();
                return;
            }
            if (event.key === 'Escape') {
                const shown = getTopModal();
                if (shown && window.bootstrap?.Modal) {
                    event.preventDefault();
                    window.bootstrap.Modal.getOrCreateInstance(shown).hide();
                }
            }
        }, true);

        root.addEventListener('shown.bs.modal', event => {
            const modal = event.target;
            const previousIndex = modalStack.indexOf(modal);
            if (previousIndex >= 0) modalStack.splice(previousIndex, 1);
            modalStack.push(modal);
            refreshModalGrids(modal);
        }, true);
        root.addEventListener('hidden.bs.modal', event => {
            const index = modalStack.indexOf(event.target);
            if (index >= 0) modalStack.splice(index, 1);
        }, true);
    }

    function collapseGroups(grid, collapsed = true) {
        if (!grid?.groupModule) return;
        if (collapsed) grid.groupModule.collapseAll?.();
        else grid.groupModule.expandAll?.();
    }

    window.GridInteractionManager = { configureBatch, configureRowSelection, fitMainGridToViewport, track, save, saveBeforeSubmit, syncBatchRowValues, wireKeyboard, collapseGroups, autoConfigure, patchModalPopups, refreshModalGrids };
    patchModalPopups();
    const init = () => {
        patchModalPopups();
        wireKeyboard();
        autoConfigure();
        new MutationObserver(autoConfigure).observe(document.body, { childList: true, subtree: true });
        let resizeFrame = null;
        window.addEventListener?.('resize', () => {
            if (resizeFrame) window.cancelAnimationFrame?.(resizeFrame);
            resizeFrame = window.requestAnimationFrame?.(() => {
                resizeFrame = null;
                autoConfigure();
            }) ?? null;
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window, document);
