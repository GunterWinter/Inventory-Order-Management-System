# Nghiệp vụ quản lý kho, bán hàng và kế toán công trình

Tài liệu này mô tả nghiệp vụ của ứng dụng. Mục tiêu là giúp người dùng và người phát triển hiểu cùng một luồng vận hành.

## Phạm vi và khái niệm

- Hệ thống quản lý danh mục, mua hàng, bán hàng, kho, thu chi, công nợ, bảo hành và báo cáo cho doanh nghiệp thi công/nội thất.
- Mỗi Khách hàng có thể là khách mua thông thường hoặc một công trình. Tất cả Khách hàng đều có thể có doanh thu, chi phí và lợi nhuận để báo cáo theo từng đối tượng.
- Nhà cung cấp là đối tác bán hàng hóa hoặc dịch vụ cho doanh nghiệp.
- Kho chỉ chứa hàng vật lý. Hàng phi vật lý không có tồn, kho hiện tại, serial hoặc lịch sử chuyển động kho.
- Ứng dụng chỉ có ba trạng thái chứng từ: Nháp, Đã xác nhận và Đã hủy. Không sử dụng trạng thái Lưu trữ.

## Quy ước hiển thị và dữ liệu

- Giao diện tiếng Việt dùng dấu chấm (.) ngăn cách hàng nghìn và dấu phẩy (,) cho phần thập phân; ví dụ 321.987,63.
- Tiền được nhập và hiển thị với đúng hai chữ số thập phân. Cơ sở dữ liệu vẫn giữ độ chính xác sáu chữ số thập phân để tính toán trước khi làm tròn kết quả hiển thị.
- Số lượng hàng không theo dõi serial có thể có tối đa sáu chữ số thập phân. Số lượng hàng theo serial luôn là số nguyên.
- Ngày nghiệp vụ hiển thị theo dd/MM/yyyy, dùng múi giờ Việt Nam và không được dịch sang ngày trước hoặc sau do chênh lệch múi giờ.
- Dòng chi tiết, nhóm, tổng cuối, biểu đồ, PDF và Excel của cùng một số tiền phải dùng cùng quy tắc hiển thị.

## Hàng hóa, kho và serial

### Hàng vật lý

Hàng vật lý là vật tư hoặc thiết bị thực tế được nhập, xuất và quản lý trong kho. Mỗi dòng mua hoặc bán hàng vật lý bắt buộc có kho.

Mỗi hàng vật lý có một chế độ serial:

1. Không theo dõi serial: quản lý theo số lượng, cho phép số lẻ khi đơn vị tính cho phép.
2. Mã nội bộ tự sinh: số lượng là số nguyên; hệ thống sinh một mã duy nhất cho từng đơn vị khi xác nhận mua.
3. Serial nhà sản xuất: số lượng là số nguyên; người dùng nhập đủ serial, không rỗng và không trùng nhau.

Serial luôn thuộc đúng một hàng hóa và chỉ ở một trạng thái/vị trí hợp lệ tại một thời điểm. Không được bán, xuất, chuyển hoặc phân bổ cùng một serial nhiều lần. Không được đổi thuộc tính vật lý hoặc chế độ serial sau khi hàng đã có lịch sử kho hoặc serial.

### Hàng phi vật lý

Hàng phi vật lý dùng cho dịch vụ, voucher hoặc sản phẩm đầu ra tổng hợp. Hàng này luôn không theo dõi serial, không yêu cầu kho, không tạo chuyển động kho, không kiểm tra tồn và không có bảo hành thiết bị. Hàng phi vật lý vẫn có thể mua hoặc bán để ghi nhận chi phí, doanh thu và công nợ.

## Vòng đời chứng từ, xóa và hủy

- Nháp chỉ là dữ liệu chuẩn bị; chưa làm thay đổi tồn kho, serial, bảo hành, công nợ, thu chi hay báo cáo. Nháp có thể sửa hoặc xóa.
- Đã xác nhận tạo toàn bộ tác động nghiệp vụ. Không được sửa trực tiếp dòng hàng, số lượng, giá, kho hoặc serial.
- Đã hủy không được tính vào tồn kho, doanh thu, chi phí, công nợ hay báo cáo. Hủy phải hoàn tác toàn bộ tác động liên quan trong một nghiệp vụ nguyên tử.
- Chứng từ Đã xác nhận không được xóa. Nếu người dùng không còn dùng chứng từ, phải dùng Hủy; hệ thống phải chặn hủy khi còn thanh toán, trả hàng, phân bổ, xuất dùng hoặc chứng từ phụ thuộc.
- Thông báo chặn hủy phải nêu rõ chứng từ, hàng hóa/serial, số lượng, kho hoặc nghiệp vụ phụ thuộc để người dùng biết cần xử lý gì trước.
- Giao dịch Thu/Chi tự tạo từ chứng từ nguồn không được xóa riêng. Giao dịch tiền thủ công được xóa cùng các lần thanh toán và dòng phân bổ, sau đó số dư quỹ phải được tính lại.

## Mua hàng, bán hàng và trả hàng

- Đơn mua Nháp không tăng tồn và không tạo công nợ. Khi xác nhận, hàng vật lý tăng tồn tại kho của dòng; giá vốn nguồn là đơn giá mua thực tế trước thuế. Hàng phi vật lý không tăng tồn nhưng vẫn tham gia tổng tiền và khoản phải trả.
- Đơn mua Đã xác nhận tạo khoản phải trả bằng tổng sau thuế. Thanh toán chỉ làm thay đổi số đã trả, số còn lại và số dư quỹ; không thay đổi chi phí/lợi nhuận dồn tích.
- Hủy đơn mua phải hoàn tác tồn, serial và khoản phải trả cùng lúc. Không được hủy khi có trả hàng, phân bổ công trình, xuất dùng, thanh toán hoặc giao dịch phụ thuộc chưa được hoàn tác.
- Phiếu trả hàng mua luôn tham chiếu đơn mua hợp lệ, làm giảm tồn và giảm giá trị mua/khoản phải trả. Serial trả phải đúng nguồn mua và còn ở trạng thái hợp lệ.
- Đơn bán Nháp không giảm tồn, không ghi nhận doanh thu và không tạo công nợ. Khi xác nhận, hệ thống kiểm tra tồn và serial trong cùng nghiệp vụ; hàng vật lý giảm tồn, serial chuyển sang Đã bán và bắt đầu bảo hành khách hàng.
- Đơn bán Đã xác nhận tạo khoản phải thu bằng tổng sau thuế. Doanh thu và lợi nhuận dồn tích không phụ thuộc khách đã thanh toán hay chưa.
- Hủy đơn bán phải hoàn tác tồn, serial, bảo hành và khoản phải thu cùng lúc; bị chặn khi còn thanh toán, trả hàng, phân bổ, xuất dùng hoặc nghiệp vụ phụ thuộc.
- Phiếu trả hàng bán luôn tham chiếu đơn bán hợp lệ, làm tăng tồn và giảm doanh thu/khoản phải thu. Serial trả phải là serial đã bán từ đúng đơn bán đó. Phải hủy phiếu trả hàng còn hiệu lực trước khi hủy đơn bán nguồn.

## Chuyển động kho và phân bổ công trình

- Xuất chuyển kho đưa hàng ra khỏi kho nguồn; Nhập chuyển kho chỉ được xác nhận từ phiếu xuất chuyển kho đã xác nhận và đưa hàng vào kho đích. Tổng tồn toàn hệ thống không đổi. Muốn hủy xuất chuyển kho phải hủy nhập chuyển kho tương ứng trước.
- Kiểm kê ghi nhận chênh lệch giữa số hệ thống và số thực đếm, có dấu vết người xác nhận. Không thể hủy khi cùng hàng và kho đã có chuyển động mới hơn.
- Hủy hàng làm giảm tồn do mất, hỏng hoặc loại bỏ và bắt buộc có lý do. Chỉ được hoàn tác khi hàng/serial chưa có chuyển động mới hơn.
- Xuất vật tư làm giảm tồn để sử dụng cho một Khách hàng/Công trình. Hàng serial phải chọn đúng serial còn ở kho; hàng không serial phải đủ tồn.
- Xác nhận xuất vật tư ghi nhận chi phí công trình theo giá vốn và tạo một giao dịch Chi nguồn phiếu xuất vật tư. Hủy phiếu phải phục hồi tồn/serial, loại chi phí công trình và hoàn tác giao dịch nguồn cùng lúc.
- Chỉ đơn mua Đã xác nhận mới được phân bổ. Tổng số lượng phân bổ của mỗi dòng mua không được vượt số lượng còn khả dụng.
- Mỗi dòng phân bổ xác định Khách hàng/Công trình, hàng hóa, số lượng, kho, đơn giá mua thực tế trước thuế và thành tiền. Phân bổ hàng vật lý làm giảm tồn; hàng serial phải chọn đúng serial còn trong kho. Phân bổ hàng phi vật lý chỉ tạo chi phí công trình.
- Không có bước nhận hàng riêng sau đơn mua, bước giao hàng riêng sau đơn bán hoặc chứng từ điều chỉnh tăng/giảm độc lập.

## Thu, chi, công nợ và lợi nhuận

- Trong hệ thống, Debit là Thu và Credit là Chi.
- Công thợ, gia công, vận chuyển và chi phí tương tự là giao dịch Chi. Một giao dịch có thể phân bổ cho một hoặc nhiều Khách hàng/Công trình.
- Khi có phân bổ, tổng tiền các dòng bắt buộc bằng tổng giao dịch. Báo cáo chỉ tính các dòng phân bổ, không cộng lại giao dịch cha.
- Phân bổ Thu chỉ phục vụ truy vết, không tạo doanh thu công trình. Phân bổ Chi tạo chi phí công trình khi được xác lập, không phụ thuộc trạng thái thanh toán.
- Công nợ khách hàng = giá trị đơn bán Đã xác nhận sau thuế trừ số đã thu. Công nợ nhà cung cấp = giá trị đơn mua Đã xác nhận sau thuế trừ số đã trả.
- Thanh toán một phần chỉ giảm công nợ và cập nhật số dư quỹ; không làm thay đổi doanh thu, chi phí hoặc lợi nhuận dồn tích. Điều chuyển quỹ không phải Thu hoặc Chi và không được tính vào báo cáo thu chi theo danh mục.
- Doanh thu công trình là tổng trước thuế của đơn bán Đã xác nhận. Chi phí công trình gồm vật tư phân bổ từ đơn mua, vật tư xuất từ kho và các khoản Chi đã phân bổ. Lợi nhuận = Doanh thu trước thuế − Chi phí công trình.
- Giá vốn hàng serial lấy từ đúng dòng mua đã sinh serial. Hàng không serial xuất theo FIFO theo ngày chứng từ, rồi đến thời điểm tạo và mã dòng để phá hòa; nếu xuất xuyên nhiều lô thì phải giữ đúng từng lát số lượng/đơn giá nguồn. Giá vốn danh mục chỉ là giá dự phòng khi không truy được nguồn mua.
- Trả hàng bán phải trừ doanh thu, công nợ và giá vốn liên quan; trả hàng mua phải trừ giá trị mua và công nợ liên quan.

## Bảo hành, tra cứu, báo cáo và Dashboard

- Chỉ hàng vật lý có serial mới có bảo hành thiết bị. Bảo hành nhà cung cấp bắt đầu từ mua; bảo hành khách hàng bắt đầu khi serial được bán.
- Tra cứu serial/bảo hành phải thể hiện đúng nguồn và lịch sử thực tế: mua, bán, trả hàng, chuyển kho, xuất vật tư hoặc phân bổ công trình.
- Báo cáo tồn kho, biến động kho, mua/bán, thu chi theo danh mục, công nợ, giá vốn/lợi nhuận hàng bán và tài chính công trình chỉ tính chứng từ Đã xác nhận; loại Nháp, Đã hủy và dữ liệu đã xóa.
- Báo cáo phải cho phép tra cứu bằng thông tin dễ nhận biết như mã chứng từ, mã/tên hàng, serial, kho, Khách hàng/Công trình, Nhà cung cấp, ngày và trạng thái khi dữ liệu đó thuộc phân hệ.
- Các tổng số trên báo cáo phải đối chiếu được với chứng từ nguồn và giữ đúng dấu tăng/giảm.
- Dashboard cung cấp tổng quan về doanh số bán Đã xác nhận, khoản phải thu, giá trị mua Đã xác nhận, khoản phải trả, số dư quỹ, số lượng tồn, số phiếu xuất vật tư, đơn mua/bán gần đây, chuyển động kho gần đây và biểu đồ tồn theo kho.
- Mỗi thẻ hoặc dòng tổng hợp phải dẫn người dùng đến danh sách/chứng từ liên quan. Dashboard phải dùng cùng nguồn và công thức với báo cáo chi tiết; biểu đồ và tổng hợp không được cắt phần thập phân.

## Các bất biến không được phá vỡ

- Không tạo tồn âm; không bán hoặc xuất serial không sẵn có.
- Không tạo tồn, serial, bảo hành hay chuyển động kho cho hàng phi vật lý.
- Không sửa dòng chứng từ Đã xác nhận.
- Xác nhận, hủy, xóa chứng từ Nháp và xóa giao dịch tiền thủ công phải hoàn thành toàn bộ tác động liên quan hoặc hoàn tác toàn bộ khi có lỗi.
- Không cộng trùng chi phí giữa giao dịch cha, dòng phân bổ, thanh toán và xuất vật tư.
- Không dùng tiền đã thu làm doanh thu hoặc tiền đã trả làm chi phí của báo cáo lợi nhuận.
- Giá trị lợi nhuận dùng trước thuế; công nợ dùng sau thuế.
