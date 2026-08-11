# Nghiệp vụ quản lý kho, bán hàng và kế toán công trình

Tài liệu này là nguồn quy tắc nghiệp vụ chung. Mọi thay đổi hệ thống phải bảo toàn các nguyên tắc dưới đây.

## Khái niệm nền tảng

- Một Khách hàng đồng thời đại diện cho một khách hàng thương mại hoặc một công trình cần theo dõi doanh thu, chi phí và lợi nhuận.
- Nhà cung cấp là đối tác bán hàng hóa hoặc dịch vụ cho doanh nghiệp.
- Kho chỉ chứa hàng vật lý. Hàng phi vật lý không được có số tồn, kho hiện tại hoặc lịch sử chuyển động kho.
- Trạng thái Nháp chỉ là dữ liệu chuẩn bị. Chỉ chứng từ Đã xác nhận mới tạo tác động kế toán hoặc tồn kho.
- Chứng từ Đã hủy không được tính vào tồn kho, doanh thu, chi phí, công nợ hay báo cáo.

## Vòng đời chứng từ

- Nháp được sửa và xóa vì chưa tạo tác động kho hoặc kế toán.
- Đã xác nhận đã tạo toàn bộ tác động nghiệp vụ, không được sửa dòng và không được xóa; muốn dừng hiệu lực phải dùng Hủy.
- Đã hủy có nghĩa là mọi tác động tồn, serial, bảo hành, công nợ và báo cáo đã được hoàn tác thành công.
- Lưu trữ vẫn giữ nguyên tác động như Đã xác nhận, chỉ ẩn chứng từ khỏi công việc thường ngày.
- Xác nhận và Hủy là thao tác nguyên tử: nếu một bước thất bại thì mọi thay đổi trong thao tác đó phải được hoàn tác.
- Không được hủy âm thầm khi có chứng từ phụ thuộc. Thông báo phải chỉ rõ chứng từ, hàng hóa, serial hoặc số lượng, kho và chứng từ phụ thuộc để người dùng biết việc cần xử lý trước.

## Hàng hóa và dịch vụ

### Hàng vật lý

Hàng vật lý là vật tư hoặc thiết bị thực sự nhập, xuất và nằm trong kho. Mọi dòng mua hoặc bán hàng vật lý bắt buộc có kho.

Hàng vật lý có đúng một trong ba chế độ serial:

1. Không theo dõi serial: tồn kho quản lý theo số lượng và có thể dùng số lượng thập phân khi đơn vị đo cho phép.
2. Mã nội bộ tự sinh: số lượng phải là số nguyên; hệ thống sinh một mã duy nhất cho từng đơn vị khi xác nhận mua.
3. Serial nhà sản xuất: số lượng phải là số nguyên; người dùng phải nhập đủ serial, các serial không rỗng và không trùng nhau.

Serial luôn thuộc đúng một hàng hóa. Serial đang ở kho nào phải khớp với tồn kho của hàng hóa tại kho đó. Một serial không thể đồng thời ở hai kho, bán hai lần hoặc phân bổ hai lần.

Không được đổi thuộc tính vật lý hoặc chế độ serial khi hàng đã có lịch sử kho hoặc lịch sử serial, vì việc đổi có thể làm mất tính nhất quán của tồn.

### Hàng phi vật lý

Hàng phi vật lý dùng cho dịch vụ, voucher hoặc sản phẩm đầu ra tổng hợp như “Bàn làm việc”. Hàng phi vật lý:

- luôn có chế độ serial là Không theo dõi;
- không có kho mặc định, kho trên dòng chứng từ hoặc tồn kho;
- không tạo giao dịch kho và không kiểm tra tồn;
- không có bảo hành thiết bị hoặc thao tác chọn serial;
- không xuất hiện trong báo cáo tồn kho;
- vẫn được mua hoặc bán để ghi nhận nghĩa vụ tài chính, doanh thu và chi phí phù hợp.

## Mua hàng

- Đơn mua Nháp không tăng tồn và không tạo công nợ.
- Khi xác nhận đơn mua, từng dòng hàng vật lý tăng tồn trực tiếp tại kho của dòng đó. Giá vốn nguồn là đơn giá mua thực tế trước thuế của chính dòng mua.
- Dòng hàng phi vật lý không tăng tồn nhưng vẫn tham gia tổng tiền và khoản phải trả.
- Khi xác nhận, đơn mua tạo một khoản phải trả nhà cung cấp bằng tổng sau thuế.
- Đơn mua đã xác nhận không được sửa trực tiếp dòng hàng, số lượng, giá hoặc kho.
- Chỉ được hủy đơn mua đã xác nhận khi chưa có thanh toán, trả hàng, phân bổ công trình, xuất dùng hoặc giao dịch phụ thuộc. Hủy hợp lệ phải hoàn tác tồn, serial và công nợ cùng lúc.
- Serial nguồn mua đang Đã bán, đang ở công trình, đang chuyển kho, đã hủy hàng, thất lạc hoặc ở sai kho sẽ chặn hủy đơn mua.
- Serial từng bán vẫn cho phép hủy đơn mua nếu đã được khách trả và hiện quay về đúng kho nhập ban đầu. Khi đó lịch sử serial được giữ lại nhưng serial chuyển thành Nguồn mua đã hủy, không còn trong tồn, danh sách chọn serial hoặc bảo hành đang hoạt động.
- Trả hàng mua luôn tham chiếu đơn mua và trực tiếp làm giảm tồn tại kho. Serial trả phải đúng nguồn và còn ở trạng thái hợp lệ.

## Bán hàng

- Đơn bán Nháp không giảm tồn, không ghi nhận doanh thu và không tạo công nợ.
- Khi xác nhận đơn bán, hệ thống kiểm tra tồn và serial trong cùng một nghiệp vụ xác nhận.
- Dòng hàng vật lý giảm tồn trực tiếp tại kho của dòng. Serial được chuyển sang Đã bán và bắt đầu bảo hành khách hàng.
- Dòng hàng phi vật lý không ảnh hưởng tồn nhưng vẫn ghi nhận doanh thu.
- Khi xác nhận, đơn bán tạo một khoản phải thu khách hàng bằng tổng sau thuế.
- Đơn bán đã xác nhận không được sửa trực tiếp dòng hàng, số lượng, giá, kho hoặc serial.
- Chỉ được hủy đơn bán đã xác nhận khi chưa có thanh toán, trả hàng, phân bổ, xuất dùng hoặc giao dịch phụ thuộc. Hủy hợp lệ phải hoàn tác tồn, serial, bảo hành và công nợ cùng lúc.
- Trả hàng bán luôn tham chiếu đơn bán và trực tiếp làm tăng tồn. Serial trả phải đúng serial đã bán từ đơn bán đó.
- Nếu trả hàng bán còn hiệu lực thì phải hủy phiếu trả trước khi hủy đơn bán để tránh cộng tồn hai lần.

## Chuyển động kho còn được sử dụng

- Chuyển kho gồm xuất khỏi kho nguồn và nhập vào kho đích; tổng tồn toàn hệ thống không đổi.
- Nhập chuyển kho chỉ được xác nhận từ phiếu xuất chuyển kho đã xác nhận. Không được hủy phiếu xuất khi phiếu nhập tương ứng còn hiệu lực; phải hủy phiếu nhập trước.
- Kiểm kê ghi nhận chênh lệch giữa số hệ thống và số thực đếm, có dấu vết người xác nhận.
- Hủy hàng làm giảm tồn do mất, hỏng hoặc loại bỏ và phải có lý do.
- Xuất vật tư làm giảm tồn để sử dụng cho một công trình.
- Hàng không serial xuất theo số lượng và phải kiểm tra tồn tại kho.
- Hàng có serial xuất bằng đúng các serial được chọn; số serial phải bằng số lượng và đều đang sẵn có tại kho.
- Không tồn tại bước nhận hàng riêng sau đơn mua, bước giao hàng riêng sau đơn bán, hoặc chứng từ điều chỉnh tăng/giảm độc lập.
- Hủy xuất vật tư phải phục hồi tồn/serial và loại chi phí công trình tương ứng.
- Hủy hàng chỉ được hoàn tác khi hàng hoặc serial chưa có chuyển động mới hơn; kiểm kê chỉ được hủy khi không có chuyển động mới hơn trên đúng hàng và kho liên quan.

## Phân bổ vật tư mua cho công trình

- Chỉ đơn mua Đã xác nhận mới được phân bổ.
- Tổng số lượng phân bổ của một dòng không được vượt số lượng đã mua.
- Mỗi dòng phân bổ xác định công trình, hàng hóa, số lượng, kho, đơn giá và thành tiền.
- Giá chi phí là đơn giá mua thực tế trước thuế, không phải giá vốn mặc định trong danh mục.
- Phân bổ hàng vật lý trực tiếp làm giảm tồn của kho tương ứng; hàng có serial phải chọn đúng serial còn trong kho.
- Phân bổ hàng phi vật lý chỉ tạo chi phí công trình, không tạo chuyển động kho.
- Khoản phải trả hoặc khoản thanh toán nhà cung cấp không được cộng thêm lần nữa vào chi phí công trình.

## Chi phí công thợ, gia công và chi phí tiền mặt

- Công thợ, gia công ván, vận chuyển và chi phí tương tự là giao dịch Chi.
- Thông tin chung của giao dịch Chi xác định người nhận tiền hoặc nhà cung cấp, nhóm chi phí, tổng số tiền và tình trạng thanh toán.
- Một giao dịch Chi có thể được chia cho một hoặc nhiều công trình.
- Chi tiết phân bổ mới xác định khách hàng/công trình nào chịu chi phí. Mỗi dòng gồm công trình, số tiền và diễn giải riêng cho phần việc của công trình đó.
- Một người thợ hoặc đơn vị gia công có thể cung cấp công việc cho nhiều công trình trong cùng một giao dịch. Ví dụ giao dịch Chi 800.000 cho Anh Lân có thể phân bổ 250.000 cho Công trình A và 550.000 cho Công trình B.
- Khi dùng phân bổ, tổng tiền của tất cả dòng bắt buộc bằng tổng giao dịch.
- Nếu có dòng phân bổ, báo cáo chỉ tính các dòng; tuyệt đối không cộng lại giao dịch cha.
- Chi phí được ghi nhận đầy đủ khi nghiệp vụ phân bổ được xác lập, không phụ thuộc đã trả tiền hay chưa.

## Doanh thu, chi phí và lợi nhuận công trình

Hệ thống áp dụng nguyên tắc dồn tích:

- Doanh thu công trình là tổng trước thuế của các đơn bán Đã xác nhận thuộc công trình.
- Chi phí công trình gồm vật tư phân bổ trực tiếp từ đơn mua, vật tư xuất từ kho, và các khoản công thợ, gia công, vận chuyển hoặc chi phí khác đã phân bổ.
- Lợi nhuận bằng Doanh thu trừ Chi phí công trình.
- Trạng thái thanh toán không làm thay đổi doanh thu, chi phí hoặc lợi nhuận.
- Dữ liệu Nháp hoặc Đã hủy không được tính.

Ví dụ bất biến: công trình có đơn bán Đã xác nhận trước thuế 2.000.000 và tổng chi phí vật tư, công thợ, gia công 500.000 thì doanh thu là 2.000.000, chi phí là 500.000 và lợi nhuận là 1.500.000 kể cả chưa thu hoặc chưa trả tiền.

## Giá vốn hàng bán

- Giá vốn và doanh thu dùng số trước thuế.
- Hàng có serial lấy giá vốn từ đúng dòng đơn mua đã sinh ra serial đó.
- Hàng không serial dùng bình quân gia quyền theo số lượng thực nhập Đã xác nhận của đúng hàng và đúng kho, với đơn giá mua thực tế.
- Khi không thể truy nguồn mua, giá vốn danh mục chỉ là giá dự phòng và phải được nhận biết là nguồn dự phòng.
- Không được mặc định giá vốn thiếu thành 0 nếu vẫn có thể dùng giá dự phòng.

## Tiền và công nợ

- Trong loại giao dịch tiền, `Debit` là Thu và `Credit` là Chi. Đây là quy ước của hệ thống; không được đảo nghĩa dựa trên cách gọi debit/credit của sao kê ngân hàng.
- Đơn bán Đã xác nhận tạo khoản phải thu bằng tổng sau thuế.
- Đơn mua Đã xác nhận tạo khoản phải trả bằng tổng sau thuế.
- Thu hoặc trả tiền chỉ cập nhật lịch sử thanh toán, số đã thanh toán, số còn lại và số dư tài khoản tiền.
- Thanh toán một phần chỉ làm giảm công nợ tương ứng; không đổi lợi nhuận dồn tích.
- Công nợ khách hàng tổng hợp doanh số Đã xác nhận, đã thu và còn phải thu.
- Công nợ nhà cung cấp tổng hợp giá trị mua Đã xác nhận, đã trả và còn phải trả.
- Tổng hợp công nợ và bảng điều khiển phải dùng cùng một công thức và cùng nguồn chứng từ.
- Giao dịch tiền tự sinh từ đơn mua, đơn bán, xuất vật tư hoặc trả hàng không được xóa độc lập; phải xử lý chứng từ nguồn.
- Giao dịch tiền thủ công được xóa cùng toàn bộ lần thanh toán và dòng phân bổ trong một nghiệp vụ nguyên tử, sau đó số dư tài khoản phải được tính lại.
- Trả hàng bán làm giảm doanh thu và khoản phải thu; trả hàng mua làm giảm giá trị mua và khoản phải trả. Khoản đã thanh toán hoặc hoàn tiền chưa xử lý sẽ chặn hủy chứng từ nguồn.

## Bảo hành

- Chỉ hàng vật lý có serial mới có bảo hành thiết bị.
- Bảo hành nhà cung cấp bắt đầu từ nguồn mua; bảo hành khách hàng bắt đầu khi serial được bán.
- Lịch sử serial phải giữ đúng loại nguồn thực tế: mua, bán, trả hàng, chuyển kho, xuất vật tư hoặc phân bổ công trình.
- Lịch sử phân bổ công trình phải cho biết nguồn mua, công trình, hàng, kho, số lượng, đơn giá và thành tiền; không được giả thành một loại chứng từ khác.

## Các bất biến không được phá vỡ

- Không tạo tồn âm, không bán hoặc xuất một serial không sẵn có.
- Không tạo bất kỳ tồn hoặc serial nào cho hàng phi vật lý.
- Không cho sửa dòng chứng từ đã xác nhận.
- Xác nhận hoặc hủy phải hoàn thành toàn bộ tác động kho, serial và công nợ; lỗi ở một phần phải hoàn tác tất cả.
- Không cộng trùng chi phí giữa phân bổ, giao dịch cha và thanh toán.
- Không dùng tiền đã thu làm doanh thu hoặc tiền đã trả làm chi phí của báo cáo lợi nhuận.
- Báo cáo tồn, lợi nhuận, công nợ và bảng điều khiển phải loại Nháp và Đã hủy.
- Báo cáo phải tính cả Đã xác nhận và Lưu trữ; trả hàng phải được trừ đúng khỏi doanh thu, chi phí và công nợ liên quan.
- Giá trị lợi nhuận dùng trước thuế; giá trị công nợ dùng sau thuế.

## Quy trình kiểm thử bắt buộc cho agent

- Sau mọi thay đổi code, agent phải chạy `npm.cmd run test:js` và `dotnet build Indotalent.sln --no-restore`.
- Không giữ application test tạm trong repository. Nếu tạo application test để xác minh trong lúc sửa lỗi thì phải xóa test và project test đó sau khi kiểm tra xong; JavaScript test và browser test dùng chung vẫn được giữ lại.
- Khi thay đổi giao diện, giao dịch Thu Chi, báo cáo tài chính, localization, menu hoặc hành vi gom nhóm, agent phải khởi động ứng dụng thật và chạy `npm.cmd run test:browser:all`. Không được kết luận hoàn tất chỉ dựa trên unit test.
- Browser test phải chạy trên database cô lập, ví dụ `WHMS_AntigravityTest`; tuyệt đối không bật `IsDemoVersion=true` trên database làm việc vì demo startup sẽ xóa và seed lại database.
- Nếu ứng dụng không chạy tại `http://localhost:5000`, phải truyền `BASE_URL` cho các script Playwright. Mọi HTTP 4xx/5xx cùng origin, request thất bại, JavaScript error hoặc sai tổng tiền đều làm test thất bại.
- Với giao dịch thủ công, cả Thu (`Debit`) và Chi (`Credit`) đều có `Chi tiết phân bổ` tùy chọn. Nếu có dòng thì tổng dòng phải bằng tổng giao dịch; phân bổ Thu chỉ để truy vết và không được tính thành doanh thu hay chi phí công trình.
- Báo cáo Thu Chi Theo Danh Mục phải dùng tiền thực thu/thực chi, loại điều chuyển quỹ và dữ liệu đã xóa, đồng thời khớp tổng thẻ với tổng các dòng.
- Mọi grid có gom nhóm phải đóng toàn bộ nhóm sau lần bind/rebind dữ liệu; mở một nhóm không được làm bung các nhóm còn lại.
- Import Excel phải kiểm tra toàn bộ workbook và lưu trong một transaction; một lỗi ở bất kỳ sheet/dòng nào phải khiến toàn file không tạo dữ liệu. Chứng từ import luôn là Nháp và chưa tác động tồn kho, serial, công nợ hoặc báo cáo.
- Browser test Import/Export không được chỉ kiểm tra nút. Phải tải file, đọc lại workbook và đối chiếu sheet, cột, số dòng, kiểu số/ngày, bộ lọc và dữ liệu chi tiết của nhóm đang đóng.
- Browser test PDF phải tải file thật, kiểm tra chữ ký `%PDF`, số trang và chứng từ dài không mất dòng. Các thư viện export phải được phục vụ nội bộ, không phụ thuộc CDN.
- Hướng dẫn browser chi tiết và ma trận nghiệp vụ nằm tại `docs/ANTIGRAVITY_BROWSER_TEST_GUIDE.md`; agent phải cập nhật tài liệu này khi thêm hoặc đổi một luồng browser quan trọng.
