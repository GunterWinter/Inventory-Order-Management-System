(function (window, document) {
    'use strict';

    // Shared interaction conventions for Syncfusion grids and document forms.
    const pending = new WeakMap();
    const collapsingGroups = new WeakSet();
    const scheduledGroupCollapses = new WeakSet();
    const gridDiscoveryAttempts = new WeakMap();
    const modalStack = [];
    const MODAL_POPUP_Z_INDEX = 2000;
    const MAX_GROUP_COLLAPSE_ATTEMPTS = 4;
    const isGrid = value => value && typeof value.endEdit === 'function';
    const requestTypeOf = args => String(args?.requestType ?? '').toLowerCase();
    const batchChangeCount = changes => (changes?.addedRecords?.length || 0)
        + (changes?.changedRecords?.length || 0)
        + (changes?.deletedRecords?.length || 0);
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
            state.batchChanges = {
                addedRecords: [...(changes?.addedRecords || [])],
                changedRecords: [...(changes?.changedRecords || [])],
                deletedRecords: [...(changes?.deletedRecords || [])]
            };

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

    async function save(grid) {
        if (!isGrid(grid)) return true;
        const state = pending.get(grid);
        if (!state) return true;
        if (!(await commitActiveCell(grid))) return false;
        const current = grid.getCurrentViewRecords?.() ?? [];
        const hadPendingChanges = pendingChanges(grid);
        const previousBatchStarted = state.batchStarted;
        if (hadPendingChanges) {
            if (!state.prepareBatch?.({}, grid.getBatchChanges?.() || {})) return false;
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
        grid.editSettings = Object.assign(
            {},
            grid.editSettings || {},
            { allowEditing: true, mode: 'Batch', allowAdding: true, allowDeleting: true, showConfirmDialog: false },
            options.editSettings || {},
            { mode: 'Batch', showConfirmDialog: false }
        );
        grid.selectionSettings = Object.assign({ checkboxOnly: true }, grid.selectionSettings || {}, options.selectionSettings || {}, { type: 'Multiple' });
        if (Array.isArray(grid.toolbar)) {
            const custom = grid.toolbar.filter(item => item !== 'Edit');
            ['Add', 'Delete', 'Update', 'Cancel'].forEach(item => { if (!custom.includes(item)) custom.push(item); });
            grid.toolbar = custom;
        }
        track(grid, options);
        return grid;
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
            if (grid?.groupSettings?.columns?.length && !element.dataset.groupCollapseWired) {
                element.dataset.groupCollapseWired = 'true';
                const collapseWhenRendered = () => collapseGroupsOnDataBound(grid);
                if (typeof grid.addEventListener === 'function') {
                    grid.addEventListener('dataBound', collapseWhenRendered);
                }
                collapseWhenRendered();
            }
            window.GridExportManager?.configure?.(grid);
            // Item grids are mounted with id="SecondaryGrid" across all document pages.
            // Normalize them even when a legacy page still declares Normal mode.
            if (grid && (/^secondarygrid/i.test(element.id || '') || grid.editSettings?.mode === 'Batch') && !element.dataset.batchManaged) {
                element.dataset.batchManaged = 'true';
                configureBatch(grid);
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
        const getBatchGrids = host => [...(host?.querySelectorAll?.('.e-grid') ?? [])]
            .map(element => element.ej2_instances?.[0])
            .filter(grid => grid?.editSettings?.mode === 'Batch');
        const getModalSubmitButton = modal => modal?.querySelector?.(
            '#MainSaveButton:not([disabled]), button[data-action="submit"]:not([disabled]), button[type="submit"]:not([disabled]), .modal-footer .btn-primary:not([disabled])'
        );

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

            if (event.key === 'Enter' && topModal && !window.Swal?.isVisible?.()) {
                // Bootstrap focus is deliberately relaxed for nested dialogs, so focus can
                // remain on the main grid behind the modal. Always consume Enter at the
                // topmost modal to prevent Syncfusion from toggling an underlying row.
                if (topModal.contains(target) && target?.closest?.('textarea')) return;
                event.preventDefault();
                event.stopImmediatePropagation();

                const modalGrids = getBatchGrids(topModal);
                const targetGridElement = topModal.contains(target) ? target?.closest?.('.e-grid') : null;
                const targetGrid = targetGridElement?.ej2_instances?.[0];
                const activeGrid = targetGrid?.editSettings?.mode === 'Batch'
                    ? targetGrid
                    : modalGrids.find(grid => grid.isEdit || pendingChanges(grid));

                const hadGridWork = Boolean(activeGrid && (activeGrid.isEdit || pendingChanges(activeGrid)));
                if (hadGridWork) {
                    void save(activeGrid);
                    return;
                }

                const pendingGrid = modalGrids.find(pendingChanges);
                if (pendingGrid) {
                    void save(pendingGrid);
                    return;
                }

                getModalSubmitButton(topModal)?.click?.();
                return;
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

    function groupRowsAreRendered(grid) {
        if (grid?.isDestroyed || grid?.element?.isConnected === false) return false;
        if (typeof grid?.getRowsObject !== 'function' || typeof grid?.getRowElementByUID !== 'function') return true;

        try {
            return (grid.getRowsObject() || []).every(row => !row?.isDataRow || Boolean(grid.getRowElementByUID(row.uid)));
        } catch {
            return false;
        }
    }

    function isTransientGroupRenderError(error) {
        if (error?.name !== 'TypeError') return false;
        const details = `${error.message || ''}\n${error.stack || ''}`;
        return details.includes('updateVisibleexpandCollapseRows')
            || /Cannot read properties of (?:null|undefined) \(reading ['"]style['"]\)/.test(details);
    }

    function collapseGroupsOnDataBound(grid) {
        if (!grid || collapsingGroups.has(grid) || scheduledGroupCollapses.has(grid)) return;

        scheduledGroupCollapses.add(grid);
        const attemptCollapse = attempt => window.requestAnimationFrame(() => {
            if (!scheduledGroupCollapses.has(grid)) return;
            if (!grid.groupSettings?.columns?.length || !grid.groupModule?.collapseAll || grid.isDestroyed) {
                scheduledGroupCollapses.delete(grid);
                return;
            }

            // Syncfusion can publish dataBound before its row objects and row elements
            // are in sync. collapseAll assumes every data row already has an element.
            if (!groupRowsAreRendered(grid)) {
                if (attempt < MAX_GROUP_COLLAPSE_ATTEMPTS) attemptCollapse(attempt + 1);
                else scheduledGroupCollapses.delete(grid);
                return;
            }

            collapsingGroups.add(grid);
            try {
                grid.groupModule.collapseAll();
            } catch (error) {
                collapsingGroups.delete(grid);
                if (isTransientGroupRenderError(error) && attempt < MAX_GROUP_COLLAPSE_ATTEMPTS) {
                    attemptCollapse(attempt + 1);
                    return;
                }
                scheduledGroupCollapses.delete(grid);
                if (!isTransientGroupRenderError(error)) throw error;
                return;
            }

            // collapseAll can synchronously raise dataBound again. Keep both guards
            // until the following frame so re-entrant callbacks cannot schedule a loop.
            window.requestAnimationFrame(() => {
                collapsingGroups.delete(grid);
                scheduledGroupCollapses.delete(grid);
            });
        });

        attemptCollapse(1);
    }

    // Compatibility alias for pages that have not yet moved to the data-bound name.
    function collapseGroupsOnFirstLoad(grid) {
        collapseGroupsOnDataBound(grid);
    }

    window.GridInteractionManager = { configureBatch, track, save, saveBeforeSubmit, wireKeyboard, collapseGroups, collapseGroupsOnDataBound, collapseGroupsOnFirstLoad, autoConfigure, patchModalPopups, refreshModalGrids };
    patchModalPopups();
    const init = () => { patchModalPopups(); wireKeyboard(); autoConfigure(); new MutationObserver(autoConfigure).observe(document.body, { childList: true, subtree: true }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window, document);
