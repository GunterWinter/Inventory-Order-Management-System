# Architech WHMS

**Architech WHMS** là hệ thống quản lý kho, tồn kho và đơn hàng được xây dựng trên ASP.NET Core 9.0. README này định hướng dự án như một giải pháp vận hành dành cho Architech: tập trung vào quản trị dữ liệu hàng hóa, chuẩn hóa luồng mua bán, kiểm soát tồn kho và cung cấp nền tảng kỹ thuật dễ mở rộng.

## Định Vị Giải Pháp

Architech WHMS hỗ trợ doanh nghiệp quản lý tập trung các quy trình liên quan đến hàng hóa và đơn hàng:

- Theo dõi tồn kho, nhập kho, xuất kho, chuyển kho và kiểm kê.
- Quản lý khách hàng, nhà cung cấp, sản phẩm, kho, đơn vị tính và nhóm dữ liệu liên quan.
- Chuẩn hóa quy trình mua hàng, bán hàng, giao hàng, nhận hàng và trả hàng.
- Cung cấp báo cáo giao dịch, tồn kho và biến động hàng hóa để hỗ trợ ra quyết định.
- Quản trị người dùng, phân quyền, cấu hình công ty, thuế và số chứng từ.

Mục tiêu của hệ thống là giúp Architech có một nền tảng back-office rõ ràng, dễ triển khai nội bộ, dễ tùy biến theo quy trình thực tế và có thể mở rộng thành giải pháp cho khách hàng doanh nghiệp.

## Năng Lực Nghiệp Vụ

- **Quản lý khách hàng**
  - Nhóm khách hàng, danh mục khách hàng, hồ sơ khách hàng và liên hệ.
- **Quản lý nhà cung cấp**
  - Nhóm nhà cung cấp, danh mục nhà cung cấp, hồ sơ nhà cung cấp và liên hệ.
- **Quản lý sản phẩm và kho**
  - Sản phẩm, nhóm sản phẩm, đơn vị tính, kho hàng và dữ liệu tham chiếu.
- **Mua hàng**
  - Đơn mua hàng, nhận hàng, trả hàng mua và báo cáo mua hàng.
- **Bán hàng**
  - Đơn bán hàng, giao hàng, trả hàng bán và báo cáo bán hàng.
- **Vận hành kho**
  - Chuyển kho, điều chỉnh tăng/giảm, hủy hàng, kiểm kê và lịch sử giao dịch tồn kho.
- **Báo cáo**
  - Báo cáo giao dịch, báo cáo tồn kho, báo cáo biến động và dữ liệu dashboard.
- **Quản trị hệ thống**
  - Cấu hình công ty, thuế, số chứng từ, người dùng, vai trò, nhật ký lỗi và nhật ký phân tích.

## Kiến Trúc Và Công Nghệ

Hệ thống được tổ chức theo hướng **Monolithic Clean Architecture**: một mã nguồn triển khai thống nhất, nhưng vẫn tách lớp rõ ràng giữa domain, application, infrastructure và presentation.

- **Backend**
  - ASP.NET Core 9.0
  - Clean Architecture
  - CQRS với MediatR
  - Repository Pattern
  - Entity Framework Core với SQL Server
  - ASP.NET Identity và JWT
  - AutoMapper
  - FluentValidation
  - Serilog
  - API cho upload/download hình ảnh và tài liệu
- **Frontend**
  - ASP.NET Core Razor Pages
  - Vue.js dùng trực tiếp, không cần build system riêng
  - Syncfusion UI Components
  - AdminLTE template
  - Axios cho giao tiếp API

## Cấu Trúc Dự Án

```text
Core/
  Application/        # Use case, CQRS handler, DTO, validation, interface
  Domain/             # Entity và logic domain

Infrastructure/
  Infrastructure/     # EF Core, Identity, repository, service triển khai

Presentation/
  ASPNET/             # Razor Pages, API controllers, wwwroot, appsettings
```

## Cấu Hình Chính

File cấu hình chính nằm tại:

```text
Presentation/ASPNET/appsettings.json
```

Các cấu hình thường cần kiểm tra trước khi chạy:

- `ConnectionStrings:DefaultConnection`: chuỗi kết nối SQL Server.
- `AspNetIdentity:DefaultAdmin`: tài khoản quản trị mặc định.
- `Jwt`: khóa, issuer, audience và thời hạn token.
- `FileImageManager` và `FileDocumentManager`: thư mục lưu file upload.
- `SmtpSettings`: cấu hình gửi email.
- `IsDemoVersion`: trạng thái demo của hệ thống.

Tài khoản quản trị mặc định trong cấu hình hiện tại:

```text
Email: admin@root.com
Password: 123456
```

## Chạy Dự Án Bằng Visual Studio

1. Mở solution trong thư mục gốc của repo bằng Visual Studio.
2. Kiểm tra chuỗi kết nối trong `Presentation/ASPNET/appsettings.json`.
3. Clean và build solution.
4. Chạy project `Presentation/ASPNET`.
5. Truy cập ứng dụng theo URL Kestrel hoặc IIS Express mà Visual Studio cung cấp.

Database sẽ được tạo tự động nếu cấu hình SQL Server hợp lệ và database chưa tồn tại.

## Chạy Dự Án Bằng .NET CLI

Yêu cầu môi trường:

- .NET 9 SDK
- SQL Server hoặc SQL Server Express
- Visual Studio/SQL Server tooling nếu cần quản trị database thủ công

Lệnh chạy:

```powershell
dotnet restore .\Presentation\ASPNET\ASPNET.csproj
dotnet build .\Presentation\ASPNET\ASPNET.csproj
dotnet run --project .\Presentation\ASPNET\ASPNET.csproj
```

Theo cấu hình hiện tại, ứng dụng dùng Kestrel tại:

```text
http://localhost:5000
```

## Kiểm Thử API Đăng Nhập

Endpoint đăng nhập API:

```http
POST /api/Security/Login
Content-Type: application/json
```

Body mẫu:

```json
{
  "email": "admin@root.com",
  "password": "123456"
}
```

Sau khi đăng nhập thành công, dùng access token trong header:

```http
Authorization: Bearer <accessToken>
```

## Triển Khai IIS

1. Publish project `Presentation/ASPNET`.
2. Copy thư mục publish lên IIS.
3. Cấu hình application pool phù hợp với ASP.NET Core.
4. Cập nhật connection string theo môi trường production.
5. Đảm bảo thư mục upload có quyền ghi.
6. Kiểm tra cấu hình JWT, SMTP và biến demo trước khi public.

Tài liệu tham khảo: [Microsoft ASP.NET Core IIS deployment](https://learn.microsoft.com/en-us/aspnet/core/host-and-deploy/iis/).

## Ghi Nhận

Dự án sử dụng các thư viện và tài nguyên cộng đồng:

- [Syncfusion Community Edition](https://www.syncfusion.com/products/communitylicense)
- [AdminLTE](https://github.com/ColorlibHQ/AdminLTE)
- [ASP.NET Core](https://learn.microsoft.com/en-us/aspnet/core/)
- [Entity Framework Core](https://learn.microsoft.com/en-us/ef/core/)