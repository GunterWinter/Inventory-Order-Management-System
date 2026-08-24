# Hướng dẫn Antigravity kiểm thử trình duyệt

## Khởi chạy kiểm thử tự động

Tại thư mục gốc của repository, cài dependency một lần:

```powershell
npm.cmd install
```

Lệnh chuẩn và bắt buộc cho Antigravity là:

```powershell
npm.cmd run test:browser:isolated
```

Runner này tự build, tạo một database duy nhất có tiền tố `WHMS_AntigravityTest_`, seed dữ liệu demo, chờ ứng dụng sẵn sàng, chạy browser suite tuần tự, dừng đúng process ứng dụng và xóa đúng database của lượt test. Khi thành công, log/artifact tạm được xóa; khi thất bại, log, screenshot, video và trace được giữ trong `artifacts/`.

Muốn chỉ định cổng hoặc tên database để chẩn đoán, vẫn phải dùng đúng tiền tố an toàn:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File Tests/run-antigravity-browser.ps1 `
  -Port 5127 `
  -DatabaseName WHMS_AntigravityTest_ProductPrice
```

Lệnh tổng hợp chạy lần lượt:

- `npm.cmd run test:browser`: Dashboard, chứng từ, bảo hành, lợi nhuận công trình và công nợ.
- `npm.cmd run test:browser:documents`: modal SO/PO, chuyển thật EN/VI rồi chọn ngày chứng từ ở cả hai ngôn ngữ, hiển thị/cuộn Item grid và xác nhận mọi dropdown Item có ô tìm kiếm đúng ngôn ngữ.
- `npm.cmd run test:browser:sales-items`: tạo Product có tồn đầu kỳ hoàn toàn qua UI, xác nhận giá/tồn sau lưu, chọn Product trong SO/PO và thấy giá ngay trước Enter, sau đó chọn thuế, lưu và reload item đúng giá.
- `npm.cmd run test:browser:gate:purchase-sales`: alias chạy riêng gate Product/PO/SO ở trên; chỉ dùng khi ứng dụng đã chạy trên database test cô lập.
- `npm.cmd run test:browser:cash`: phân bổ Thu/Chi, dropdown động và popup thanh toán có tìm kiếm, báo cáo Thu Chi Theo Danh Mục, localization và trạng thái đóng/mở grid gom nhóm.
- `npm.cmd run test:browser:files`: tồn đầu kỳ Product, Import/Export Excel song ngữ, rollback toàn workbook và tải/đọc file PDF thật.

Bài smoke dùng Microsoft Edge ở chế độ headless, tự đăng nhập và kiểm tra Dashboard, Cash Transaction, báo cáo tài chính, hai loại công nợ, vòng đổi ngôn ngữ và kịch bản dồn tích `2.000.000 - 500.000 = 1.500.000`. Nó cũng chủ động làm một API Dashboard trả lỗi 500 để xác nhận các khối còn lại vẫn hoạt động và nút thử lại phục hồi được dữ liệu. Mọi lỗi console, request thất bại hoặc kết quả tiền sai đều phải làm bài test thất bại.

Khi chẩn đoán thủ công trên một ứng dụng test đã chạy ở địa chỉ khác, truyền `BASE_URL` trước khi chạy alias mục tiêu. Lượt hoàn tất của Antigravity vẫn phải dùng `test:browser:isolated`. Playwright Test tự giám sát lỗi console/HTTP/request và chỉ giữ ảnh/video/trace của ca thất bại.

Không chạy demo browser test trên database làm việc. `IsDemoVersion=true` sẽ xóa và seed lại database khi khởi động. Khối lệnh thủ công dưới đây chỉ dùng để chẩn đoán và database vẫn phải có tiền tố an toàn:

```powershell
$env:ConnectionStrings__DefaultConnection='Server=localhost;Database=WHMS_AntigravityTest_Manual;Integrated Security=True;Encrypt=False;TrustServerCertificate=True;'
$env:Kestrel__Endpoints__Http__Url='http://localhost:5127'
$env:IsDemoVersion='true'
dotnet run --project Presentation/ASPNET/ASPNET.csproj
```

Ở terminal chạy test:

```powershell
$env:BASE_URL='http://localhost:5127'
npm.cmd run test:browser:all
```

Sau khi chẩn đoán thủ công, dừng ứng dụng và chỉ xóa đúng database `WHMS_AntigravityTest_Manual`; không được xóa hoặc reset database khác.

## Mục tiêu và cách chạy

Agent phải kiểm thử như một kế toán kho thực tế, dùng trình duyệt tự động và lưu bằng chứng cho từng lỗi. Không sửa dữ liệu trực tiếp trong database. API chỉ dựng fixture hoặc đọc đối chiếu; click, nhập, chọn, lưu và reload thuộc hành vi đang kiểm thử phải đi qua UI. Không được sửa giá/payload hoặc commit ô trong test để che lỗi. Mỗi kịch bản phải ghi lại URL hiện tại, dữ liệu nhập, thông báo nhận được, giá trị trước/sau và ảnh chụp khi thất bại.

Quy tắc diễn giải trước khi kết luận lỗi:

- Ghi nhận ngôn ngữ đang chọn. Một trang chỉ bị xem là trộn ngôn ngữ nếu nhãn không đồng nhất trong cùng ngôn ngữ; phải thử cả English và Tiếng Việt.
- Trong dữ liệu giao dịch tiền, `Debit` là Thu và `Credit` là Chi. Khi giao diện tiếng Việt, hai giá trị phải lần lượt hiển thị là Thu và Chi; không được đảo ngược quy ước này.
- Bảo hành dùng đường dẫn chuẩn từ menu hiện tại là `/WarrantyLookups/WarrantyLookup`. Không tự suy đoán rằng mọi trang đều phải có hậu tố `List`; chỉ báo link chết khi một liên kết thật trong ứng dụng điều hướng sai.
- Báo cáo công nợ là một báo cáo chung có hai tab Khách hàng và Nhà cung cấp. Đường dẫn hiện hành có thể giữ tên phân hệ cũ; không yêu cầu một trang công nợ khách hàng riêng nếu cả hai tab hoạt động đúng.

Thiết lập mặc định của dữ liệu demo:

- Email: `admin@root.com`
- Mật khẩu: `123456`
- Bộ seed chuẩn phải nhỏ và cố định: 4 khách hàng/công trình, 3 nhà cung cấp, 3 kho thường và 10 hàng hóa; trong 10 hàng có đủ ba chế độ serial, hàng không serial và ít nhất hai hàng phi vật lý.
- Chỉ có 3–4 đơn mua và 3–4 đơn bán, gồm Nháp, Đã xác nhận, chưa thanh toán và thanh toán một phần. Không chấp nhận dữ liệu ngẫu nhiên theo 12 tháng hoặc hàng chục chứng từ làm chậm test.
- Công trình demo dồn tích phải đứng riêng với doanh thu 2.000.000 và chi phí đúng 500.000; chứng từ demo khác không được làm thay đổi tổng này.
- Nếu ứng dụng đang dùng cấu hình khác, đọc tài khoản demo từ cấu hình chạy hiện tại; không ghi mật khẩu vào báo cáo công khai.
- Dùng tên có tiền tố `E2E-YYYYMMDD-HHmm` để tránh trùng dữ liệu.
- Với phép tính tiền, luôn ghi rõ giá trước thuế, thuế, giá sau thuế và cách làm tròn.

Trước mỗi lượt:

1. Mở trang đăng nhập, đăng nhập bằng quản trị viên và xác nhận menu chính tải đầy đủ.
2. Mở công cụ theo dõi request của browser. Đánh dấu mọi HTTP 4xx/5xx, request quá 10 giây hoặc lỗi JavaScript.
3. Chọn một kho thường, không chọn kho hệ thống.
4. Ghi lại số tồn, công nợ và số dư tiền ban đầu của dữ liệu sẽ dùng.
5. Không dùng lại chứng từ đã xác nhận cho kịch bản cần chỉnh sửa.

## 1. Đăng nhập và phân quyền

1. Đăng nhập đúng tài khoản. Kỳ vọng chuyển tới Dashboard, tên người dùng hiện đúng và không có lỗi console.
2. Đăng xuất rồi thử sai mật khẩu. Kỳ vọng bị từ chối, không tạo phiên đăng nhập.
3. Đăng nhập lại, tải mới trang và mở từng nhóm menu. Kỳ vọng quyền được giữ nguyên.
4. Xác nhận không còn menu Nhận hàng, Giao hàng, Điều chỉnh tăng và Điều chỉnh giảm.
5. Xác nhận vẫn có Bán hàng, Mua hàng, Hàng hóa, Bảo hành, Trả hàng, Chuyển kho, Xuất vật tư, Hủy hàng, Kiểm kê, Tiền, Báo cáo tài chính và Công nợ.

## 2. Danh mục nền

### Công trình/khách hàng

Tạo `E2E-Công trình A`. Nhập thông tin tối thiểu hợp lệ, lưu, tìm lại và mở xem/sửa. Kỳ vọng dữ liệu không mất sau tải mới. Công trình này dùng xuyên suốt các bước sau.

### Nhà cung cấp

Tạo `E2E-NCC A`, lưu và tìm lại. Nhà cung cấp này dùng cho đơn mua và công nợ.

### Kho

Tạo hoặc chọn `E2E-Kho chính`. Kỳ vọng kho xuất hiện trong các dòng hàng vật lý nhưng không được áp vào hàng phi vật lý.

### Tài khoản và nhóm tiền

Tạo/chọn một tài khoản tiền có số dư biết trước. Chuẩn bị nhóm Chi phí công thợ, Gia công ván, Vận chuyển và Chi phí khác.

## 3. Ba chế độ serial và hàng phi vật lý

Tạo bốn mặt hàng:

- `E2E-VL-KhongSerial`: vật lý, Không theo dõi serial, kho mặc định là kho chính.
- `E2E-VL-NoiBo`: vật lý, Mã nội bộ tự sinh, mã cố định 2–4 ký tự.
- `E2E-VL-NSX`: vật lý, Serial nhà sản xuất.
- `E2E-BanLamViec`: phi vật lý, giá bán 2.000.000.

Kỳ vọng:

- Modal thêm mới mặc định chọn `Không theo dõi serial`.
- Ba hàng vật lý lưu đúng chế độ đã chọn.
- Mã cố định chỉ bắt buộc ở chế độ tự sinh.
- Hàng phi vật lý tự trở về Không theo dõi, không giữ kho mặc định hoặc bảo hành.
- `E2E-VL-KhongSerial` được nhập tồn đầu kỳ thập phân không âm và chỉ mode này được sửa tổng tồn đầu kỳ về sau. Sửa metadata hoặc đổi kho mặc định mà không sửa ô tồn không được tạo giao dịch kho.
- `E2E-VL-NoiBo` chỉ nhận tồn đầu kỳ nguyên khi tạo, sinh đúng số mã nội bộ duy nhất và khóa ô tồn khi sửa. `E2E-VL-NSX` không nhận tồn đầu kỳ từ Product mà chỉ tăng tồn sau Purchase Order có đủ serial nhà sản xuất.
- Tồn đầu kỳ dương bắt buộc có Cost Price và kho thường. Giao dịch phải là Stock Count đã xác nhận, có dấu vết người xác nhận; hiệu chỉnh sau dùng kho mở đầu cũ và giá vốn snapshot cũ dù Kho mặc định/Cost Price của Product đã thay đổi.
- Thử số âm, số lẻ cho Internal Auto, thiếu Cost Price, thiếu kho, Manufacturer/phi vật lý có tồn dương và gọi API sửa tồn ở mode bị khóa. Mọi ca phải rollback Product, Stock Count, transaction, serial và movement.
- Stock Count sinh từ Product không được sửa/xóa trực tiếp; Cancel hợp lệ hoàn tác tồn/serial, Archive giữ nguyên tác động và Cancel bị chặn khi đã có chuyển động phụ thuộc.
- Kiểm tra giá vốn: hàng không serial có tồn đầu kỳ `10 @ 100` và PO `10 @ 200` phải bán/xuất vật tư theo bình quân `150`; hàng Internal Auto dùng đúng `ProductSerial.UnitCost` của từng mã mở đầu, kể cả serial không có `PurchaseOrderItem`. Báo cáo lợi nhuận và Material Export phải khớp cùng nguồn giá, còn fallback phải được gắn nhãn rõ.
- Khi đổi Vật lý sang Phi vật lý trước khi có lịch sử, các trường kho/serial/bảo hành bị xóa.
- Sau khi một hàng có lịch sử kho hoặc serial, thử đổi Vật lý/chế độ serial phải bị chặn với thông báo rõ.

## 4. Đơn mua tăng tồn trực tiếp

### Hàng không serial

1. Tạo đơn mua Nháp cho `E2E-NCC A`, thêm 10 `E2E-VL-KhongSerial`, kho chính, đơn giá 400.000 trước thuế.
2. Khi còn Nháp, mở Stock Report. Kỳ vọng tồn chưa tăng và công nợ nhà cung cấp chưa phát sinh.
3. Xác nhận đơn mua. Kỳ vọng tồn tăng đúng 10 ngay lập tức, không cần chứng từ nhận hàng.
4. Kỳ vọng khoản phải trả bằng tổng sau thuế; giá nguồn tồn là 400.000 một đơn vị.

### Serial tự sinh

Tạo đơn mua 3 `E2E-VL-NoiBo`, xác nhận. Kỳ vọng sinh đúng 3 mã khác nhau, cùng đúng hàng và kho, trạng thái Trong kho.

### Serial nhà sản xuất

1. Tạo đơn mua 2 `E2E-VL-NSX`, nhập `E2E-MFG-001`, `E2E-MFG-002`.
2. Thử thiếu serial, serial trùng và số serial khác số lượng. Kỳ vọng đều bị chặn.
3. Nhập hợp lệ và xác nhận. Kỳ vọng đúng hai serial xuất hiện trong kho.

### Hàng phi vật lý

Tạo đơn mua dịch vụ phi vật lý. Kỳ vọng dòng không cần kho, không tạo tồn/serial nhưng vẫn tăng giá trị phải trả khi xác nhận.

### Khóa sửa và hủy

- Thử sửa dòng của đơn mua đã xác nhận: phải bị chặn.
- Với đơn chưa thanh toán và chưa có phụ thuộc, hủy: tồn, serial và công nợ phải hoàn tác.
- Với đơn đã thanh toán một phần hoặc đã phân bổ/trả hàng/xuất dùng, hủy phải bị chặn và giải thích phụ thuộc.
- Bán một serial từ PO ở SO rồi thử hủy PO. Kỳ vọng bị chặn và thông báo nêu số PO, serial, tên hàng, SO đang giữ serial và kho cần trả về.
- Lập Sales Return đưa serial về đúng kho nhập ban đầu, sau đó hủy PO chưa thanh toán. Kỳ vọng cho phép hủy, giảm tồn và phải trả; serial còn lịch sử nhưng chuyển `Nguồn mua đã hủy`, không còn trong picker hoặc bảo hành hoạt động.
- Nếu Sales Return đưa serial về kho khác kho nhập ban đầu thì PO vẫn phải bị chặn hủy và thông báo nêu cả kho hiện tại lẫn kho yêu cầu.

## 5. Đơn bán giảm tồn trực tiếp

1. Tạo đơn bán Nháp cho Công trình A.
2. Thêm hàng không serial từ kho và thêm hàng serial bằng cách chọn đúng serial đang Trong kho.
3. Ngay khi chọn Product ở dòng mới, đơn giá, kho mặc định, bảo hành và mô tả phải hiện trong Batch Editor. Chọn thuế rồi lưu; tải lại phải đọc được đúng một item với Product, đơn giá và thuế đã chọn, không được trả về danh sách rỗng.
4. Khi Nháp, tồn và công nợ khách chưa đổi.
5. Xác nhận. Kỳ vọng hàng vật lý giảm tồn trực tiếp, serial chuyển Đã bán, không cần chứng từ giao hàng.
6. Kỳ vọng khoản phải thu bằng tổng sau thuế.
7. Mở Xem đơn bán: dòng hàng, serial, thuế và tổng tiền phải hiển thị ngay cả khi request danh sách tồn bị chặn hoặc giả lập lỗi.
8. Mở Sửa: chỉ cho chỉnh dòng khi đơn Nháp và dữ liệu tồn đã tải; đơn Đã xác nhận phải chỉ đọc.
9. Thử bán quá tồn, chọn serial sai kho hoặc serial đã bán. Kỳ vọng xác nhận thất bại và không có tác động dở dang.

Với đơn chưa có phụ thuộc, kiểm tra hủy hoàn tác tồn, serial, bảo hành và khoản phải thu. Sau thanh toán hoặc trả hàng, hủy phải bị chặn.

## 6. Bán sản phẩm đầu ra phi vật lý

1. Tạo đơn bán Công trình A với một `E2E-BanLamViec`, giá trước thuế 2.000.000.
2. Không chọn kho hoặc serial.
3. Xác nhận nhưng chưa thu tiền.
4. Kỳ vọng không có dòng Stock Report cho sản phẩm này; doanh thu công trình là 2.000.000 trước thuế; công nợ dùng tổng sau thuế.

## 7. Phân bổ vật tư trực tiếp từ đơn mua

1. Mở đơn mua Đã xác nhận còn số lượng chưa phân bổ.
2. Phân bổ một phần cho Công trình A.
3. Kỳ vọng tổng phân bổ không vượt số mua; hàng vật lý giảm tồn, hàng serial yêu cầu đúng serial; hàng phi vật lý không tác động kho.
4. Kỳ vọng chi phí dùng đơn giá mua 400.000 trước thuế, không dùng giá vốn danh mục nếu danh mục là 350.000.
5. Mở chi tiết giao dịch tiền nguồn. Tiêu đề phải là Hàng hóa; nội dung có số đơn mua, công trình, hàng, kho, số lượng, đơn giá và thành tiền.
6. Kỳ vọng thanh toán nhà cung cấp sau đó không làm chi phí công trình tăng lần hai.

## 8. Xuất vật tư

### Không serial

Tạo phiếu xuất vật tư từ kho chính cho Công trình A, nhập số lượng hàng không serial rồi xác nhận. Kỳ vọng kiểm tra tồn, giảm đúng số lượng và ghi nhận chi phí theo giá vốn mua thực tế.

### Có serial

Tạo phiếu khác, chọn hàng serial và đúng serial. Số lượng phải bằng số serial. Kỳ vọng serial rời kho và không thể chọn lại.

Thử số lượng lớn hơn tồn, serial sai kho và xác nhận hai lần. Kỳ vọng đều không tạo tồn âm hoặc chi phí trùng.

## 9. Công thợ, gia công ván và phân bổ tiền

Cả giao dịch Thu và Chi thủ công đều có nút `Chi tiết phân bổ` tùy chọn. Giao dịch Chi ghi nhận người nhận tiền hoặc nhà cung cấp ở phần thông tin chung; chi tiết phân bổ xác định từng khách hàng/công trình chịu bao nhiêu chi phí. Giao dịch Thu có thể chia số tiền cho nhiều khách hàng/công trình để truy vết nhưng các dòng này không được ghi nhận thêm doanh thu hoặc chi phí công trình. Một người thợ hoặc một đơn vị gia công có thể làm cho nhiều công trình trong cùng một lần thanh toán.

### Công thợ

1. Tạo giao dịch Chi `E2E-Công thợ Anh Lân`, chọn người nhận/NCC `Anh Lân`, nhóm chi phí Công thợ, tổng tiền 800.000 và để chưa thanh toán.
2. Mở Chi tiết của giao dịch và thêm hai dòng:
   - Khách hàng/Công trình A: 250.000; diễn giải `Chi công thợ công trình A`.
   - Khách hàng/Công trình B: 550.000; diễn giải `Chi công thợ công trình B`.
3. Lưu chi tiết. Kỳ vọng tổng hai dòng đúng 800.000 và giao dịch cha vẫn thể hiện người nhận là Anh Lân.
4. Thử đổi tổng phân bổ thành 799.999 rồi 800.001. Cả hai trường hợp đều không được lưu.
5. Kỳ vọng Finance Report ghi chi phí Công trình A tăng 250.000 và Công trình B tăng 550.000 ngay cả khi Anh Lân chưa được trả tiền. Không công trình nào bị tính toàn bộ 800.000 nếu không được phân bổ số tiền đó.

### Gia công ván

6. Tạo giao dịch Chi `E2E-Gia công ván`, chọn đúng người nhận/NCC gia công, tổng tiền 600.000 và để chưa thanh toán.
7. Mở Chi tiết và phân bổ:
   - Khách hàng/Công trình A: 150.000; diễn giải `Gia công ván công trình A`.
   - Khách hàng/Công trình B: 450.000; diễn giải `Gia công ván công trình B`.
8. Kỳ vọng tổng chi phí công thợ và gia công của Công trình A là 400.000; của Công trình B là 1.000.000. Mỗi công trình chỉ nhận đúng số trên dòng chi tiết của mình.
9. Tạo thêm giao dịch Chi vận chuyển/chi phí khác 100.000 và phân bổ toàn bộ cho Công trình A. Kỳ vọng tổng chi phí chuẩn của Công trình A là 500.000.
10. Với mọi giao dịch đã có dòng phân bổ, xác nhận báo cáo chỉ cộng các dòng chi tiết và không cộng lại tổng tiền của giao dịch cha.
11. Thanh toán một phần cho Anh Lân hoặc đơn vị gia công. Kỳ vọng chỉ số đã trả, số còn phải trả và số dư tài khoản tiền thay đổi; chi phí và lợi nhuận từng công trình giữ nguyên.

## 10. Kịch bản chuẩn lợi nhuận 2.000.000 − 500.000

Theo dữ liệu ở mục 9, Công trình A chịu 250.000 công thợ, 150.000 gia công ván và 100.000 vận chuyển/chi phí khác, tổng đúng 500.000. Giữ đơn bán phi vật lý Đã xác nhận 2.000.000 trước thuế và chưa thu tiền.

Mở Finance Report, lọc Công trình A. Kỳ vọng chính xác:

- Revenue: 2.000.000
- ProjectCost: 500.000
- Profit: 1.500.000

Sau đó thu một phần tiền đơn bán và trả một phần chi phí. Tải lại báo cáo. Ba số trên phải hoàn toàn không đổi.

## 11. Báo cáo công nợ chung

### Tab Khách hàng

- Công trình A có tổng nghĩa vụ từ đơn bán Đã xác nhận theo giá sau thuế.
- Chưa thu: đã thu bằng 0, còn phải thu bằng toàn bộ nghĩa vụ.
- Thu một phần: đã thu tăng đúng số tiền, còn phải thu giảm tương ứng.
- Drill-down hiển thị từng đơn bán và từng lần thu.

### Tab Nhà cung cấp

- `E2E-NCC A` có nghĩa vụ từ đơn mua Đã xác nhận theo giá sau thuế.
- Trả một phần cập nhật đã trả và còn phải trả.
- Drill-down hiển thị từng đơn mua và từng lần trả.

So sánh tổng hai tab với Dashboard. Các tổng phải dùng cùng công thức. Nháp và Đã hủy không được xuất hiện.

## 12. Giá vốn và Inventory Profit

1. Đặt giá vốn danh mục 350.000.
2. Mua thực tế giá 400.000, bán giá 500.000.
3. Kỳ vọng UnitCost 400.000, TotalCost 400.000, TotalSales 500.000, Profit 100.000.
4. Mua thêm cùng hàng/kho với giá khác và kiểm tra bình quân gia quyền theo số lượng nhập.
5. Với serial, bán serial thuộc dòng mua cụ thể và kỳ vọng lấy đúng giá dòng đó.
6. Với kho khác, không được trộn giá nguồn sai kho.
7. Trường hợp thiếu nguồn mua phải dùng CostPrice và đánh dấu nguồn dự phòng, không hiển thị vốn bằng 0 nếu CostPrice có giá trị.
8. Draft/Cancelled không được tính vào báo cáo.

## 13. Trả hàng, chuyển kho, kiểm kê và hủy hàng

- Sales Return tham chiếu đơn bán, tăng tồn trực tiếp và phục hồi trạng thái serial phù hợp.
- Purchase Return tham chiếu đơn mua, giảm tồn trực tiếp và chỉ cho trả lượng/serial hợp lệ.
- Transfer Out giảm kho nguồn; Transfer In tăng kho đích; tổng toàn hệ thống không đổi.
- Stock Count ghi đúng chênh lệch giữa tồn hệ thống và thực đếm.
- Scrapping giảm tồn, lưu lý do và không cho hủy serial không có trong kho.
- Sau mỗi nghiệp vụ, đối chiếu Stock Report, Transaction Report và lịch sử serial.
- Hủy SO chưa thu tiền và không có Sales Return: tồn và serial phải về đúng kho, bảo hành khách bị xóa và khoản phải thu biến mất.
- Khi Sales Return đang hiệu lực, hủy SO phải bị chặn cho tới khi hủy Sales Return.
- Khi Transfer In còn hiệu lực, hủy Transfer Out phải bị chặn. Sau khi hủy Transfer In, hủy Transfer Out phải trả số lượng/serial về đúng kho nguồn.
- Hủy Material Export phải phục hồi tồn/serial và xóa đúng chi phí công trình; giao dịch tiền nguồn không được xóa độc lập.
- Hủy Scrapping phải phục hồi hàng về kho nếu chưa có movement mới. Hủy Stock Count phải hoàn tác đúng chênh lệch và bị chặn nếu có movement mới hơn trên cùng hàng/kho.
- Với mọi ca chặn, thông báo phải là lỗi nghiệp vụ có số chứng từ, hàng, serial/số lượng, kho và phụ thuộc; không chấp nhận `Entity not found`, GUID hoặc stack trace.

## 14. Tra cứu bảo hành

1. Mở trang và không nhập gì. Kỳ vọng trang tự tải trang dữ liệu đầu tiên, có tổng số bản ghi và không báo “Nhập thông tin tra cứu”.
2. Bấm Tìm kiếm khi ô trống và bấm Xóa. Cả hai thao tác đều phải tải lại toàn bộ dữ liệu theo phân trang.
3. Chuyển trang. Kỳ vọng top search tìm trên toàn bộ dữ liệu phía server; ô tìm trong grid chỉ lọc nhanh dữ liệu của trang hiện tại.
4. Tìm lần lượt bằng serial nội bộ, serial nhà sản xuất, số SO, tên khách hàng và số điện thoại. Mỗi loại phải trả đúng serial.
5. Tìm serial đã bán. Kỳ vọng hiện cả hai loại serial, nguồn mua, nguồn bán, thời hạn nhà cung cấp và khách hàng; lịch sử sắp xếp mới nhất trước.
6. Tìm serial đã phân bổ công trình và mở lịch sử phân bổ. Kỳ vọng loại lịch sử vẫn là Phân bổ công trình, không bị đổi thành đơn mua.
7. Chi tiết có đơn mua nguồn, công trình, hàng, kho, số lượng, đơn giá và thành tiền; liên kết đơn mua nguồn vẫn mở được.
8. Hàng phi vật lý và serial `Nguồn mua đã hủy` không được xuất hiện như bảo hành đang hoạt động.

## 15. Cash Transaction và chi tiết hàng hóa

- Giao dịch nguồn PO hiển thị dòng phân bổ; nếu PO chưa phân bổ thì hiển thị dòng mua gốc.
- Giao dịch nguồn SO hiển thị hàng bán, kho, số lượng, đơn giá, thành tiền và serial nếu có.
- Giao dịch nguồn Material Export hiển thị công trình, hàng đã xuất, kho, số lượng, giá vốn nguồn và serial. Sales Return và Purchase Return cũng phải hiển thị đúng các dòng hàng hoàn trả.
- Tiêu đề vùng nguồn là Hàng hóa, không phải Phân bổ.
- Giao dịch có nguồn và có hàng chỉ hiện Hàng hóa, không hiện thêm khối Phân bổ rỗng. Nguồn có chứng từ nhưng thiếu dòng hàng phải báo lỗi toàn vẹn dữ liệu nguồn.
- Cả giao dịch Thu và Chi thủ công đều phải hiện nút `Chi tiết phân bổ`; phần này là tùy chọn và không bắt buộc tạo dòng.
- Nếu có ít nhất một dòng, tổng phân bổ phải bằng tổng giao dịch. Thử cả tổng thấp hơn và cao hơn một đơn vị; cả hai phải bị chặn mà không lưu dữ liệu dở dang.
- Ở chế độ Xem, nếu giao dịch thủ công không có dòng phân bổ thì ẩn toàn bộ khối Phân bổ. Nếu có dòng, phải hiện đúng khách hàng/công trình, số tiền và diễn giải. Payment History chỉ hiện khi có lần thanh toán thật.
- Phân bổ Thu chỉ phục vụ truy vết; lọc Báo cáo Tài Chính Công Trình phải xác nhận các dòng Thu không làm tăng doanh thu hoặc chi phí.
- Nguồn không hợp lệ hoặc đã xóa phải báo rõ, không làm hỏng modal chi tiết.
- Thử xóa giao dịch tự sinh từ PO/SO/Material Export/Return. Kỳ vọng bị chặn và yêu cầu xử lý chứng từ nguồn. Xóa giao dịch thủ công phải đồng thời xóa payment/allocation và tính lại số dư quỹ.

## 16. Báo cáo, Excel và kiểm tra liên kết chết

1. Mở `/CashTransactions/CashCategoryReport`. Đối chiếu tổng `Đã thu`, `Đã chi`, `Chênh lệch dòng tiền` trên thẻ với tổng các dòng theo danh mục.
2. Báo cáo danh mục chỉ dùng số thực tế đã thanh toán, dùng lịch sử thanh toán trước và `PaidAmount` làm fallback cho dữ liệu cũ; phải loại giao dịch đã xóa và hai chân điều chuyển quỹ. Giao dịch thiếu danh mục nằm ở `Chưa phân loại`.
3. Thử bộ lọc từ ngày, đến ngày và tài khoản quỹ; kết quả và Excel phải khớp dữ liệu đang lọc.
4. Với mọi grid có gom nhóm, xác nhận sau tải/rebind chỉ có các nhóm đóng. Mở một nhóm và xác nhận các nhóm khác vẫn đóng.
5. Xuất Excel ở các báo cáo còn lại và đối chiếu số dòng, tổng tiền, định dạng ngày/tiền.
6. Tìm toàn bộ menu và nút hành động. Không liên kết nào được trỏ tới bốn phân hệ đã xóa.
7. Kiểm tra nhãn tiếng Việt sau khi trang tải và sau khi modal/grid render động.
8. Kiểm tra console không có lỗi localization hoặc lỗi thành phần grid.
9. Với tập tồn lớn, mở/sửa đơn bán và Stock Report; request tồn không được timeout và SQL không được chứa nhiều truy vấn con MAX tương quan lặp lại.

## 17. Import, Download Template, Export Excel và PDF

### Download Template và Import Excel

1. Chặn toàn bộ request ra `cdn.jsdelivr.net` và `cdnjs.cloudflare.com`; tải template vẫn phải thành công từ asset nội bộ.
2. Kiểm tra sheet nhập chính không có dòng mẫu có thể bị import nhầm. File chứng từ phải có `Documents`, `Items`, `Instructions` và lookup; giao dịch tiền có thêm `Allocations`.
3. Tải Product/Customer template ở cả English và Tiếng Việt, đọc lại workbook và đối chiếu header thật với `UiLocalization` của locale đang chọn. Tên sheet kỹ thuật `Data`, `Documents`, `Items`, `Allocations` không đổi theo ngôn ngữ.
4. Đối chiếu dấu bắt buộc với form/backend: Product có Unit Measure, mode serial mặc định None và `Opening Stock`; địa chỉ Customer/Vendor đều tùy chọn; Tax của PO/SO item bắt buộc; Status của chứng từ import không xuất hiện vì server luôn tạo Draft.
5. Import cùng một template bằng header English và Tiếng Việt ở cả hai locale. Tạo Customer Group tên chính xác `Đá`, rồi import Customer chỉ có Name/Group/Category và để trống Street cùng toàn bộ địa chỉ; lookup phải phân biệt `Đá` với `Da`.
6. Tạo file có ít nhất hai chứng từ, trong đó dòng cuối sai lookup hoặc sai điều kiện serial. Import phải báo đúng sheet/dòng/cột và không tạo bất kỳ chứng từ nào.
7. Sửa file hợp lệ rồi import lại. Tất cả chứng từ và dòng hàng phải được tạo cùng lúc ở trạng thái Nháp; tồn, serial, công nợ và báo cáo chưa thay đổi. Riêng Product có `Opening Stock` phải tạo Product và Stock Count mở đầu trong cùng transaction.
8. Với giao dịch tiền, thử tổng phân bổ sai và `Paid Amount > Amount`; toàn file phải bị từ chối. File hợp lệ phải tạo đúng payment/allocation và số dư quỹ.

### Export Excel

1. Trên một grid thường, áp dụng tìm kiếm, lọc, sắp xếp và chọn page size nhỏ; file phải chứa toàn bộ kết quả khớp, không chỉ trang hiện tại.
2. Đọc workbook bằng SheetJS và xác nhận không có checkbox, nút thao tác, ID kỹ thuật hoặc cột ẩn; ngày và tiền phải là kiểu Excel phù hợp.
3. Trên Báo cáo Tài chính Công trình, để tất cả nhóm đóng rồi export. File vẫn phải chứa đầy đủ dòng giao dịch và tổng nhóm đang lọc.
4. Đổi Việt/Anh và tải lại; tiêu đề cột trong workbook phải khớp chính xác header grid của locale hiện tại, không trộn nhãn. Tên sheet kỹ thuật vẫn ổn định.

### Print/Download PDF

1. Mở lần lượt PDF của SO, PO, Sales Return, Purchase Return, Transfer Out, Transfer In, Scrapping, Stock Count và Material Export; API và trang xem trước phải có dữ liệu đúng nguồn.
2. Material Export phải hiện đúng `ExportDate` và dòng hàng. Purchase/Sales Return phải đọc trực tiếp PO/SO, không còn phụ thuộc `goodsReceive/deliveryOrder`.
3. Tạo chứng từ có đủ dòng để vượt một trang A4, tải PDF và xác nhận có nhiều trang, không mất dòng, tiêu đề bảng được lặp và footer có `trang/tổng trang`.
4. Mọi tab PDF phải mở với `noopener`; thiếu ID hoặc API lỗi phải hiện thông báo rõ, không tạo file rỗng.

Mọi file tải xuống chỉ lưu trong thư mục artifact tạm của lượt test. Xóa artifact khi test thành công và chỉ giữ file/trace/video của ca thất bại.

## 17.1. Luồng hồi quy bắt buộc sau sửa lỗi kế toán/UI

1. Sales Order: gõ tuần tự Giá vốn `234000,25`, Giá bán `345000.75`, tồn mở đầu `2,5` và số lượng bán `1,25`; request, database và dữ liệu tải lại phải giữ đúng phần thập phân. Ô Hàng hóa hiển thị tên/mã thay vì UUID, cột `Tồn khả dụng` hiển thị `2,5`. Lưu ảnh tại `artifacts/screenshots/sales-order-stock-and-lookup.png`.
2. Sales Order có serial: chọn 2 trong 3 serial khả dụng; số lượng trên dòng, batch thay đổi và dữ liệu lưu phải cùng bằng `2` và chứa đúng 2 serial đã chọn.
3. Thu chi: tăng `Số tiền đã trả` khi chưa chọn tài khoản quỹ phải bị chặn; chọn tài khoản rồi lưu phải thành công trong dưới 10 giây. Với giao dịch nguồn Sales/Purchase còn nợ, tài khoản quỹ phải cho phép chọn ngay tại màn hình Thu chi. Thanh toán trực tiếp từ SO/PO phải đổi trạng thái trên grid ngay, không cần F5.
4. Nhóm nhà cung cấp: nhấn một lần vào dòng phải chọn dòng; Ctrl+click chọn hai dòng, xóa một lần; sau đó chọn và xóa dòng còn lại để xác nhận selection cũ đã được dọn. Khi xóa khách hàng/nhóm khách hàng đang được sử dụng, UI phải hiện `Xóa thất bại` và lý do nghiệp vụ thay vì chỉ có lỗi console.
5. File mẫu import: sheet nhập chính không chứa dữ liệu mẫu. Các sheet `Example-Data`, `Example-Documents`, `Example-Items`, `Example-Allocations` chỉ dùng tham khảo, có tiêu đề tiếng Việt và ít nhất một dòng ví dụ thực tế; importer không đọc các sheet này. File không có dòng nhập phải báo `File Excel không chứa dòng dữ liệu nào để nhập.` khi dùng tiếng Việt.
6. Định dạng số: kiểm tra đồng thời tiền nguyên `10.000.000,00`, tiền lẻ `12.350,231` và số lượng tồn thập phân; không được làm tròn mất phần lẻ ở UI, request, database, Excel hoặc PDF.

7. Thu chi thập phân: nhập `200.000,22`, rời focus và lưu; UI, payload và database phải cùng là `200000.22`. Sau đó thay bằng tổng lũy kế `300.000`; lịch sử phải có đúng hai lần `200000.22` và `99999.78`, không nối thêm chữ số từ giá trị cũ.
8. Sales Order có serial: sau khi chọn serial, đổi Thuế và kiểm tra ngay trước khi lưu; số lượng trên row và ô hiển thị vẫn phải bằng số serial đã chọn.
9. UI responsive: kiểm tra các trang Product, SO, PO, Thu chi và ba báo cáo tại `1366x768` và `390x844`; body không tràn ngang, modal cuộn trong thân và footer nút luôn nhìn thấy.

## 18. Mẫu báo cáo lỗi

```text
Tiêu đề: [Phân hệ] Kết quả sai ngắn gọn
Thời điểm / môi trường:
Tài khoản / vai trò:
Dữ liệu tiền tố E2E:
Điều kiện ban đầu:
Các bước tái hiện:
1.
2.
3.
Kết quả thực tế:
Kết quả mong đợi:
Giá trị trước / sau:
Request lỗi, status và thời gian:
Lỗi console:
Ảnh/video:
Mức độ: Blocker / Critical / Major / Minor
Ảnh hưởng nghiệp vụ kho hoặc kế toán:
```

Nếu một bước thất bại, agent phải dừng các bước phụ thuộc vào dữ liệu đó, lưu bằng chứng và tiếp tục các kịch bản độc lập. Không được tự coi kết quả đúng chỉ vì thao tác không hiện thông báo lỗi; luôn đối chiếu báo cáo, tồn, serial, công nợ và số dư tiền.
