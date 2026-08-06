(function (window) {
    const CREATED_FIELDS = ['createdAtUtc', 'createdAt', 'creationTime'];

    function flattenColumns(columns, result = []) {
        (columns ?? []).forEach(column => {
            if (Array.isArray(column?.columns)) {
                flattenColumns(column.columns, result);
            } else if (column?.field) {
                result.push(column.field);
            }
        });
        return result;
    }

    function resolveCreatedField(grid) {
        const columnFields = flattenColumns(grid?.columns);
        const columnMatch = CREATED_FIELDS.find(field => columnFields.includes(field));
        if (columnMatch) return columnMatch;

        const dataSource = Array.isArray(grid?.dataSource)
            ? grid.dataSource
            : grid?.dataSource?.result;
        const sample = Array.isArray(dataSource) ? dataSource.find(Boolean) : null;
        return sample ? CREATED_FIELDS.find(field => Object.prototype.hasOwnProperty.call(sample, field)) : null;
    }

    function patchGrid() {
        const Grid = window.ej?.grids?.Grid;
        if (!Grid || Grid.prototype.__createdAtDefaultSortPatched) return;

        const originalAppendTo = Grid.prototype.appendTo;
        Grid.prototype.appendTo = function (selector) {
            const createdField = resolveCreatedField(this);
            if (createdField) {
                this.sortSettings = {
                    ...(this.sortSettings ?? {}),
                    columns: [{ field: createdField, direction: 'Descending' }]
                };
            }
            return originalAppendTo.call(this, selector);
        };

        Grid.prototype.__createdAtDefaultSortPatched = true;
    }

    patchGrid();
    document.addEventListener('DOMContentLoaded', patchGrid, { once: true });
})(window);
