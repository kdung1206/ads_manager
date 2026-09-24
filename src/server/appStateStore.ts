// ---------------------------------------------------------------------------
// Persistent database. Production (Vercel) is always backed by Supabase —
// serverless functions have an ephemeral filesystem. Local dev (no
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY configured) reads/writes a local
// file, src/db_store.json (gitignored), so local testing is fully isolated
// from any real database — same convention as marketing_report_v2.
//
// The stored shape is a single JSONB-like blob: { users, platform_connections,
// ad_campaigns, ad_groups, ads, ads_audit_log }. Domains that need relational
// queries in production (all of the above) still keep this same blob as their
// local-dev fallback — see connectionsStore.ts/campaignsStore.ts.
// ---------------------------------------------------------------------------
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { supabase, APP_STATE_ROW_ID, isSupabaseConfigured } from "./supabaseClient";
import { DEFAULT_USERS } from "../lib/defaultUsers";

const LOCAL_DB_PATH = path.join(process.cwd(), "src", "db_store.json");

function emptySeed(): any {
  return {
    users: DEFAULT_USERS,
    platform_connections: [],
    ad_campaigns: [],
    ad_groups: [],
    ads: [],
    ads_audit_log: [],
  };
}

export async function getDatabaseData(): Promise<any> {
  if (!isSupabaseConfigured) {
    let raw: string;
    try {
      raw = fs.readFileSync(LOCAL_DB_PATH, "utf8");
    } catch (err: any) {
      // Only a missing file (first run ever) is safe to auto-seed — any other
      // read error must not fall through to reseeding (could be a concurrent
      // writer truncating the file mid-write), so surface it instead of
      // silently destroying real local data.
      if (err.code !== "ENOENT") throw err;
      const seed = emptySeed();
      await saveDatabaseData(seed);
      return seed;
    }

    try {
      return JSON.parse(raw);
    } catch (err: any) {
      throw new Error(
        `src/db_store.json chứa JSON không hợp lệ. Không tự động ghi đè để tránh mất dữ liệu; kiểm tra thủ công. Lỗi gốc: ${err.message}`
      );
    }
  }

  const { data, error } = await supabase
    .from("app_state")
    .select("data")
    .eq("id", APP_STATE_ROW_ID)
    .maybeSingle();

  if (error) {
    throw new Error(`Lỗi đọc dữ liệu từ Supabase: ${error.message}`);
  }

  if (data?.data) {
    return data.data;
  }

  const seed = emptySeed();
  await saveDatabaseData(seed);
  return seed;
}

export async function saveDatabaseData(fullData: any): Promise<void> {
  if (!isSupabaseConfigured) {
    // Write to a temp file then rename over the real path — rename() is
    // atomic on the same filesystem, so a concurrent reader never sees a
    // half-written/empty file.
    const tmpPath = `${LOCAL_DB_PATH}.tmp-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
    fs.writeFileSync(tmpPath, JSON.stringify(fullData, null, 2), "utf8");
    fs.renameSync(tmpPath, LOCAL_DB_PATH);
    return;
  }

  const { error } = await supabase
    .from("app_state")
    .upsert({ id: APP_STATE_ROW_ID, data: fullData, updated_at: new Date().toISOString() });

  if (error) {
    throw new Error(`Lỗi ghi dữ liệu vào Supabase: ${error.message}`);
  }
}
