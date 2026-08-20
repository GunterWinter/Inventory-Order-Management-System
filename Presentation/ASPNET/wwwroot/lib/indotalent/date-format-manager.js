(function (window) {
    const VI_LOCALE = 'vi-VN';
    const VI_TIME_ZONE = 'Asia/Ho_Chi_Minh';
    // Syncfusion only bundles CLDR data for en-US. Keep the DatePicker engine on
    // that supported locale while controlling the visible format separately.
    const SYNCFUSION_DATE_LOCALE = 'en-US';

    function isVietnamese() {
        return window.UiLocalization?.getLocale?.() !== 'en';
    }

    function displayLocale() {
        return isVietnamese() ? VI_LOCALE : 'en-US';
    }

    function displayDateFormat(includeTime = false) {
        const dateFormat = isVietnamese() ? 'dd/MM/yyyy' : 'MM/dd/yyyy';
        return includeTime ? `${dateFormat} HH:mm` : dateFormat;
    }

    function pad(value) {
        return `${value}`.padStart(2, '0');
    }

    function parseIsoLikeDate(value) {
        if (typeof value !== 'string') {
            return null;
        }

        const normalizedValue = value.trim();
        if (!normalizedValue) {
            return null;
        }

        const timeZonePattern = /(Z|[+-]\d{2}:\d{2})$/i;
        if (timeZonePattern.test(normalizedValue)) {
            return null;
        }

        const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
        if (!match) {
            return null;
        }

        const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
        return new Date(
            Number(year),
            Number(month) - 1,
            Number(day),
            Number(hour),
            Number(minute),
            Number(second)
        );
    }

    function buildVietnamDisplayDate(value) {
        if (value == null || value === '') {
            return null;
        }

        const isoLikeDate = parseIsoLikeDate(value);
        if (isoLikeDate instanceof Date && !Number.isNaN(isoLikeDate.getTime())) {
            return isoLikeDate;
        }

        const sourceDate = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(sourceDate.getTime())) {
            return null;
        }

        const formatter = new Intl.DateTimeFormat('sv-SE', {
            timeZone: VI_TIME_ZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });

        const parts = formatter.formatToParts(sourceDate).reduce((accumulator, part) => {
            if (part.type !== 'literal') {
                accumulator[part.type] = part.value;
            }

            return accumulator;
        }, {});

        return new Date(
            Number(parts.year),
            Number(parts.month) - 1,
            Number(parts.day),
            Number(parts.hour),
            Number(parts.minute),
            Number(parts.second)
        );
    }

    function truncateToLocalDate(value) {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            return null;
        }

        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    function parseBusinessDate(value) {
        if (value == null || value === '') {
            return null;
        }

        if (value instanceof Date) {
            return truncateToLocalDate(value);
        }

        if (typeof value === 'string') {
            const normalizedValue = value.trim();
            const match = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?(Z|[+-]\d{2}:\d{2})?$/i);

            if (match) {
                const [, year, month, day, hour = '00', minute = '00', second = '00', timeZone = ''] = match;
                const hasExplicitTimeZone = timeZone !== '';
                const hasTime = normalizedValue.includes('T') || normalizedValue.includes(' ');
                const hasNonMidnightTime = Number(hour) !== 0 || Number(minute) !== 0 || Number(second) !== 0;

                if (hasExplicitTimeZone || (hasTime && hasNonMidnightTime)) {
                    const sourceValue = hasExplicitTimeZone
                        ? normalizedValue
                        : `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
                    return truncateToLocalDate(buildVietnamDisplayDate(sourceValue));
                }

                return new Date(Number(year), Number(month) - 1, Number(day));
            }
        }

        return truncateToLocalDate(buildVietnamDisplayDate(value));
    }

    function formatForApiDate(value) {
        const localDate = parseBusinessDate(value);
        if (!localDate) {
            return null;
        }

        return [
            localDate.getFullYear(),
            pad(localDate.getMonth() + 1),
            pad(localDate.getDate())
        ].join('-');
    }

    function datePickerOptions(options = {}) {
        return {
            format: displayDateFormat(false),
            locale: SYNCFUSION_DATE_LOCALE,
            strictMode: true,
            ...options
        };
    }

    function formatDate(value) {
        const localDate = buildVietnamDisplayDate(value);
        if (!localDate) {
            return '';
        }

        return new Intl.DateTimeFormat(displayLocale(), {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(localDate);
    }

    function formatDateTime(value) {
        const localDate = buildVietnamDisplayDate(value);
        if (!localDate) {
            return '';
        }

        return `${formatDate(localDate)} ${pad(localDate.getHours())}:${pad(localDate.getMinutes())}:${pad(localDate.getSeconds())}`;
    }

    function normalizeGridDateColumn(column) {
        if (!column) {
            return;
        }

        if (Array.isArray(column.columns)) {
            column.columns.forEach(normalizeGridDateColumn);
        }

        const format = `${column.format ?? ''}`;
        const looksLikeDate = /yyyy|MM|dd/.test(format)
            && (/date/i.test(`${column.field ?? ''} ${column.headerText ?? ''}`) || /yyyy/.test(format));
        if (!looksLikeDate) {
            return;
        }

        const includesTime = /H|h|m/.test(format.replace(/MM/g, ''));
        column.__indotalentDateColumn = true;
        column.__indotalentIncludesTime = includesTime;
        column.format = displayDateFormat(includesTime);
    }

    function normalizeGridDates(grid) {
        if (!Array.isArray(grid?.columns)) {
            return;
        }

        grid.columns.forEach(column => {
            if (column.__indotalentDateColumn) {
                column.format = displayDateFormat(column.__indotalentIncludesTime);
            } else {
                normalizeGridDateColumn(column);
            }
        });
    }

    function patchGrid() {
        const grid = window.ej?.grids?.Grid;
        if (!grid || grid.prototype.__vietnamDateFormatPatched) {
            return;
        }

        const originalAppendTo = grid.prototype.appendTo;
        grid.prototype.appendTo = function (selector) {
            normalizeGridDates(this);
            return originalAppendTo.call(this, selector);
        };
        grid.prototype.__vietnamDateFormatPatched = true;
    }

    function patchDatePicker() {
        const datePicker = window.ej?.calendars?.DatePicker;
        if (!datePicker || datePicker.prototype.__vietnamDateFormatPatched) {
            return;
        }

        const originalAppendTo = datePicker.prototype.appendTo;
        datePicker.prototype.appendTo = function (selector) {
            const currentFormat = `${this.format ?? ''}`;
            if (!currentFormat || /yyyy[-/]MM[-/]dd|dd[-/]MM[-/]yyyy|MM[-/]dd[-/]yyyy/.test(currentFormat)) {
                this.format = displayDateFormat(false);
                this.locale = SYNCFUSION_DATE_LOCALE;
            }
            return originalAppendTo.call(this, selector);
        };
        datePicker.prototype.__vietnamDateFormatPatched = true;
    }

    patchGrid();
    patchDatePicker();
    window.document.addEventListener('DOMContentLoaded', () => {
        patchGrid();
        patchDatePicker();
    }, { once: true });
    window.addEventListener('ui:languagechanged', () => {
        window.document.querySelectorAll('.e-grid').forEach(element => {
            const grid = element.ej2_instances?.[0];
            if (!grid) return;
            normalizeGridDates(grid);
            grid.refreshColumns?.();
        });
        window.document.querySelectorAll('.e-datepicker').forEach(element => {
            const datePicker = element.ej2_instances?.[0];
            if (!datePicker) return;
            datePicker.format = displayDateFormat(false);
            datePicker.locale = SYNCFUSION_DATE_LOCALE;
            datePicker.dataBind?.();
        });
    });

    window.DateFormatManager = {
        locale: VI_LOCALE,
        timeZone: VI_TIME_ZONE,
        parseServerDate: buildVietnamDisplayDate,
        parseBusinessDate,
        formatForApiDate,
        datePickerOptions,
        syncfusionDateLocale: SYNCFUSION_DATE_LOCALE,
        formatToLocale: formatDate,
        formatDateTimeToLocale: formatDateTime
    };
})(window);
