(function (window, document) {
    const VI_LOCALE = 'vi-VN';
    const DEFAULT_CURRENCY = 'VND';
    const GROUP_SEPARATOR = '.';
    const DECIMAL_SEPARATOR = ',';
    const MAX_FRACTION_DIGITS = 2;
    const MONEY_FORMAT = 'N0';
    const MONEY_FIELD_PATTERN = /(price|amount|cost|profit|cogs|subtotal|total|sales)/i;

    function toFiniteNumber(value) {
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }

        if (typeof value === 'string') {
            const parsedValue = parseLocaleNumber(value);
            return parsedValue ?? 0;
        }

        return 0;
    }

    function countFractionDigits(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }

        const fractionValue = value.toString().split('.')[1] ?? '';
        return Math.min(fractionValue.length, MAX_FRACTION_DIGITS);
    }

    function formatNumber(value, minimumFractionDigits = null, maximumFractionDigits = null) {
        const safeValue = toFiniteNumber(value);
        const resolvedMaximumFractionDigits = maximumFractionDigits ?? Math.max(minimumFractionDigits ?? 0, countFractionDigits(safeValue));
        const resolvedMinimumFractionDigits = minimumFractionDigits ?? Math.min(resolvedMaximumFractionDigits, countFractionDigits(safeValue));

        return new Intl.NumberFormat(VI_LOCALE, {
            style: 'decimal',
            minimumFractionDigits: resolvedMinimumFractionDigits,
            maximumFractionDigits: resolvedMaximumFractionDigits
        }).format(safeValue);
    }

    function formatCurrency(value, minimumFractionDigits = 0, maximumFractionDigits = 0) {
        const safeValue = toFiniteNumber(value);

        return new Intl.NumberFormat(VI_LOCALE, {
            style: 'currency',
            currency: DEFAULT_CURRENCY,
            minimumFractionDigits,
            maximumFractionDigits
        }).format(safeValue);
    }

    function getColumnText(column) {
        return [
            column?.field,
            column?.headerText,
            column?.foreignKeyField,
            column?.foreignKeyValue
        ].filter(Boolean).join(' ');
    }

    function isMoneyText(value) {
        return MONEY_FIELD_PATTERN.test(`${value ?? ''}`);
    }

    function isMoneyNumericTextBox(numericTextBox) {
        return isMoneyText([
            numericTextBox?.placeholder,
            numericTextBox?.element?.id,
            numericTextBox?.element?.name,
            numericTextBox?.element?.className,
            numericTextBox?.htmlAttributes?.name,
            numericTextBox?.htmlAttributes?.id
        ].filter(Boolean).join(' '));
    }

    function normalizeMoneyNumericTextBox(numericTextBox) {
        const format = `${numericTextBox?.format ?? ''}`.toLowerCase();
        if (format === 'n2' && isMoneyNumericTextBox(numericTextBox)) {
            numericTextBox.format = 'n0';
            numericTextBox.decimals = 0;
            numericTextBox.validateDecimalOnType = false;
        }
    }

    function normalizeMoneyGridColumn(column) {
        if (!column) {
            return;
        }

        if (Array.isArray(column.columns)) {
            column.columns.forEach(normalizeMoneyGridColumn);
        }

        const format = `${column.format ?? ''}`.toLowerCase();
        if (format === 'n2' && isMoneyText(getColumnText(column))) {
            column.format = MONEY_FORMAT;
        }
    }

    function splitEditableNumber(value) {
        const rawValue = `${value ?? ''}`.trim();
        const sign = rawValue.startsWith('-') ? '-' : '';
        const unsignedValue = sign ? rawValue.slice(1) : rawValue;
        const lastDotIndex = unsignedValue.lastIndexOf('.');
        const lastCommaIndex = unsignedValue.lastIndexOf(',');
        const decimalIndex = Math.max(lastDotIndex, lastCommaIndex);

        let integerPart = unsignedValue;
        let fractionPart = '';
        let hasDecimalSeparator = false;

        if (decimalIndex >= 0) {
            const candidateFraction = unsignedValue.slice(decimalIndex + 1).replace(/\D/g, '');
            const candidateInteger = unsignedValue.slice(0, decimalIndex);
            const treatAsDecimal = candidateFraction.length > 0 && candidateFraction.length <= MAX_FRACTION_DIGITS;
            const keepTrailingDecimal = candidateFraction.length === 0;

            if (treatAsDecimal || keepTrailingDecimal) {
                integerPart = candidateInteger;
                fractionPart = candidateFraction.slice(0, MAX_FRACTION_DIGITS);
                hasDecimalSeparator = true;
            }
        }

        integerPart = integerPart.replace(/\D/g, '');

        return {
            sign,
            integerPart,
            fractionPart,
            hasDecimalSeparator
        };
    }

    function formatEditableValue(value) {
        const parts = splitEditableNumber(value);
        if (!parts.integerPart && !parts.fractionPart) {
            return parts.sign;
        }

        const formattedInteger = (parts.integerPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
        const fractionSection = parts.hasDecimalSeparator ? `${DECIMAL_SEPARATOR}${parts.fractionPart}` : '';

        return `${parts.sign}${formattedInteger}${fractionSection}`;
    }

    function normalizeNumberString(value) {
        const parts = splitEditableNumber(value);
        if (!parts.integerPart && !parts.fractionPart) {
            return '';
        }

        const integerPart = parts.integerPart || '0';
        const fractionSection = parts.hasDecimalSeparator && parts.fractionPart
            ? `.${parts.fractionPart}`
            : '';

        return `${parts.sign}${integerPart}${fractionSection}`;
    }

    function parseLocaleNumber(value) {
        const normalizedValue = normalizeNumberString(value);
        if (!normalizedValue || normalizedValue === '-') {
            return null;
        }

        const parsedValue = Number(normalizedValue);
        return Number.isFinite(parsedValue) ? parsedValue : null;
    }

    function syncNumericDisplay(numericTextBox) {
        const element = numericTextBox?.element;
        if (!element) {
            return;
        }

        const parsedValue = parseLocaleNumber(element.value);
        if (parsedValue == null) {
            element.value = '';
            numericTextBox.value = null;
            return;
        }

        numericTextBox.value = parsedValue;
        element.value = formatEditableValue(element.value);
    }

    function attachLiveFormatting(numericTextBox) {
        if (!numericTextBox?.element || numericTextBox.element.dataset.liveFormatted === 'true') {
            return;
        }

        const element = numericTextBox.element;
        let isComposing = false;

        const handleInput = () => {
            if (isComposing || numericTextBox.readonly || numericTextBox.enabled === false) {
                return;
            }

            syncNumericDisplay(numericTextBox);
            const caretPosition = element.value.length;
            requestAnimationFrame(() => {
                try {
                    element.setSelectionRange(caretPosition, caretPosition);
                } catch (error) {
                }
            });
        };

        element.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        element.addEventListener('compositionend', () => {
            isComposing = false;
            handleInput();
        });

        element.addEventListener('input', handleInput);
        element.addEventListener('blur', () => syncNumericDisplay(numericTextBox));
        element.dataset.liveFormatted = 'true';

        if (numericTextBox.value != null && numericTextBox.value !== '') {
            element.value = formatNumber(numericTextBox.value);
        }
    }

    function patchNumericTextBox() {
        const numericTextBox = window.ej?.inputs?.NumericTextBox;
        if (!numericTextBox || numericTextBox.prototype.__vietnamCurrencyPatched) {
            return;
        }

        const originalAppendTo = numericTextBox.prototype.appendTo;
        numericTextBox.prototype.appendTo = function (selector) {
            normalizeMoneyNumericTextBox(this);
            const result = originalAppendTo.call(this, selector);
            attachLiveFormatting(this);
            return result;
        };

        numericTextBox.prototype.__vietnamCurrencyPatched = true;
    }

    function patchGrid() {
        const grid = window.ej?.grids?.Grid;
        if (!grid || grid.prototype.__vietnamMoneyFormatPatched) {
            return;
        }

        const originalAppendTo = grid.prototype.appendTo;
        grid.prototype.appendTo = function (selector) {
            if (Array.isArray(this.columns)) {
                this.columns.forEach(normalizeMoneyGridColumn);
            }

            return originalAppendTo.call(this, selector);
        };

        grid.prototype.__vietnamMoneyFormatPatched = true;
    }

    patchNumericTextBox();
    patchGrid();
    document.addEventListener('DOMContentLoaded', () => {
        patchNumericTextBox();
        patchGrid();
    }, { once: true });

    window.NumberFormatManager = {
        locale: VI_LOCALE,
        currency: DEFAULT_CURRENCY,
        moneyFormat: MONEY_FORMAT,
        formatToLocale: formatNumber,
        formatCurrencyToLocale: formatCurrency,
        formatEditableValue,
        normalizeNumberString,
        parseLocaleNumber
    };
})(window, document);
