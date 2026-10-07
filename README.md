# Recruiting Studio

> just a Talent Acquisition tinkering to build her own recruiting process

UI ATS tiếng Việt, xây theo đúng 10 bảng của **Recruiting Database**. Giao diện có daily brief, pipeline kéo thả hoặc danh sách, candidate pool, quản lý job, hồ sơ chi tiết, interview/test, feedback từng reviewer, email nháp, offer và onboarding.

## Trạng thái hiện tại

Đây là bản UI tương tác có lưu cục bộ, được triển khai riêng tư qua Sites. Lần mở đầu dùng dữ liệu hư cấu để thử thao tác. Bấm **Dữ liệu & kết nối → Workspace trống** để bắt đầu nhập dữ liệu riêng; hãy xuất JSON trước khi thay thế dữ liệu đang có.

**Chưa kết nối trực tiếp Google Sheet, Drive, Gmail, Calendly hoặc AI.** Công cụ kiểm tra quyền connector cho Sites không khả dụng trong phiên xây dựng này. UI không gọi Google APIs, không ghi vào Sheet, không tự gửi email, không tạo Calendar event, và form HM chưa có link bên ngoài. Các điểm fit trong demo là số mẫu, không phải kết quả gọi AI. Dữ liệu nằm trong localStorage của trình duyệt; chưa hỗ trợ đồng bộ nhiều người hoặc nhiều thiết bị.

Google Sheet đích: https://docs.google.com/spreadsheets/d/1iD1kfavTv3qivYE6roNzjWIOekpajhgVjgVwQI5NJrs/edit

## Source trên GitHub

Repository này lưu source code, hướng dẫn và kiểm tra. Dữ liệu ứng viên và Goals bà nhập trên dashboard vẫn nằm trong trình duyệt và không được đưa lên GitHub. Trước khi đổi máy, trình duyệt hoặc chuyển từ website hiện tại sang localhost/URL mới, xuất **Recruiting Database JSON** và **Goals JSON** riêng từ UI gốc, rồi nhập từng file ở UI đích. Dữ liệu cục bộ được tách theo địa chỉ website.

Chỉnh code trên GitHub chưa tự cập nhật website đang chạy trên Sites; cần triển khai phiên bản mới sau khi chỉnh. Repository không chứa cấu hình gắn với Site hiện tại hay thông tin xác thực.

## Chạy trên máy

Không cần cài thư viện frontend. Trong thư mục dự án:

```sh
python3 -m http.server 5173 --bind 127.0.0.1 --directory dist
```

Mở `http://127.0.0.1:5173/`. Kiểm tra nghiệp vụ bằng Node:

```sh
npm test
```

## Cấu trúc code

- `dist/index.html`: trang vào.
- `dist/app.js`: màn hình và thao tác UI, kiểm tra dữ liệu trước khi lưu, rollback khi lỗi.
- `dist/model.js`: liên kết bản ghi, thay đổi giai đoạn, quyết định, feedback, đổi lịch, email nháp, import/export.
- `dist/goals-model.js`: dữ liệu và quy tắc cho mục tiêu công việc, tách khỏi database ứng viên.
- `dist/goals-view.js`: danh sách mục tiêu, kế hoạch task, preset và thao tác import/export Goals.
- `dist/recruiting-details.js`: thông tin tuyển dụng dưới tên ứng viên, control sửa trực tiếp và kiểm tra giá trị từng trường.
- `dist/schema.json`: schema đầy đủ của Sheet, gồm tên cột, loại, dropdown và mô tả tiếng Việt.
- `dist/styles.css`: giao diện desktop/mobile và trạng thái truy cập bằng bàn phím.
- `dist/goals.css`: bố cục và trạng thái của màn hình Goals trên desktop/mobile.
- `tests/model.test.mjs`: kiểm tra những quy tắc có thể gây sai dữ liệu hoặc workflow.
- `tests/goals.test.mjs`: kiểm tra tiến độ, hoàn thành mục tiêu, ngày, liên kết task và import/export của Goals.
- `tests/goals-view.test.mjs`: kiểm tra luồng xác nhận hoàn thành Goals trên UI.
- `tests/recruiting-details.test.mjs`: kiểm tra sửa đúng Candidate/Application, lương, ngày, giá trị trống và an toàn khi hiển thị thông tin.

`schema_version` là `1.0`. JSON xuất giữ đủ `Jobs`, `Candidates`, `Applications`, `Documents`, `Rounds`, `Feedback`, `Tasks`, `Emails`, `Offers`, `ActivityLog`; trường JSON trong từng bản ghi vẫn là chuỗi JSON đúng schema. Có thể xuất riêng từng bảng CSV từ phần khám phá database. CSV chặn diễn giải giá trị bắt đầu bằng ký tự công thức; JSON là bản xuất chuẩn để bảo toàn dữ liệu.

## Mục tiêu công việc

Goals giúp ghi mục tiêu, tiêu chí hoàn thành và các task nhỏ để thực hiện mục tiêu. Task Goals đến hạn có thể xuất hiện trong brief hôm nay; mục tiêu đang tạm dừng hoặc đã lưu trữ được loại khỏi brief. Tick hết task chỉ thể hiện tiến độ: người dùng vẫn cần xác nhận hoàn thành mục tiêu và tiêu chí kết quả. Task bị hủy không tính vào tiến độ; mục tiêu chưa có task hoặc chỉ có task bị hủy hiển thị 0%.

Dữ liệu Goals được lưu cục bộ riêng với dữ liệu ATS. File **xuất Goals JSON** là bản sao cho mục tiêu và task Goals; bản xuất Recruiting Database vẫn giữ nguyên 10 bảng ứng viên và không có thêm bảng Goals. Chuyển workspace hay nhập file ATS không tự tạo hoặc ghi mục tiêu vào Google Sheet. Chưa có đồng bộ Goals giữa người dùng/thiết bị hoặc nhắc việc khi đóng trang.

Đề xuất task từ preset là mẫu cố định để người dùng xem lại, chỉnh sửa và thêm; đây chưa phải tính năng gọi AI. Inbox chưa được thêm vào phiên bản này.

## Quy tắc đã thực hiện

- Thông tin tuyển dụng nằm dưới tên/vị trí ứng tuyển và trước các tab hồ sơ. Các trường sửa trực tiếp, hiện Lưu/Hủy khi focus hoặc có thay đổi. Enter lưu một trường; Escape hủy sửa trường; ghi chú dùng Ctrl/Cmd + Enter để lưu. Bản nháp các trường khác được giữ khi lưu một trường, và được xóa khi thay workspace/import database.
- Một Candidate có nhiều Application; không dùng số dòng làm mã.
- Fit và coverage lưu 0–1; ô trống hiển thị “—”, khác 0%.
- Feedback và quyết định recruiter được giữ riêng.
- Từ chối/rút/đóng hồ sơ phải có kết quả và lý do. Không tự gửi email.
- Khi đóng hồ sơ, hủy việc không còn cần thiết và feedback đang chờ; giữ việc thank you. Bảo toàn lịch sử đã hoàn thành.
- D1…Dn là HM interview, T1/T2 là test; recruiter screen giữ riêng.
- Đổi lịch giữ round_id, ghi lịch sử và cập nhật thời gian nhắc chuẩn bị/tham gia đã có.
- Nhận feedback thì hoàn tất việc đòi feedback liên quan. Vắng mặt được ghi bên vắng và lý do, không tự reject.
- Email chỉ là bản nháp; nút gửi thật chưa được bật. Attachments lưu document_id và tham chiếu file.
- Đề xuất thay portrait giữ trong Feedback để recruiter duyệt. UI không tự sửa tài liệu tiêu chí.

## Phần cần nối để vận hành thật

Thay `loadState`/`saveState` bằng adapter server đọc và cập nhật Sheet theo ID. Server cần xác thực recruiter, kiểm tra quyền job, lấy dữ liệu mới nhất trước mỗi ghi, phát hiện xung đột khi nhiều người sửa, và ghi ActivityLog. localStorage không thể làm nguồn dữ liệu chính khi chạy chung.

Các hành động gửi email, tạo lịch/buffer và nhận feedback qua link cần server có quyền riêng: email phải có yêu cầu gửi rõ ràng, chống gửi trùng và lưu provider_message_id khi dịch vụ xác nhận; form HM chỉ cho đúng reviewer/vòng, không để lộ candidate pool; buffer tham chiếu CV và câu hỏi cá nhân hóa. Luồng AI xử lý file cần cập nhật Documents.processing_status và ghi bằng chứng/phiên bản tiêu chí vào Feedback.

Quy tắc checkpoint 5 ngày, D+2/D+4, thank you và ngày làm việc/cuối tuần cần được chốt và chạy ở backend. UI hiện hỗ trợ đặt/hoàn tất/hoãn công việc; chưa có scheduler chạy khi trang đóng.
