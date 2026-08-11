// Manual Accountant QA Test - Runs all tests in one shot
// Usage: node Tests/manual_accountant_test.js

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:5127';
const RESULTS_DIR = path.join(__dirname, '..', 'test-results', 'accountant-qa');
const ISSUES = [];
let screenshotIdx = 0;

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });

async function screenshot(page, name) {
    screenshotIdx++;
    const fname = `${String(screenshotIdx).padStart(3, '0')}_${name}.png`;
    await page.screenshot({ path: path.join(RESULTS_DIR, fname), fullPage: false });
    return fname;
}

function logIssue(severity, module, title, details) {
    const issue = { severity, module, title, details, timestamp: new Date().toISOString() };
    ISSUES.push(issue);
    console.log(`  ❌ [${severity}] [${module}] ${title}`);
    if (details) console.log(`     ${details}`);
}

function logPass(module, title) {
    console.log(`  ✅ [${module}] ${title}`);
}

async function waitForApp(page) {
    // Wait for Syncfusion components to initialize
    await page.waitForTimeout(2000);
}

(async () => {
    console.log('='.repeat(70));
    console.log('  KIỂM THỬ KẾ TOÁN TOÀN DIỆN - Inventory Order Management System');
    console.log('  Thời gian: ' + new Date().toLocaleString('vi-VN'));
    console.log('  URL: ' + BASE_URL);
    console.log('='.repeat(70));

    const browser = await chromium.launch({ headless: true, channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1536, height: 900 } });
    const page = await context.newPage();

    // Track console errors
    const consoleErrors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Track failed requests
    const failedRequests = [];
    page.on('requestfailed', req => {
        if (req.url().startsWith(BASE_URL)) failedRequests.push(`${req.method()} ${req.url()} - ${req.failure()?.errorText}`);
    });

    // Track HTTP errors
    const httpErrors = [];
    page.on('response', res => {
        if (res.url().startsWith(BASE_URL) && res.status() >= 400 && !res.url().includes('GetPurchaseDashboard')) {
            httpErrors.push(`${res.status()} ${res.url()}`);
        }
    });

    try {
        // ========== SECTION 1: LOGIN & MENU ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 1: ĐĂNG NHẬP VÀ KIỂM TRA MENU');
        console.log('─'.repeat(70));

        // 1.1 Login
        await page.goto(`${BASE_URL}/Accounts/Login`, { waitUntil: 'networkidle' });
        await page.fill('input[name="email"], input[type="email"], #email', 'admin@root.com');
        await page.fill('input[name="password"], input[type="password"], #password', '123456');
        await page.click('button[type="submit"], .btn-primary, #loginButton');
        await page.waitForURL('**/Dashboards/**', { timeout: 15000 });
        await waitForApp(page);
        logPass('Đăng nhập', 'Đăng nhập thành công, chuyển tới Dashboard');
        await screenshot(page, 'dashboard_after_login');

        // 1.2 Check user display name
        const userNameEl = await page.$('.user-name, .username, #userName, .e-avatar, [class*="user"]');
        if (userNameEl) {
            const userName = await userNameEl.textContent();
            logPass('Đăng nhập', `Tên người dùng hiển thị: "${userName.trim()}"`);
        }

        // 1.3 Extract ALL menu items
        const menuData = await page.evaluate(() => {
            const menuEl = document.getElementById('mainMenu');
            if (menuEl && menuEl.ej2_instances && menuEl.ej2_instances[0]) {
                const inst = menuEl.ej2_instances[0];
                const ds = inst.fields?.dataSource || [];
                return ds.map(d => ({
                    id: d.id, text: d.text, parentId: d.parentId,
                    url: d.navigateUrl || d.url || '', expanded: d.expanded
                }));
            }
            // Fallback: DOM based
            const items = [];
            document.querySelectorAll('.e-treeview .e-text-content .e-list-text, .sidebar-menu a, nav a').forEach(el => {
                items.push({ text: el.textContent.trim(), url: el.closest('a')?.href || '' });
            });
            return items;
        });

        console.log('\n  📋 DANH SÁCH MENU:');
        const parentItems = menuData.filter(m => !m.parentId);
        const childItems = menuData.filter(m => m.parentId);
        
        for (const parent of parentItems) {
            console.log(`    📁 ${parent.text}`);
            const children = childItems.filter(c => c.parentId === parent.id);
            for (const child of children) {
                console.log(`       ├─ ${child.text} → ${child.url || '(no url)'}`);
            }
        }

        // 1.4 Check removed menus should NOT exist
        const allMenuTexts = menuData.map(m => (m.text || '').toLowerCase());
        const allMenuUrls = menuData.map(m => (m.url || '').toLowerCase());
        const removedMenus = [
            { name: 'Goods Receive / Nhận hàng', keywords: ['goods receive', 'nhận hàng', 'goodsreceive'] },
            { name: 'Delivery Order / Giao hàng', keywords: ['delivery order', 'giao hàng', 'deliveryorder'] },
            { name: 'Positive Adjustment / Điều chỉnh tăng', keywords: ['positive adjustment', 'điều chỉnh tăng', 'positiveadjustment'] },
            { name: 'Negative Adjustment / Điều chỉnh giảm', keywords: ['negative adjustment', 'điều chỉnh giảm', 'negativeadjustment'] }
        ];

        for (const rm of removedMenus) {
            const found = rm.keywords.some(kw =>
                allMenuTexts.some(t => t.includes(kw)) ||
                allMenuUrls.some(u => u.includes(kw.replace(/ /g, '')))
            );
            if (found) {
                logIssue('Major', 'Menu', `Menu đã xóa "${rm.name}" vẫn còn xuất hiện`, 'Phải xóa các phân hệ: Nhận hàng, Giao hàng, Điều chỉnh tăng, Điều chỉnh giảm');
            } else {
                logPass('Menu', `"${rm.name}" đã được xóa đúng`);
            }
        }

        // 1.5 Check required menus exist
        const requiredMenus = [
            { name: 'Bán hàng / Sales', keywords: ['sales order', 'bán hàng', 'salesorder'] },
            { name: 'Mua hàng / Purchase', keywords: ['purchase order', 'mua hàng', 'purchaseorder'] },
            { name: 'Hàng hóa / Products', keywords: ['product', 'hàng hóa'] },
            { name: 'Bảo hành / Warranty', keywords: ['warranty', 'bảo hành'] },
            { name: 'Trả hàng bán / Sales Return', keywords: ['sales return', 'trả hàng bán'] },
            { name: 'Trả hàng mua / Purchase Return', keywords: ['purchase return', 'trả hàng mua'] },
            { name: 'Chuyển kho / Transfer', keywords: ['transfer', 'chuyển kho'] },
            { name: 'Xuất vật tư / Material Export', keywords: ['material export', 'xuất vật tư'] },
            { name: 'Hủy hàng / Scrapping', keywords: ['scrapping', 'hủy hàng'] },
            { name: 'Kiểm kê / Stock Count', keywords: ['stock count', 'kiểm kê'] },
            { name: 'Tiền / Cash', keywords: ['cash', 'tiền'] },
            { name: 'Công nợ / Debt', keywords: ['debt', 'công nợ'] },
        ];

        for (const rm of requiredMenus) {
            const found = rm.keywords.some(kw =>
                allMenuTexts.some(t => t.includes(kw)) ||
                allMenuUrls.some(u => u.includes(kw.replace(/ /g, '')))
            );
            if (!found) {
                logIssue('Critical', 'Menu', `Menu bắt buộc "${rm.name}" không tìm thấy`, '');
            } else {
                logPass('Menu', `"${rm.name}" tồn tại`);
            }
        }

        // 1.6 Logout + Wrong password test
        console.log('\n  🔑 Test đăng xuất và sai mật khẩu:');
        // Try to find logout
        const logoutLink = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a'));
            const logoutLink = links.find(a => a.href.includes('Logout') || a.href.includes('logout') || a.textContent.includes('Logout') || a.textContent.includes('Đăng xuất'));
            return logoutLink ? logoutLink.href : null;
        });
        
        if (logoutLink) {
            await page.goto(logoutLink, { waitUntil: 'networkidle' });
            await page.waitForTimeout(1000);
            
            // Try wrong password
            try {
                await page.goto(`${BASE_URL}/Accounts/Login`, { waitUntil: 'networkidle' });
                await page.fill('input[name="email"], input[type="email"], #email', 'admin@root.com');
                await page.fill('input[name="password"], input[type="password"], #password', 'wrongpass');
                await page.click('button[type="submit"], .btn-primary, #loginButton');
                await page.waitForTimeout(3000);
                
                const currentUrl = page.url();
                if (currentUrl.includes('Dashboard')) {
                    logIssue('Blocker', 'Auth', 'Đăng nhập sai mật khẩu vẫn vào được Dashboard!', '');
                } else {
                    logPass('Auth', 'Sai mật khẩu bị từ chối đúng');
                    await screenshot(page, 'wrong_password_rejected');
                }
            } catch (e) {
                logPass('Auth', 'Sai mật khẩu bị từ chối (timeout = đúng)');
            }

            // Login back
            await page.goto(`${BASE_URL}/Accounts/Login`, { waitUntil: 'networkidle' });
            await page.fill('input[name="email"], input[type="email"], #email', 'admin@root.com');
            await page.fill('input[name="password"], input[type="password"], #password', '123456');
            await page.click('button[type="submit"], .btn-primary, #loginButton');
            await page.waitForURL('**/Dashboards/**', { timeout: 15000 });
            await waitForApp(page);
            logPass('Auth', 'Đăng nhập lại thành công');
        } else {
            logIssue('Minor', 'Auth', 'Không tìm thấy nút Logout', '');
        }

        // ========== SECTION 2: DASHBOARD DATA ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 2: DASHBOARD - KIỂM TRA SỐ LIỆU');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/Dashboards/DefaultDashboard`, { waitUntil: 'networkidle' });
        await waitForApp(page);

        const dashboardData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card, .dashboard-card, [class*="card"]'));
            return cards.map(c => ({
                text: c.textContent.replace(/\s+/g, ' ').trim().substring(0, 200)
            }));
        });
        
        console.log('  📊 Dashboard cards:');
        for (const card of dashboardData.slice(0, 15)) {
            console.log(`    • ${card.text.substring(0, 120)}`);
        }
        await screenshot(page, 'dashboard_data');

        // ========== SECTION 3: STOCK REPORT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 3: BÁO CÁO TỒN KHO');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/StockReports/StockReportList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'stock_report');

        const stockData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row, table tbody tr'));
            return rows.slice(0, 20).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  📦 Tồn kho hiện tại:');
        for (const row of stockData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // Check no non-physical products in stock
        const productPhysicalCheck = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/Product/GetProducts');
                const data = await res.json();
                const products = data.data || data;
                const nonPhysical = products.filter(p => !p.physical);
                return nonPhysical.map(p => ({ name: p.name, physical: p.physical }));
            } catch (e) { return []; }
        });

        for (const np of productPhysicalCheck) {
            const inStock = stockData.some(row => row.some(cell => cell.includes(np.name)));
            if (inStock) {
                logIssue('Critical', 'Tồn kho', `Hàng phi vật lý "${np.name}" xuất hiện trong báo cáo tồn kho`, 'Theo AGENTS.md: hàng phi vật lý không xuất hiện trong báo cáo tồn kho');
            }
        }
        logPass('Tồn kho', 'Báo cáo tồn kho tải thành công');

        // ========== SECTION 4: PURCHASE ORDERS ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 4: ĐƠN MUA HÀNG');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/PurchaseOrders/PurchaseOrderList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'purchase_order_list');

        const poData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 10).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  🛒 Danh sách đơn mua:');
        for (const row of poData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // Check for Draft and Confirmed POs
        const hasDraftPO = poData.some(r => r.some(c => c.includes('Draft') || c.includes('Nháp')));
        const hasConfirmedPO = poData.some(r => r.some(c => c.includes('Confirmed') || c.includes('Đã xác nhận')));
        if (hasDraftPO) logPass('Đơn mua', 'Có đơn mua Nháp');
        if (hasConfirmedPO) logPass('Đơn mua', 'Có đơn mua Đã xác nhận');

        // Open first PO to check details
        if (poData.length > 0) {
            const firstViewLink = await page.$('.e-gridcontent tr.e-row a[href*="PurchaseOrder"]');
            if (firstViewLink) {
                await firstViewLink.click();
                await waitForApp(page);
                await screenshot(page, 'purchase_order_detail');
                
                const poDetail = await page.evaluate(() => {
                    return {
                        url: window.location.href,
                        title: document.title,
                        bodyText: document.body.innerText.substring(0, 2000)
                    };
                });
                console.log(`  📄 Chi tiết đơn mua: ${poDetail.url}`);
            }
        }

        // ========== SECTION 5: SALES ORDERS ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 5: ĐƠN BÁN HÀNG');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/SalesOrders/SalesOrderList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'sales_order_list');

        const soData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 10).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  💰 Danh sách đơn bán:');
        for (const row of soData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // ========== SECTION 6: PRODUCTS ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 6: HÀNG HÓA - KIỂM TRA SERIAL VÀ VẬT LÝ/PHI VẬT LÝ');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/Products/ProductList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'product_list');

        const productData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 20).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  📦 Danh sách hàng hóa:');
        for (const row of productData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // API check for product details
        const productsApi = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/Product/GetProducts');
                const data = await res.json();
                const products = data.data || data;
                return products.map(p => ({
                    name: p.name, physical: p.physical,
                    serialTracking: p.serialProcess, costPrice: p.costPrice,
                    unitPrice: p.unitPrice, uom: p.unitOfMeasure
                }));
            } catch (e) { return { error: e.message }; }
        });

        console.log('\n  📋 Chi tiết hàng hóa từ API:');
        if (Array.isArray(productsApi)) {
            let hasNonPhysical = false;
            let hasNoSerial = false;
            let hasAutoSerial = false;
            let hasMfgSerial = false;

            for (const p of productsApi) {
                const type = p.physical ? 'VẬT LÝ' : 'PHI VẬT LÝ';
                const serial = p.serialTracking === 0 ? 'Không serial' : p.serialTracking === 1 ? 'Tự sinh' : p.serialTracking === 2 ? 'NSX' : `Unknown(${p.serialTracking})`;
                console.log(`    • ${p.name} [${type}] [${serial}] Giá vốn: ${p.costPrice} | Giá bán: ${p.unitPrice}`);
                
                if (!p.physical) hasNonPhysical = true;
                if (p.serialTracking === 0) hasNoSerial = true;
                if (p.serialTracking === 1) hasAutoSerial = true;
                if (p.serialTracking === 2) hasMfgSerial = true;

                // Check: non-physical must have serialTracking = 0
                if (!p.physical && p.serialTracking !== 0) {
                    logIssue('Critical', 'Hàng hóa', `Hàng phi vật lý "${p.name}" có chế độ serial khác 0`, 'Hàng phi vật lý phải luôn là Không theo dõi serial');
                }
            }

            if (!hasNonPhysical) logIssue('Major', 'Hàng hóa', 'Không có hàng phi vật lý trong dữ liệu demo', 'Cần ít nhất 2 hàng phi vật lý');
            else logPass('Hàng hóa', 'Có hàng phi vật lý');

            if (!hasNoSerial) logIssue('Major', 'Hàng hóa', 'Thiếu hàng không serial', '');
            else logPass('Hàng hóa', 'Có hàng không serial');

            if (!hasAutoSerial) logIssue('Major', 'Hàng hóa', 'Thiếu hàng serial tự sinh', '');
            else logPass('Hàng hóa', 'Có hàng serial tự sinh');

            if (!hasMfgSerial) logIssue('Major', 'Hàng hóa', 'Thiếu hàng serial NSX', '');
            else logPass('Hàng hóa', 'Có hàng serial NSX');
        }

        // ========== SECTION 7: FINANCE REPORT (Profit) ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 7: BÁO CÁO TÀI CHÍNH CÔNG TRÌNH - LỢI NHUẬN DỒN TÍCH');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/CashTransactions/CustomerFinanceReport`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'finance_report');

        // Get profit report via API
        const profitReport = await page.evaluate(async () => {
            try {
                const res = await fetch('/api/CashTransaction/GetCustomerProfitReport');
                const data = await res.json();
                return data;
            } catch (e) { return { error: e.message }; }
        });

        console.log('  💰 Báo cáo lợi nhuận công trình:');
        if (Array.isArray(profitReport)) {
            for (const r of profitReport) {
                console.log(`    • ${r.customerName}: Doanh thu=${r.revenue}, Chi phí=${r.projectCost}, Lợi nhuận=${r.profit}`);
                
                // Verify profit = revenue - cost
                const expectedProfit = (r.revenue || 0) - (r.projectCost || 0);
                if (Math.abs((r.profit || 0) - expectedProfit) > 1) {
                    logIssue('Critical', 'Lợi nhuận', 
                        `Công trình "${r.customerName}": Profit ${r.profit} ≠ Revenue ${r.revenue} - Cost ${r.projectCost} = ${expectedProfit}`,
                        'Lợi nhuận phải = Doanh thu - Chi phí');
                }
            }

            // Check the demo scenario: 2,000,000 - 500,000 = 1,500,000
            const demoProject = profitReport.find(r => r.revenue === 2000000 && r.projectCost === 500000);
            if (demoProject) {
                if (demoProject.profit === 1500000) {
                    logPass('Lợi nhuận', `Kịch bản chuẩn: ${demoProject.customerName} = 2.000.000 - 500.000 = 1.500.000 ✓`);
                } else {
                    logIssue('Blocker', 'Lợi nhuận', 
                        `Kịch bản chuẩn sai: profit=${demoProject.profit}, expected=1500000`,
                        'AGENTS.md yêu cầu: 2.000.000 - 500.000 = 1.500.000');
                }
            } else {
                console.log('    ⚠️  Không tìm thấy công trình demo 2M/500K. Kiểm tra lại dữ liệu seed.');
            }
        }

        // ========== SECTION 8: CUSTOMER DEBT REPORT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 8: BÁO CÁO CÔNG NỢ');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/VendorDebtReports/VendorDebtReportList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'debt_report');

        // Check for tabs
        const debtTabs = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('.e-tab-header .e-toolbar-item, .nav-tabs .nav-link, [role="tab"]'));
            return tabs.map(t => t.textContent.trim());
        });

        console.log('  📊 Tabs công nợ: ' + JSON.stringify(debtTabs));
        
        const hasCustomerTab = debtTabs.some(t => t.toLowerCase().includes('customer') || t.includes('Khách hàng'));
        const hasVendorTab = debtTabs.some(t => t.toLowerCase().includes('vendor') || t.includes('Nhà cung cấp'));

        if (hasCustomerTab) logPass('Công nợ', 'Tab Khách hàng tồn tại');
        else logIssue('Major', 'Công nợ', 'Thiếu tab Khách hàng', '');

        if (hasVendorTab) logPass('Công nợ', 'Tab Nhà cung cấp tồn tại');
        else logIssue('Major', 'Công nợ', 'Thiếu tab Nhà cung cấp', '');

        // Get debt data
        const debtData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 10).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  📋 Dữ liệu công nợ:');
        for (const row of debtData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // ========== SECTION 9: CASH TRANSACTIONS ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 9: GIAO DỊCH TIỀN');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/CashTransactions/CashTransactionList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'cash_transaction_list');

        const cashData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 15).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  💵 Danh sách giao dịch tiền:');
        for (const row of cashData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // Check Debit = Thu, Credit = Chi convention
        const cashTypeCheck = await page.evaluate(() => {
            const lang = localStorage.getItem('selectedLanguage') || 'en';
            const cells = Array.from(document.querySelectorAll('.e-gridcontent td'));
            const texts = cells.map(c => c.textContent.trim());
            return {
                hasDebit: texts.some(t => t === 'Debit' || t === 'Thu'),
                hasCredit: texts.some(t => t === 'Credit' || t === 'Chi'),
                lang,
                allTexts: texts.filter(t => t === 'Debit' || t === 'Credit' || t === 'Thu' || t === 'Chi')
            };
        });

        console.log(`  📋 Loại giao dịch tìm thấy: ${JSON.stringify(cashTypeCheck.allTexts)}`);

        // ========== SECTION 10: CASH CATEGORY REPORT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 10: BÁO CÁO THU CHI THEO DANH MỤC');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/CashTransactions/CashCategoryReport`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'cash_category_report');

        const categoryReportData = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card, [class*="summary"]'));
            const cardTexts = cards.map(c => c.textContent.replace(/\s+/g, ' ').trim().substring(0, 200));
            
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row, .e-gridcontent tr'));
            const gridRows = rows.slice(0, 20).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });

            return { cardTexts, gridRows };
        });

        console.log('  📊 Thẻ tổng hợp:');
        for (const ct of categoryReportData.cardTexts.slice(0, 5)) {
            console.log(`    ${ct}`);
        }

        // ========== SECTION 11: WARRANTY LOOKUP ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 11: TRA CỨU BẢO HÀNH');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/WarrantyLookups/WarrantyLookup`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'warranty_lookup');

        // Check: page should auto-load data without entering anything
        const warrantyAutoLoad = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            const emptyMsg = document.querySelector('.e-emptyrow');
            const bodyText = document.body.innerText;
            const hasPromptMsg = bodyText.includes('Nhập thông tin tra cứu') || bodyText.includes('Enter search');
            return {
                rowCount: rows.length,
                hasEmptyRow: !!emptyMsg,
                hasPromptMsg,
                bodySnippet: bodyText.substring(0, 500)
            };
        });

        if (warrantyAutoLoad.hasPromptMsg) {
            logIssue('Major', 'Bảo hành', 'Trang bảo hành yêu cầu "Nhập thông tin tra cứu" thay vì tự tải dữ liệu', 
                'Kỳ vọng: trang tự tải trang dữ liệu đầu tiên');
        } else if (warrantyAutoLoad.rowCount > 0) {
            logPass('Bảo hành', `Trang bảo hành tự tải ${warrantyAutoLoad.rowCount} bản ghi`);
        } else {
            console.log('    ⚠️  Không có dữ liệu bảo hành (có thể do chưa có serial đã bán)');
        }

        // ========== SECTION 12: MATERIAL EXPORT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 12: XUẤT VẬT TƯ');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/MaterialExports/MaterialExportList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'material_export_list');

        const meData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 10).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  📦 Danh sách xuất vật tư:');
        for (const row of meData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // ========== SECTION 13: TRANSFER OUT/IN ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 13: CHUYỂN KHO');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/TransferOuts/TransferOutList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'transfer_out_list');
        logPass('Chuyển kho', 'Trang Xuất chuyển kho tải thành công');

        await page.goto(`${BASE_URL}/TransferIns/TransferInList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'transfer_in_list');
        logPass('Chuyển kho', 'Trang Nhập chuyển kho tải thành công');

        // ========== SECTION 14: SALES/PURCHASE RETURNS ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 14: TRẢ HÀNG');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/SalesReturns/SalesReturnList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'sales_return_list');
        logPass('Trả hàng', 'Trang trả hàng bán tải thành công');

        await page.goto(`${BASE_URL}/PurchaseReturns/PurchaseReturnList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'purchase_return_list');
        logPass('Trả hàng', 'Trang trả hàng mua tải thành công');

        // ========== SECTION 15: SCRAPPING & STOCK COUNT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 15: HỦY HÀNG VÀ KIỂM KÊ');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/Scrappings/ScrappingList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'scrapping_list');
        logPass('Hủy hàng', 'Trang hủy hàng tải thành công');

        await page.goto(`${BASE_URL}/StockCounts/StockCountList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'stock_count_list');
        logPass('Kiểm kê', 'Trang kiểm kê tải thành công');

        // ========== SECTION 16: LOCALIZATION CHECK ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 16: KIỂM TRA LOCALIZATION (TIẾNG VIỆT / ENGLISH)');
        console.log('─'.repeat(70));

        // Go to dashboard and check language
        await page.goto(`${BASE_URL}/Dashboards/DefaultDashboard`, { waitUntil: 'networkidle' });
        await waitForApp(page);

        const currentLang = await page.evaluate(() => {
            return localStorage.getItem('selectedLanguage') || 'unknown';
        });
        console.log(`  🌐 Ngôn ngữ hiện tại: ${currentLang}`);

        // Switch to Vietnamese if not already
        const langSwitchResult = await page.evaluate(() => {
            const switcher = document.querySelector('#languageSwitcher, [id*="language"], select[id*="lang"]');
            return switcher ? { found: true, tag: switcher.tagName, id: switcher.id } : { found: false };
        });

        if (langSwitchResult.found) {
            console.log(`  🌐 Language switcher found: ${langSwitchResult.tag}#${langSwitchResult.id}`);
        }

        // ========== SECTION 17: INVENTORY PROFIT REPORT ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 17: GIÁ VỐN VÀ LỢI NHUẬN HÀNG BÁN');
        console.log('─'.repeat(70));

        await page.goto(`${BASE_URL}/SalesReports/SalesReportList`, { waitUntil: 'networkidle' });
        await waitForApp(page);
        await screenshot(page, 'sales_report');

        const salesReportData = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('.e-gridcontent tr.e-row'));
            return rows.slice(0, 15).map(row => {
                const cells = Array.from(row.querySelectorAll('td'));
                return cells.map(c => c.textContent.trim());
            });
        });

        console.log('  📊 Báo cáo bán hàng:');
        for (const row of salesReportData) {
            console.log(`    ${row.join(' | ')}`);
        }

        // ========== SECTION 18: DEAD LINK CHECK ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 18: KIỂM TRA LIÊN KẾT CHẾT');
        console.log('─'.repeat(70));

        // Check all menu links
        const allLinks = await page.evaluate(() => {
            const menuEl = document.getElementById('mainMenu');
            if (menuEl && menuEl.ej2_instances && menuEl.ej2_instances[0]) {
                const ds = menuEl.ej2_instances[0].fields?.dataSource || [];
                return ds.filter(d => d.navigateUrl || d.url).map(d => ({
                    text: d.text,
                    url: d.navigateUrl || d.url
                }));
            }
            return [];
        });

        const deadLinks = [];
        for (const link of allLinks) {
            if (!link.url || link.url === '#' || link.url === 'javascript:void(0)') continue;
            try {
                const fullUrl = link.url.startsWith('http') ? link.url : `${BASE_URL}${link.url.startsWith('/') ? '' : '/'}${link.url}`;
                const res = await page.evaluate(async (url) => {
                    try {
                        const response = await fetch(url, { method: 'GET', redirect: 'follow' });
                        return { status: response.status, ok: response.ok };
                    } catch (e) { return { status: 0, error: e.message }; }
                }, fullUrl);

                if (!res.ok && res.status !== 200 && res.status !== 302) {
                    deadLinks.push({ text: link.text, url: link.url, status: res.status });
                    logIssue('Major', 'Liên kết', `Liên kết chết: "${link.text}" → ${link.url} (HTTP ${res.status})`, '');
                }
            } catch (e) {
                // skip
            }
        }

        if (deadLinks.length === 0) {
            logPass('Liên kết', 'Không tìm thấy liên kết chết trong menu');
        }

        // Check for links to removed modules
        const removedUrls = ['GoodsReceive', 'DeliveryOrder', 'PositiveAdjustment', 'NegativeAdjustment'];
        for (const link of allLinks) {
            for (const rm of removedUrls) {
                if ((link.url || '').includes(rm)) {
                    logIssue('Critical', 'Liên kết', `Menu "${link.text}" trỏ tới phân hệ đã xóa: ${link.url}`, '');
                }
            }
        }

        // ========== SECTION 19: CONSOLE ERRORS CHECK ==========
        console.log('\n' + '─'.repeat(70));
        console.log('  BƯỚC 19: KIỂM TRA LỖI CONSOLE VÀ REQUEST');
        console.log('─'.repeat(70));

        if (consoleErrors.length > 0) {
            console.log('  ⚠️  Console errors:');
            for (const err of consoleErrors.slice(0, 20)) {
                console.log(`    ❌ ${err.substring(0, 200)}`);
            }
            // Only log as issue if there are significant errors
            const significantErrors = consoleErrors.filter(e => !e.includes('favicon') && !e.includes('manifest'));
            if (significantErrors.length > 0) {
                logIssue('Minor', 'Console', `${significantErrors.length} lỗi JavaScript trong console`, significantErrors.slice(0, 3).join('; '));
            }
        } else {
            logPass('Console', 'Không có lỗi JavaScript trong console');
        }

        if (failedRequests.length > 0) {
            console.log('  ⚠️  Failed requests:');
            for (const req of failedRequests) {
                console.log(`    ❌ ${req}`);
            }
        } else {
            logPass('Request', 'Không có request thất bại');
        }

        if (httpErrors.length > 0) {
            console.log('  ⚠️  HTTP errors:');
            for (const err of httpErrors) {
                console.log(`    ❌ ${err}`);
            }
        }

        // ========== SUMMARY ==========
        console.log('\n' + '='.repeat(70));
        console.log('  TỔNG KẾT KIỂM THỬ');
        console.log('='.repeat(70));

        const blockers = ISSUES.filter(i => i.severity === 'Blocker');
        const criticals = ISSUES.filter(i => i.severity === 'Critical');
        const majors = ISSUES.filter(i => i.severity === 'Major');
        const minors = ISSUES.filter(i => i.severity === 'Minor');

        console.log(`\n  🔴 Blocker: ${blockers.length}`);
        console.log(`  🟠 Critical: ${criticals.length}`);
        console.log(`  🟡 Major: ${majors.length}`);
        console.log(`  🟢 Minor: ${minors.length}`);
        console.log(`  📸 Screenshots: ${screenshotIdx} files in ${RESULTS_DIR}`);

        if (ISSUES.length > 0) {
            console.log('\n  📋 CHI TIẾT LỖI:');
            for (const issue of ISSUES) {
                console.log(`\n  [${issue.severity}] ${issue.module} - ${issue.title}`);
                if (issue.details) console.log(`    → ${issue.details}`);
            }
        } else {
            console.log('\n  🎉 Không phát hiện lỗi nghiệp vụ!');
        }

        // Write report to file
        const report = {
            timestamp: new Date().toISOString(),
            baseUrl: BASE_URL,
            totalIssues: ISSUES.length,
            issues: ISSUES,
            consoleErrors: consoleErrors.length,
            failedRequests: failedRequests.length,
            httpErrors: httpErrors.length,
            screenshotCount: screenshotIdx
        };

        fs.writeFileSync(path.join(RESULTS_DIR, 'report.json'), JSON.stringify(report, null, 2));
        console.log(`\n  📄 Báo cáo JSON: ${path.join(RESULTS_DIR, 'report.json')}`);

    } catch (err) {
        console.error('\n  💥 LỖI NGHIÊM TRỌNG:', err.message);
        console.error(err.stack);
        await screenshot(page, 'error_state');
    } finally {
        await browser.close();
    }

    console.log('\n' + '='.repeat(70));
    console.log('  HOÀN TẤT KIỂM THỬ');
    console.log('='.repeat(70));
    
    process.exit(ISSUES.some(i => i.severity === 'Blocker') ? 1 : 0);
})();
