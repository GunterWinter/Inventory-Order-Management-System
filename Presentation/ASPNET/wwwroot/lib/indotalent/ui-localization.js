(function (window, document) {
    const SUPPORTED_LOCALES = ['en', 'vi'];
    const DEFAULT_LOCALE = 'en';
    const textNodeOriginals = new WeakMap();
    const attributeOriginals = new WeakMap();
    let currentLocale = resolveLocale(getSavedLocale()) ?? detectBrowserLocale();
    let originalTitle = document.title;
    let isApplying = false;
    let isScheduled = false;

    const exactTranslations = {
        'Dashboards': 'Bảng điều khiển',
        'Default Dashboard': 'Bảng điều khiển tổng quan',
        'Sales': 'Bán hàng',
        'Purchase': 'Mua hàng',
        'Inventory': 'Kho',
        'Utilities': 'Tiện ích',
        'Membership': 'Người dùng và phân quyền',
        'Profiles': 'Hồ sơ',
        'Settings': 'Thiết lập',
        'Default': 'Tổng quan',
        'Customer': 'Khách hàng',
        'Customer Group': 'Nhóm khách hàng',
        'Customer Category': 'Phân loại khách hàng',
        'Customer Contact': 'Liên hệ khách hàng',
        'Sales Order': 'Đơn bán hàng',
        'Sales Order Item': 'Chi tiết đơn bán hàng',
        'Sales Report': 'Báo cáo bán hàng',
        'Vendor': 'Nhà cung cấp',
        'Vendor Group': 'Nhóm nhà cung cấp',
        'Vendor Category': 'Phân loại nhà cung cấp',
        'Vendor Contact': 'Liên hệ nhà cung cấp',
        'Purchase Order': 'Đơn mua hàng',
        'Purchase Order Item': 'Chi tiết đơn mua hàng',
        'Purchase Report': 'Báo cáo mua hàng',
        'Unit Measure': 'Đơn vị tính',
        'Product Group': 'Nhóm hàng hóa',
        'Product': 'Hàng hóa',
        'Warehouse': 'Kho hàng',
        'Delivery Order': 'Phiếu xuất kho',
        'Delivery Item': 'Chi tiết xuất kho',
        'Sales Return': 'Phiếu hàng bán trả lại',
        'Goods Receive': 'Phiếu nhập kho',
        'Receive Item': 'Chi tiết nhập kho',
        'Purchase Return': 'Phiếu trả hàng mua',
        'Transfer Out': 'Phiếu chuyển kho đi',
        'Transfer In': 'Phiếu chuyển kho đến',
        'Positive Adjustment': 'Phiếu điều chỉnh tăng',
        'Negative Adjustment': 'Phiếu điều chỉnh giảm',
        'Scrapping': 'Phiếu hủy hàng',
        'Stock Count': 'Phiếu kiểm kê',
        'Transaction Report': 'Báo cáo giao dịch kho',
        'Stock Report': 'Báo cáo tồn kho',
        'Movement Reports': 'Báo cáo lãi theo lô',
        'Batch Profit Report': 'Báo cáo lãi theo lô',
        'Inventory Cost Layers': 'Lớp giá vốn nhập kho',
        'Inventory Issue Allocations': 'Phân bổ xuất kho theo lô',
        'Todo': 'Công việc',
        'Todo Item': 'Chi tiết công việc',
        'Users': 'Người dùng',
        'Roles': 'Vai trò',
        'My Profile': 'Hồ sơ của tôi',
        'My Company': 'Thông tin doanh nghiệp',
        'Tax': 'Thuế',
        'Number Sequence': 'Mã số chứng từ',
        'Login': 'Đăng nhập',
        'Log Out': 'Đăng xuất',
        'Logout': 'Đăng xuất',
        'Register': 'Đăng ký',
        'Forgot Password': 'Quên mật khẩu',
        'Forgot Password Confirmation': 'Xác nhận quên mật khẩu',
        'Email Confirm': 'Xác nhận email',
        'Home page': 'Trang chủ',
        'Profile': 'Hồ sơ',
        'Currency:': 'Tiền tệ:',
        'Loading...': 'Đang tải...',
        'All Right Reserved.': 'Bảo lưu mọi quyền.',
        'Developed By:': 'Phát triển bởi:',
        'Main Info': 'Thông tin chính',
        'Payment Summary': 'Tổng hợp thanh toán',
        'Subtotal': 'Tạm tính',
        'Total Amount': 'Tổng thanh toán',
        'Order Date': 'Ngày chứng từ',
        'Receive Date': 'Ngày nhập',
        'Delivery Date': 'Ngày xuất',
        'Return Date': 'Ngày trả hàng',
        'Release Date': 'Ngày xuất chuyển',
        'Adjustment Date': 'Ngày điều chỉnh',
        'Scrapping Date': 'Ngày hủy hàng',
        'Count Date': 'Ngày kiểm kê',
        'Movement Date': 'Ngày giao dịch',
        'Received Date': 'Ngày nhập',
        'Number': 'Số chứng từ',
        'Number (Mã HT)': 'Số chứng từ (mã hệ thống)',
        'Description': 'Diễn giải',
        'Order Status': 'Trạng thái chứng từ',
        'Status': 'Trạng thái',
        'Draft': 'Nháp',
        'Confirm': 'Xác nhận',
        'Confirmed': 'Đã xác nhận',
        'Cancelled': 'Đã hủy',
        'Canceled': 'Đã hủy',
        'Archived': 'Đã lưu trữ',
        'In': 'Nhập',
        'Out': 'Xuất',
        'Product Number': 'Mã hàng',
        'Product Name': 'Tên hàng',
        'Physical Product': 'Hàng hóa vật lý',
        'Is Physical Product?': 'Là hàng hóa vật lý?',
        'Reference Code': 'Mã tham khảo',
        'Reference Code (Mã tùy chỉnh)': 'Mã tham khảo (mã tùy chỉnh)',
        'Ref Code': 'Mã tham khảo',
        'Enter Reference Code (SKU/Custom)': 'Nhập mã tham khảo (SKU/tùy chỉnh)',
        'Batch Number': 'Số lô',
        'Quantity': 'Số lượng',
        'Summary': 'Ghi chú',
        'Unit Price': 'Đơn giá',
        'Unit Cost': 'Giá vốn đơn vị',
        'Original Qty': 'Số lượng nhập',
        'Total': 'Thành tiền',
        'Total Cost': 'Tổng giá vốn',
        'Total Sales': 'Tổng doanh thu',
        'Percentage': 'Tỷ lệ',
        'Prefix': 'Tiền tố',
        'Suffix': 'Hậu tố',
        'Warehouse': 'Kho hàng',
        'System Warehouse': 'Kho hệ thống',
        'Is System Warehouse?': 'Là kho hệ thống?',
        'System Stock': 'Tồn kho hệ thống',
        'Movement': 'Số lượng giao dịch',
        'Trans Type': 'Loại giao dịch',
        'Adjustment': 'Điều chỉnh',
        'Counted': 'Đã kiểm kê',
        'Close': 'Đóng',
        'Save': 'Lưu',
        'Delete': 'Xóa',
        'Search': 'Tìm kiếm',
        'Add': 'Thêm',
        'Edit': 'Sửa',
        'Update': 'Cập nhật',
        'Cancel': 'Hủy',
        'Save Successful': 'Lưu thành công',
        'Delete Successful': 'Xóa thành công',
        'Update Successful': 'Cập nhật thành công',
        'Save Failed': 'Lưu thất bại',
        'Delete Failed': 'Xóa thất bại',
        'Update Failed': 'Cập nhật thất bại',
        'Saving...': 'Đang lưu...',
        'Deleting...': 'Đang xóa...',
        'Login Successful': 'Đăng nhập thành công',
        'Login Failed': 'Đăng nhập thất bại',
        'An Error Occurred': 'Đã xảy ra lỗi',
        'Unauthorized': 'Không có quyền truy cập',
        'Token not valid': 'Phiên đăng nhập không hợp lệ',
        'Error validating token': 'Lỗi xác thực phiên đăng nhập',
        'You are being redirected...': 'Hệ thống đang chuyển hướng...',
        'Try Again': 'Thử lại',
        'OK': 'Đồng ý',
        'Please try again.': 'Vui lòng thử lại.',
        'Please check your credentials.': 'Vui lòng kiểm tra lại thông tin đăng nhập.',
        'Please check your data.': 'Vui lòng kiểm tra lại dữ liệu.',
        'Form will be closed...': 'Biểu mẫu sẽ được đóng...',
        'Passwords do not match.': 'Mật khẩu không khớp.',
        'Password and Confirm Password must match.': 'Mật khẩu và mật khẩu xác nhận phải khớp nhau.',
        'Email Confirmation Successful': 'Xác nhận email thành công',
        'Email Confirmation Failed': 'Xác nhận email thất bại',
        'Email confirmation is in progress.': 'Đang xác nhận email.',
        'Forgot Password Confirm': 'Xác nhận quên mật khẩu',
        'Click the button below to confirm and log out completely.': 'Bấm nút bên dưới để xác nhận và đăng xuất hoàn toàn.',
        'Remember Me': 'Ghi nhớ đăng nhập',
        '- OR -': 'HOẶC',
        'Sign in using Facebook': 'Đăng nhập bằng Facebook',
        'Sign in using Google+': 'Đăng nhập bằng Google',
        'Register a new membership': 'Đăng ký tài khoản mới',
        'Password': 'Mật khẩu',
        'Email': 'Email',
        'Company': 'Công ty',
        'Name': 'Tên',
        'Group': 'Nhóm',
        'Category': 'Phân loại',
        'Street': 'Địa chỉ',
        'City': 'Thành phố',
        'State': 'Tỉnh/Thành',
        'Zip Code': 'Mã bưu chính',
        'Country': 'Quốc gia',
        'Currency': 'Tiền tệ',
        'Company Name': 'Tên công ty',
        'Phone': 'Điện thoại',
        'Phone#': 'Điện thoại',
        'Phone Number': 'Số điện thoại',
        'PhoneNumber': 'Số điện thoại',
        'Fax Number': 'Số fax',
        'Email Address': 'Địa chỉ email',
        'EmailAddress': 'Địa chỉ email',
        'Website': 'Website',
        'Job Title': 'Chức danh',
        'JobTitle': 'Chức danh',
        'First Name': 'Tên',
        'Last Name': 'Họ',
        'FirstName': 'Tên',
        'LastName': 'Họ',
        'Lastname': 'Họ',
        'Confirm Password': 'Xác nhận mật khẩu',
        'Old Password': 'Mật khẩu hiện tại',
        'New Password': 'Mật khẩu mới',
        'Confirm New Password': 'Xác nhận mật khẩu mới',
        'Enter old password': 'Nhập mật khẩu hiện tại',
        'Enter new password': 'Nhập mật khẩu mới',
        'Confirm new password': 'Xác nhận mật khẩu mới',
        'Email Confirmed': 'Email đã xác nhận',
        'Is Blocked': 'Bị khóa',
        'Is Deleted': 'Đã xóa',
        'Access Granted': 'Được cấp quyền',
        'Created At': 'Thời điểm tạo',
        'Created At UTC': 'Thời điểm tạo',
        'Last Updated': 'Cập nhật lần cuối',
        'Last Used Count': 'Số lần đã dùng',
        'PO Date': 'Ngày đơn mua',
        'SO Date': 'Ngày đơn bán',
        'Date': 'Ngày',
        '#Number': 'Số chứng từ',
        'Id': 'ID',
        'Module': 'Phân hệ',
        'Module Name': 'Tên phân hệ',
        'Module Code': 'Mã phân hệ',
        'Module Number': 'Số chứng từ phân hệ',
        'Entity Name': 'Tên đối tượng',
        'PurchaseOrder': 'Đơn mua hàng',
        'SalesOrder': 'Đơn bán hàng',
        'Warehouse From': 'Kho xuất',
        'Warehouse To': 'Kho nhập',
        'Layer Status': 'Trạng thái lớp',
        'Issued Batch': 'Lô xuất',
        'Qty Issued': 'Số lượng đã xuất',
        'Sales Amount': 'Doanh thu',
        'Allocation Date': 'Ngày phân bổ',
        'Sales by Customer Group': 'Bán hàng theo nhóm khách hàng',
        'Sales by Customer Category': 'Bán hàng theo phân loại khách hàng',
        'Purchase by Vendor Group': 'Mua hàng theo nhóm nhà cung cấp',
        'Purchase by Vendor Category': 'Mua hàng theo phân loại nhà cung cấp',
        'Stock by Warehouse': 'Tồn kho theo kho hàng',
        'Remaining Qty': 'Tồn còn lại',
        'Sold Qty': 'Số lượng đã bán',
        'Sales Price': 'Giá bán',
        'Profit': 'Lợi nhuận',
        'COGS': 'Giá vốn',
        'Last Sold': 'Lần bán gần nhất',
        'Remaining:': 'Tồn còn lại:',
        'Select existing or type new batch': 'Chọn lô có sẵn hoặc nhập lô mới',
        'Suggested FIFO batch': 'Gợi ý lô FIFO',
        'No batch with stock': 'Không có lô còn tồn',
        'Blank = FIFO': 'Để trống = FIFO',
        'Enter Batch No.': 'Nhập số lô',
        'Default Company': 'Công ty mặc định',
        'Open': 'Đang mở',
        'Closed': 'Đã hết',
        'Unknown': 'Không xác định',
        'Unknown Product': 'Hàng hóa không xác định',
        'This page only shows batches that have already been sold. Each row represents the actual profit by product and batch based on issued allocations.': 'Trang này chỉ hiển thị các lô đã phát sinh bán hàng. Mỗi dòng là lợi nhuận thực tế theo hàng hóa và lô đã được cấp phát khi xuất kho.',
        'This report shows only batches that still have stock on hand. Use it to check which product is available in which batch and how much quantity remains in the warehouse.': 'Báo cáo này chỉ hiển thị các lô vẫn còn tồn kho. Dùng báo cáo để kiểm tra hàng hóa nào đang còn ở lô nào và còn bao nhiêu trong kho.',
        'Select an existing batch if you want to receive more stock into the same batch, or type a new batch to create a new supplier lot.': 'Chọn lô đã có nếu muốn nhập tiếp vào cùng lô, hoặc gõ lô mới để tạo lô nhập mới từ nhà cung cấp.',
        'When a product is selected, the system suggests the earliest available batch by FIFO. You can still choose a different batch, and each option shows its remaining stock.': 'Khi chọn hàng hóa, hệ thống sẽ gợi ý lô còn tồn sớm nhất theo FIFO. Bạn vẫn có thể chọn lô khác, và mỗi lựa chọn đều hiển thị tồn còn lại.',
        'Inventory transactions are auto-generated from Purchase Order items. Maintain batch numbers on the purchase order before confirming receipt.': 'Giao dịch kho được tự động tạo từ chi tiết đơn mua hàng. Hãy quản lý đúng số lô trên đơn mua trước khi xác nhận nhập kho.',
        'Inventory transactions are auto-generated from Sales Order items. Leave batch blank on the sales order for FIFO, or fill it to force a specific batch.': 'Giao dịch kho được tự động tạo từ chi tiết đơn bán hàng. Để trống số lô để xuất theo FIFO, hoặc nhập số lô nếu muốn chỉ định lô cụ thể.',
        'Leave Batch Number empty to issue automatically by FIFO. Fill it only when you want to force a specific batch.': 'Để trống số lô để hệ thống tự xuất theo FIFO. Chỉ nhập số lô khi muốn chỉ định lô cụ thể.',
        'Select a Product': 'Chọn hàng hóa',
        'Select a Warehouse': 'Chọn kho hàng',
        'Select a Vendor': 'Chọn nhà cung cấp',
        'Select a Customer': 'Chọn khách hàng',
        'Select a Tax': 'Chọn thuế',
        'Select an Order Status': 'Chọn trạng thái chứng từ',
        'Select a Vendor Group': 'Chọn nhóm nhà cung cấp',
        'Select a Vendor Category': 'Chọn phân loại nhà cung cấp',
        'Select a Customer Group': 'Chọn nhóm khách hàng',
        'Select a Customer Category': 'Chọn phân loại khách hàng',
        'Select a Product Group': 'Chọn nhóm hàng hóa',
        'Select a Unit Measure': 'Chọn đơn vị tính',
        'Select a Todo': 'Chọn công việc',
        'Must be a positive number and not zero': 'Phải là số dương và khác 0',
        'Please enter a valid email address.': 'Vui lòng nhập địa chỉ email hợp lệ.',
        'Password must be at least 6 characters.': 'Mật khẩu phải có ít nhất 6 ký tự.',
        'Only draft goods receive can be updated.': 'Chỉ phiếu nhập kho ở trạng thái nháp mới được phép cập nhật.',
        'Only draft goods receive can be deleted.': 'Chỉ phiếu nhập kho ở trạng thái nháp mới được phép xóa.',
        'Only draft delivery order can be updated.': 'Chỉ phiếu xuất kho ở trạng thái nháp mới được phép cập nhật.',
        'Only draft delivery order can be deleted.': 'Chỉ phiếu xuất kho ở trạng thái nháp mới được phép xóa.',
        'Issue transaction must reference a sales order item.': 'Giao dịch xuất kho phải gắn với một dòng đơn bán hàng.',
        'Unable to resolve default warehouse for goods receive.': 'Không xác định được kho mặc định cho phiếu nhập kho.',
        'Unable to resolve default warehouse for delivery order.': 'Không xác định được kho mặc định cho phiếu xuất kho.'
    };

    const termTranslations = {
        'dashboard': 'bảng điều khiển',
        'default dashboard': 'bảng điều khiển tổng quan',
        'sales': 'bán hàng',
        'purchase': 'mua hàng',
        'inventory': 'kho',
        'customer': 'khách hàng',
        'customer group': 'nhóm khách hàng',
        'customer category': 'phân loại khách hàng',
        'customer contact': 'liên hệ khách hàng',
        'sales order': 'đơn bán hàng',
        'sales order item': 'chi tiết đơn bán hàng',
        'sales report': 'báo cáo bán hàng',
        'vendor': 'nhà cung cấp',
        'vendor group': 'nhóm nhà cung cấp',
        'vendor category': 'phân loại nhà cung cấp',
        'vendor contact': 'liên hệ nhà cung cấp',
        'purchase order': 'đơn mua hàng',
        'purchase order item': 'chi tiết đơn mua hàng',
        'purchase report': 'báo cáo mua hàng',
        'unit measure': 'đơn vị tính',
        'product group': 'nhóm hàng hóa',
        'product': 'hàng hóa',
        'warehouse': 'kho hàng',
        'delivery order': 'phiếu xuất kho',
        'delivery item': 'chi tiết xuất kho',
        'sales return': 'phiếu hàng bán trả lại',
        'goods receive': 'phiếu nhập kho',
        'receive item': 'chi tiết nhập kho',
        'purchase return': 'phiếu trả hàng mua',
        'transfer out': 'phiếu chuyển kho đi',
        'transfer in': 'phiếu chuyển kho đến',
        'positive adjustment': 'phiếu điều chỉnh tăng',
        'negative adjustment': 'phiếu điều chỉnh giảm',
        'scrapping': 'phiếu hủy hàng',
        'stock count': 'phiếu kiểm kê',
        'transaction report': 'báo cáo giao dịch kho',
        'stock report': 'báo cáo tồn kho',
        'movement report': 'báo cáo lãi theo lô',
        'movement reports': 'báo cáo lãi theo lô',
        'batch profit report': 'báo cáo lãi theo lô',
        'inventory cost layers': 'lớp giá vốn nhập kho',
        'inventory issue allocations': 'phân bổ xuất kho theo lô',
        'todo': 'công việc',
        'todo item': 'chi tiết công việc',
        'user': 'người dùng',
        'users': 'người dùng',
        'role': 'vai trò',
        'roles': 'vai trò',
        'profile': 'hồ sơ',
        'tax': 'thuế',
        'number sequence': 'mã số chứng từ',
        'order date': 'ngày chứng từ',
        'receive date': 'ngày nhập',
        'delivery date': 'ngày xuất',
        'return date': 'ngày trả hàng',
        'release date': 'ngày xuất chuyển',
        'adjustment date': 'ngày điều chỉnh',
        'scrapping date': 'ngày hủy hàng',
        'count date': 'ngày kiểm kê',
        'movement date': 'ngày giao dịch',
        'status': 'trạng thái',
        'order status': 'trạng thái chứng từ',
        'draft': 'nháp',
        'confirm': 'xác nhận',
        'confirmed': 'đã xác nhận',
        'cancelled': 'đã hủy',
        'canceled': 'đã hủy',
        'archived': 'đã lưu trữ',
        'in': 'nhập',
        'out': 'xuất',
        'product number': 'mã hàng',
        'product name': 'tên hàng',
        'physical product': 'hàng hóa vật lý',
        'reference code': 'mã tham khảo',
        'ref code': 'mã tham khảo',
        'batch number': 'số lô',
        'quantity': 'số lượng',
        'summary': 'ghi chú',
        'unit price': 'đơn giá',
        'unit cost': 'giá vốn đơn vị',
        'total': 'thành tiền',
        'total cost': 'tổng giá vốn',
        'total sales': 'tổng doanh thu',
        'percentage': 'tỷ lệ',
        'prefix': 'tiền tố',
        'suffix': 'hậu tố',
        'subtotal': 'tạm tính',
        'total amount': 'tổng thanh toán',
        'payment summary': 'tổng hợp thanh toán',
        'number': 'số chứng từ',
        'description': 'diễn giải',
        'warehouse': 'kho hàng',
        'system warehouse': 'kho hệ thống',
        'system stock': 'tồn kho hệ thống',
        'movement': 'số lượng giao dịch',
        'trans type': 'loại giao dịch',
        'transaction type': 'loại giao dịch',
        'adjustment': 'điều chỉnh',
        'counted': 'đã kiểm kê',
        'sales price': 'giá bán',
        'sold qty': 'số lượng đã bán',
        'profit': 'lợi nhuận',
        'remaining qty': 'tồn còn lại',
        'cogs': 'giá vốn',
        'last sold': 'lần bán gần nhất',
        'password': 'mật khẩu',
        'email': 'email',
        'company': 'công ty',
        'name': 'tên',
        'group': 'nhóm',
        'category': 'phân loại',
        'street': 'địa chỉ',
        'city': 'thành phố',
        'state': 'tỉnh/thành',
        'zip code': 'mã bưu chính',
        'country': 'quốc gia',
        'currency': 'tiền tệ',
        'company name': 'tên công ty',
        'phone': 'điện thoại',
        'phone#': 'điện thoại',
        'phone number': 'số điện thoại',
        'phonenumber': 'số điện thoại',
        'phone no': 'số điện thoại',
        'fax number': 'số fax',
        'email address': 'địa chỉ email',
        'emailaddress': 'địa chỉ email',
        'website': 'website',
        'job title': 'chức danh',
        'jobtitle': 'chức danh',
        'first name': 'tên',
        'last name': 'họ',
        'firstname': 'tên',
        'lastname': 'họ',
        'confirm password': 'xác nhận mật khẩu',
        'old password': 'mật khẩu hiện tại',
        'new password': 'mật khẩu mới',
        'confirm new password': 'xác nhận mật khẩu mới',
        'email confirmed': 'email đã xác nhận',
        'is blocked': 'bị khóa',
        'is deleted': 'đã xóa',
        'access granted': 'được cấp quyền',
        'created at': 'thời điểm tạo',
        'created at utc': 'thời điểm tạo',
        'last updated': 'cập nhật lần cuối',
        'last used count': 'số lần đã dùng',
        'po date': 'ngày đơn mua',
        'so date': 'ngày đơn bán',
        'date': 'ngày',
        '#number': 'số chứng từ',
        'id': 'ID',
        'module': 'phân hệ',
        'module name': 'tên phân hệ',
        'module code': 'mã phân hệ',
        'module number': 'số chứng từ phân hệ',
        'entity name': 'tên đối tượng',
        'purchaseorder': 'đơn mua hàng',
        'salesorder': 'đơn bán hàng',
        'warehouse from': 'kho xuất',
        'warehouse to': 'kho nhập',
        'layer status': 'trạng thái lớp',
        'issued batch': 'lô xuất',
        'qty issued': 'số lượng đã xuất',
        'sales amount': 'doanh thu',
        'allocation date': 'ngày phân bổ',
        'stock': 'tồn kho',
        'password reset': 'đặt lại mật khẩu',
        'reset password': 'đặt lại mật khẩu',
        'email confirmation': 'xác nhận email',
        'logout': 'đăng xuất',
        'register': 'đăng ký',
        'change password': 'đổi mật khẩu',
        'change role': 'đổi vai trò',
        'edit company': 'chỉnh sửa thông tin doanh nghiệp',
        'manage contact': 'quản lý liên hệ'
    };

    function normalizeText(value) {
        return (value ?? '').replace(/\s+/g, ' ').trim();
    }

    function toSentenceCase(value) {
        if (!value) {
            return value;
        }

        return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function resolveLocale(locale) {
        return SUPPORTED_LOCALES.includes(locale) ? locale : null;
    }

    function getSavedLocale() {
        if (window.StorageManager?.getLocale) {
            return window.StorageManager.getLocale();
        }

        try {
            const rawValue = window.localStorage.getItem('locale');
            return rawValue ? JSON.parse(rawValue) : null;
        } catch (error) {
            return null;
        }
    }

    function saveLocale(locale) {
        if (window.StorageManager?.saveLocale) {
            window.StorageManager.saveLocale(locale);
            return;
        }

        try {
            window.localStorage.setItem('locale', JSON.stringify(locale));
        } catch (error) {
            console.error('Failed to save locale', error);
        }
    }

    function detectBrowserLocale() {
        const browserLocale = (window.navigator.language || window.navigator.userLanguage || DEFAULT_LOCALE).toLowerCase();
        return browserLocale.startsWith('vi') ? 'vi' : DEFAULT_LOCALE;
    }

    function translateBusinessTerm(value, locale = currentLocale) {
        if (locale === 'en') {
            return value;
        }

        const normalized = normalizeText(value).toLowerCase();
        return termTranslations[normalized] ?? value;
    }

    function translateNormalized(value, locale = currentLocale) {
        if (!value || locale === 'en') {
            return value;
        }

        if (exactTranslations[value]) {
            return exactTranslations[value];
        }

        const requiredMatch = value.match(/^(.+?) is required\.?$/i);
        if (requiredMatch) {
            return `${toSentenceCase(translateBusinessTerm(requiredMatch[1], locale))} là bắt buộc.`;
        }

        const minLengthMatch = value.match(/^(.+?) must be at least (\d+) characters\.?$/i);
        if (minLengthMatch) {
            return `${toSentenceCase(translateBusinessTerm(minLengthMatch[1], locale))} phải có ít nhất ${minLengthMatch[2]} ký tự.`;
        }

        const mustMatch = value.match(/^(.+?) and (.+?) must match\.?$/i);
        if (mustMatch) {
            return `${toSentenceCase(translateBusinessTerm(mustMatch[1], locale))} và ${translateBusinessTerm(mustMatch[2], locale)} phải khớp nhau.`;
        }

        const isMatch = value.match(/^Is (.+?)\?$/i);
        if (isMatch) {
            return `Là ${translateBusinessTerm(isMatch[1], locale)}?`;
        }

        const selectMatch = value.match(/^Select(?: (?:a|an))? (.+)$/i);
        if (selectMatch) {
            return `Chọn ${translateBusinessTerm(selectMatch[1], locale)}`;
        }

        const enterMatch = value.match(/^Enter (.+)$/i);
        if (enterMatch) {
            return `Nhập ${translateBusinessTerm(enterMatch[1], locale)}`;
        }

        const statusMatch = value.match(/^(.+?) (Successful|Failed)$/i);
        if (statusMatch) {
            const resultText = statusMatch[2].toLowerCase() === 'successful' ? 'thành công' : 'thất bại';
            return `${toSentenceCase(translateBusinessTerm(statusMatch[1], locale))} ${resultText}`;
        }

        const listMatch = value.match(/^(.+?) List$/i);
        if (listMatch) {
            return `Danh sách ${translateBusinessTerm(listMatch[1], locale)}`;
        }

        const pdfMatch = value.match(/^(.+?) PDF$/i);
        if (pdfMatch) {
            return `PDF ${translateBusinessTerm(pdfMatch[1], locale)}`;
        }

        const byMatch = value.match(/^(.+?) by (.+)$/i);
        if (byMatch) {
            const metricText = translateBusinessTerm(byMatch[1], locale);
            const groupText = translateBusinessTerm(byMatch[2], locale);

            if (metricText !== byMatch[1] || groupText !== byMatch[2]) {
                return `${toSentenceCase(metricText)} theo ${groupText}`;
            }
        }

        const batchRemainingMatch = value.match(/^(.*\|\s*)Remaining:\s*(.+)$/i);
        if (batchRemainingMatch) {
            return `${batchRemainingMatch[1]}Tồn còn lại: ${batchRemainingMatch[2]}`;
        }

        const remainingQtyMatch = value.match(/^Remaining Qty:\s*(.+)$/i);
        if (remainingQtyMatch) {
            return `Tồn còn lại: ${remainingQtyMatch[1]}`;
        }

        const draftMatch = value.match(/^Only draft (.+) can be (updated|deleted)\.$/i);
        if (draftMatch) {
            const action = draftMatch[2].toLowerCase() === 'updated' ? 'cập nhật' : 'xóa';
            return `Chỉ ${translateBusinessTerm(draftMatch[1], locale)} ở trạng thái nháp mới được phép ${action}.`;
        }

        const stockMatch = value.match(/^Not enough stock in cost layers for Product:\s*(.+?),\s*Batch:\s*(.+)$/i);
        if (stockMatch) {
            return `Không đủ tồn trong các lớp giá vốn cho hàng hóa ${stockMatch[1]} và lô ${stockMatch[2]}.`;
        }

        const translatedTerm = translateBusinessTerm(value, locale);
        if (translatedTerm !== value) {
            return toSentenceCase(translatedTerm);
        }

        return value;
    }

    function translateText(value, locale = currentLocale) {
        const rawValue = value ?? '';
        const normalized = normalizeText(rawValue);
        if (!normalized) {
            return rawValue;
        }

        const translated = translateNormalized(normalized, locale);
        if (translated === normalized) {
            return rawValue;
        }

        return rawValue.replace(normalized, translated);
    }

    function captureTextNodeOriginal(node, force = false) {
        if (!node) {
            return;
        }

        if (force || !textNodeOriginals.has(node)) {
            textNodeOriginals.set(node, node.nodeValue ?? '');
        }
    }

    function captureElementOriginal(element, attributeName, force = false) {
        if (!element || !attributeName) {
            return;
        }

        let store = attributeOriginals.get(element);
        if (!store) {
            store = {};
            attributeOriginals.set(element, store);
        }

        if (force || !(attributeName in store)) {
            store[attributeName] = element.getAttribute(attributeName) ?? '';
        }
    }

    function captureInputValueOriginal(element, force = false) {
        if (!(element instanceof HTMLInputElement)) {
            return;
        }

        let store = attributeOriginals.get(element);
        if (!store) {
            store = {};
            attributeOriginals.set(element, store);
        }

        if (force || !('__value' in store)) {
            store.__value = element.value ?? '';
        }
    }

    function applyTextNode(node) {
        if (!node || !node.nodeValue) {
            return;
        }

        const parentTagName = node.parentElement?.tagName;
        if (parentTagName === 'SCRIPT' || parentTagName === 'STYLE') {
            return;
        }

        captureTextNodeOriginal(node);
        const originalValue = textNodeOriginals.get(node) ?? '';
        const translatedValue = currentLocale === 'vi' ? translateText(originalValue) : originalValue;

        if (node.nodeValue !== translatedValue) {
            node.nodeValue = translatedValue;
        }
    }

    function applyElementAttributes(element) {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        ['placeholder', 'title', 'aria-label', 'alt', 'data-bs-original-title'].forEach(attributeName => {
            if (!element.hasAttribute(attributeName)) {
                return;
            }

            captureElementOriginal(element, attributeName);
            const store = attributeOriginals.get(element) ?? {};
            const originalValue = store[attributeName] ?? '';
            const translatedValue = currentLocale === 'vi' ? translateText(originalValue) : originalValue;

            if (element.getAttribute(attributeName) !== translatedValue) {
                element.setAttribute(attributeName, translatedValue);
            }
        });

        if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) {
            captureInputValueOriginal(element);
            const store = attributeOriginals.get(element) ?? {};
            const originalValue = store.__value ?? '';
            const translatedValue = currentLocale === 'vi' ? translateText(originalValue) : originalValue;

            if (element.value !== translatedValue) {
                element.value = translatedValue;
            }
        }
    }

    function captureNodeOriginals(root) {
        if (!root) {
            return;
        }

        if (root.nodeType === Node.TEXT_NODE) {
            captureTextNodeOriginal(root, true);
            return;
        }

        if (root.nodeType !== Node.ELEMENT_NODE) {
            return;
        }

        ['placeholder', 'title', 'aria-label', 'alt', 'data-bs-original-title'].forEach(attributeName => {
            if (root.hasAttribute(attributeName)) {
                captureElementOriginal(root, attributeName, true);
            }
        });

        if (root instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(root.type)) {
            captureInputValueOriginal(root, true);
        }

        root.childNodes.forEach(captureNodeOriginals);
    }

    function updateLanguageButtons() {
        document.querySelectorAll('[data-language-switch]').forEach(button => {
            const locale = button.getAttribute('data-language-switch');
            const isActive = locale === currentLocale;

            button.classList.toggle('btn-primary', isActive);
            button.classList.toggle('btn-outline-secondary', !isActive);
            button.classList.toggle('text-white', isActive);
        });
    }

    function updateDocumentState() {
        const translatedOriginalTitle = translateText(originalTitle, 'vi');

        if (currentLocale === 'en') {
            originalTitle = document.title === translatedOriginalTitle ? originalTitle : document.title;
            document.title = originalTitle;
        } else {
            document.title = translatedOriginalTitle;
        }

        document.documentElement.lang = currentLocale === 'vi' ? 'vi' : 'en';
    }

    function translateDom(root) {
        if (!root) {
            return;
        }

        isApplying = true;

        updateDocumentState();

        if (root.nodeType === Node.TEXT_NODE) {
            applyTextNode(root);
            isApplying = false;
            return;
        }

        if (root.nodeType === Node.ELEMENT_NODE) {
            applyElementAttributes(root);
        }

        if (root.querySelectorAll) {
            root.querySelectorAll('*').forEach(applyElementAttributes);
        }

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let currentNode = walker.nextNode();
        while (currentNode) {
            applyTextNode(currentNode);
            currentNode = walker.nextNode();
        }

        updateLanguageButtons();
        isApplying = false;
    }

    function scheduleTranslate() {
        if (isScheduled) {
            return;
        }

        isScheduled = true;
        window.requestAnimationFrame(() => {
            isScheduled = false;
            translateDom(document.body);
        });
    }

    function initSyncfusionLocalization() {
        if (!window.ej || !window.ej.base) {
            return;
        }

        window.ej.base.L10n.load({
            vi: {
                grid: {
                    EmptyRecord: 'Không có dữ liệu',
                    True: 'Đúng',
                    False: 'Sai',
                    InvalidFilterMessage: 'Điều kiện lọc không hợp lệ',
                    GroupDropArea: 'Kéo tiêu đề cột vào đây để nhóm dữ liệu',
                    UnGroup: 'Bỏ nhóm',
                    GroupDisable: 'Không thể nhóm cột này',
                    FilterbarTitle: 'Lọc',
                    EmptyDataSourceError: 'Nguồn dữ liệu đang trống',
                    Add: 'Thêm',
                    Edit: 'Sửa',
                    Cancel: 'Hủy',
                    Update: 'Cập nhật',
                    Delete: 'Xóa',
                    Print: 'In',
                    PdfExport: 'Xuất PDF',
                    ExcelExport: 'Xuất Excel',
                    CsvExport: 'Xuất CSV',
                    WordExport: 'Xuất Word',
                    Search: 'Tìm kiếm',
                    Columnchooser: 'Chọn cột',
                    SaveButton: 'Lưu',
                    OKButton: 'Đồng ý',
                    CancelButton: 'Hủy',
                    EditOperationAlert: 'Vui lòng chọn dòng cần sửa',
                    DeleteOperationAlert: 'Vui lòng chọn dòng cần xóa',
                    SaveConfirm: 'Bạn có muốn lưu thay đổi không?',
                    BatchSaveConfirm: 'Bạn có chắc muốn lưu toàn bộ thay đổi không?',
                    BatchSaveLostChanges: 'Các thay đổi chưa lưu sẽ bị mất. Bạn có muốn tiếp tục không?',
                    ConfirmDelete: 'Bạn có chắc muốn xóa bản ghi này không?',
                    CancelEdit: 'Bạn có muốn hủy thay đổi không?'
                },
                pager: {
                    currentPageInfo: '{0} / {1} trang',
                    totalItemsInfo: '({0} bản ghi)',
                    firstPageTooltip: 'Trang đầu',
                    lastPageTooltip: 'Trang cuối',
                    nextPageTooltip: 'Trang sau',
                    previousPageTooltip: 'Trang trước',
                    nextPagerTooltip: 'Nhóm trang sau',
                    previousPagerTooltip: 'Nhóm trang trước',
                    pagerDropDown: 'bản ghi mỗi trang',
                    pagerAllDropDown: 'Tất cả'
                },
                dropdowns: {
                    noRecordsTemplate: 'Không có dữ liệu',
                    actionFailureTemplate: 'Không thể tải dữ liệu',
                    totalCountInfo: '{0} mục',
                    selectAllText: 'Chọn tất cả',
                    unSelectAllText: 'Bỏ chọn tất cả'
                },
                datepicker: {
                    placeholder: 'Chọn ngày',
                    today: 'Hôm nay'
                },
                datetimepicker: {
                    placeholder: 'Chọn ngày giờ',
                    today: 'Hôm nay'
                },
                daterangepicker: {
                    placeholder: 'Chọn khoảng ngày'
                },
                numerictextbox: {
                    incrementTitle: 'Tăng giá trị',
                    decrementTitle: 'Giảm giá trị'
                }
            }
        });
    }

    function applyCulture() {
        if (!window.ej || !window.ej.base) {
            return;
        }

        window.ej.base.setCulture(currentLocale === 'vi' ? 'vi' : 'en-US');
        window.ej.base.setCurrencyCode('VND');
    }

    function setLocale(locale, persist = true) {
        const resolvedLocale = resolveLocale(locale) ?? DEFAULT_LOCALE;
        currentLocale = resolvedLocale;

        if (persist) {
            saveLocale(resolvedLocale);
        }

        applyCulture();
        scheduleTranslate();
        window.dispatchEvent(new CustomEvent('ui:languagechanged', {
            detail: { locale: resolvedLocale }
        }));
    }

    function bindLanguageSwitcher() {
        document.addEventListener('click', event => {
            const button = event.target.closest('[data-language-switch]');
            if (!button) {
                return;
            }

            event.preventDefault();
            const locale = button.getAttribute('data-language-switch');
            if (!locale || locale === currentLocale) {
                return;
            }

            setLocale(locale);
        });
    }

    function initMutationObserver() {
        const observer = new MutationObserver(mutations => {
            if (isApplying) {
                return;
            }

            mutations.forEach(mutation => {
                if (mutation.type === 'characterData') {
                    if (mutation.target.parentNode?.nodeName === 'TITLE') {
                        originalTitle = mutation.target.nodeValue ?? originalTitle;
                    } else {
                        captureTextNodeOriginal(mutation.target, true);
                    }
                }

                if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
                    captureElementOriginal(mutation.target, mutation.attributeName, true);

                    if (mutation.attributeName === 'value' && mutation.target instanceof HTMLInputElement) {
                        captureInputValueOriginal(mutation.target, true);
                    }
                }

                mutation.addedNodes.forEach(captureNodeOriginals);
            });

            scheduleTranslate();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['placeholder', 'title', 'aria-label', 'alt', 'data-bs-original-title', 'value']
        });
    }

    function init() {
        initSyncfusionLocalization();
        bindLanguageSwitcher();
        applyCulture();
        scheduleTranslate();
        initMutationObserver();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    window.UiLocalization = {
        getLocale: () => currentLocale,
        setLocale,
        translateText,
        refresh: scheduleTranslate
    };
})(window, document);
