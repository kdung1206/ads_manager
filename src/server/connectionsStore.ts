// ---------------------------------------------------------------------------
// Storage for platform_connections (see supabase/schema.sql). Same
// production-vs-local split as appStateStore.ts: production uses the
// relational table, local dev stores the same collection as an array inside
// src/db_store.json.
// ---------------------------------------------------------------------------
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getDatabaseData, saveDatabaseData } from "./appStateStore";

export type Platform = "facebook" | "google" | "tiktok";

export interface PlatformConnection {
  id: string;
  platform: Platform;
  account_id: string;
  account_name: string;
  brand: string | null;
  credentials_encrypted: string;
  is_active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  token_expired: boolean;
  created_by: string | null;
  created_at: string;
}

function genId(): string {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readLocal(): Promise<{ store: any; connections: PlatformConnection[] }> {
  const store = await getDatabaseData();
  return { store, connections: Array.isArray(store.platform_connections) ? store.platform_connections : [] };
}

async function writeLocal(store: any, connections: PlatformConnection[]): Promise<void> {
  await saveDatabaseData({ ...store, platform_connections: connections });
}

export async function getConnections(platform?: Platform): Promise<PlatformConnection[]> {
  if (!isSupabaseConfigured) {
    const { connections } = await readLocal();
    return platform ? connections.filter((c) => c.platform === platform) : connections;
  }
  let query = supabase.from("platform_connections").select("*").order("created_at", { ascending: true });
  if (platform) query = query.eq("platform", platform);
  const { data, error } = await query;
  if (error) throw new Error(`Lỗi đọc danh sách kết nối: ${error.message}`);
  return data || [];
}

export async function getConnectionById(id: string): Promise<PlatformConnection | null> {
  if (!isSupabaseConfigured) {
    const { connections } = await readLocal();
    return connections.find((c) => c.id === id) || null;
  }
  const { data, error } = await supabase.from("platform_connections").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Lỗi đọc kết nối: ${error.message}`);
  return data || null;
}

export async function createConnection(input: {
  platform: Platform;
  account_id: string;
  account_name: string;
  brand?: string | null;
  credentials_encrypted: string;
  created_by?: string | null;
}): Promise<PlatformConnection> {
  const now = new Date().toISOString();
  const row: PlatformConnection = {
    id: genId(),
    platform: input.platform,
    account_id: input.account_id,
    account_name: input.account_name,
    brand: input.brand ?? null,
    credentials_encrypted: input.credentials_encrypted,
    is_active: true,
    last_checked_at: null,
    last_error: null,
    token_expired: false,
    created_by: input.created_by ?? null,
    created_at: now,
  };

  if (!isSupabaseConfigured) {
    const { store, connections } = await readLocal();
    const dup = connections.find((c) => c.platform === row.platform && c.account_id === row.account_id);
    if (dup) throw new Error(`Đã tồn tại kết nối ${row.platform}/${row.account_id}. Hãy sửa kết nối hiện có thay vì tạo mới.`);
    await writeLocal(store, [...connections, row]);
    return row;
  }

  const { data, error } = await supabase.from("platform_connections").insert(row).select().single();
  if (error) throw new Error(`Lỗi tạo kết nối: ${error.message}`);
  return data;
}

export async function updateConnection(
  id: string,
  updates: Partial<Pick<PlatformConnection, "account_name" | "brand" | "credentials_encrypted" | "is_active" | "last_checked_at" | "last_error" | "token_expired">>
): Promise<void> {
  if (!isSupabaseConfigured) {
    const { store, connections } = await readLocal();
    const next = connections.map((c) => (c.id === id ? { ...c, ...updates } : c));
    await writeLocal(store, next);
    return;
  }
  const { error } = await supabase.from("platform_connections").update(updates).eq("id", id);
  if (error) throw new Error(`Lỗi cập nhật kết nối: ${error.message}`);
}

export async function deleteConnection(id: string): Promise<void> {
  if (!isSupabaseConfigured) {
    // No real FK in the local JSON blob, so cascade by hand: campaigns under
    // this connection, then ad groups under those campaigns, then ads under
    // those ad groups — mirrors the `on delete cascade` behavior the real
    // Supabase schema gives production for free.
    const store = await getDatabaseData();
    const connections: PlatformConnection[] = Array.isArray(store.platform_connections) ? store.platform_connections : [];
    const campaigns = Array.isArray(store.ad_campaigns) ? store.ad_campaigns : [];
    const adGroups = Array.isArray(store.ad_groups) ? store.ad_groups : [];
    const ads = Array.isArray(store.ads) ? store.ads : [];

    const removedCampaignIds = new Set(campaigns.filter((c: any) => c.connection_id === id).map((c: any) => c.id));
    const remainingCampaigns = campaigns.filter((c: any) => !removedCampaignIds.has(c.id));
    const removedGroupIds = new Set(adGroups.filter((g: any) => removedCampaignIds.has(g.campaign_id)).map((g: any) => g.id));
    const remainingGroups = adGroups.filter((g: any) => !removedGroupIds.has(g.id));
    const remainingAds = ads.filter((a: any) => !removedGroupIds.has(a.ad_group_id));

    await saveDatabaseData({
      ...store,
      platform_connections: connections.filter((c) => c.id !== id),
      ad_campaigns: remainingCampaigns,
      ad_groups: remainingGroups,
      ads: remainingAds,
    });
    return;
  }
  // Real platform accounts already synced (ad_campaigns rows) cascade-delete
  // via the FK — same "config removal cleans up its own children" behavior
  // as marketing_report_v2's fb_pages → fb_insights_daily/fb_posts.
  const { error } = await supabase.from("platform_connections").delete().eq("id", id);
  if (error) throw new Error(`Lỗi xóa kết nối: ${error.message}`);
}
