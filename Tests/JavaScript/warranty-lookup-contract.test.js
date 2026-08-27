const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const pageSource = fs.readFileSync(path.resolve(
    __dirname,
    '../../Presentation/ASPNET/FrontEnd/Pages/WarrantyLookups/WarrantyLookup.cshtml.js'
), 'utf8');
const querySource = fs.readFileSync(path.resolve(
    __dirname,
    '../../Core/Application/Features/ProductSerialManager/Queries/GetWarrantyLookup.cs'
), 'utf8');
const localizationSource = fs.readFileSync(path.resolve(
    __dirname,
    '../../Presentation/ASPNET/wwwroot/lib/indotalent/ui-localization.js'
), 'utf8');

test('Warranty Lookup dùng một nguồn dữ liệu cho phân trang sort và filter', () => {
    assert.match(pageSource, /const apiPageSize = 200/);
    assert.match(pageSource, /Promise\.all\(Array\.from/);
    assert.match(pageSource, /mainGrid\.obj\.dataSource = state\.mainData/);
    assert.doesNotMatch(pageSource, /requestType !== 'paging'/);
});

test('Warranty Lookup có dữ liệu chứng từ cho Sales Order và Material Export', () => {
    assert.match(querySource, /SourceDocumentNumber = salesOrder\?\.Number \?\? materialExport\?\.Number/);
    assert.match(querySource, /CustomerName = salesOrder\?\.Customer\?\.Name \?\? materialExport\?\.CustomerName/);
    assert.match(querySource, /CustomerPhoneNumber = salesOrder\?\.Customer\?\.PhoneNumber \?\? materialExport\?\.CustomerPhoneNumber/);
    assert.match(pageSource, /field: 'sourceDocumentNumber'/);
    assert.match(pageSource, /field: 'issueDateText'/);
});

test('Warranty Lookup dịch Serial nhà sản xuất và giữ filter trạng thái', () => {
    assert.match(localizationSource, /'Manufacturer Serial': 'Serial Nhà Sản Xuất'/);
    assert.match(pageSource, /field: 'statusName'/);
    assert.match(pageSource, /filterSettings: \{ type: 'CheckBox' \}/);
});
