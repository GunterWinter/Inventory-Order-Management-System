const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const managerPath = path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/axios-manager.js'
);

function loadManager() {
    let nextError;
    const axiosInstance = config => {
        axiosInstance.lastConfig = config;
        if (nextError) {
            const error = nextError;
            nextError = null;
            return Promise.reject(error);
        }
        return Promise.resolve({ data: {} });
    };
    axiosInstance.interceptors = {
        request: { use() { } },
        response: { use() { } }
    };
    const context = {
        axios: {
            create: () => axiosInstance,
            post: async () => ({ data: { code: 200 } })
        },
        StorageManager: {
            getAccessToken: () => null,
            getRefreshToken: () => null
        },
        window: {},
        console,
        setTimeout,
        clearTimeout,
        Date,
        atob: value => Buffer.from(value, 'base64').toString('binary')
    };
    vm.runInNewContext(`${fs.readFileSync(managerPath, 'utf8')}\n;globalThis.__manager = AxiosManager;`, context);
    return { manager: context.__manager, failWith: error => { nextError = error; } };
}

test('AxiosManager extracts nested exception messages and removes the technical prefix', () => {
    const { manager } = loadManager();
    assert.equal(
        manager.getErrorMessage({ response: { data: { message: 'Exception: Hàng hóa đang có tồn kho.' } } }),
        'Hàng hóa đang có tồn kho.'
    );
    assert.equal(
        manager.getErrorMessage({ response: { data: { content: { message: 'Serial không thuộc kho.' } } } }),
        'Serial không thuộc kho.'
    );
});

test('AxiosManager flattens validation errors instead of returning a generic retry message', () => {
    const { manager } = loadManager();
    assert.equal(
        manager.getErrorMessage({ response: { data: { errors: { Name: ['Tên là bắt buộc.'], Quantity: ['Số lượng phải lớn hơn 0.'] } } } }),
        'Tên là bắt buộc.\nSố lượng phải lớn hơn 0.'
    );
});

test('AxiosManager enriches plain-string and network errors for existing page catches', async () => {
    const loaded = loadManager();
    const plainStringError = { response: { status: 409, data: 'Hàng hóa đang được sử dụng.' } };
    loaded.failWith(plainStringError);
    await assert.rejects(
        loaded.manager.post('/Product/DeleteProduct', { id: 'x' }, { skipGlobalError: true }),
        error => error.response.data.message === 'Hàng hóa đang được sử dụng.'
    );

    const network = new Error('Network Error');
    loaded.failWith(network);
    await assert.rejects(
        loaded.manager.post('/Product/DeleteProduct', { id: 'x' }, { skipGlobalError: true }),
        error => {
            assert.equal(error.userMessage, 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng rồi thử lại.');
            return true;
        }
    );
});
