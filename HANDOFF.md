# Handoff — Ads Manager (D:\Dung\ads_manager)

Đây là bản chuyển giao để tiếp tục làm việc trên máy khác. Đọc file này trước,
[README.md](README.md) có chi tiết đầy đủ về kiến trúc/cách chạy/deploy —
file này chỉ tóm tắt trạng thái hiện tại và việc cần làm tiếp.

## Project này là gì

Dashboard quản lý tập trung cho team Ads: kết nối tài khoản quảng cáo
Facebook/Google Ads/TikTok, và tạo/sửa/xóa campaign → ad group → ad trực
tiếp. Tách biệt hoàn toàn khỏi `marketing_report_v2` (repo, Supabase project,
deploy riêng) — lý do và kế hoạch merge sau này xem trong README.md.

## Trạng thái hiện tại (2026-08-07)

**Đã xong và đã verify qua browser thật (không phải chỉ code, đã chạy
thật):**
- Đăng nhập, phân quyền Admin/Editor/Viewer.
- Kết nối nền tảng: thêm/sửa/xóa/kiểm tra kết nối Facebook (đã test thật với
  Graph API — token giả bị Facebook từ chối đúng như kỳ vọng, lỗi được bắt
  và hiển thị đúng).
- CRUD campaign → ad group → ad, lưu vào DB riêng của app.
- "Đẩy lên nền tảng": Facebook đã nối thật (`src/server/facebookAdsWrite.ts`)
  — tạo/sửa/xóa campaign/ad set/ad qua Marketing API, luôn tạo ở trạng thái
  PAUSED (an toàn, không tự bật chạy tốn tiền). Google/TikTok là stub, báo rõ
  "chưa hỗ trợ".
- Nhật ký hoạt động (audit log) ghi mọi hành động, kể cả push thất bại.
- `tsc --noEmit` sạch, bundle API (`esbuild`) ~2.0MB, không SDK nặng.

**Chưa làm (đúng phạm vi đã chốt với user, không phải thiếu sót):**
- Ghi thật lên Google Ads API (cần Developer Token + OAuth Client) và TikTok
  Business API (cần app TikTok for Business riêng, khác app Login Kit của
  `marketing_report_v2`).
- Merge vào `marketing_report_v2` — chỉ làm khi user xác nhận sẵn sàng.
- Targeting chi tiết (audience/placement/geo nâng cao) cho ad group — hiện
  chỉ có `targeting` dạng object tự do, UI chưa có form xây targeting.

## Cách tiếp tục trên máy mới

```bash
cd ads_manager
npm install
npm run dev        # http://localhost:3100 (npm run dev dùng tsx, không watch — sửa src/server/*.ts phải restart lại, HMR chỉ áp dụng cho .tsx frontend)
```

`.env.local` đã có sẵn trong bản đóng gói này (SESSION_SECRET,
ENCRYPTION_KEY) — **giữ bí mật file này**, không commit lên Git/chia sẻ công
khai. Không đặt `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` local — để trống
thì server tự dùng `src/db_store.json` (đã kèm theo, chứa dữ liệu test từ lúc
build ban đầu — có thể xóa để bắt đầu sạch, xem cách seed lại ở dưới).

Tài khoản Admin mặc định (`src/lib/defaultUsers.ts`): `admin` /
`AdsManager@2026` — đổi càng sớm càng tốt nếu định cấp quyền cho người khác.

## Chưa phải git repo

Thư mục này chưa init Git. Nếu muốn theo dõi lịch sử thay đổi hoặc đẩy lên
GitHub (giống cách `marketing_report_v2` đang làm), chạy:

```bash
git init
git add .
git commit -m "Initial Ads Manager scaffold"
```

rồi tạo repo GitHub và `git remote add`/`git push` nếu muốn.

## Việc cần làm tiếp (gợi ý thứ tự)

1. Xin quyền `ads_management` thật (System User token khuyến nghị) cho một
   ad account test, thử push thật một campaign — xác nhận nó xuất hiện trên
   Facebook Ads Manager ở trạng thái PAUSED.
2. Xin Google Ads Developer Token + tạo OAuth Client → nối
   `src/server/app.ts`'s Google push stub theo cùng pattern
   `facebookAdsWrite.ts`.
3. Tạo app TikTok for Business riêng (Ads Management scope) → nối tương tự.
4. Khi cả 3 platform ổn định, quay lại hỏi user về việc merge UI + phân
   quyền vào `marketing_report_v2`.
