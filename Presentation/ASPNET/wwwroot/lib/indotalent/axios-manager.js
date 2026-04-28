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

    axiosInstance.interceptors.request.use(
        (config) => {
            const token = StorageManager.getAccessToken(); 
            if (token) {
                config.headers['Authorization'] = `Bearer ${token}`;
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
            const originalRequest = error.config;
            if (error.response && error.response.status === 498) {
                if (!isRefreshing) {
                    isRefreshing = true;

                    try {
                        const refreshToken = StorageManager.getRefreshToken();
                        const response = await axiosInstance.post('/Security/RefreshToken', { refreshToken });

                        if (response?.data?.code === 200) {
                            StorageManager.saveLoginResult(response?.data);
                            isRefreshing = false;
                            retryQueue.forEach((cb) => cb());
                            retryQueue = [];
                            return axiosInstance(originalRequest);
                        } else {
                            throw new Error('Refresh token failed');
                        }
                    } catch (refreshError) {
                        retryQueue.forEach((cb) => cb());
                        retryQueue = [];
                        isRefreshing = false;
                        throw refreshError;
                    }
                }

                return new Promise((resolve, reject) => {
                    retryQueue.push(() => {
                        resolve(axiosInstance(originalRequest));
                    });
                });
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
