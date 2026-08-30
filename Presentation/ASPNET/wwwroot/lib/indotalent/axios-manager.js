const AxiosManager = (() => {
    const axiosInstance = axios.create({
        baseURL: '/api',
        headers: {
            'accept': 'application/json',
            'Content-Type': 'application/json',
        }
    });

    let isRefreshing = false;
    let retryQueue = [];
    const NUMERIC_REQUEST_KEY_PATTERN = /(price|amount|cost|profit|cogs|subtotal|total|quantity|qty|movement|percentage|rate)$/i;
    let lastGlobalErrorKey = '';
    let lastGlobalErrorAt = 0;

    const cleanErrorText = (value) => {
        if (value == null) return '';
        const text = String(value).replace(/^Exception:\s*/i, '').trim();
        return text
            && !/^Request failed with status code\s+\d+$/i.test(text)
            && !/^(Network Error|Failed to fetch)$/i.test(text)
            ? text
            : '';
    };

    const flattenErrorMessages = (value) => {
        if (Array.isArray(value)) {
            return value.flatMap(item => flattenErrorMessages(item)).filter(Boolean);
        }
        if (value && typeof value === 'object') {
            if (value.message || value.Message || value.error) {
                return flattenErrorMessages(value.message ?? value.Message ?? value.error);
            }
            return Object.values(value).flatMap(item => flattenErrorMessages(item)).filter(Boolean);
        }
        const text = cleanErrorText(value);
        return text ? [text] : [];
    };

    const getErrorMessage = (error, fallback = 'Không thể hoàn thành thao tác.') => {
        const data = error?.response?.data;
        const candidates = [
            data?.message,
            data?.Message,
            data?.content?.message,
            data?.content?.Message,
            data?.detail,
            data?.title,
            data?.error?.message,
            typeof data === 'string' ? data : null,
            error?.userMessage,
            error?.message
        ];
        for (const candidate of candidates) {
            const message = cleanErrorText(candidate);
            if (message) return message;
        }

        const validationMessages = flattenErrorMessages(data?.errors ?? data?.Errors);
        if (validationMessages.length) return [...new Set(validationMessages)].join('\n');

        const status = error?.response?.status;
        if (status === 401 || status === 498) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
        if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.';
        if (status === 404) return 'Không tìm thấy dữ liệu cần xử lý.';
        if (status === 409) return 'Dữ liệu đã thay đổi hoặc đang được sử dụng bởi nghiệp vụ khác.';
        if (!error?.response) return 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng rồi thử lại.';
        return fallback;
    };

    const showGlobalErrorIfUnhandled = (error, config, message) => {
        if (config?.skipGlobalError || isAuthEndpoint(config?.url)) return;
        setTimeout(() => {
            if (error?.uiErrorHandled || typeof Swal === 'undefined' || typeof Swal.fire !== 'function') return;
            if (typeof document !== 'undefined' && document.querySelector('.swal2-container.swal2-shown')) return;
            const key = `${String(config?.method || '').toUpperCase()} ${config?.url || ''} ${message}`;
            if (key === lastGlobalErrorKey && Date.now() - lastGlobalErrorAt < 1000) return;
            lastGlobalErrorKey = key;
            lastGlobalErrorAt = Date.now();
            error.uiErrorHandled = true;
            Swal.fire({
                icon: 'error',
                title: 'Không thể thực hiện thao tác',
                text: message,
                confirmButtonText: 'Đồng ý',
                heightAuto: false
            });
        }, 0);
    };

    const enrichError = (error, config) => {
        const message = getErrorMessage(error);
        error.userMessage = message;
        error.message = message;
        if (!error.response) {
            error.response = { status: 0, data: { message }, config };
        } else if (error.response.data == null) {
            error.response.data = { message };
        } else if (typeof error.response.data === 'string') {
            error.response.data = { message: cleanErrorText(error.response.data) || message };
        } else if (typeof error.response.data === 'object') {
            const existing = getErrorMessage(error, '');
            if (!error.response.data.message && existing) error.response.data.message = existing;
        }
        showGlobalErrorIfUnhandled(error, config, message);
        return error;
    };

    // Legacy grid handlers often await an API call without a local catch.
    // Surface those rejections globally so users see the normalized message.
    if (window.addEventListener && !window.__axiosManagerUnhandledRejectionHook) {
        window.__axiosManagerUnhandledRejectionHook = true;
        window.addEventListener('unhandledrejection', event => {
            const error = event?.reason;
            if (!error) return;
            showGlobalErrorIfUnhandled(error, error.config || {}, getErrorMessage(error));
        });
    }

    const formatDateOnly = (value) => {
        if (window.DateFormatManager?.formatForApiDate) {
            return window.DateFormatManager.formatForApiDate(value);
        }

        return [
            value.getFullYear(),
            `${value.getMonth() + 1}`.padStart(2, '0'),
            `${value.getDate()}`.padStart(2, '0')
        ].join('-');
    };

    const normalizeRequestData = (value, key = '') => {
        if (value instanceof Date) {
            return Number.isNaN(value.getTime()) ? null : formatDateOnly(value);
        }

        if (typeof value === 'string' && NUMERIC_REQUEST_KEY_PATTERN.test(key)) {
            const parsedValue = window.NumberFormatManager?.parseLocaleNumber?.(value);
            if (parsedValue != null) {
                return parsedValue;
            }

            return value.trim() === '' ? null : value;
        }

        if (!value || typeof value !== 'object') {
            return value;
        }

        if (
            (typeof FormData !== 'undefined' && value instanceof FormData) ||
            (typeof Blob !== 'undefined' && value instanceof Blob) ||
            (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) ||
            (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams)
        ) {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map((item) => normalizeRequestData(item, key));
        }

        return Object.fromEntries(
            Object.entries(value).map(([itemKey, item]) => [itemKey, normalizeRequestData(item, itemKey)])
        );
    };

    const isAuthEndpoint = (url) => /\/security\/(login|refreshtoken)\b/i.test(String(url || ''));
    const decodeExpiry = (token) => {
        try {
            const payload = String(token || '').split('.')[1];
            if (!payload) return 0;
            const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
            return Number(JSON.parse(atob(normalized.padEnd(normalized.length + (4 - normalized.length % 4) % 4, '='))).exp || 0);
        } catch (_) { return 0; }
    };

    const refreshAccessToken = async () => {
        if (isRefreshing) {
            return new Promise((resolve, reject) => retryQueue.push({ resolve, reject }));
        }
        isRefreshing = true;
        try {
            const refreshToken = StorageManager.getRefreshToken?.();
            if (!refreshToken) throw new Error('Refresh token unavailable');
            // Use the raw axios client to avoid recursively invoking auth interceptors.
            const response = await axios.post('/api/Security/RefreshToken', { refreshToken });
            if (response?.data?.code !== 200) throw new Error('Refresh token failed');
            StorageManager.saveLoginResult(response.data);
            retryQueue.splice(0).forEach(item => item.resolve(response.data));
            return response.data;
        } catch (error) {
            retryQueue.splice(0).forEach(item => item.reject(error));
            StorageManager.removeAccessToken?.();
            StorageManager.removeRefreshToken?.();
            console.error('Token refresh failed', error);
            throw error;
        } finally {
            isRefreshing = false;
        }
    };

    axiosInstance.interceptors.request.use(
        async (config) => {
            const token = StorageManager.getAccessToken(); 
            if (token && !isAuthEndpoint(config.url) && decodeExpiry(token) * 1000 - Date.now() <= 5 * 60 * 1000) {
                try {
                    await refreshAccessToken();
                } catch (_) {
                    // Let the request proceed with the existing token; response interceptor handles 401/498.
                }
            }
            const currentToken = StorageManager.getAccessToken();
            if (currentToken) {
                config.headers['Authorization'] = `Bearer ${currentToken}`;
            }
            return config;
        },
        (error) => {
            return Promise.reject(error);
        }
    );

    axiosInstance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const originalRequest = error.config || {};
            const endpoint = String(originalRequest.url || '').toLowerCase();
            const tokenExpired = error.response && (error.response.status === 498 || error.response.status === 401);
            if (tokenExpired && !originalRequest._retry && !isAuthEndpoint(endpoint)) {
                originalRequest._retry = true;
                await refreshAccessToken();
                return axiosInstance(originalRequest);
            }

            return Promise.reject(error);
        }
    );

    const request = async (method, url, data = {}, customHeaders = {}, responseType = 'json', requestOptions = {}) => {
        try {
            const response = await axiosInstance({
                method,
                url,
                data: normalizeRequestData(data),
                headers: {
                    ...customHeaders,
                },
                responseType,
            });
            return response;
        } catch (error) {
            throw enrichError(error, { method, url, ...requestOptions });
        }
    };

    return {
        request,
        get: (url, config = {}) => request('get', url, {}, config.headers, config.responseType, config),
        post: (url, data, config = {}) => request('post', url, data, config.headers, config.responseType, config),
        put: (url, data, config = {}) => request('put', url, data, config.headers, config.responseType, config),
        delete: (url, config = {}) => request('delete', url, {}, config.headers, config.responseType, config),
        getErrorMessage,
        showError: (error, fallback) => {
            const message = getErrorMessage(error, fallback);
            if (typeof Swal !== 'undefined' && typeof Swal.fire === 'function') {
                error.uiErrorHandled = true;
                return Swal.fire({
                    icon: 'error',
                    title: 'Không thể thực hiện thao tác',
                    text: message,
                    confirmButtonText: 'Đồng ý',
                    heightAuto: false
                });
            }
            return Promise.resolve();
        },
    };
})();
