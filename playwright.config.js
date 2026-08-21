const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './Tests/Browser',
    fullyParallel: false,
    workers: 1,
    timeout: 90_000,
    expect: { timeout: 10_000 },
    reporter: [['list']],
    outputDir: 'artifacts/playwright',
    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:5000',
        channel: 'msedge',
        headless: true,
        viewport: { width: 1500, height: 900 },
        actionTimeout: 12_000,
        navigationTimeout: 25_000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure'
    }
});
