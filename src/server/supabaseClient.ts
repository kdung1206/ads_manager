// ---------------------------------------------------------------------------
// Server-only Supabase client for ads_manager — a DIFFERENT Supabase project
// than marketing_report_v2 by design (see plan: real ad-spend write actions
// must stay isolated from the report dashboard's production database until
// the two are deliberately merged). Uses the SERVICE ROLE key, which bypasses
// Row Level Security — never import this from client code.
// ---------------------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// False by default for local dev: local testing must never touch a real
// database. When false, app.ts falls back to a local-only JSON file
// (src/db_store.json, gitignored) — see appStateStore.ts.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY chưa được cấu hình — đang chạy ở chế độ LOCAL-ONLY " +
    "(dữ liệu lưu vào src/db_store.json). Chỉ khai báo 2 biến này trên Vercel (production) hoặc khi " +
    "muốn dev cục bộ kết nối Supabase thật."
  );
}

export const supabase = createClient(
  SUPABASE_URL || "https://placeholder.invalid",
  SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key",
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export const APP_STATE_ROW_ID = "main";

// PostgREST caps any single response at the project's max-rows setting
// (default 1000) regardless of query — page through with .range() until a
// page comes back short, same fix marketing_report_v2 needed after
// ads_performance grew past 1000 rows for a date range.
export async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
