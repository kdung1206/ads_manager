# Ads Manager — Livotec & Karofi

Dashboard quản lý tập trung cho team Ads: kết nối tài khoản quảng cáo Facebook/
Google Ads/TikTok, và tạo/sửa/xóa campaign → ad set/ad group → ad trực tiếp
(không chỉ xem báo cáo như "Digital Ads Report" trong `marketing_report_v2`).

Project **riêng biệt hoàn toàn** với `marketing_report_v2` (repo, Supabase
project, deploy khác nhau) — xem lý do trong phần "Vì sao tách riêng" dưới.
Kế hoạch là merge vào hệ thống dashboard report chung sau khi ổn định, với
phân quyền riêng cho team Ads.

## Chạy local

```bash
npm install
npm run dev
```

Mở http://localhost:3100. Đăng nhập bằng tài khoản Admin đã seed sẵn
(`src/lib/defaultUsers.ts`):

- Username: `admin`
- Password: `AdsManager@2026` — **đổi ngay** qua màn "Người dùng" sau lần đăng
  nhập đầu, hoặc thêm tài khoản Editor riêng cho từng thành viên team Ads.

Không đặt `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` trong `.env.local` khi
dev cục bộ — không có 2 biến này, server tự lưu vào `src/db_store.json`
(gitignored), tách biệt hoàn toàn khỏi dữ liệu thật.

## Cấu trúc quyền

- **Admin** — quản lý kết nối nền tảng (credentials thật), quản lý user.
- **Editor** — tạo/sửa/xóa campaign/ad group/ad, bấm "Đẩy lên nền tảng". Đây
  là tài khoản team Ads dùng hàng ngày.
- **Viewer** — chỉ xem.

## Trạng thái từng nền tảng (phase hiện tại)

| Platform | Đọc kết nối | Ghi thật (tạo/sửa/xóa campaign) |
|---|---|---|
| Facebook | ✅ (nút "Kiểm tra") | ✅ — cần Access Token quyền `ads_management` |
| Google Ads | Lưu credentials trước | ❌ chưa nối — cần Developer Token + OAuth Client (Google Ads API Center) |
| TikTok | Lưu credentials trước | ❌ chưa nối — cần app TikTok for Business riêng (khác app Login Kit đang dùng cho Social Report), scope Ads Management |

Route `POST /api/campaigns/:id/push` (và tương tự ad-group/ad) đã có sẵn cho
cả 3 platform — Google/TikTok trả lỗi rõ ràng "chưa hỗ trợ" cho tới khi API
access được cấp và code nối API thật (`src/server/facebookAdsWrite.ts` là ví
dụ tham khảo) được bổ sung.

## Vì sao tách riêng khỏi marketing_report_v2

1. **Rủi ro tiền thật**: nút "Đẩy lên nền tảng" gọi API ghi thật (tạo campaign
   trên Facebook Ads Manager) — một bug ở đây không được phép ảnh hưởng tới
   dashboard report đang chạy production.
2. **Supabase project riêng**: schema (`supabase/schema.sql`) độc lập, không
   đụng tới bảng `app_state`/`ads_performance`/... của `marketing_report_v2`.
3. Sẽ merge lại (UI + phân quyền) khi cả 3 platform đã ghi thật ổn định và
   người dùng xác nhận sẵn sàng.

## Deploy (Vercel + Supabase) — khi sẵn sàng lên production

Giống hệt quy trình `marketing_report_v2`:

1. Tạo **Supabase project mới** (không dùng chung với marketing_report_v2) →
   chạy `supabase/schema.sql` trong SQL Editor.
2. Khai báo trên Vercel (biến server, không tiền tố `VITE_`):
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`,
   `ENCRYPTION_KEY` (tạo bằng `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
3. Import repo vào Vercel — `vercel.json` đã cấu hình build (`vite build` +
   bundle `api/index.js` bằng esbuild) và rewrite `/api/*`.
4. Đổi mật khẩu Admin mặc định (`src/lib/defaultUsers.ts`) trước khi cấp
   quyền truy cập thật cho team Ads.

## An toàn khi "Đẩy lên nền tảng"

- Campaign luôn được **tạo ở trạng thái PAUSED** trên Facebook dù trạng thái
  local là gì — an toàn có chủ đích cho phase đầu, team Ads chủ động bật chạy
  từ Ads Manager (hoặc từ một lần push "activate" sau khi luồng này đã được
  tin dùng qua thực tế).
- Mọi hành động tạo/sửa/xóa/đẩy lên (kể cả đẩy lên thất bại) đều ghi vào
  `ads_audit_log` — xem ở màn "Nhật ký hoạt động" (Admin).
