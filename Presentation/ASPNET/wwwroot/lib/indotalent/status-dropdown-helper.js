(function (window) {
    'use strict';

    /**
     * StatusDropdownHelper
     * 
     * Utility for preventing users from reverting to Draft status.
     * When a record has been saved with a non-Draft status (> 0),
     * the Draft option is hidden from the dropdown popup.
     * 
     * Uses Syncfusion DropDownList's `open` event to hide Draft items
     * via CSS display:none — this avoids ALL dataSource manipulation issues.
     * 
     * All status enums follow: Draft=0, Cancelled=1, Confirmed=2, Archived=3
     */

    /**
     * Installs a popup-open handler on the Syncfusion DropDownList.
     * When the dropdown opens and currentStatus > 0, Draft (id=0) items are hidden.
     * 
     * @param {Object} dropdownObj - The Syncfusion DropDownList instance
     * @param {Array} fullDataSource - The complete status list (unused, kept for API compat)
     * @param {number|string} currentStatus - The current status value
     */
    function applyToDropdown(dropdownObj, fullDataSource, currentStatus) {
        if (!dropdownObj) return;

        // Store the current status on the dropdown for use in the open handler
        dropdownObj._currentStatusForFilter = currentStatus;

        // Only install the handler once
        if (!dropdownObj._statusFilterInstalled) {
            dropdownObj._statusFilterInstalled = true;

            var originalOpen = dropdownObj.open;
            dropdownObj.open = function (args) {
                _hideDraftItems(dropdownObj);
                if (typeof originalOpen === 'function') {
                    originalOpen.call(this, args);
                }
            };
        }
    }

    /**
     * Hides or shows Draft (value=0) list items in the popup based on current status.
     */
    function _hideDraftItems(dropdownObj) {
        var status = dropdownObj._currentStatusForFilter;
        var statusVal = parseInt(status, 10);
        var shouldHideDraft = !isNaN(statusVal) && statusVal > 0;

        // Use setTimeout to ensure the popup DOM is rendered
        setTimeout(function () {
            var popupEle = dropdownObj.popupObj ? dropdownObj.popupObj.element : null;
            if (!popupEle) return;

            var listItems = popupEle.querySelectorAll('li.e-list-item');
            listItems.forEach(function (li) {
                var itemValue = li.getAttribute('data-value');
                if (itemValue === '0' || itemValue === 0) {
                    li.style.display = shouldHideDraft ? 'none' : '';
                }
            });
        }, 0);
    }

    /**
     * Filters out Draft (id=0) from array (for use outside dropdown context).
     */
    function filterForExistingRecord(dataSource, currentStatus) {
        if (!dataSource || !Array.isArray(dataSource)) return dataSource;
        var statusVal = parseInt(currentStatus, 10);
        if (isNaN(statusVal) || statusVal <= 0) {
            return dataSource;
        }
        return dataSource.filter(function (item) {
            return parseInt(item.id, 10) !== 0;
        });
    }

    window.StatusDropdownHelper = {
        filterForExistingRecord: filterForExistingRecord,
        applyToDropdown: applyToDropdown
    };
})(window);
