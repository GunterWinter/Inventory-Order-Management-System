(function (window) {
    const VI_LOCALE = 'vi-VN';
    const ISO_DATE_LOCALE = 'en-CA';
    const VI_TIME_ZONE = 'Asia/Ho_Chi_Minh';

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
            format: 'yyyy-MM-dd',
            locale: 'en-US',
            strictMode: true,
            ...options
        };
    }

    function formatDate(value) {
        const localDate = buildVietnamDisplayDate(value);
        if (!localDate) {
            return '';
        }

        return new Intl.DateTimeFormat(ISO_DATE_LOCALE, {
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

    window.DateFormatManager = {
        locale: VI_LOCALE,
        timeZone: VI_TIME_ZONE,
        parseServerDate: buildVietnamDisplayDate,
        parseBusinessDate,
        formatForApiDate,
        datePickerOptions,
        syncfusionDateLocale: 'en-US',
        formatToLocale: formatDate,
        formatDateTimeToLocale: formatDateTime
    };
})(window);
