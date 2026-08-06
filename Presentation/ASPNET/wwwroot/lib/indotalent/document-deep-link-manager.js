(function (window, document) {
    const VIEW_PARAMETER = 'viewId';
    const MAX_ATTEMPTS = 120;

    function wait(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    async function openRequestedRecord() {
        const parameters = new URLSearchParams(window.location.search);
        const recordId = parameters.get(VIEW_PARAMETER);
        if (!recordId) return;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
            const gridElement = document.getElementById('MainGrid');
            const grid = gridElement?.ej2_instances?.find(instance => instance?.getModuleName?.() === 'grid')
                ?? gridElement?.ej2_instances?.[0];
            const records = Array.isArray(grid?.dataSource) ? grid.dataSource : grid?.dataSource?.result;
            const record = Array.isArray(records) ? records.find(item => `${item?.id}` === recordId) : null;
            const viewButton = document.getElementById('ViewCustom')
                ?? document.querySelector('[id$="_ViewCustom"]');

            if (grid && record && viewButton) {
                grid.filterByColumn('id', 'equal', recordId);
                await wait(150);
                grid.selectRow(0);
                await wait(50);
                viewButton.click();
                await wait(150);
                grid.clearFiltering(['id']);

                parameters.delete(VIEW_PARAMETER);
                const remainingQuery = parameters.toString();
                window.history.replaceState({}, document.title, `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ''}${window.location.hash}`);
                return;
            }

            await wait(100);
        }

        if (window.Swal) {
            Swal.fire({ icon: 'error', title: 'Document Not Found', text: 'The requested document could not be opened.' });
        }
    }

    window.addEventListener('load', openRequestedRecord, { once: true });
})(window, document);
