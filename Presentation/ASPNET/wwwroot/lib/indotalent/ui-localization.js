(function (window, document) {
    const SUPPORTED_LOCALES = ['en', 'vi'];
    const DEFAULT_LOCALE = 'en';
    const textNodeOriginals = new WeakMap();
    const attributeOriginals = new WeakMap();
    const localizedTextWrites = new WeakSet();
    const localizedAttributeWrites = new WeakMap();
    const localizedDropDownInstances = new Set();
    const localizedSyncfusionTextInstances = new Set();
    const LOCALIZED_DROPDOWN_TEXT_FIELD = '__localizedText';
    const LOCALIZED_OPTION_TEXTS = new Set([
        'Draft', 'Cancelled', 'Canceled', 'Confirmed', 'Archived',
        'In', 'Out',
        'Debit', 'Credit',
        'Paid', 'Unpaid', 'PartiallyPaid', 'Partially Paid',
        'Exported',
        'Cash', 'Bank',
        'Open', 'Closed'
    ]);
    let currentLocale = resolveLocale(getSavedLocale()) ?? detectBrowserLocale();
    let originalTitle = document.title;
    let isApplying = false;
    let isScheduled = false;
    let localizedTitleWrites = 0;

    const exactTranslations = {
        'This field is required.': 'Trường này là bắt buộc.',
        'Dashboards': 'Bảng điều khiển',
        'Default Dashboard': 'Bảng điều khiển tổng quan',
        'Operations Overview': 'Tổng Quan Vận Hành',
        'Warehouse Management System': 'Hệ Thống Quản Lý Kho',
        'Sales, purchasing, cash flow and inventory in one place.': 'Theo Dõi Bán Hàng, Mua Hàng, Dòng Tiền Và Tồn Kho Tại Một Nơi.',
        'Refresh': 'Làm Mới',
        'Confirmed Sales': 'Doanh Số Đã Xác Nhận',
        'Customer Receivable': 'Công Nợ Khách Hàng',
        'Confirmed Purchases': 'Giá Trị Mua Đã Xác Nhận',
        'Vendor Debt': 'Công Nợ Nhà Cung Cấp',
        'Cash Balance': 'Số Dư Quỹ',
        'Inventory Quantity': 'Số Lượng Tồn Kho',
        'Material Exports': 'Phiếu Xuất Vật Tư',
        'Order value': 'Giá Trị Đơn Hàng',
        'Outstanding sales': 'Khoản Bán Chưa Thu',
        'Outstanding purchases': 'Khoản Mua Chưa Trả',
        'Across active accounts': 'Tổng Các Tài Khoản Hoạt Động',
        'Confirmed on hand': 'Tồn Thực Tế Đã Xác Nhận',
        'Confirmed documents': 'Chứng Từ Đã Xác Nhận',
        'Recent Sales Orders': 'Đơn Bán Hàng Gần Đây',
        'Recent Purchase Orders': 'Đơn Mua Hàng Gần Đây',
        'Latest Inventory Movements': 'Biến Động Kho Gần Đây',
        'Stock by Warehouse': 'Tồn Kho Theo Kho Hàng',
        'View All': 'Xem Tất Cả',
        'View Stock': 'Xem Tồn Kho',
        'Dashboard data could not be loaded.': 'Không Thể Tải Dữ Liệu Tổng Quan.',
        'WHMS - .NET 9 - Warehouse & Inventory Management System': 'WHMS - .NET 9 - Hệ thống quản lý kho và tồn kho',
        'Sales': 'Bán hàng',
        'Sales Rtrn.': 'Trả hàng bán',
        'Purchase': 'Mua hàng',
        'Purchase Rtrn.': 'Trả hàng mua',
        'Purchases': 'Mua hàng',
        'Inventory': 'Kho',
        'Stocks': 'Tồn kho',
        'Transactions': 'Giao dịch',
        'Utilities': 'Tiện ích',
        'Membership': 'Người dùng và phân quyền',
        'Profiles': 'Hồ sơ',
        'Settings': 'Thiết lập',
        'Default': 'Tổng quan',
        'Customer': 'Khách hàng',
        'Customer Group': 'Nhóm Khách Hàng',
        'Customer Category': 'Phân Loại Khách Hàng',
        'Customer Contact': 'Liên Hệ Khách Hàng',
        'Sales Order': 'Đơn Bán Hàng',
        'Sales Order Item': 'Chi Tiết Đơn Bán Hàng',
        'Sales Report': 'Báo Cáo Bán Hàng',
        'Vendor': 'Nhà Cung Cấp',
        'Vendor Group': 'Nhóm Nhà Cung Cấp',
        'Vendor Category': 'Phân Loại Nhà Cung Cấp',
        'Vendor Contact': 'Liên Hệ Nhà Cung Cấp',
        'Purchase Order': 'Đơn Mua Hàng',
        'Purchase Order Item': 'Chi Tiết Đơn Mua Hàng',
        'Purchase Report': 'Báo Cáo Mua Hàng',
        'Unit Measure': 'Đơn Vị Tính',
        'Product Group': 'Nhóm Hàng Hóa',
        'Product': 'Hàng Hóa',
        'Warehouse': 'Kho Hàng',
        'Customer / Warehouse': 'Khách Hàng / Kho Hàng',
        'Delivery Order': 'Phiếu Xuất Kho',
        'Delivery Item': 'Chi Tiết Xuất Kho',
        'Sales Return': 'Phiếu Hàng Bán Trả Lại',
        'Goods Receive': 'Phiếu Nhập Kho',
        'Receive Item': 'Chi Tiết Nhập Kho',
        'Purchase Return': 'Phiếu Trả Hàng Mua',
        'Transfer Out': 'Phiếu Chuyển Kho Đi',
        'Transfer In': 'Phiếu Chuyển Kho Đến',
        'Positive Adjustment': 'Phiếu Điều Chỉnh Tăng',
        'Negative Adjustment': 'Phiếu Điều Chỉnh Giảm',
        'Scrapping': 'Phiếu Hủy Hàng',
        'Stock Count': 'Phiếu Kiểm Kê',
        'Transaction Report': 'Báo Cáo Giao Dịch Kho',
        'Stock Report': 'Báo Cáo Tồn Kho',
        'Movement Reports': 'Báo Cáo Lãi Theo Lô',
        'Batch Profit Report': 'Báo Cáo Lãi Theo Lô',
        'Inventory Cost Layers': 'Lớp Giá Vốn Nhập Kho',
        'Inventory Issue Allocations': 'Phân Bổ Xuất Kho Theo Lô',
        'This product already exists in this sales order.': 'Hàng hóa này đã có trong đơn bán hàng.',
        'This product already exists in this purchase order.': 'Hàng hóa này đã có trong đơn mua hàng.',
        'Todo': 'Công Việc',
        'Todo Item': 'Chi Tiết Công Việc',
        'User': 'Người Dùng',
        'Users': 'Người Dùng',
        'Roles': 'Vai Trò',
        'My Profile': 'Hồ Sơ Của Tôi',
        'My Company': 'Thông Tin Doanh Nghiệp',
        'Tax': 'Thuế',
        'Tax Amount': 'Tiền Thuế',
        'Total Tax': 'Tổng Thuế',
        'Before Tax Amount': 'Số Tiền Trước Thuế',
        'After Tax Amount': 'Số Tiền Sau Thuế',
        'Select Tax': 'Chọn Thuế',
        'Number Sequence': 'Mã Số Chứng Từ',
        'Finance': 'Tài Chính',
        'Cash Account': 'Tài Khoản Quỹ',
        'Cash Category': 'Danh Mục Thu Chi',
        'Cash Transaction': 'Giao Dịch Thu Chi',
        'Account Type': 'Loại Tài Khoản',
        'Cash': 'Tiền Mặt',
        'Bank': 'Ngân Hàng',
        'Initial Balance': 'Số Dư Ban Đầu',
        'Current Balance': 'Số Dư Hiện Tại',
        'Transaction Type': 'Loại Giao Dịch',
        'Transaction Date': 'Ngày Giao Dịch',
        'Transaction Info': 'Thông Tin Giao Dịch',
        'Debit': 'Thu',
        'Credit': 'Chi',
        'Payment Status': 'Trạng Thái Thanh Toán',
        'Unpaid': 'Chưa Thanh Toán',
        'Paid': 'Đã Thanh Toán',
        'Total Debit': 'Tổng Thu',
        'Total Credit': 'Tổng Chi',
        'Total Balance': 'Tổng Số Dư',
        'Select Account': 'Chọn Tài Khoản',
        'Select Category': 'Chọn Danh Mục',
        'Select Type': 'Chọn Loại',
        'Select Account Type': 'Chọn Loại Tài Khoản',
        'Enter Amount': 'Nhập Số Tiền',
        'Enter Initial Balance': 'Nhập Số Dư Ban Đầu',
        'Add Cash Account': 'Thêm Tài Khoản Quỹ',
        'Edit Cash Account': 'Sửa Tài Khoản Quỹ',
        'Delete Cash Account?': 'Xóa Tài Khoản Quỹ?',
        'Add Cash Category': 'Thêm Danh Mục Thu Chi',
        'Edit Cash Category': 'Sửa Danh Mục Thu Chi',
        'Delete Cash Category?': 'Xóa Danh Mục Thu Chi?',
        'Add Cash Transaction': 'Thêm Giao Dịch Thu Chi',
        'Edit Cash Transaction': 'Sửa Giao Dịch Thu Chi',
        'Delete Cash Transaction?': 'Xóa Giao Dịch Thu Chi?',
        'Cash Account List': 'Danh Sách Tài Khoản Quỹ',
        'Cash Category List': 'Danh Sách Danh Mục Thu Chi',
        'Cash Transaction List': 'Danh Sách Giao Dịch Thu Chi',
        'Account': 'Tài Khoản',
        'Type': 'Loại',
        'Amount': 'Số Tiền',
        'Source': 'Nguồn',
        'Select Date': 'Chọn Ngày',
        'Select Status': 'Chọn Trạng Thái',
        'Fund Transfer': 'Điều Chuyển Quỹ',
        'Transfer': 'Điều Chuyển',
        'Transfer Info': 'Thông Tin Điều Chuyển',
        'Transfer Date': 'Ngày Điều Chuyển',
        'From Account': 'Từ Tài Khoản',
        'To Account': 'Đến Tài Khoản',
        'Select Source Account': 'Chọn Tài Khoản Nguồn',
        'Select Destination Account': 'Chọn Tài Khoản Đích',
        'Source and destination accounts must be different.': 'Tài khoản nguồn và tài khoản đích phải khác nhau.',
        'Cash transfer legs cannot be edited. Delete the transfer and create a new one.': 'Không thể sửa từng dòng của điều chuyển quỹ. Hãy xóa điều chuyển và tạo lại.',
        'Delete Cash Transfer?': 'Xóa Điều Chuyển Quỹ?',
        'Select a Customer': 'Chọn Khách Hàng',
        'Select Partner': 'Chọn Đối Tác',
        'Partner': 'Đối Tác',
        'Finance Report': 'Báo Cáo Tài Chính',
        'Customer Profit Report': 'Báo Cáo Lợi Nhuận Khách Hàng',
        'Actual Received': 'Thực Thu',
        'Project Cost': 'Chi Phí Công Trình',
        'Select Customer': 'Chọn Khách Hàng',
        'Retry': 'Thử Lại',
        'Created At': 'Thời Điểm Tạo',
        'Only paid amounts from customer-linked transactions are included. Vendor obligations are excluded.': 'Chỉ tính số tiền thực thu, thực chi của giao dịch gắn khách hàng. Nghĩa vụ nhà cung cấp không được tính vào báo cáo này.',
        'Unable to load the customer profit report.': 'Không thể tải báo cáo lợi nhuận khách hàng.',
        'Unable to initialize the customer profit report.': 'Không thể khởi tạo báo cáo lợi nhuận khách hàng.',
        'Dashboard could not be initialized.': 'Không thể khởi tạo Bảng điều khiển.',
        'Dashboard could not be initialized. Reload the page and check the browser Console/Network details.': 'Không thể khởi tạo Bảng điều khiển. Hãy tải lại trang và kiểm tra Console/Network của trình duyệt.',
        'Total Received': 'Tổng Thu',
        'Total Spent': 'Tổng Chi',
        'Received': 'Thu',
        'Spent': 'Chi',
        'Net': 'Chênh Lệch',
        'From Date': 'Từ Ngày',
        'To Date': 'Đến Ngày',
        'Clear Filters': 'Xóa Bộ Lọc',
        'Only confirmed transactions linked to a customer are included.': 'Chỉ bao gồm các giao dịch đã xác nhận có gắn khách hàng.',
        'Device Code Management': 'Kiểu Quản Lý Mã Thiết Bị',
        'Auto-generate Internal Code': 'Tự Sinh Mã Nội Bộ',
        'Fixed Code': 'Mã Cố Định',
        'Manufacturer Serial Entry': 'Nhập Serial Hãng',
        'In Development': 'Đang Phát Triển',
        'Example generated code': 'Ví dụ mã tự sinh',
        'Device Code': 'Mã Thiết Bị',
        'Enter internal code/SKU...': 'Nhập mã nội bộ/SKU...',
        'Clear': 'Xóa',
        'Serial number, SO number, or customer phone': 'Số serial, số đơn bán hàng hoặc số điện thoại khách hàng',
        'Movement History': 'Lịch Sử Giao Dịch',
        'Batch': 'Số Lô',
        'Qty': 'SL',
        'Error': 'Lỗi',
        'Payment Successful': 'Thanh Toán Thành Công',
        'Missing Data': 'Thiếu Dữ Liệu',
        'Please select product, warehouse and batch first.': 'Hãy chọn sản phẩm, kho và batch trước.',
        'Please select a payment account.': 'Vui lòng chọn tài khoản thanh toán.',
        'Select Device Code': 'Chọn Mã Thiết Bị',
        'Fixed Code must be 2-4 letters or digits.': 'Mã cố định phải có 2-4 ký tự chữ hoặc số.',
        'Number (System Code)': 'Number (Mã HT)',
        'Reference Code (Custom Code)': 'Reference Code (Mã tùy chỉnh)',
        'Enter Name': 'Nhập Tên',
        'Login': 'Đăng Nhập',
        'Log In': 'Đăng Nhập',
        'Log Out': 'Đăng Xuất',
        'Logout': 'Đăng Xuất',
        'Register': 'Đăng Ký',
        'Forgot Password': 'Quên Mật Khẩu',
        'Forgot Password Confirmation': 'Xác Nhận Quên Mật Khẩu',
        'Email Confirm': 'Xác Nhận Email',
        'Home page': 'Trang Chủ',
        'Profile': 'Hồ Sơ',
        'Language': 'Ngôn Ngữ',
        'Currency:': 'Tiền Tệ:',
        'Loading...': 'Đang Tải...',
        'Please wait...': 'Vui Lòng Chờ...',
        'All Right Reserved.': 'Bảo Lưu Mọi Quyền.',
        'Developed By:': 'Phát Triển Bởi:',
        'Main Info': 'Thông Tin Chính',
        'Tax Info': 'Thông Tin Thuế',
        'Address': 'Địa Chỉ',
        'Communication': 'Liên Hệ',
        'Social Media': 'Mạng Xã Hội',
        'Customer Information': 'Thông Tin Khách Hàng',
        'Vendor Information': 'Thông Tin Nhà Cung Cấp',
        'Warehouse Information': 'Thông Tin Kho Hàng',
        'Order Information': 'Thông Tin Đơn Hàng',
        'Delivery Information': 'Thông Tin Xuất Kho',
        'Receive Information': 'Thông Tin Nhập Kho',
        'Return Information': 'Thông Tin Trả Hàng',
        'Adjustment Information': 'Thông Tin Điều Chỉnh',
        'Transfer Information': 'Thông Tin Chuyển Kho',
        'Scrapping Information': 'Thông Tin Hủy Hàng',
        'Stock Count Information': 'Thông Tin Kiểm Kê',
        'User Info': 'Thông Tin Người Dùng',
        'User Password': 'Mật Khẩu Người Dùng',
        'User Roles': 'Vai Trò Người Dùng',
        'Payment Summary': 'Tổng Hợp Thanh Toán',
        'Subtotal': 'Tạm Tính',
        'Total Amount': 'Tổng Thanh Toán',
        'Total Movement': 'Tổng Số Lượng Giao Dịch',
        'Total Counted': 'Tổng Số Lượng Kiểm Kê',
        'Order Date': 'Ngày Chứng Từ',
        'Order Number': 'Số Đơn Hàng',
        'Receive Date': 'Ngày Nhập',
        'Delivery Date': 'Ngày Xuất',
        'Return Date': 'Ngày Trả Hàng',
        'Release Date': 'Ngày Xuất Chuyển',
        'Adjustment Date': 'Ngày Điều Chỉnh',
        'Scrapping Date': 'Ngày Hủy Hàng',
        'Count Date': 'Ngày Kiểm Kê',
        'Movement Date': 'Ngày Giao Dịch',
        'Sales Order Payment': 'Thanh Toán Đơn Bán Hàng',
        'Current Status': 'Trạng Thái Hiện Tại',
        'Order Total': 'Tổng Tiền Đơn Hàng',
        'Remaining': 'Còn Lại',
        'Select Cash Account': 'Chọn Tài Khoản Quỹ',
        'Changing the account updates this transaction; it does not create another transaction.': 'Đổi Tài Khoản Sẽ Cập Nhật Giao Dịch Này, Không Tạo Giao Dịch Mới.',
        'Save Payment': 'Lưu Thanh Toán',
        'Payment Completed': 'Đã Thanh Toán Đủ',
        'Payment Saved': 'Đã Lưu Thanh Toán',
        'Payment Failed': 'Thanh Toán Thất Bại',
        'Select a cash account.': 'Vui Lòng Chọn Tài Khoản Quỹ.',
        'Paid amount cannot be negative.': 'Số Tiền Đã Thanh Toán Không Được Âm.',
        'Paid amount cannot exceed the order total.': 'Số Tiền Đã Thanh Toán Không Được Vượt Tổng Tiền Đơn Hàng.',
        'Only Description and Cash Category can be edited for a material export transaction.': 'Giao Dịch Phiếu Xuất Vật Tư Chỉ Được Sửa Diễn Giải Và Danh Mục Thu Chi.',
        'Document Not Found': 'Không Tìm Thấy Chứng Từ',
        'The requested document could not be opened.': 'Không Thể Mở Chứng Từ Được Yêu Cầu.',
        'Document View Unavailable': 'Chưa Hỗ Trợ Xem Chứng Từ Này',
        'Received Date': 'Ngày Nhập',
        'Number': 'Số Chứng Từ',
        'Number (Mã HT)': 'Số Chứng Từ (Mã Hệ Thống)',
        'Reference': 'Tham Chiếu',
        'Description': 'Diễn Giải',
        'Order Status': 'Trạng Thái Chứng Từ',
        'Status': 'Trạng Thái',
        'Draft': 'Nháp',
        'Confirm': 'Xác Nhận',
        'Confirmed': 'Đã Xác Nhận',
        'Cancelled': 'Đã Hủy',
        'Canceled': 'Đã Hủy',
        'Archived': 'Đã Lưu Trữ',
        'In': 'Nhập',
        'Out': 'Xuất',
        'Product Number': 'Mã Hàng',
        'Product Name': 'Tên Hàng',
        'Physical Product': 'Hàng Hóa Vật Lý',
        'Is Physical Product?': 'Là Hàng Hóa Vật Lý?',
        'Reference Code': 'Mã Tham Khảo',
        'Reference Code (Mã tùy chỉnh)': 'Mã Tham Khảo (Mã Tùy Chỉnh)',
        'Ref Code': 'Mã Tham Khảo',
        'Enter Reference Code (SKU/Custom)': 'Nhập Mã Tham Khảo (SKU/Tùy Chỉnh)',
        'Batch Number': 'Số Lô',
        'Qty.': 'SL.',
        'Quantity': 'Số Lượng',
        'Summary': 'Ghi Chú',
        'Unit Price': 'Đơn Giá',
        'Unit Cost': 'Giá Vốn Đơn Vị',
        'Original Qty': 'Số Lượng Nhập',
        'Total': 'Thành Tiền',
        'Total Cost': 'Tổng Giá Vốn',
        'Total Sales': 'Tổng Doanh Thu',
        'Percentage': 'Tỷ Lệ',
        'Prefix': 'Tiền Tố',
        'Suffix': 'Hậu Tố',
        'Warehouse': 'Kho Hàng',
        'Warranty Months': 'Thời Gian Bảo Hành (Tháng)',
        'Supplier Warranty (Months)': 'BH Nhà Cung Cấp (Tháng)',
        'Supplier Warranty Remaining': 'BH NCC Còn Lại',
        'Select a Warehouse': 'Chọn Kho Hàng',
        'Enter Warranty Months': 'Nhập Thời Gian Bảo Hành',
        'Warranty months must be zero or greater.': 'Thời gian bảo hành phải lớn hơn hoặc bằng 0.',
        'System Warehouse': 'Kho Hệ Thống',
        'Is System Warehouse?': 'Là Kho Hệ Thống?',
        'System Stock': 'Tồn Kho Hệ Thống',
        'Movement': 'Số Lượng Giao Dịch',
        'Trans Type': 'Loại Giao Dịch',
        'Adjustment': 'Điều Chỉnh',
        'Counted': 'Đã Kiểm Kê',
        'Close': 'Đóng',
        'Save': 'Lưu',
        'Delete': 'Xóa',
        'Search': 'Tìm Kiếm',
        'Add': 'Thêm',
        'Edit': 'Sửa',
        'Update': 'Cập Nhật',
        'Cancel': 'Hủy',
        'Save Successful': 'Lưu Thành Công',
        'Delete Successful': 'Xóa Thành Công',
        'Update Successful': 'Cập Nhật Thành Công',
        'Save Failed': 'Lưu Thất Bại',
        'Delete Failed': 'Xóa Thất Bại',
        'Update Failed': 'Cập Nhật Thất Bại',
        'Saving...': 'Đang Lưu...',
        'Deleting...': 'Đang Xóa...',
        'Login Successful': 'Đăng Nhập Thành Công',
        'Login Failed': 'Đăng Nhập Thất Bại',
        'An Error Occurred': 'Đã Xảy Ra Lỗi',
        'An unexpected error occurred.': 'Đã xảy ra lỗi không mong muốn.',
        'Unauthorized': 'Không có quyền truy cập',
        'Token not valid': 'Phiên đăng nhập không hợp lệ',
        'Error validating token': 'Lỗi xác thực phiên đăng nhập',
        'You are being redirected...': 'Hệ thống đang chuyển hướng...',
        'Page will be refreshed...': 'Trang sẽ được làm mới...',
        'Try Again': 'Thử lại',
        'OK': 'Đồng ý',
        'Please try again.': 'Vui lòng thử lại.',
        'Please check your credentials.': 'Vui lòng kiểm tra lại thông tin đăng nhập.',
        'Please check your data.': 'Vui lòng kiểm tra lại dữ liệu.',
        'Please check your email. You are being redirected...': 'Vui lòng kiểm tra email. Hệ thống đang chuyển hướng...',
        'This field is required.': 'Trường này là bắt buộc.',
        'This field is required': 'Trường này là bắt buộc',
        'This field': 'Trường này',
        'Value is required': 'Trường này là bắt buộc',
        'Retail': 'Xuất bán lẻ',
        'Internal': 'Xuất nội bộ',
        'Form will be closed...': 'Biểu mẫu sẽ được đóng...',
        'Passwords do not match.': 'Mật khẩu không khớp.',
        'Password and Confirm Password must match.': 'Mật khẩu và mật khẩu xác nhận phải khớp nhau.',
        'Password has been updated.': 'Mật khẩu đã được cập nhật.',
        'Password reset is in progress.': 'Đang đặt lại mật khẩu.',
        'Email Confirmation Successful': 'Xác nhận email thành công',
        'Email Confirmation Failed': 'Xác nhận email thất bại',
        'Email confirmation is in progress.': 'Đang xác nhận email.',
        'Email or code is missing in the URL query string.': 'Thiếu email hoặc mã xác nhận trong URL.',
        'Forgot Password Confirm': 'Xác nhận quên mật khẩu',
        'Click the button below to confirm and log out completely.': 'Bấm nút bên dưới để xác nhận và đăng xuất hoàn toàn.',
        'Are you sure you want to log out?': 'Bạn có chắc muốn đăng xuất không?',
        'Remember Me': 'Ghi nhớ đăng nhập',
        '- OR -': 'HOẶC',
        'Sign in using Facebook': 'Đăng nhập bằng Facebook',
        'Sign in using Google+': 'Đăng nhập bằng Google',
        'Sign up using Facebook': 'Đăng ký bằng Facebook',
        'Sign up using Google+': 'Đăng ký bằng Google',
        'Register a new membership': 'Đăng ký tài khoản mới',
        'I already have a membership': 'Tôi đã có tài khoản',
        'I forgot my password': 'Tôi quên mật khẩu',
        'Password': 'Mật khẩu',
        'Re-type Password': 'Nhập lại mật khẩu',
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
        'Website': 'Trang web',
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
        'Inventory Stock': 'Tồn kho',
        'Inventory Transaction': 'Giao dịch kho',
        'Latest Sales': 'Đơn bán hàng mới nhất',
        'Latest Purchase': 'Đơn mua hàng mới nhất',
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
        'Return Item': 'Chi tiết trả hàng',
        'Change Avatar': 'Đổi ảnh đại diện',
        'Uploader Area': 'Khu vực tải lên',
        'User Image': 'Ảnh người dùng',
        'Your image has been uploaded successfully!': 'Ảnh của bạn đã được tải lên thành công!',
        'Default Company': 'Công ty mặc định',
        'Open': 'Đang mở',
        'Closed': 'Đã hết',
        'Unknown': 'Không xác định',
        'Unknown Product': 'Hàng hóa không xác định',
        'This page only shows batches that have already been sold. Each row represents the actual profit by product and batch based on issued allocations.': 'Trang này chỉ hiển thị các lô đã phát sinh bán hàng. Mỗi dòng là lợi nhuận thực tế theo hàng hóa và lô đã được cấp phát khi xuất kho.',
        'This report shows only batches that still have stock on hand. Use it to check which product is available in which batch and how much quantity remains in the warehouse.': 'Báo cáo này chỉ hiển thị các lô vẫn còn tồn kho. Dùng báo cáo để kiểm tra hàng hóa nào đang còn ở lô nào và còn bao nhiêu trong kho.',
        'Select an existing batch if you want to receive more stock into the same batch, or type a new batch to create a new supplier lot.': 'Chọn lô đã có nếu muốn nhập tiếp vào cùng lô, hoặc gõ lô mới để tạo lô nhập mới từ nhà cung cấp.',
        'When a product is selected, the system suggests the earliest available batch by FIFO. You can still choose a different batch, and each option shows its remaining stock.': 'Khi chọn hàng hóa, hệ thống sẽ gợi ý lô còn tồn sớm nhất theo FIFO. Bạn vẫn có thể chọn lô khác, và mỗi lựa chọn đều hiển thị tồn còn lại.',
        'Inventory transactions are auto-generated from': 'Giao dịch kho được tự động tạo từ',
        'items. Maintain batch numbers on the purchase order before confirming receipt.': 'chi tiết. Hãy quản lý đúng số lô trên đơn mua trước khi xác nhận nhập kho.',
        'items. Leave batch blank on the sales order for FIFO, or fill it to force a specific batch.': 'chi tiết. Để trống số lô trên đơn bán hàng để xuất theo FIFO, hoặc nhập số lô nếu muốn chỉ định lô cụ thể.',
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
        'Amount must be greater than 0.': 'Số tiền phải lớn hơn 0.',
        'Unable to delete this item.': 'Không thể xóa dòng này.',
        'Print PDF': 'In PDF',
        'Only draft goods receive can be updated.': 'Chỉ phiếu nhập kho ở trạng thái nháp mới được phép cập nhật.',
        'Only draft goods receive can be deleted.': 'Chỉ phiếu nhập kho ở trạng thái nháp mới được phép xóa.',
        'Only draft delivery order can be updated.': 'Chỉ phiếu xuất kho ở trạng thái nháp mới được phép cập nhật.',
        'Only draft delivery order can be deleted.': 'Chỉ phiếu xuất kho ở trạng thái nháp mới được phép xóa.',
        'Issue transaction must reference a sales order item.': 'Giao dịch xuất kho phải gắn với một dòng đơn bán hàng.',
        'Unable to resolve default warehouse for goods receive.': 'Không xác định được kho mặc định cho phiếu nhập kho.',
        'Unable to resolve default warehouse for delivery order.': 'Không xác định được kho mặc định cho phiếu xuất kho.',
        'Product Serial': 'Serial Hàng Hóa',
        'Product Serials': 'Danh Sách Serial',
        'Internal Serial Number': 'Số Serial Nội Bộ',
        'Serial Number': 'Số Serial',
        'Device Serial': 'Serial Thiết Bị',
        'Device Serials': 'Mã thiết bị',
        'Warranty Lookup': 'Tra Cứu Bảo Hành',
        'SO Number': 'Số Đơn Bán',
        'Sold Date': 'Ngày Bán',
        'Warranty End': 'Hạn Bảo Hành',
        'Warranty End Date': 'Ngày Hết Hạn Bảo Hành',
        'Warranty Status': 'Trạng Thái Bảo Hành',
        'Document Detail': 'Chi Tiết Chứng Từ',
        'Purchase Order Details': 'Chi Tiết Đơn Mua Hàng',
        'Sales Order Details': 'Chi Tiết Đơn Bán Hàng',
        'Document Number': 'Số Chứng Từ',
        'Items': 'Danh Sách Mặt Hàng',
        'Price': 'Đơn Giá',
        'Available': 'Khả Dụng',
        'Reserved': 'Đã Đặt',
        'From Warehouse': 'Từ Kho',
        'To Warehouse': 'Đến Kho',
        'Valid': 'Còn Hạn',
        'Expired': 'Hết Hạn',
        'N/A': 'Không Có',
        'GoodsReceive': 'Phiếu Nhập Kho',
        'DeliveryOrder': 'Phiếu Xuất Kho',
        'Sold': 'Đã Bán',
        'Pending': 'Chờ Xử Lý',
        'InStock': 'Tồn Kho',
        'InTransfer': 'Đang Luân Chuyển',
        'ReturnedToSupplier': 'Trả Nhà Cung Cấp',
        'Scrapped': 'Đã hủy',
        'ReturnedByCustomer': 'Khách hàng trả lại',
        'Returned By Customer': 'Khách hàng trả lại',
        'Supplier Warranty End': 'Hạn BH Nhà Cung Cấp',
        'StockCount': 'Kho Kiểm Kê',
        'SalesReturn': 'Phiếu Hàng Bán Trả Lại',
        'PurchaseReturn': 'Phiếu Trả Hàng Mua',
        'TransferOut': 'Phiếu Chuyển Kho Đi',
        'TransferIn': 'Phiếu Chuyển Kho Đến',
        'PositiveAdjustment': 'Phiếu Điều Chỉnh Tăng',
        'NegativeAdjustment': 'Phiếu Điều Chỉnh Giảm',
        'Document not found': 'Không tìm thấy chứng từ',
        'Error loading document': 'Lỗi tải chứng từ',
        'Internal serial, SO number, or customer phone': 'Serial nội bộ, số đơn bán hoặc SĐT khách hàng',
        'CostAllocation': 'Phân Bổ Công Trình',
        'MaterialExport': 'Phiếu Xuất Vật Tư',
        'Material Export': 'Phiếu Xuất Vật Tư',
        'Vendor Debt Report': 'Báo Cáo Công Nợ NCC',
        'Vendor Debt': 'Công Nợ NCC',
        'Total Purchase': 'Tổng Tiền Mua',
        'Total Paid': 'Tổng Đã Thanh Toán',
        'Remaining Debt': 'Còn Nợ',
        'Vendor Name': 'Tên Nhà Cung Cấp',
        'Exported': 'Đã Xuất',
        'PartiallyPaid': 'Thanh Toán Một Phần',
        'Partially Paid': 'Thanh Toán Một Phần',
        'Payment History': 'Lịch Sử Thanh Toán',
        'No payments': 'Chưa Có Thanh Toán',
        'No allocation details': 'Chưa Có Chi Tiết Phân Bổ',
        'Payment Date': 'Ngày Thanh Toán',
        'Payment This Time': 'Số Tiền Trả Lần Này',
        'Remaining Amount': 'Số Tiền Còn Lại',
        'Paid Amount': 'Số Tiền Đã Trả',
        'Cost Allocation Details': 'Chi Tiết Phân Bổ',
        'Purchase Obligation': 'Nghĩa Vụ Từ Đơn Mua',
        'Manual Obligation': 'Nghĩa Vụ Thủ Công',
        'Total Obligation': 'Tổng Nghĩa Vụ',
        'Serial Numbers': 'Số Serial',
        'Quick Add Customer Group': 'Thêm Nhanh Nhóm Khách Hàng',
        'Quick Add Customer Category': 'Thêm Nhanh Loại Khách Hàng',
        'Quick Add Vendor Group': 'Thêm Nhanh Nhóm Nhà Cung Cấp',
        'Quick Add Vendor Category': 'Thêm Nhanh Loại Nhà Cung Cấp',
        'Allocation saved': 'Đã Lưu Phân Bổ',
        'Allocation is locked': 'Phân Bổ Đã Bị Khóa',
        'Warehouse cannot be changed': 'Không Thể Đổi Kho',
        'Quantity exceeds stock': 'Số Lượng Vượt Tồn Kho',
        'Quick Add is unavailable': 'Không Thể Dùng Thêm Nhanh',
        'Cost Allocation': 'Phân Bổ Công Trình',
        'Confirm Allocation': 'Xác Nhận Phân Bổ',
        'Allocation Quantity': 'Số Lượng Phân Bổ',
        'Quick Add Customer': 'Thêm Nhanh Khách Hàng',
        'No products selected': 'Chưa Chọn Sản Phẩm',
        'Select at least one product to allocate.': 'Chọn Ít Nhất Một Sản Phẩm Để Phân Bổ.',
        'Invalid quantity': 'Số Lượng Không Hợp Lệ',
        'Allocation quantity cannot be negative.': 'Số Lượng Phân Bổ Không Được Âm.',
        'Allocation exceeds purchase quantity': 'Phân Bổ Vượt Số Lượng Mua',
        'Customer is required': 'Bắt Buộc Chọn Khách Hàng',
        'Allocation failed': 'Phân Bổ Thất Bại',
        'Check the allocation data and try again.': 'Kiểm Tra Dữ Liệu Phân Bổ Và Thử Lại.',
        'An error occurred': 'Đã Xảy Ra Lỗi',
        'The cost allocation could not be saved.': 'Không Thể Lưu Phân Bổ.',
        'One unpaid vendor obligation was created or updated.': 'Đã Tạo Hoặc Cập Nhật Một Chứng Từ Công Nợ Nhà Cung Cấp Chưa Thanh Toán.',
        'Open Cash Transactions?': 'Mở Giao Dịch Tiền?',
        'Quick Add Vendor': 'Thêm Nhanh Nhà Cung Cấp',
        'Quick Add Product': 'Thêm Nhanh Sản Phẩm',
        'Quick Add Product Group': 'Thêm Nhanh Nhóm Hàng Hóa',
        'Quick Add Warehouse': 'Thêm Nhanh Kho Hàng',
        'Add Warehouse': 'Thêm Kho Hàng',
        'Add Customer': 'Thêm Khách Hàng',
        'Add Split Row': 'Thêm Dòng Chia',
        'Select a row to split': 'Chọn Dòng Để Chia Thêm',
        'Main Information': 'Thông Tin Chính',
        'Added successfully!': 'Đã Thêm Thành Công!',
        'Vendor added successfully!': 'Đã Thêm Nhà Cung Cấp Thành Công!',
        'Customer added successfully!': 'Đã Thêm Khách Hàng Thành Công!',
        'Product added successfully!': 'Đã Thêm Sản Phẩm Thành Công!',
        'The record could not be added. Please try again.': 'Không Thể Thêm Bản Ghi. Vui Lòng Thử Lại.',
        'The Vendor could not be added. Please try again.': 'Không Thể Thêm Nhà Cung Cấp. Vui Lòng Thử Lại.',
        'The Customer could not be added. Please try again.': 'Không Thể Thêm Khách Hàng. Vui Lòng Thử Lại.',
        'The Product could not be added. Please try again.': 'Không Thể Thêm Sản Phẩm. Vui Lòng Thử Lại.',
        'Vendor name is required.': 'Tên Nhà Cung Cấp Là Bắt Buộc.',
        'Customer name is required.': 'Tên Khách Hàng Là Bắt Buộc.',
        'Product name is required.': 'Tên Sản Phẩm Là Bắt Buộc.',
        'Select a Vendor Group.': 'Chọn Nhóm Nhà Cung Cấp.',
        'Select a Vendor Category.': 'Chọn Loại Nhà Cung Cấp.',
        'Select a Customer Group.': 'Chọn Nhóm Khách Hàng.',
        'Select a Customer Category.': 'Chọn Loại Khách Hàng.',
        'Select a Product Group.': 'Chọn Nhóm Hàng Hóa.',
        'Payment': 'Thanh Toán',
        'Payment successful': 'Thanh Toán Thành Công',
        'Payment is unavailable': 'Không Thể Thanh Toán',
        'Allocate this purchase order first to create its vendor obligation.': 'Hãy Chia Đơn Mua Hàng Trước Để Tạo Chứng Từ Công Nợ Nhà Cung Cấp.',
        'The payment was not saved.': 'Không Thể Lưu Thanh Toán.',
        'Page initialization failed': 'Khởi Tạo Trang Thất Bại',
        'Material Export could not be loaded.': 'Không Thể Tải Trang Phiếu Xuất Vật Tư.',
        'Select a payment account.': 'Chọn Tài Khoản Thanh Toán.',
        'Payment amount must be greater than zero.': 'Số Tiền Thanh Toán Phải Lớn Hơn 0.',
        'Payment amount cannot exceed the remaining amount.': 'Số Tiền Thanh Toán Không Được Vượt Quá Số Còn Lại.',
        'Payment date is required.': 'Ngày Thanh Toán Là Bắt Buộc.',
        'All installments for this transaction use the account selected on its first payment.': 'Tất Cả Các Lần Thanh Toán Của Giao Dịch Này Sử Dụng Tài Khoản Đã Chọn Ở Lần Thanh Toán Đầu Tiên.',
        'All payments for a cash transaction must use the same cash account.': 'Tất Cả Các Lần Thanh Toán Của Một Giao Dịch Phải Dùng Cùng Một Tài Khoản Quỹ.',
        'Original Amount': 'Số Tiền Gốc',
        'View Cash Transaction': 'Xem Giao Dịch Thu Chi',
        'View Purchase Order': 'Xem Đơn Mua Hàng',
        'Loading source details...': 'Đang Tải Chi Tiết Nguồn...',
        'The source transaction details could not be loaded.': 'Không Thể Tải Chi Tiết Phân Bổ Và Lịch Sử Thanh Toán.',
        'Manual payment adjustment': 'Điều Chỉnh Thanh Toán Thủ Công',
        'Paid amount must be between zero and the original amount.': 'Số Tiền Đã Trả Phải Nằm Trong Khoảng Từ 0 Đến Số Tiền Gốc.',
        'Select a payment account before changing the paid amount.': 'Hãy Chọn Tài Khoản Thanh Toán Trước Khi Thay Đổi Số Tiền Đã Trả.',
        'Only Paid Amount, Description and Cash Category can be edited for a source-generated transaction.': 'Giao Dịch Tự Động Chỉ Cho Phép Sửa Số Tiền Đã Trả, Diễn Giải Và Danh Mục Thu Chi.',
        'Paid amount cannot exceed the original amount.': 'Số Tiền Đã Trả Không Được Lớn Hơn Số Tiền Gốc.',
        'Purchase Order Details': 'Chi Tiết Đơn Mua Hàng',
        'Selected': 'Đã Chọn',
        'products for cost allocation. Add multiple rows when one product is allocated to multiple customers.': 'Sản Phẩm Để Phân Bổ Chi Phí. Thêm Nhiều Dòng Khi Một Sản Phẩm Được Phân Bổ Cho Nhiều Khách Hàng.',
        'Incomplete product row': 'Dòng Sản Phẩm Chưa Hoàn Tất',
        'Complete all required fields (Product, Warehouse, Tax and Quantity) on the edited row before saving the purchase order.': 'Điền Đầy Đủ Các Trường Bắt Buộc (Sản Phẩm, Kho, Thuế Và Số Lượng) Trên Dòng Đang Sửa Trước Khi Lưu Đơn Mua Hàng.',
        'The purchase order has been deleted.': 'Đơn Mua Hàng Đã Được Xóa.',
        'Allocation data could not be loaded.': 'Không Thể Tải Dữ Liệu Phân Bổ.',
        'Select or enter Batch Number': 'Chọn Hoặc Nhập Số Lô',
        'Supplier Warranty (Months)': 'Bảo Hành Nhà Cung Cấp (Tháng)',
        'Warranty Months': 'Số Tháng Bảo Hành',
        'Product Number': 'Mã Sản Phẩm',
        'Allocated Quantity': 'Số Lượng Đã Chia',
        'Remaining Quantity': 'Số Lượng Còn Lại',
        'Missing Required Information': 'Thiếu Thông Tin Bắt Buộc',
        'Select a product before saving.': 'Chọn Sản Phẩm Trước Khi Lưu.',
        'Select a warehouse before saving.': 'Chọn Kho Trước Khi Lưu.',
        'Select a tax before saving.': 'Chọn Thuế Trước Khi Lưu.',
        'Quantity must be greater than zero.': 'Số Lượng Phải Lớn Hơn 0.',
        'Value must be greater than zero.': 'Giá Trị Phải Lớn Hơn 0.',
        'Allocate selected product costs to customers': 'Phân Bổ Chi Phí Các Sản Phẩm Đã Chọn Cho Khách Hàng',
        'Select Category (Optional)': 'Chọn Danh Mục (Tùy Chọn)',
        'No row selected': 'Chưa Chọn Dòng',
        'Select one product row before adding another allocation.': 'Chọn Một Dòng Sản Phẩm Trước Khi Thêm Phân Bổ Khác.',
        'Cost allocation is unavailable': 'Không Thể Phân Bổ Chi Phí',
        'A purchase order can only be allocated after it is confirmed.': 'Chỉ Có Thể Phân Bổ Đơn Mua Hàng Sau Khi Đơn Đã Được Xác Nhận.'
    };

    const termTranslations = {
        'dashboard': 'bảng điều khiển',
        'default dashboard': 'bảng điều khiển tổng quan',
        'operations overview': 'tổng quan vận hành',
        'confirmed sales': 'doanh số đã xác nhận',
        'customer receivable': 'công nợ khách hàng',
        'confirmed purchases': 'giá trị mua đã xác nhận',
        'vendor debt': 'công nợ nhà cung cấp',
        'cash balance': 'số dư quỹ',
        'inventory quantity': 'số lượng tồn kho',
        'material exports': 'phiếu xuất vật tư',
        'recent sales orders': 'đơn bán hàng gần đây',
        'recent purchase orders': 'đơn mua hàng gần đây',
        'latest inventory movements': 'biến động kho gần đây',
        'stock by warehouse': 'tồn kho theo kho hàng',
        'sales': 'bán hàng',
        'sales rtrn.': 'trả hàng bán',
        'purchase': 'mua hàng',
        'purchase rtrn.': 'trả hàng mua',
        'purchases': 'mua hàng',
        'inventory': 'kho',
        'stocks': 'tồn kho',
        'transactions': 'giao dịch',
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
        'UnitMeasure': 'Đơn vị tính',
        'product group': 'nhóm hàng hóa',
        'ProductGroup': 'Nhóm hàng hóa',
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
        'inventory stock': 'tồn kho',
        'inventory transaction': 'giao dịch kho',
        'latest sales': 'đơn bán hàng mới nhất',
        'latest purchase': 'đơn mua hàng mới nhất',
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
        'tax amount': 'tiền thuế',
        'total tax': 'tổng thuế',
        'before tax amount': 'số tiền trước thuế',
        'after tax amount': 'số tiền sau thuế',
        'number sequence': 'mã số chứng từ',
        'finance': 'tài chính',
        'cash account': 'tài khoản quỹ',
        'cash category': 'danh mục thu chi',
        'cash transaction': 'giao dịch thu chi',
        'account type': 'loại tài khoản',
        'initial balance': 'số dư ban đầu',
        'current balance': 'số dư hiện tại',
        'fund transfer': 'điều chuyển quỹ',
        'transfer date': 'ngày điều chuyển',
        'from account': 'từ tài khoản',
        'to account': 'đến tài khoản',
        'finance report': 'báo cáo tài chính',
        'transaction date': 'ngày giao dịch',
        'transaction info': 'thông tin giao dịch',
        'debit': 'ghi nợ',
        'credit': 'ghi có',
        'payment status': 'trạng thái thanh toán',
        'unpaid': 'chưa thanh toán',
        'paid': 'đã thanh toán',
        'total debit': 'tổng thu',
        'total credit': 'tổng chi',
        'total balance': 'tổng số dư',
        'account': 'tài khoản',
        'type': 'loại',
        'amount': 'số tiền',
        'source': 'nguồn',
        'order date': 'ngày chứng từ',
        'order number': 'số đơn hàng',
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
        'qty.': 'SL.',
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
        'total movement': 'tổng số lượng giao dịch',
        'total counted': 'tổng số lượng kiểm kê',
        'payment summary': 'tổng hợp thanh toán',
        'number': 'số chứng từ',
        'reference': 'tham chiếu',
        'description': 'diễn giải',
        'warehouse': 'kho hàng',
        'address': 'địa chỉ',
        'communication': 'liên hệ',
        'social media': 'mạng xã hội',
        'system warehouse': 'kho hệ thống',
        'system stock': 'tồn kho hệ thống',
        'supplier warranty (months)': 'BH nhà cung cấp (tháng)',
        'supplier warranty remaining': 'BH NCC còn lại',
        'movement': 'số lượng giao dịch',
        'trans type': 'loại giao dịch',
        'transaction type': 'loại giao dịch',
        'adjustment': 'điều chỉnh',
        'counted': 'đã kiểm kê',
        'information': 'thông tin',
        'delivery': 'xuất kho',
        'order': 'đơn hàng',
        'receive': 'nhập kho',
        'return': 'trả hàng',
        'transfer': 'chuyển kho',
        'from': 'từ',
        'to': 'đến',
        'return item': 'chi tiết trả hàng',
        'sales price': 'giá bán',
        'sold qty': 'số lượng đã bán',
        'profit': 'lợi nhuận',
        'remaining qty': 'tồn còn lại',
        'cogs': 'giá vốn',
        'last sold': 'lần bán gần nhất',
        'password': 'mật khẩu',
        're-type password': 'nhập lại mật khẩu',
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
        'website': 'trang web',
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
        'change avatar': 'đổi ảnh đại diện',
        'change role': 'đổi vai trò',
        'edit company': 'chỉnh sửa thông tin doanh nghiệp',
        'manage contact': 'quản lý liên hệ',
        'language': 'ngôn ngữ',
        'user info': 'thông tin người dùng',
        'user password': 'mật khẩu người dùng',
        'user roles': 'vai trò người dùng',
        'tax info': 'thông tin thuế',
        'uploader area': 'khu vực tải lên',
        'user image': 'ảnh người dùng',
        'product serial': 'serial hàng hóa',
        'warranty lookup': 'tra cứu bảo hành',
        'device serial': 'serial thiết bị',
        'document detail': 'chi tiết chứng từ',
        'items': 'danh sách mặt hàng',
        'available': 'khả dụng',
        'reserved': 'đã đặt',
        'from warehouse': 'từ kho',
        'to warehouse': 'đến kho',
        'valid': 'còn hạn',
        'expired': 'hết hạn',
        'n/a': 'không có',
        'goodsreceive': 'phiếu nhập kho',
        'deliveryorder': 'phiếu xuất kho',
        'sold': 'đã bán',
        'pending': 'chờ xử lý',
        'instock': 'tồn kho',
        'intransfer': 'đang luân chuyển',
        'returnedtosupplier': 'trả nhà cung cấp',
        'missing': 'thất lạc',
        'scrapped': 'hủy bỏ',
        'supplier warranty end': 'hạn bh nhà cung cấp',
        'this field': 'trường này',
        'this field is required': 'trường này là bắt buộc',
        'costallocation': 'phân bổ công trình',
        'materialexport': 'phiếu xuất vật tư',
        'material export': 'phiếu xuất vật tư',
        'vendor debt report': 'báo cáo công nợ NCC',
        'vendor debt': 'công nợ NCC',
        'total purchase': 'tổng tiền mua',
        'total paid': 'tổng đã thanh toán',
        'remaining debt': 'còn nợ',
        'vendor name': 'tên nhà cung cấp',
        'customer / warehouse': 'khách hàng / kho hàng',
        'has total allocation': 'có tổng phân bổ',
        'exceeding purchased quantity': 'vượt số lượng mua',
        'has a positive allocation but no customer': 'có số lượng phân bổ lớn hơn 0 nhưng chưa chọn khách hàng',
        'payment': 'thanh toán',
        'payment for order': 'chi tiền đơn'
    };

    Object.entries({ ...termTranslations }).forEach(([key, value]) => {
        const normalizedKey = normalizeText(key).toLowerCase();
        termTranslations[normalizedKey] = value;
        if (key !== normalizedKey) {
            delete termTranslations[key];
        }
    });

    const exactEnglishByVietnamese = Object.entries(exactTranslations).reduce((result, [english, vietnamese]) => {
        const normalizedVietnamese = normalizeText(vietnamese);
        if (normalizedVietnamese && !result[normalizedVietnamese]) {
            result[normalizedVietnamese] = english;
        }
        return result;
    }, {});
    const termEnglishByVietnamese = Object.entries(termTranslations).reduce((result, [english, vietnamese]) => {
        const normalizedVietnamese = normalizeText(vietnamese).toLowerCase();
        if (normalizedVietnamese && !result[normalizedVietnamese]) {
            result[normalizedVietnamese] = english;
        }
        return result;
    }, {});

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
            return termEnglishByVietnamese[normalizeText(value).toLowerCase()] ?? value;
        }

        const normalized = normalizeText(value).toLowerCase();
        return termTranslations[normalized] ?? value;
    }

    function translateNormalized(value, locale = currentLocale) {
        if (!value) {
            return value;
        }

        if (locale === 'en') {
            return exactEnglishByVietnamese[value]
                ?? termEnglishByVietnamese[value.toLowerCase()]
                ?? value;
        }

        if (exactTranslations[value]) {
            return exactTranslations[value];
        }

        const contactLineMatch = value.match(/^Email:\s*(.+?)\s*\|\s*Phone:\s*(.+)$/i);
        if (contactLineMatch) {
            return `Email: ${contactLineMatch[1]} | Điện thoại: ${contactLineMatch[2]}`;
        }

        const colonLabelMatch = value.match(/^(.+?):$/);
        if (colonLabelMatch) {
            const labelText = translateNormalized(colonLabelMatch[1], locale);
            if (labelText !== colonLabelMatch[1]) {
                return `${labelText}:`;
            }
        }

        const templatedLabelMatch = value.match(/^(.+?):\s*(\$\{.+\})$/);
        if (templatedLabelMatch) {
            const labelText = translateNormalized(templatedLabelMatch[1], locale);
            if (labelText !== templatedLabelMatch[1]) {
                return `${labelText}: ${templatedLabelMatch[2]}`;
            }
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

        const infoMatch = value.match(/^(.+?) (?:Info|Information)$/i);
        if (infoMatch) {
            const subjectText = translateBusinessTerm(infoMatch[1], locale);
            if (subjectText !== infoMatch[1]) {
                return `Thông tin ${subjectText}`;
            }
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

        const selectedBatchStockMatch = value.match(/^Not enough stock for the selected warehouse and batch\. Available:\s*(.+)\.$/i);
        if (selectedBatchStockMatch) {
            return `Không đủ tồn cho kho và lô đã chọn. Tồn khả dụng: ${selectedBatchStockMatch[1]}.`;
        }

        const remainingStockMatch = value.match(/^Quantity must not exceed remaining stock \((.+)\)\.$/i);
        if (remainingStockMatch) {
            return `Số lượng không được vượt quá tồn còn lại (${remainingStockMatch[1]}).`;
        }

        const paymentDocMatch = value.match(/^Payment (\S+)$/);
        if (paymentDocMatch) {
            return `Thanh Toán ${paymentDocMatch[1]}`;
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

    function getDropDownTextField(instance) {
        return instance?.fields?.text || 'text';
    }

    function getDropDownValueField(instance) {
        return instance?.fields?.value || 'value';
    }

    function resolveOriginalDropDownSource(instance) {
        if (!instance || !Array.isArray(instance.dataSource)) {
            return null;
        }

        if (instance.dataSource !== instance.__localizedDataSource) {
            instance.__originalDataSource = instance.dataSource;
            instance.__originalFields = { ...(instance.fields ?? {}) };
        }

        return instance.__originalDataSource ?? instance.dataSource;
    }

    function isLocalizedOptionSource(dataSource, textField) {
        if (!Array.isArray(dataSource) || !dataSource.length || dataSource.length > LOCALIZED_OPTION_TEXTS.size) {
            return false;
        }

        return dataSource.every(item => LOCALIZED_OPTION_TEXTS.has(normalizeText(item?.[textField])));
    }

    function localizeDropDownDataSource(instance) {
        const originalDataSource = resolveOriginalDropDownSource(instance);
        if (!originalDataSource) {
            return false;
        }

        const originalFields = instance.__originalFields ?? { ...(instance.fields ?? {}) };
        const textField = originalFields.text || getDropDownTextField(instance);
        if (!isLocalizedOptionSource(originalDataSource, textField)) {
            return false;
        }

        if (currentLocale === 'en') {
            instance.dataSource = originalDataSource;
            instance.fields = originalFields;
            instance.__localizedDataSource = null;
            return true;
        }

        const localizedDataSource = originalDataSource.map(item => ({
            ...item,
            [LOCALIZED_DROPDOWN_TEXT_FIELD]: translateText(item?.[textField])
        }));

        instance.__localizedDataSource = localizedDataSource;
        instance.dataSource = localizedDataSource;
        instance.fields = {
            ...originalFields,
            text: LOCALIZED_DROPDOWN_TEXT_FIELD
        };
        return true;
    }

    function syncDropDownSelectedText(instance) {
        if (!instance || currentLocale === 'en' || !Array.isArray(instance.dataSource)) {
            return;
        }

        const valueField = getDropDownValueField(instance);
        const selectedItem = instance.dataSource.find(item => `${item?.[valueField]}` === `${instance.value}`);
        const translatedText = selectedItem?.[LOCALIZED_DROPDOWN_TEXT_FIELD];
        if (!translatedText) {
            return;
        }

        if (instance.inputElement && instance.inputElement.value !== translatedText) {
            instance.inputElement.value = translatedText;
            instance.inputElement.setAttribute('value', translatedText);
        }

        if (instance.text !== translatedText) {
            instance.text = translatedText;
        }
    }

    function refreshDropDownInstance(instance) {
        if (!localizeDropDownDataSource(instance)) {
            return;
        }

        if (typeof instance.dataBind === 'function' && !instance.__isLocalizingDataBind) {
            instance.__isLocalizingDataBind = true;
            instance.dataBind();
            instance.__isLocalizingDataBind = false;
        }

        syncDropDownSelectedText(instance);
    }

    function refreshSyncfusionLocalizedControls() {
        localizedDropDownInstances.forEach(refreshDropDownInstance);
        localizedSyncfusionTextInstances.forEach(refreshSyncfusionTextInstance);
    }

    function patchDropDownComponent(component) {
        if (!component || component.prototype.__localizedStatusTextPatched) {
            return;
        }

        const originalAppendTo = component.prototype.appendTo;
        component.prototype.appendTo = function (selector) {
            localizeDropDownDataSource(this);
            const result = originalAppendTo.call(this, selector);
            localizedDropDownInstances.add(this);
            syncDropDownSelectedText(this);
            return result;
        };

        const originalDataBind = component.prototype.dataBind;
        if (typeof originalDataBind === 'function') {
            component.prototype.dataBind = function () {
                if (!this.__isLocalizingDataBind) {
                    localizeDropDownDataSource(this);
                }

                const result = originalDataBind.call(this);
                syncDropDownSelectedText(this);
                return result;
            };
        }

        component.prototype.__localizedStatusTextPatched = true;
    }

    function patchSyncfusionDropDowns() {
        patchDropDownComponent(window.ej?.dropdowns?.DropDownList);
        patchDropDownComponent(window.ej?.dropdowns?.ComboBox);
    }

    function localizeStringProperty(owner, propertyName, originalPropertyName) {
        if (!owner || typeof owner[propertyName] !== 'string') {
            return false;
        }

        if (!Object.prototype.hasOwnProperty.call(owner, originalPropertyName)) {
            owner[originalPropertyName] = owner[propertyName];
        }

        const originalValue = owner[originalPropertyName] ?? '';
        const localizedValue = translateText(originalValue, currentLocale);
        if (owner[propertyName] === localizedValue) {
            return false;
        }

        owner[propertyName] = localizedValue;
        return true;
    }

    function localizeGridColumnHeaders(columns) {
        if (!Array.isArray(columns)) {
            return false;
        }

        let changed = false;
        columns.forEach(column => {
            changed = localizeStringProperty(column, 'headerText', '__originalHeaderText') || changed;
            changed = localizeGridColumnHeaders(column.columns) || changed;
        });

        return changed;
    }

    function localizeGridAggregateTemplates(aggregates) {
        if (!Array.isArray(aggregates)) {
            return false;
        }

        let changed = false;
        aggregates.forEach(aggregate => {
            if (!Array.isArray(aggregate?.columns)) {
                return;
            }

            aggregate.columns.forEach(column => {
                changed = localizeStringProperty(column, 'groupCaptionTemplate', '__originalGroupCaptionTemplate') || changed;
                changed = localizeStringProperty(column, 'footerTemplate', '__originalFooterTemplate') || changed;
            });
        });

        return changed;
    }

    function localizeGridText(instance) {
        let changed = false;
        changed = localizeGridColumnHeaders(instance?.columns) || changed;
        changed = localizeGridAggregateTemplates(instance?.aggregates) || changed;
        return changed;
    }

    function localizeChartText(instance) {
        if (!instance) {
            return false;
        }

        let changed = false;
        changed = localizeStringProperty(instance, 'title', '__originalTitle') || changed;
        changed = localizeStringProperty(instance.primaryXAxis, 'title', '__originalTitle') || changed;
        changed = localizeStringProperty(instance.primaryYAxis, 'title', '__originalTitle') || changed;

        if (Array.isArray(instance.axes)) {
            instance.axes.forEach(axis => {
                changed = localizeStringProperty(axis, 'title', '__originalTitle') || changed;
            });
        }

        if (Array.isArray(instance.series)) {
            instance.series.forEach(series => {
                changed = localizeStringProperty(series, 'name', '__originalName') || changed;
            });
        }

        return changed;
    }

    function refreshSyncfusionTextInstance(instance) {
        const localizer = instance?.__syncfusionTextLocalizer;
        if (typeof localizer !== 'function') {
            return;
        }

        localizer(instance);
        if (instance.__isLocalizingTextRefresh) {
            return;
        }

        instance.__isLocalizingTextRefresh = true;
        try {
            if (typeof instance.refreshColumns === 'function') {
                instance.refreshColumns();
            } else if (typeof instance.refresh === 'function') {
                instance.refresh();
            } else if (typeof instance.dataBind === 'function') {
                instance.dataBind();
            }
        } finally {
            instance.__isLocalizingTextRefresh = false;
        }
    }

    function patchSyncfusionTextComponent(component, localizer) {
        if (!component || component.prototype.__localizedTextPatched) {
            return;
        }

        const originalAppendTo = component.prototype.appendTo;
        component.prototype.appendTo = function (selector) {
            this.__syncfusionTextLocalizer = localizer;
            localizer(this);
            const result = originalAppendTo.call(this, selector);
            localizedSyncfusionTextInstances.add(this);
            return result;
        };

        const originalDataBind = component.prototype.dataBind;
        if (typeof originalDataBind === 'function') {
            component.prototype.dataBind = function () {
                if (!this.__isLocalizingTextRefresh) {
                    this.__syncfusionTextLocalizer = localizer;
                    localizer(this);
                }

                return originalDataBind.call(this);
            };
        }

        component.prototype.__localizedTextPatched = true;
    }

    function patchSyncfusionTextComponents() {
        patchSyncfusionTextComponent(window.ej?.grids?.Grid, localizeGridText);
        patchSyncfusionTextComponent(window.ej?.charts?.Chart, localizeChartText);
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
        const translatedValue = translateText(originalValue, currentLocale);

        if (node.nodeValue !== translatedValue) {
            localizedTextWrites.add(node);
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
            const translatedValue = translateText(originalValue, currentLocale);

            if (element.getAttribute(attributeName) !== translatedValue) {
                let attributes = localizedAttributeWrites.get(element);
                if (!attributes) {
                    attributes = new Set();
                    localizedAttributeWrites.set(element, attributes);
                }
                attributes.add(attributeName);
                element.setAttribute(attributeName, translatedValue);
            }
        });

        if (element instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(element.type)) {
            captureInputValueOriginal(element);
            const store = attributeOriginals.get(element) ?? {};
            const originalValue = store.__value ?? '';
            const translatedValue = translateText(originalValue, currentLocale);

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
        const localizedTitle = translateText(originalTitle, currentLocale);
        if (document.title !== localizedTitle) {
            localizedTitleWrites += 1;
            document.title = localizedTitle;
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
        refreshSyncfusionLocalizedControls();
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
                    if (localizedTextWrites.has(mutation.target)) {
                        localizedTextWrites.delete(mutation.target);
                    } else if (mutation.target.parentNode?.nodeName === 'TITLE') {
                        if (localizedTitleWrites > 0) {
                            localizedTitleWrites -= 1;
                        } else {
                            originalTitle = mutation.target.nodeValue ?? originalTitle;
                        }
                    } else {
                        captureTextNodeOriginal(mutation.target, true);
                    }
                }

                if (mutation.type === 'attributes' && mutation.target.nodeType === Node.ELEMENT_NODE) {
                    const localizedAttributes = localizedAttributeWrites.get(mutation.target);
                    if (localizedAttributes?.has(mutation.attributeName)) {
                        localizedAttributes.delete(mutation.attributeName);
                    } else {
                        captureElementOriginal(mutation.target, mutation.attributeName, true);

                        if (mutation.attributeName === 'value' && mutation.target instanceof HTMLInputElement) {
                            captureInputValueOriginal(mutation.target, true);
                        }
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
        patchSyncfusionDropDowns();
        patchSyncfusionTextComponents();
        bindLanguageSwitcher();
        applyCulture();
        refreshSyncfusionLocalizedControls();
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
        refreshSyncfusionControls: refreshSyncfusionLocalizedControls,
        refresh: scheduleTranslate
    };
})(window, document);
