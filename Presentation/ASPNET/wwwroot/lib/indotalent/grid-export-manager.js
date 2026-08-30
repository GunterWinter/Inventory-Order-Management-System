(function (window, document) {
    'use strict';

    const wrapped = new WeakSet();
    const technicalFields = new Set([
        'id', 'createdbyid', 'updatedbyid', 'deletedbyid', 'createdatutc',
        'updatedatutc', 'deletedatutc', 'isdeleted', 'rowversion'
    ]);

    const cleanFileName = value => `${value || 'Export'}`
        .replace(/[^\p{L}\p{N}_.-]+/gu, '-')
        .replace(/^-+|-+$/g, '') || 'Export';

    function getLocalizedHeaderText(column) {
        const originalHeader = column?.__originalHeaderText
            ?? column?.headerText
            ?? column?.field
            ?? '';
        const locale = window.UiLocalization?.getLocale?.() ?? 'en';
        return window.UiLocalization?.translateText?.(originalHeader, locale) ?? originalHeader;
    }

    function getExportColumns(grid) {
        return (grid?.columns || [])
            .filter(column => column
                && column.visible !== false
                && column.type !== 'checkbox'
                && !column.commands?.length
                && column.field
                && !technicalFields.has(`${column.field}`.toLowerCase()))
            .map(column => ({
                field: column.field,
                headerText: getLocalizedHeaderText(column),
                width: column.width,
                textAlign: column.textAlign,
                format: column.format,
                type: column.type,
                valueAccessor: column.valueAccessor,
                foreignKeyField: column.foreignKeyField,
                foreignKeyValue: column.foreignKeyValue,
                dataSource: column.dataSource
            }));
    }

    function defaultFileName() {
        const heading = document.querySelector('h1, h2, h3, .page-title, .card-title')?.textContent?.trim();
        const date = new Date().toISOString().slice(0, 10);
        return `${cleanFileName(heading)}-${date}.xlsx`;
    }

    function showFailure(error) {
        const message = window.AxiosManager?.getErrorMessage?.(error, 'Không thể xuất Excel.')
            || error?.message
            || 'Không thể xuất Excel.';
        if (window.Swal) {
            void window.Swal.fire({
                icon: 'error',
                title: 'Xuất Excel thất bại',
                text: message,
                confirmButtonText: 'Đồng ý'
            });
        } else {
            window.alert(message);
        }
    }

    async function exportExcel(grid, options = {}, exporter) {
        if (!grid) return false;
        const original = exporter || grid.__originalExcelExport;
        if (typeof original !== 'function') return false;

        const properties = Object.assign({
            exportType: 'AllPages',
            fileName: defaultFileName(),
            columns: getExportColumns(grid)
        }, options || {});

        try {
            await Promise.resolve(original(properties));
            return true;
        } catch (error) {
            console.error('Unable to export Excel.', error);
            showFailure(error);
            return false;
        }
    }

    function configure(grid) {
        if (!grid || wrapped.has(grid) || typeof grid.excelExport !== 'function') return grid;
        const original = grid.excelExport.bind(grid);
        Object.defineProperty(grid, '__originalExcelExport', { value: original, configurable: true });
        grid.excelExport = options => exportExcel(grid, options, original);
        wrapped.add(grid);
        return grid;
    }

    function autoConfigure() {
        document.querySelectorAll('.e-grid').forEach(element => configure(element.ej2_instances?.[0]));
    }

    window.GridExportManager = { configure, exportExcel, getExportColumns, getLocalizedHeaderText, autoConfigure };
    const init = () => {
        autoConfigure();
        new MutationObserver(autoConfigure).observe(document.body, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window, document);
