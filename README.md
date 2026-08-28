# LobeHub Account Manager

App desktop độc lập (Electron) để:
- Đăng nhập nhiều tài khoản LobeHub Cloud của chính bạn qua OAuth chuẩn (PKCE, mở trình duyệt hệ thống thật — không có webview giả, app không thấy mật khẩu của bạn).
- Chuyển đổi tài khoản "đang chọn" để xem thông tin.
- Xem quota/usage của tài khoản đang chọn (gọi API `/api/v1/usage` chính chủ bằng token của chính tài khoản đó).

Đây KHÔNG phải bản sửa đổi của LobeHub — là app hoàn toàn riêng biệt, chỉ tái sử dụng đúng cơ chế OAuth/API công khai mà LobeHub desktop dùng.

## Chạy thử (development)

```bash
npm install
npm start
```

## Build ra file .exe thật cho Windows

Khuyến nghị chạy lệnh build ngay trên máy Windows (không cần Wine, nhanh và ổn định nhất):

```bash
npm install
npm run build:win        # tạo cả installer (NSIS) và bản portable .exe trong thư mục dist/
```

Nếu build từ Linux/macOS sang Windows, cần cài Wine trước (`electron-builder` sẽ dùng Wine để nhúng icon/metadata vào .exe).

## Build ra .exe bằng GitHub Actions (không cần máy Windows)

Project đã có sẵn `.github/workflows/build.yml`, chạy trên runner Windows thật của GitHub:

1. Tạo một repo GitHub (public hoặc private đều được) và đẩy toàn bộ thư mục này lên:
   ```bash
   cd account-manager
   git init
   git add .
   git commit -m "init"
   git branch -M main
   git remote add origin https://github.com/<ten-ban>/<ten-repo>.git
   git push -u origin main
   ```
2. Vào repo trên GitHub → tab **Actions** → workflow "Build Windows exe" sẽ tự chạy sau khi push (hoặc bấm **Run workflow** để chạy thủ công).
3. Đợi build xong (vài phút) → mở run đó → mục **Artifacts** ở cuối trang → tải file `lobehub-account-manager-windows.zip` về, trong đó có cả bản installer (NSIS) và bản portable `.exe`.

Lưu ý: `node_modules/` không được đẩy lên Git — file `.gitignore` bên dưới đã xử lý việc đó, npm sẽ tự cài lại trên runner.

## Cấu trúc

- `src/main/auth.js` — luồng OAuth PKCE (mở browser hệ thống → poll → đổi code lấy token → refresh token).
- `src/main/store.js` — lưu nhiều tài khoản, token được mã hóa bằng `safeStorage` của hệ điều hành (Keychain/DPAPI/libsecret), không lưu plaintext.
- `src/main/index.js` — cửa sổ chính + các IPC handler (add/list/switch/remove/usage).
- `src/renderer/*` — giao diện.

## Lưu ý quan trọng

- App chỉ **hiển thị** quota, không tự động chuyển tài khoản khi hết quota, không có bất kỳ logic nào để né rate-limit. Việc chuyển tài khoản là thao tác thủ công do bạn bấm, dùng để quản lý nhiều tài khoản hợp lệ của chính bạn.
- Trường dữ liệu quota hiển thị (`messageCount`, `tokenUsage`, `quotaLimit`, `quotaRemaining`) là các trường phổ biến — tùy phiên bản server LobeHub Cloud, tên trường thực tế trong response `/api/v1/usage` có thể khác. Mục "Xem dữ liệu gốc" trong app luôn hiện raw JSON để bạn đối chiếu và chỉnh `renderUsage()` trong `renderer.js` cho khớp.
