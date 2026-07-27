---
name: ui-localization
description: Vietnamese UI Localization system using ui-localization.js. Handles translating English text to Vietnamese across all pages, grids, modals, and Swal messages.
---

# UI Localization System

## Overview
The project uses a centralized localization system at `Presentation/ASPNET/wwwroot/lib/indotalent/ui-localization.js` to translate English UI text to Vietnamese.

## Architecture
The localization file contains two translation dictionaries:

### 1. `exactTranslations` (line ~22)
- **Case-sensitive exact matches** for full sentences, phrases, button labels
- Used for: Modal titles, Swal messages, validation messages, menu items
- Example: `'CostAllocation': 'Phân Bổ Công Trình'`

### 2. `termTranslations` (line ~516)
- **Lowercase term matches** for grid column headers, labels, shorter terms
- Used for: Syncfusion Grid headerText, card headers, labels
- Example: `'costallocation': 'phân bổ công trình'`

## How It Works
- The system uses a MutationObserver to watch DOM changes
- When new text nodes appear, it checks both dictionaries
- Grid column `headerText` values are translated via `termTranslations`
- Syncfusion dropdown option text (Draft, Confirmed, etc.) is translated via `LOCALIZED_OPTION_TEXTS`

## Rules When Adding New Modules

When creating a new module/page, you **MUST** add translations for:

1. **Module name** (both exact + term):
   ```javascript
   // exactTranslations
   'MaterialExport': 'Phiếu Xuất Vật Tư',
   
   // termTranslations  
   'materialexport': 'phiếu xuất vật tư',
   ```

2. **All hardcoded English text in JS files** should be written in Vietnamese directly:
   - Modal titles: `'Thêm phiếu Xuất vật tư'` not `'Add MaterialExport'`
   - Swal messages: `'Lưu thành công'` not `'Save Successful'`
   - Validation: `'Ngày xuất là bắt buộc.'` not `'Date is required.'`
   - Placeholders: `'Chọn đơn mua hàng'` not `'Select PurchaseOrder'`

3. **Grid column headers** use English `headerText` (e.g., `'Product Name'`) which gets auto-translated by the localization system. Add new terms to `termTranslations` if not already present.

4. **Navigation menu items** in `NavigationTreeStructure.cs` can use either English (auto-translated) or Vietnamese directly.

## Common Patterns

### Swal Messages (Vietnamese)
```javascript
Swal.fire({ icon: 'success', title: 'Lưu thành công', timer: 2000, showConfirmButton: false });
Swal.fire({ icon: 'error', title: 'Lưu thất bại', text: 'Vui lòng kiểm tra lại dữ liệu.', confirmButtonText: 'Thử lại' });
Swal.fire({ icon: 'error', title: 'Đã xảy ra lỗi', text: error.response?.data?.message ?? 'Vui lòng thử lại.', confirmButtonText: 'Đồng ý' });
```

### Status Enums
Status values like `Draft`, `Confirmed`, `Cancelled` are in `LOCALIZED_OPTION_TEXTS` and auto-translated in dropdowns.

## File Location
`Presentation/ASPNET/wwwroot/lib/indotalent/ui-localization.js`
