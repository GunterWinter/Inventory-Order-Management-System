(function (window, document) {
    const VI_LOCALE = 'vi-VN';
    const DEFAULT_CURRENCY = 'VND';
    const GROUP_SEPARATOR = '.';
    const DECIMAL_SEPARATOR = ',';
    const MAX_FRACTION_DIGITS = 6;
    const MONEY_MIN_FRACTION_DIGITS = 0;
    const MONEY_FORMAT = 'N2';
    const MONEY_FIELD_PATTERN = /(price|amount|balance|debit|credit|receipt|expense|revenue|debt|paid|payment|cost|profit|cogs|subtotal|total|sales)/i;
    const QUANTITY_FIELD_PATTERN = /(quantity|qty|stock|movement)/i;
    const DECIMAL_FIELD_PATTERN = /(quantity|qty|stock|movement|price|amount|cost|profit|cogs|subtotal|total|rate|percentage)/i;
    const INTEGER_FIELD_PATTERN = /(month|warranty|year|page|sequence|serial)/i;
    const numericInputHandlers = new WeakMap();

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

    function formatMoney(value) {
        return formatNumber(value, MONEY_MIN_FRACTION_DIGITS, MAX_FRACTION_DIGITS);
    }

    function formatCurrency(value, minimumFractionDigits = MONEY_MIN_FRACTION_DIGITS, maximumFractionDigits = MAX_FRACTION_DIGITS) {
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
        const text = `${value ?? ''}`;
        return MONEY_FIELD_PATTERN.test(text) && !QUANTITY_FIELD_PATTERN.test(text);
    }

    function isMoneyNumericTextBox(numericTextBox) {
        return isMoneyText([
            numericTextBox?.placeholder,
            numericTextBox?.element?.id,
            numericTextBox?.element?.name,
            numericTextBox?.htmlAttributes?.name,
            numericTextBox?.htmlAttributes?.id
        ].filter(Boolean).join(' '));
    }

    function normalizeDecimalNumericTextBox(numericTextBox) {
        const identity = [
            numericTextBox?.placeholder,
            numericTextBox?.element?.id,
            numericTextBox?.element?.name,
            numericTextBox?.htmlAttributes?.name,
            numericTextBox?.htmlAttributes?.id
        ].filter(Boolean).join(' ');
        if (!DECIMAL_FIELD_PATTERN.test(identity) || INTEGER_FIELD_PATTERN.test(identity)) return;

        numericTextBox.format = 'n6';
        numericTextBox.decimals = MAX_FRACTION_DIGITS;
        numericTextBox.validateDecimalOnType = false;
    }

    function normalizeMoneyGridColumn(column) {
        if (!column) {
            return;
        }

        if (Array.isArray(column.columns)) {
            column.columns.forEach(normalizeMoneyGridColumn);
        }

        const columnText = getColumnText(column);
        const moneyColumn = isMoneyText(columnText);
        const format = `${column.format ?? ''}`.toLowerCase();
        if ((format === 'n0' || format === 'n2') && moneyColumn) {
            column.format = MONEY_FORMAT;
        }

        if (!column.valueAccessor && DECIMAL_FIELD_PATTERN.test(columnText) && !INTEGER_FIELD_PATTERN.test(columnText)) {
            column.valueAccessor = (field, data) => data?.[field] == null
                ? ''
                : (moneyColumn ? formatMoney(data[field]) : formatNumber(data[field]));
            column.format = undefined;
        }
    }

    function splitEditableNumber(value) {
        const rawValue = `${value ?? ''}`.trim();
        const sign = rawValue.startsWith('-') ? '-' : '';
        const unsignedValue = sign ? rawValue.slice(1) : rawValue;
        const lastCommaIndex = unsignedValue.lastIndexOf(',');

        let integerPart = unsignedValue;
        let fractionPart = '';
        const hasDecimalSeparator = lastCommaIndex >= 0;

        if (hasDecimalSeparator) {
            integerPart = unsignedValue.slice(0, lastCommaIndex);
            fractionPart = unsignedValue.slice(lastCommaIndex + 1)
                .replace(/\D/g, '')
                .slice(0, MAX_FRACTION_DIGITS);
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
        const fractionSection = parts.hasDecimalSeparator ? `.${parts.fractionPart}` : '';

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

        const value = numericTextBox.value ?? parseLocaleNumber(element.value);
        element.value = value == null
            ? ''
            : (element.dataset.moneyFormat === 'true' ? formatMoney(value) : formatNumber(value));
    }

    function countDigitsBeforeCaret(value, caretPosition) {
        return `${value ?? ''}`.slice(0, Math.max(0, caretPosition ?? 0)).replace(/\D/g, '').length;
    }

    function resolveCaretPosition(formattedValue, digitOffset) {
        if (digitOffset <= 0) {
            return formattedValue.startsWith('-') ? 1 : 0;
        }

        let digitsSeen = 0;
        for (let index = 0; index < formattedValue.length; index += 1) {
            if (/\d/.test(formattedValue[index])) {
                digitsSeen += 1;
            }

            if (digitsSeen >= digitOffset) {
                return index + 1;
            }
        }

        return formattedValue.length;
    }

    function restoreCaret(element, digitOffset, afterDecimalSeparator = false) {
        let caretPosition = resolveCaretPosition(element.value, digitOffset);
        if (afterDecimalSeparator) {
            const decimalIndex = element.value.lastIndexOf(DECIMAL_SEPARATOR);
            if (decimalIndex >= 0) caretPosition = decimalIndex + 1;
        }
        try {
            element.setSelectionRange(caretPosition, caretPosition);
        } catch (error) {
        }
    }

    function normalizeElementForComponent(element) {
        const editableValue = element.value;
        const selectionStart = element.selectionStart ?? editableValue.length;
        const selectionEnd = element.selectionEnd ?? selectionStart;
        const startDigitOffset = countDigitsBeforeCaret(editableValue, selectionStart);
        const endDigitOffset = countDigitsBeforeCaret(editableValue, selectionEnd);
        const normalizedValue = normalizeNumberString(editableValue);
        const signOffset = normalizedValue.startsWith('-') ? 1 : 0;
        element.value = normalizedValue;

        try {
            element.setSelectionRange(
                Math.min(normalizedValue.length, startDigitOffset + signOffset),
                Math.min(normalizedValue.length, endDigitOffset + signOffset));
        } catch (error) {
        }

        return {
            editableValue,
            digitOffset: endDigitOffset
        };
    }

    function attachLiveFormatting(numericTextBox) {
        if (!numericTextBox?.element || numericTextBox.element.dataset.liveFormatted === 'true') {
            return;
        }

        const element = numericTextBox.element;
        let isComposing = false;
        let inputRevision = 0;
        let componentValuePrepared = false;
        let preparedBlurValue = null;

        const prepareInputForComponent = () => {
            if (isComposing || numericTextBox.readonly || numericTextBox.enabled === false) {
                return;
            }

            const editableValue = element.value;
            const selectionStart = element.selectionStart ?? editableValue.length;
            const digitOffset = countDigitsBeforeCaret(editableValue, selectionStart);
            const afterDecimalSeparator = editableValue.slice(0, selectionStart).endsWith(DECIMAL_SEPARATOR);
            const normalizedValue = normalizeNumberString(editableValue);
            const parsedValue = parseLocaleNumber(editableValue);
            const revision = ++inputRevision;

            // Syncfusion must parse an ungrouped value. Reapply the grouped
            // presentation only after all component input handlers have run.
            element.value = normalizedValue;
            componentValuePrepared = true;
            const applyFormattedDisplay = () => {
                if (revision !== inputRevision || document.activeElement !== element) {
                    return;
                }

                if (typeof numericTextBox.setProperties === 'function') {
                    numericTextBox.setProperties({ value: parsedValue }, true);
                }
                element.value = formatEditableValue(editableValue);
                restoreCaret(element, digitOffset, afterDecimalSeparator);
            };

            queueMicrotask(applyFormattedDisplay);
            requestAnimationFrame(applyFormattedDisplay);
        };

        const prepareBlurForComponent = () => {
            const parsedValue = parseLocaleNumber(element.value);
            preparedBlurValue = parsedValue;
            element.value = parsedValue == null ? '' : `${parsedValue}`;
            componentValuePrepared = true;
            setTimeout(() => syncNumericDisplay(numericTextBox), 0);
        };

        element.addEventListener('compositionstart', () => {
            isComposing = true;
        });

        element.addEventListener('compositionend', () => {
            isComposing = false;
            prepareInputForComponent();
        });

        numericInputHandlers.set(element, {
            prepareInputForComponent,
            prepareBlurForComponent,
            getPreparedBlurValue: () => preparedBlurValue,
            consumePreparedValue: () => {
                const prepared = componentValuePrepared;
                componentValuePrepared = false;
                return prepared;
            }
        });
        element.dataset.liveFormatted = 'true';

        if (numericTextBox.value != null && numericTextBox.value !== '') {
            syncNumericDisplay(numericTextBox);
        }
    }

    function patchNumericTextBox() {
        const numericTextBox = window.ej?.inputs?.NumericTextBox;
        if (!numericTextBox || numericTextBox.prototype.__vietnamCurrencyPatched) {
            return;
        }

        const normalizeBeforeComponentHandler = handlerName => {
            const originalHandler = numericTextBox.prototype[handlerName];
            if (typeof originalHandler !== 'function') {
                return;
            }

            numericTextBox.prototype[handlerName] = function (event) {
                if (!this.element || this.element.dataset.liveFormatted !== 'true') {
                    return originalHandler.call(this, event);
                }

                if (handlerName === 'keyPressHandler'
                    && Number(this.decimals ?? 0) > 0
                    && ((event?.key === DECIMAL_SEPARATOR || event?.key === '.')
                        && !splitEditableNumber(this.element.value).hasDecimalSeparator
                        || /^\d$/.test(event?.key ?? '')
                        && splitEditableNumber(this.element.value).hasDecimalSeparator)) {
                    return;
                }

                if (handlerName !== 'keyPressHandler'
                    && !numericInputHandlers.get(this.element)?.consumePreparedValue()) {
                    normalizeElementForComponent(this.element);
                }
                return originalHandler.call(this, event);
            };
        };

        ['keyPressHandler', 'inputHandler']
            .forEach(normalizeBeforeComponentHandler);

        const originalChangeHandler = numericTextBox.prototype.changeHandler;
        if (originalChangeHandler) {
            numericTextBox.prototype.changeHandler = function (event) {
                const preparedValue = this.element?.dataset.liveFormatted === 'true' ? this.value : null;
                const result = originalChangeHandler.call(this, event);
                if (preparedValue != null && this.value !== preparedValue) {
                    this.setProperties({ value: preparedValue }, true);
                    if (typeof this.change === 'function') this.change({ value: preparedValue });
                }
                return result;
            };
        }

        const originalAppendTo = numericTextBox.prototype.appendTo;
        numericTextBox.prototype.appendTo = function (selector) {
            const moneyInput = isMoneyNumericTextBox(this);
            normalizeDecimalNumericTextBox(this);
            const result = originalAppendTo.call(this, selector);
            if (moneyInput && this.element) this.element.dataset.moneyFormat = 'true';
            attachLiveFormatting(this);
            return result;
        };

        const originalFocusIn = numericTextBox.prototype.focusHandler;
        if (originalFocusIn) {
            numericTextBox.prototype.focusHandler = function (e) {
                originalFocusIn.call(this, e);
                if (this.element && this.element.dataset.liveFormatted === 'true') {
                    syncNumericDisplay(this);
                }
            };
        }

        const originalFocusOut = numericTextBox.prototype.focusOutHandler;
        if (originalFocusOut) {
            numericTextBox.prototype.focusOutHandler = function (e) {
                const preparedValue = this.value
                    ?? numericInputHandlers.get(this.element)?.getPreparedBlurValue()
                    ?? parseLocaleNumber(this.element?.value);
                originalFocusOut.call(this, e);
                if (this.element && this.element.dataset.liveFormatted === 'true') {
                    if (preparedValue != null && this.value !== preparedValue) {
                        this.setProperties({ value: preparedValue }, true);
                        if (typeof this.change === 'function') this.change({ value: preparedValue });
                    }
                    setTimeout(() => syncNumericDisplay(this), 0);
                }
            };
        }

        numericTextBox.prototype.__vietnamCurrencyPatched = true;
    }

    function formatPlainNumericInput(element) {
        if (!element || element.disabled || element.readOnly) {
            return;
        }

        const editableValue = element.value;
        const digitOffset = countDigitsBeforeCaret(editableValue, element.selectionStart ?? editableValue.length);
        element.value = formatEditableValue(editableValue);
        restoreCaret(element, digitOffset);
    }

    function bindNumericInput(element) {
        if (!element) {
            return null;
        }

        element.dataset.numberFormat = 'true';
        element.setAttribute('inputmode', 'numeric');
        formatPlainNumericInput(element);
        return element;
    }

    document.addEventListener('input', event => {
        const element = event.target;
        const numericHandlers = element instanceof HTMLInputElement
            ? numericInputHandlers.get(element)
            : null;
        if (numericHandlers) {
            numericHandlers.prepareInputForComponent();
            return;
        }

        if (element instanceof HTMLInputElement && element.dataset.numberFormat === 'true') {
            formatPlainNumericInput(element);
        }
    }, true);

    document.addEventListener('keydown', event => {
        const element = event.target;
        if (!(element instanceof HTMLInputElement) || !numericInputHandlers.has(element)) {
            return;
        }

        const hasDecimalSeparator = splitEditableNumber(element.value).hasDecimalSeparator;
        if (event.key === DECIMAL_SEPARATOR
            && Number(element.ej2_instances?.[0]?.decimals ?? 0) > 0
            && !hasDecimalSeparator) {
            normalizeElementForComponent(element);
            element.setRangeText(
                DECIMAL_SEPARATOR,
                element.selectionStart ?? element.value.length,
                element.selectionEnd ?? element.value.length,
                'end');
            event.preventDefault();
            event.stopImmediatePropagation();
            numericInputHandlers.get(element)?.prepareInputForComponent();
            return;
        }

        if (hasDecimalSeparator) return;
        normalizeElementForComponent(element);
    }, true);

    document.addEventListener('blur', event => {
        const element = event.target;
        const numericHandlers = element instanceof HTMLInputElement
            ? numericInputHandlers.get(element)
            : null;
        if (numericHandlers) {
            numericHandlers.prepareBlurForComponent();
            return;
        }

        if (element instanceof HTMLInputElement && element.dataset.numberFormat === 'true') {
            formatPlainNumericInput(element);
        }
    }, true);

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
        formatMoneyToLocale: formatMoney,
        formatCurrencyToLocale: formatCurrency,
        formatEditableValue,
        normalizeNumberString,
        parseLocaleNumber,
        bindNumericInput,
        refreshNumericTextBox: syncNumericDisplay
    };
})(window, document);
