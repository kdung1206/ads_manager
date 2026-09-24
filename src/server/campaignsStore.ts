// ---------------------------------------------------------------------------
// Storage for the app's own source-of-truth CRUD hierarchy: ad_campaigns →
// ad_groups → ads (see supabase/schema.sql). Every create/update writes here
// ONLY — pushing to a real platform is a separate, explicit step
// (POST /api/campaigns/:id/push, see facebookAdsWrite.ts + app.ts) that then
// comes back and updates sync_status/platform_native_id on these same rows.
// Same production-vs-local split as connectionsStore.ts.
// ---------------------------------------------------------------------------
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getDatabaseData, saveDatabaseData } from "./appStateStore";

export type EntityStatus = "draft" | "active" | "paused" | "archived";
export type SyncStatus = "local_only" | "pending_push" | "synced" | "push_error";

export interface AdCampaign {
  id: string;
  connection_id: string;
  platform: "facebook" | "google" | "tiktok";
  name: string;
  objective: string | null;
  status: EntityStatus;
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_date: string | null;
  end_date: string | null;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
  extra: Record<string, unknown>;
  created_by: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdGroup {
  id: string;
  campaign_id: string;
  name: string;
  targeting: Record<string, unknown>;
  bid_strategy: string | null;
  budget: number | null;
  status: EntityStatus;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
  extra: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ad {
  id: string;
  ad_group_id: string;
  name: string;
  creative: Record<string, unknown>;
  status: EntityStatus;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
  extra: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function genId(): string {
  return typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readLocal(): Promise<{ store: any; campaigns: AdCampaign[]; groups: AdGroup[]; ads: Ad[] }> {
  const store = await getDatabaseData();
  return {
    store,
    campaigns: Array.isArray(store.ad_campaigns) ? store.ad_campaigns : [],
    groups: Array.isArray(store.ad_groups) ? store.ad_groups : [],
    ads: Array.isArray(store.ads) ? store.ads : [],
  };
}

async function writeLocal(
  store: any,
  updates: Partial<{ campaigns: AdCampaign[]; groups: AdGroup[]; ads: Ad[] }>
): Promise<void> {
  const next: any = { ...store };
  if (updates.campaigns) next.ad_campaigns = updates.campaigns;
  if (updates.groups) next.ad_groups = updates.groups;
  if (updates.ads) next.ads = updates.ads;
  await saveDatabaseData(next);
}

// -- Campaigns ----------------------------------------------------------------

export async function getCampaigns(platform?: string): Promise<AdCampaign[]> {
  if (!isSupabaseConfigured) {
    const { campaigns } = await readLocal();
    return campaigns
      .filter((c) => !c.deleted_at)
      .filter((c) => !platform || c.platform === platform);
  }
  let query = supabase.from("ad_campaigns").select("*").is("deleted_at", null).order("created_at", { ascending: false });
  if (platform) query = query.eq("platform", platform);
  const { data, error } = await query;
  if (error) throw new Error(`Lỗi đọc danh sách campaign: ${error.message}`);
  return data || [];
}

export async function getCampaignById(id: string): Promise<AdCampaign | null> {
  if (!isSupabaseConfigured) {
    const { campaigns } = await readLocal();
    return campaigns.find((c) => c.id === id && !c.deleted_at) || null;
  }
  const { data, error } = await supabase.from("ad_campaigns").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Lỗi đọc campaign: ${error.message}`);
  return data || null;
}

export async function createCampaign(input: {
  connection_id: string;
  platform: AdCampaign["platform"];
  name: string;
  objective?: string | null;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  extra?: Record<string, unknown>;
  created_by?: string | null;
}): Promise<AdCampaign> {
  const now = new Date().toISOString();
  const row: AdCampaign = {
    id: genId(),
    connection_id: input.connection_id,
    platform: input.platform,
    name: input.name,
    objective: input.objective ?? null,
    status: "draft",
    daily_budget: input.daily_budget ?? null,
    lifetime_budget: input.lifetime_budget ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    sync_status: "local_only",
    platform_native_id: null,
    last_push_error: null,
    extra: input.extra ?? {},
    created_by: input.created_by ?? null,
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured) {
    const { store, campaigns } = await readLocal();
    await writeLocal(store, { campaigns: [...campaigns, row] });
    return row;
  }

  const { data, error } = await supabase.from("ad_campaigns").insert(row).select().single();
  if (error) throw new Error(`Lỗi tạo campaign: ${error.message}`);
  return data;
}

export async function updateCampaign(id: string, updates: Partial<AdCampaign>): Promise<void> {
  const patch = { ...updates, updated_at: new Date().toISOString() };
  if (!isSupabaseConfigured) {
    const { store, campaigns } = await readLocal();
    await writeLocal(store, { campaigns: campaigns.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
    return;
  }
  const { error } = await supabase.from("ad_campaigns").update(patch).eq("id", id);
  if (error) throw new Error(`Lỗi cập nhật campaign: ${error.message}`);
}

export async function softDeleteCampaign(id: string): Promise<void> {
  await updateCampaign(id, { deleted_at: new Date().toISOString() } as Partial<AdCampaign>);
}

// -- Ad groups ------------------------------------------------------------------

export async function getAdGroups(campaignId: string): Promise<AdGroup[]> {
  if (!isSupabaseConfigured) {
    const { groups } = await readLocal();
    return groups.filter((g) => g.campaign_id === campaignId && !g.deleted_at);
  }
  const { data, error } = await supabase
    .from("ad_groups")
    .select("*")
    .eq("campaign_id", campaignId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Lỗi đọc danh sách ad group: ${error.message}`);
  return data || [];
}

export async function getAdGroupById(id: string): Promise<AdGroup | null> {
  if (!isSupabaseConfigured) {
    const { groups } = await readLocal();
    return groups.find((g) => g.id === id && !g.deleted_at) || null;
  }
  const { data, error } = await supabase.from("ad_groups").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Lỗi đọc ad group: ${error.message}`);
  return data || null;
}

export async function createAdGroup(input: {
  campaign_id: string;
  name: string;
  targeting?: Record<string, unknown>;
  bid_strategy?: string | null;
  budget?: number | null;
  extra?: Record<string, unknown>;
}): Promise<AdGroup> {
  const now = new Date().toISOString();
  const row: AdGroup = {
    id: genId(),
    campaign_id: input.campaign_id,
    name: input.name,
    targeting: input.targeting ?? {},
    bid_strategy: input.bid_strategy ?? null,
    budget: input.budget ?? null,
    status: "draft",
    sync_status: "local_only",
    platform_native_id: null,
    last_push_error: null,
    extra: input.extra ?? {},
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured) {
    const { store, groups } = await readLocal();
    await writeLocal(store, { groups: [...groups, row] });
    return row;
  }

  const { data, error } = await supabase.from("ad_groups").insert(row).select().single();
  if (error) throw new Error(`Lỗi tạo ad group: ${error.message}`);
  return data;
}

export async function updateAdGroup(id: string, updates: Partial<AdGroup>): Promise<void> {
  const patch = { ...updates, updated_at: new Date().toISOString() };
  if (!isSupabaseConfigured) {
    const { store, groups } = await readLocal();
    await writeLocal(store, { groups: groups.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
    return;
  }
  const { error } = await supabase.from("ad_groups").update(patch).eq("id", id);
  if (error) throw new Error(`Lỗi cập nhật ad group: ${error.message}`);
}

export async function softDeleteAdGroup(id: string): Promise<void> {
  await updateAdGroup(id, { deleted_at: new Date().toISOString() } as Partial<AdGroup>);
}

// -- Ads --------------------------------------------------------------------------

export async function getAds(adGroupId: string): Promise<Ad[]> {
  if (!isSupabaseConfigured) {
    const { ads } = await readLocal();
    return ads.filter((a) => a.ad_group_id === adGroupId && !a.deleted_at);
  }
  const { data, error } = await supabase
    .from("ads")
    .select("*")
    .eq("ad_group_id", adGroupId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Lỗi đọc danh sách ad: ${error.message}`);
  return data || [];
}

export async function getAdById(id: string): Promise<Ad | null> {
  if (!isSupabaseConfigured) {
    const { ads } = await readLocal();
    return ads.find((a) => a.id === id && !a.deleted_at) || null;
  }
  const { data, error } = await supabase.from("ads").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(`Lỗi đọc ad: ${error.message}`);
  return data || null;
}

export async function createAd(input: {
  ad_group_id: string;
  name: string;
  creative?: Record<string, unknown>;
}): Promise<Ad> {
  const now = new Date().toISOString();
  const row: Ad = {
    id: genId(),
    ad_group_id: input.ad_group_id,
    name: input.name,
    creative: input.creative ?? {},
    status: "draft",
    sync_status: "local_only",
    platform_native_id: null,
    last_push_error: null,
    extra: {},
    deleted_at: null,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured) {
    const { store, ads } = await readLocal();
    await writeLocal(store, { ads: [...ads, row] });
    return row;
  }

  const { data, error } = await supabase.from("ads").insert(row).select().single();
  if (error) throw new Error(`Lỗi tạo ad: ${error.message}`);
  return data;
}

export async function updateAd(id: string, updates: Partial<Ad>): Promise<void> {
  const patch = { ...updates, updated_at: new Date().toISOString() };
  if (!isSupabaseConfigured) {
    const { store, ads } = await readLocal();
    await writeLocal(store, { ads: ads.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
    return;
  }
  const { error } = await supabase.from("ads").update(patch).eq("id", id);
  if (error) throw new Error(`Lỗi cập nhật ad: ${error.message}`);
}

export async function softDeleteAd(id: string): Promise<void> {
  await updateAd(id, { deleted_at: new Date().toISOString() } as Partial<Ad>);
}

// -- Audit log --------------------------------------------------------------------

export async function logAdsAction(input: {
  username: string;
  role: string;
  action: string;
  entity_type: "connection" | "campaign" | "ad_group" | "ad" | "user";
  entity_id: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}): Promise<void> {
  const entry = {
    username: input.username,
    role: input.role,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    before: input.before ?? null,
    after: input.after ?? null,
    ip: input.ip ?? null,
  };

  if (!isSupabaseConfigured) {
    const store = await getDatabaseData();
    const log = Array.isArray(store.ads_audit_log) ? store.ads_audit_log : [];
    log.unshift({ id: log.length + 1, ...entry, created_at: new Date().toISOString() });
    await saveDatabaseData({ ...store, ads_audit_log: log.slice(0, 2000) });
    return;
  }

  const { error } = await supabase.from("ads_audit_log").insert(entry);
  // Never throws — a logging failure must not block the mutating action it's
  // logging, same contract as marketing_report_v2's logAction.
  if (error) console.error("logAdsAction error:", error.message);
}

export async function getAuditLog(limit = 200): Promise<any[]> {
  if (!isSupabaseConfigured) {
    const store = await getDatabaseData();
    const log = Array.isArray(store.ads_audit_log) ? store.ads_audit_log : [];
    return log.slice(0, limit);
  }
  const { data, error } = await supabase
    .from("ads_audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Lỗi đọc audit log: ${error.message}`);
  return data || [];
}
