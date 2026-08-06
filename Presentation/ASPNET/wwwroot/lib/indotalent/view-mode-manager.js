(function (window, document) {
    const VIEW_TITLE_PATTERN = /^(view|xem)\b/i;
    const NATIVE_SELECTOR = 'input, select, textarea, button';

    function isViewModal(modal) {
        const title = modal?.querySelector('.modal-title')?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        return VIEW_TITLE_PATTERN.test(title);
    }

    function setInstanceReadOnly(element, readOnly) {
        const instances = element.ej2_instances ?? [];
        instances.forEach(instance => {
            const typeName = instance?.constructor?.name ?? '';
            if (!instance || /Grid/i.test(typeName)) return;

            if (readOnly) {
                if (!Object.prototype.hasOwnProperty.call(instance, '__viewModeOriginalEnabled')
                    && 'enabled' in instance) {
                    instance.__viewModeOriginalEnabled = instance.enabled;
                    instance.enabled = false;
                }
                if (!Object.prototype.hasOwnProperty.call(instance, '__viewModeOriginalReadonly')
                    && 'readonly' in instance) {
                    instance.__viewModeOriginalReadonly = instance.readonly;
                    instance.readonly = true;
                }
            } else {
                if (Object.prototype.hasOwnProperty.call(instance, '__viewModeOriginalEnabled')) {
                    instance.enabled = instance.__viewModeOriginalEnabled;
                    delete instance.__viewModeOriginalEnabled;
                }
                if (Object.prototype.hasOwnProperty.call(instance, '__viewModeOriginalReadonly')) {
                    instance.readonly = instance.__viewModeOriginalReadonly;
                    delete instance.__viewModeOriginalReadonly;
                }
            }
            instance.dataBind?.();
        });
    }

    function apply(modal, readOnly = true) {
        if (!modal) return;
        modal.classList.toggle('view-mode-readonly', readOnly);

        modal.querySelectorAll(NATIVE_SELECTOR).forEach(element => {
            if (element.matches('.btn-close, [data-bs-dismiss="modal"]')) return;

            if (readOnly) {
                if (!element.hasAttribute('data-view-mode-original-disabled')) {
                    element.setAttribute('data-view-mode-original-disabled', element.disabled ? 'true' : 'false');
                    element.setAttribute('data-view-mode-original-readonly', element.readOnly ? 'true' : 'false');
                }
                element.disabled = true;
                if ('readOnly' in element) element.readOnly = true;
            } else if (element.hasAttribute('data-view-mode-original-disabled')) {
                element.disabled = element.getAttribute('data-view-mode-original-disabled') === 'true';
                if ('readOnly' in element) {
                    element.readOnly = element.getAttribute('data-view-mode-original-readonly') === 'true';
                }
                element.removeAttribute('data-view-mode-original-disabled');
                element.removeAttribute('data-view-mode-original-readonly');
            }

            setInstanceReadOnly(element, readOnly);
        });

        modal.querySelectorAll('.e-control').forEach(element => setInstanceReadOnly(element, readOnly));
    }

    document.addEventListener('shown.bs.modal', event => {
        const modal = event.target;
        if (modal?.classList?.contains('modal') && isViewModal(modal)) {
            apply(modal, true);
        }
    });

    document.addEventListener('hidden.bs.modal', event => {
        const modal = event.target;
        if (modal?.classList?.contains('modal')) {
            apply(modal, false);
        }
    });

    const titleObserver = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            const changedModal = mutation.target?.classList?.contains?.('modal')
                ? mutation.target
                : null;
            if (changedModal?.classList.contains('show') && isViewModal(changedModal)) {
                apply(changedModal, true);
                return;
            }

            const title = mutation.target.nodeType === Node.TEXT_NODE
                ? mutation.target.parentElement?.closest('.modal-title')
                : mutation.target.closest?.('.modal-title');
            const modal = title?.closest('.modal.show');
            if (modal && isViewModal(modal)) apply(modal, true);
        });
    });

    function init() {
        titleObserver.observe(document.body, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();

    window.ViewModeManager = { apply, isViewModal };
})(window, document);
