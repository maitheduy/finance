# Quản lý chi tiêu gia đình

## Firebase
1. Trong Firebase Console, chọn dự án, đăng ký một Web App và lấy Firebase SDK configuration.
2. Mở Authentication → Sign-in method, bật Email/Password. Bật Google nếu muốn giữ tùy chọn đăng nhập Google.
3. Tạo Cloud Firestore ở Production mode. Mở Rules, dán nội dung `firestore.rules` và Publish cho đúng cơ sở dữ liệu.
4. Trên Vercel, thêm các biến từ `.env.example` bằng web config của dự án. Để trống `VITE_FIREBASE_DATABASE_ID` khi sử dụng database mặc định.
5. Trong Firebase Authentication → Settings → Authorized domains, thêm hostname thực tế của ứng dụng Vercel.

## Vercel
Import nhánh main, chọn Vite, Root Directory `./`, Build Command `npm run build`, Output Directory `dist`. Dùng npm để cài phụ thuộc. Sau khi đổi cấu hình môi trường, triển khai lại.

## Kiểm tra
Đăng ký bằng email thử. Mở thư xác minh rồi đăng nhập lại. Thêm một giao dịch thử và đọc lại trên thiết bị khác. Dùng một tài khoản thử thứ hai và xác nhận nó không thấy giao dịch của tài khoản đầu. Dữ liệu khách lưu trong trình duyệt và không tự chuyển sang tài khoản.
