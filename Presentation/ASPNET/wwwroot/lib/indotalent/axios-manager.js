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

    const request = async (method, url, data = {}, customHeaders = {}, responseType = 'json') => {
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
            throw error;
        }
    };

    return {
        request,
        get: (url, config = {}) => request('get', url, {}, config.headers, config.responseType),
        post: (url, data, config = {}) => request('post', url, data, config.headers, config.responseType),
        put: (url, data, config = {}) => request('put', url, data, config.headers, config.responseType),
        delete: (url, config = {}) => request('delete', url, {}, config.headers, config.responseType),
    };
})();
