(function (window) {
    'use strict';

    /**
     * StatusDropdownHelper
     * 
     * Previously prevented users from reverting to Draft status.
     * Now a no-op: all status transitions are allowed freely.
     * 
     * All status enums follow: Draft=0, Cancelled=1, Confirmed=2, Archived=3
     */

    /**
     * No-op. Previously installed a popup-open handler to hide Draft items.
     * Now does nothing — all statuses remain selectable.
     */
    function applyToDropdown(dropdownObj, fullDataSource, currentStatus) {
        // No-op: all status transitions are now allowed
    }

    /**
     * Returns the full dataSource unchanged.
     * Previously filtered out Draft (id=0) for non-Draft records.
     */
    function filterForExistingRecord(dataSource, currentStatus) {
        return dataSource;
    }

    window.StatusDropdownHelper = {
        filterForExistingRecord: filterForExistingRecord,
        applyToDropdown: applyToDropdown
    };
})(window);
