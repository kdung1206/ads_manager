import express from "express";
import dotenv from "dotenv";
import { supabase, isSupabaseConfigured } from "./supabaseClient";
import { getDatabaseData, saveDatabaseData } from "./appStateStore";
import { DEFAULT_USERS, reconcileUsers, UserAccount } from "../lib/defaultUsers";
import { generateServerSalt, hashPasswordScrypt, verifyPasswordScrypt } from "../lib/serverPasswordHash";
import { requireAuth, signSessionToken } from "./auth";
import { encrypt, decrypt } from "./crypto";
import {
  getConnections,
  getConnectionById,
  createConnection,
  updateConnection,
  deleteConnection,
  Platform,
} from "./connectionsStore";
import {
  getCampaigns,
  getCampaignById,
  createCampaign,
  updateCampaign,
  softDeleteCampaign,
  getAdGroups,
  getAdGroupById,
  createAdGroup,
  updateAdGroup,
  softDeleteAdGroup,
  getAds,
  getAdById,
  createAd,
  updateAd,
  softDeleteAd,
  logAdsAction,
  getAuditLog,
} from "./campaignsStore";
import {
  createFacebookCampaign,
  updateFacebookCampaign,
  deleteFacebookCampaign,
  createFacebookAdSet,
  updateFacebookAdSet,
  deleteFacebookAdSet,
  createFacebookAd,
  updateFacebookAd,
  deleteFacebookAd,
  isTokenInvalidError,
} from "./facebookAdsWrite";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

export const app = express();
app.use(express.json({ limit: "5mb" }));

// ---------------------------------------------------------------------------
// Login rate limiting — in-memory only (see supabase/schema.sql note). Fine
// for a small internal ads-team tool with a handful of accounts; resets on
// process restart / cold start, which is an accepted trade-off here, unlike
// marketing_report_v2's DB-backed limiter for its public-ish login surface.
// ---------------------------------------------------------------------------
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { failCount: number; windowStartedAt: number; lockedUntil: number | null }>();
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getClientIp(req: express.Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (first) return first.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function loginAttemptKey(req: express.Request, username: string): string {
  return `${getClientIp(req)}|${username.trim().toLowerCase()}`;
}

function getLoginLockout(key: string): Date | null {
  const rec = loginAttempts.get(key);
  if (!rec?.lockedUntil) return null;
  return rec.lockedUntil > Date.now() ? new Date(rec.lockedUntil) : null;
}

function recordLoginFailure(key: string): number {
  const now = Date.now();
  const existing = loginAttempts.get(key);
  const windowExpired = !existing || now - existing.windowStartedAt > LOGIN_WINDOW_MS;
  const rec = windowExpired
    ? { failCount: 1, windowStartedAt: now, lockedUntil: null as number | null }
    : { ...existing, failCount: existing.failCount + 1 };
  if (rec.failCount >= LOGIN_MAX_ATTEMPTS) rec.lockedUntil = now + LOGIN_LOCKOUT_MS;
  loginAttempts.set(key, rec);
  return rec.failCount;
}

function resetLoginAttempts(key: string): void {
  loginAttempts.delete(key);
}

// ---------------------------------------------------------------------------
// POST /api/login — verifies credentials, issues a signed session token. The
// client never sees any passwordHash/salt.
// ---------------------------------------------------------------------------
app.post("/api/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu." });
    }

    const attemptKey = loginAttemptKey(req, String(username));
    const lockout = getLoginLockout(attemptKey);
    if (lockout) {
      const minutesLeft = Math.max(1, Math.ceil((lockout.getTime() - Date.now()) / 60000));
      return res.status(429).json({ error: `Tài khoản tạm thời bị khóa. Vui lòng thử lại sau khoảng ${minutesLeft} phút.` });
    }

    const store = await getDatabaseData();
    const storedUsers: UserAccount[] = Array.isArray(store.users) ? store.users : [];
    const allUsers = reconcileUsers(storedUsers);

    const candidate = allUsers.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());
    const ok = candidate?.passwordHash && candidate?.salt
      ? await verifyPasswordScrypt(String(password), candidate.salt, candidate.passwordHash)
      : false;

    if (!candidate || !ok) {
      const failCount = recordLoginFailure(attemptKey);
      await sleep(Math.min(failCount * 1000, 8000));
      return res.status(401).json({ error: "Tên đăng nhập hoặc mật khẩu không chính xác." });
    }

    resetLoginAttempts(attemptKey);

    if (!isSupabaseConfigured) {
      // No cross-instance log needed locally; local dev doesn't track login_logs.
    } else {
      await supabase.from("login_logs").insert({ username: candidate.username, status: "success", ip: getClientIp(req) }).then(
        () => {},
        (err) => console.error("login_logs insert error:", err?.message)
      );
    }

    const { token } = signSessionToken(candidate);
    return res.json({ success: true, token, user: { username: candidate.username, name: candidate.name, role: candidate.role } });
  } catch (err: any) {
    console.error("POST /api/login error:", err);
    return res.status(500).json({ error: `Lỗi đăng nhập: ${err.message}` });
  }
});

app.get("/api/auth/me", requireAuth("Viewer"), (req, res) => {
  const session = (req as any).session;
  res.json({ success: true, user: { username: session.username, name: session.name, role: session.role } });
});

// ---------------------------------------------------------------------------
// Users (Admin only) — minimal add/edit/delete so the ads team can have
// their own accounts without touching marketing_report_v2's user table.
// ---------------------------------------------------------------------------
app.get("/api/users", requireAuth("Admin"), async (req, res) => {
  try {
    const store = await getDatabaseData();
    const users = reconcileUsers(Array.isArray(store.users) ? store.users : []);
    res.json({ success: true, users: users.map((u) => ({ username: u.username, name: u.name, role: u.role })) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/users", requireAuth("Admin"), async (req, res) => {
  try {
    const { username, name, role, newPassword } = req.body || {};
    if (!username || !name || !role) {
      return res.status(400).json({ success: false, error: "Thiếu username, name hoặc role." });
    }
    if (!["Admin", "Editor", "Viewer"].includes(role)) {
      return res.status(400).json({ success: false, error: "Role không hợp lệ." });
    }

    const store = await getDatabaseData();
    const users: UserAccount[] = reconcileUsers(Array.isArray(store.users) ? store.users : []);
    const existing = users.find((u) => u.username.toLowerCase() === String(username).trim().toLowerCase());

    if (!existing && !newPassword) {
      return res.status(400).json({ success: false, error: "Tài khoản mới cần mật khẩu ban đầu." });
    }

    const salt = existing?.salt || generateServerSalt();
    const passwordHash = newPassword ? hashPasswordScrypt(String(newPassword), salt) : existing?.passwordHash;

    const next: UserAccount = { username: String(username).trim(), name: String(name).trim(), role, salt, passwordHash };
    const rest = users.filter((u) => u.username.toLowerCase() !== next.username.toLowerCase());
    store.users = [...rest, next];
    await saveDatabaseData(store);

    await logAdsAction({
      username: (req as any).session.username,
      role: (req as any).session.role,
      action: existing ? "update-user" : "create-user",
      entity_type: "user",
      entity_id: next.username,
      ip: getClientIp(req),
    }).catch(() => {});

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/users/:username", requireAuth("Admin"), async (req, res) => {
  try {
    const store = await getDatabaseData();
    const users: UserAccount[] = reconcileUsers(Array.isArray(store.users) ? store.users : []);
    if (users.length <= 1) {
      return res.status(400).json({ success: false, error: "Không thể xóa tài khoản Admin cuối cùng." });
    }
    store.users = users.filter((u) => u.username.toLowerCase() !== req.params.username.toLowerCase());
    await saveDatabaseData(store);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Platform connections (Admin only — holds real credentials).
// ---------------------------------------------------------------------------
function stripConnection(c: any) {
  const { credentials_encrypted, ...rest } = c;
  return rest;
}

app.get("/api/connections", requireAuth("Viewer"), async (req, res) => {
  try {
    const platform = req.query.platform as Platform | undefined;
    const connections = await getConnections(platform);
    res.json({ success: true, connections: connections.map(stripConnection) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/connections", requireAuth("Admin"), async (req, res) => {
  try {
    const { platform, account_id, account_name, brand, access_token, refresh_token } = req.body || {};
    if (!platform || !account_id || !account_name || !access_token) {
      return res.status(400).json({ success: false, error: "Thiếu platform, account_id, account_name hoặc access_token." });
    }
    if (!["facebook", "google", "tiktok"].includes(platform)) {
      return res.status(400).json({ success: false, error: "Platform không hợp lệ." });
    }

    const credentials = JSON.stringify({ access_token: String(access_token).trim(), refresh_token: refresh_token ? String(refresh_token).trim() : null });
    const connection = await createConnection({
      platform,
      account_id: String(account_id).trim(),
      account_name: String(account_name).trim(),
      brand: brand ? String(brand).trim() : null,
      credentials_encrypted: encrypt(credentials),
      created_by: (req as any).session.username,
    });

    await logAdsAction({
      username: (req as any).session.username,
      role: (req as any).session.role,
      action: "create-connection",
      entity_type: "connection",
      entity_id: connection.id,
      after: stripConnection(connection),
      ip: getClientIp(req),
    });

    res.json({ success: true, connection: stripConnection(connection) });
  } catch (err: any) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put("/api/connections/:id", requireAuth("Admin"), async (req, res) => {
  try {
    const { account_name, brand, is_active, access_token, refresh_token } = req.body || {};
    const updates: any = {};
    if (account_name !== undefined) updates.account_name = String(account_name).trim();
    if (brand !== undefined) updates.brand = brand ? String(brand).trim() : null;
    if (is_active !== undefined) updates.is_active = Boolean(is_active);
    if (access_token) {
      updates.credentials_encrypted = encrypt(JSON.stringify({ access_token: String(access_token).trim(), refresh_token: refresh_token ? String(refresh_token).trim() : null }));
      updates.token_expired = false;
      updates.last_error = null;
    }

    await updateConnection(req.params.id, updates);
    await logAdsAction({
      username: (req as any).session.username,
      role: (req as any).session.role,
      action: "update-connection",
      entity_type: "connection",
      entity_id: req.params.id,
      after: updates,
      ip: getClientIp(req),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/connections/:id", requireAuth("Admin"), async (req, res) => {
  try {
    await deleteConnection(req.params.id);
    await logAdsAction({
      username: (req as any).session.username,
      role: (req as any).session.role,
      action: "delete-connection",
      entity_type: "connection",
      entity_id: req.params.id,
      ip: getClientIp(req),
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/connections/:id/test — basic read-only call to confirm the token
// works before trusting the connection for real pushes. Facebook only for
// now; Google/TikTok report "chưa hỗ trợ" until their write APIs are wired.
app.post("/api/connections/:id/test", requireAuth("Admin"), async (req, res) => {
  try {
    const connection = await getConnectionById(req.params.id);
    if (!connection) return res.status(404).json({ success: false, error: "Không tìm thấy kết nối." });

    if (connection.platform !== "facebook") {
      return res.json({ success: false, error: "Kiểm tra kết nối cho Google/TikTok chưa được hỗ trợ ở phase này." });
    }

    const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
    const url = `https://graph.facebook.com/v21.0/${connection.account_id}?fields=name,account_status&access_token=${encodeURIComponent(access_token)}`;
    const apiRes = await fetch(url);
    const body = await apiRes.json();
    if (!apiRes.ok || body?.error) {
      await updateConnection(connection.id, { last_checked_at: new Date().toISOString(), last_error: body?.error?.message || "Lỗi không xác định", token_expired: body?.error?.code === 190 });
      return res.json({ success: false, error: body?.error?.message || `HTTP ${apiRes.status}` });
    }

    await updateConnection(connection.id, { last_checked_at: new Date().toISOString(), last_error: null, token_expired: false });
    res.json({ success: true, account_name: body.name, account_status: body.account_status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Campaigns (Editor+ to mutate, Viewer+ to read).
// ---------------------------------------------------------------------------
app.get("/api/campaigns", requireAuth("Viewer"), async (req, res) => {
  try {
    const platform = req.query.platform as string | undefined;
    const campaigns = await getCampaigns(platform && platform !== "all" ? platform : undefined);
    res.json({ success: true, campaigns });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/campaigns/:id", requireAuth("Viewer"), async (req, res) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: "Không tìm thấy campaign." });
    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/campaigns", requireAuth("Editor"), async (req, res) => {
  try {
    const { connection_id, name, objective, daily_budget, lifetime_budget, start_date, end_date, extra } = req.body || {};
    if (!connection_id || !name) return res.status(400).json({ success: false, error: "Thiếu connection_id hoặc name." });

    const connection = await getConnectionById(connection_id);
    if (!connection) return res.status(400).json({ success: false, error: "Kết nối không tồn tại." });

    const campaign = await createCampaign({
      connection_id,
      platform: connection.platform,
      name: String(name).trim(),
      objective: objective || null,
      daily_budget: daily_budget != null ? Number(daily_budget) : null,
      lifetime_budget: lifetime_budget != null ? Number(lifetime_budget) : null,
      start_date: start_date || null,
      end_date: end_date || null,
      extra: extra && typeof extra === "object" ? extra : undefined,
      created_by: (req as any).session.username,
    });

    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "create-campaign", entity_type: "campaign", entity_id: campaign.id, after: campaign, ip: getClientIp(req) });
    res.json({ success: true, campaign });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/campaigns/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const before = await getCampaignById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: "Không tìm thấy campaign." });

    const { name, objective, status, daily_budget, lifetime_budget, start_date, end_date, extra } = req.body || {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (objective !== undefined) updates.objective = objective;
    if (status !== undefined) updates.status = status;
    if (daily_budget !== undefined) updates.daily_budget = daily_budget != null ? Number(daily_budget) : null;
    if (lifetime_budget !== undefined) updates.lifetime_budget = lifetime_budget != null ? Number(lifetime_budget) : null;
    if (start_date !== undefined) updates.start_date = start_date;
    if (end_date !== undefined) updates.end_date = end_date;
    if (extra !== undefined && typeof extra === "object") updates.extra = extra;

    await updateCampaign(req.params.id, updates);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "update-campaign", entity_type: "campaign", entity_id: req.params.id, before, after: updates, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/campaigns/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: "Không tìm thấy campaign." });

    if (campaign.platform_native_id && campaign.platform === "facebook") {
      const connection = await getConnectionById(campaign.connection_id);
      if (connection) {
        const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
        try {
          await deleteFacebookCampaign(campaign.platform_native_id, access_token);
        } catch (err: any) {
          return res.status(502).json({ success: false, error: `Campaign đã lên Facebook thật — xóa trên Facebook thất bại, chưa xóa local: ${err.message}` });
        }
      }
    }

    await softDeleteCampaign(req.params.id);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "delete-campaign", entity_type: "campaign", entity_id: req.params.id, before: campaign, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/campaigns/:id/push — Facebook is real; Google/TikTok are stubs.
app.post("/api/campaigns/:id/push", requireAuth("Editor"), async (req, res) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, error: "Không tìm thấy campaign." });

    const connection = await getConnectionById(campaign.connection_id);
    if (!connection) return res.status(400).json({ success: false, error: "Kết nối không tồn tại." });

    if (campaign.platform !== "facebook") {
      await updateCampaign(campaign.id, { sync_status: "pending_push", last_push_error: `Chưa kết nối API ghi thật cho ${campaign.platform} — cần ${campaign.platform === "google" ? "Google Ads Developer Token" : "TikTok Business API"} approval trước.` });
      return res.json({ success: false, error: `Chưa hỗ trợ đẩy lên ${campaign.platform} ở phase này. Route đã sẵn sàng, chỉ cần nối API thật khi có quyền.` });
    }

    try {
      const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
      let nativeId = campaign.platform_native_id;
      if (nativeId) {
        await updateFacebookCampaign(nativeId, access_token, {
          name: campaign.name,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget,
          lifetime_budget: campaign.lifetime_budget,
          status: campaign.status === "active" ? "ACTIVE" : campaign.status === "paused" ? "PAUSED" : undefined,
        });
      } else {
        nativeId = await createFacebookCampaign(connection.account_id, access_token, {
          name: campaign.name,
          objective: campaign.objective,
          daily_budget: campaign.daily_budget,
          lifetime_budget: campaign.lifetime_budget,
          start_date: campaign.start_date,
          end_date: campaign.end_date,
        });
      }

      await updateCampaign(campaign.id, { sync_status: "synced", platform_native_id: nativeId, last_push_error: null });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-campaign", entity_type: "campaign", entity_id: campaign.id, after: { platform_native_id: nativeId }, ip: getClientIp(req) });
      res.json({ success: true, platform_native_id: nativeId });
    } catch (err: any) {
      const tokenDead = isTokenInvalidError(err);
      await updateCampaign(campaign.id, { sync_status: "push_error", last_push_error: err.message });
      if (tokenDead) await updateConnection(connection.id, { token_expired: true, last_error: err.message });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-campaign-failed", entity_type: "campaign", entity_id: campaign.id, after: { error: err.message }, ip: getClientIp(req) });
      res.status(502).json({ success: false, error: err.message, token_expired: tokenDead });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Ad groups (nested under a campaign).
// ---------------------------------------------------------------------------
app.get("/api/campaigns/:campaignId/ad-groups", requireAuth("Viewer"), async (req, res) => {
  try {
    const groups = await getAdGroups(req.params.campaignId);
    res.json({ success: true, groups });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/campaigns/:campaignId/ad-groups", requireAuth("Editor"), async (req, res) => {
  try {
    const { name, budget, bid_strategy, targeting, extra } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: "Thiếu name." });

    const campaign = await getCampaignById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ success: false, error: "Không tìm thấy campaign." });

    const group = await createAdGroup({
      campaign_id: req.params.campaignId,
      name: String(name).trim(),
      budget: budget != null ? Number(budget) : null,
      bid_strategy: bid_strategy || null,
      targeting: targeting || {},
      extra: extra && typeof extra === "object" ? extra : undefined,
    });

    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "create-ad-group", entity_type: "ad_group", entity_id: group.id, after: group, ip: getClientIp(req) });
    res.json({ success: true, group });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/ad-groups/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const before = await getAdGroupById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: "Không tìm thấy ad group." });

    const { name, status, budget, bid_strategy, targeting, extra } = req.body || {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (status !== undefined) updates.status = status;
    if (budget !== undefined) updates.budget = budget != null ? Number(budget) : null;
    if (bid_strategy !== undefined) updates.bid_strategy = bid_strategy;
    if (targeting !== undefined) updates.targeting = targeting;
    if (extra !== undefined && typeof extra === "object") updates.extra = extra;

    await updateAdGroup(req.params.id, updates);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "update-ad-group", entity_type: "ad_group", entity_id: req.params.id, before, after: updates, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/ad-groups/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const group = await getAdGroupById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy ad group." });

    if (group.platform_native_id) {
      const campaign = await getCampaignById(group.campaign_id);
      const connection = campaign ? await getConnectionById(campaign.connection_id) : null;
      if (campaign?.platform === "facebook" && connection) {
        const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
        try {
          await deleteFacebookAdSet(group.platform_native_id, access_token);
        } catch (err: any) {
          return res.status(502).json({ success: false, error: `Ad set đã lên Facebook thật — xóa trên Facebook thất bại, chưa xóa local: ${err.message}` });
        }
      }
    }

    await softDeleteAdGroup(req.params.id);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "delete-ad-group", entity_type: "ad_group", entity_id: req.params.id, before: group, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/ad-groups/:id/push", requireAuth("Editor"), async (req, res) => {
  try {
    const group = await getAdGroupById(req.params.id);
    if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy ad group." });
    const campaign = await getCampaignById(group.campaign_id);
    if (!campaign) return res.status(400).json({ success: false, error: "Campaign cha không tồn tại." });
    if (!campaign.platform_native_id) return res.status(400).json({ success: false, error: "Phải đẩy campaign cha lên nền tảng trước." });

    if (campaign.platform !== "facebook") {
      await updateAdGroup(group.id, { sync_status: "pending_push", last_push_error: `Chưa kết nối API ghi thật cho ${campaign.platform}.` });
      return res.json({ success: false, error: `Chưa hỗ trợ đẩy lên ${campaign.platform} ở phase này.` });
    }

    const connection = await getConnectionById(campaign.connection_id);
    if (!connection) return res.status(400).json({ success: false, error: "Kết nối không tồn tại." });

    try {
      const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
      let nativeId = group.platform_native_id;
      if (nativeId) {
        await updateFacebookAdSet(nativeId, access_token, { name: group.name, budget: group.budget, targeting: group.targeting, status: group.status === "active" ? "ACTIVE" : group.status === "paused" ? "PAUSED" : undefined });
      } else {
        nativeId = await createFacebookAdSet(connection.account_id, access_token, { name: group.name, campaignId: campaign.platform_native_id, budget: group.budget, bid_strategy: group.bid_strategy, targeting: group.targeting });
      }
      await updateAdGroup(group.id, { sync_status: "synced", platform_native_id: nativeId, last_push_error: null });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-ad-group", entity_type: "ad_group", entity_id: group.id, after: { platform_native_id: nativeId }, ip: getClientIp(req) });
      res.json({ success: true, platform_native_id: nativeId });
    } catch (err: any) {
      await updateAdGroup(group.id, { sync_status: "push_error", last_push_error: err.message });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-ad-group-failed", entity_type: "ad_group", entity_id: group.id, after: { error: err.message }, ip: getClientIp(req) });
      res.status(502).json({ success: false, error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Ads (nested under an ad group).
// ---------------------------------------------------------------------------
app.get("/api/ad-groups/:groupId/ads", requireAuth("Viewer"), async (req, res) => {
  try {
    const ads = await getAds(req.params.groupId);
    res.json({ success: true, ads });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/ad-groups/:groupId/ads", requireAuth("Editor"), async (req, res) => {
  try {
    const { name, creative } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: "Thiếu name." });

    const group = await getAdGroupById(req.params.groupId);
    if (!group) return res.status(404).json({ success: false, error: "Không tìm thấy ad group." });

    const ad = await createAd({ ad_group_id: req.params.groupId, name: String(name).trim(), creative: creative || {} });
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "create-ad", entity_type: "ad", entity_id: ad.id, after: ad, ip: getClientIp(req) });
    res.json({ success: true, ad });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put("/api/ads/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const before = await getAdById(req.params.id);
    if (!before) return res.status(404).json({ success: false, error: "Không tìm thấy ad." });

    const { name, status, creative } = req.body || {};
    const updates: any = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (status !== undefined) updates.status = status;
    if (creative !== undefined) updates.creative = creative;

    await updateAd(req.params.id, updates);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "update-ad", entity_type: "ad", entity_id: req.params.id, before, after: updates, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/api/ads/:id", requireAuth("Editor"), async (req, res) => {
  try {
    const ad = await getAdById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, error: "Không tìm thấy ad." });

    if (ad.platform_native_id) {
      const group = await getAdGroupById(ad.ad_group_id);
      const campaign = group ? await getCampaignById(group.campaign_id) : null;
      const connection = campaign ? await getConnectionById(campaign.connection_id) : null;
      if (campaign?.platform === "facebook" && connection) {
        const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
        try {
          await deleteFacebookAd(ad.platform_native_id, access_token);
        } catch (err: any) {
          return res.status(502).json({ success: false, error: `Ad đã lên Facebook thật — xóa trên Facebook thất bại, chưa xóa local: ${err.message}` });
        }
      }
    }

    await softDeleteAd(req.params.id);
    await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "delete-ad", entity_type: "ad", entity_id: req.params.id, before: ad, ip: getClientIp(req) });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/ads/:id/push", requireAuth("Editor"), async (req, res) => {
  try {
    const ad = await getAdById(req.params.id);
    if (!ad) return res.status(404).json({ success: false, error: "Không tìm thấy ad." });
    const group = await getAdGroupById(ad.ad_group_id);
    if (!group) return res.status(400).json({ success: false, error: "Ad group cha không tồn tại." });
    if (!group.platform_native_id) return res.status(400).json({ success: false, error: "Phải đẩy ad group cha lên nền tảng trước." });
    const campaign = await getCampaignById(group.campaign_id);
    if (!campaign) return res.status(400).json({ success: false, error: "Campaign cha không tồn tại." });

    if (campaign.platform !== "facebook") {
      await updateAd(ad.id, { sync_status: "pending_push", last_push_error: `Chưa kết nối API ghi thật cho ${campaign.platform}.` });
      return res.json({ success: false, error: `Chưa hỗ trợ đẩy lên ${campaign.platform} ở phase này.` });
    }

    const connection = await getConnectionById(campaign.connection_id);
    if (!connection) return res.status(400).json({ success: false, error: "Kết nối không tồn tại." });

    try {
      const { access_token } = JSON.parse(decrypt(connection.credentials_encrypted));
      let nativeId = ad.platform_native_id;
      if (nativeId) {
        await updateFacebookAd(nativeId, access_token, { name: ad.name, status: ad.status === "active" ? "ACTIVE" : ad.status === "paused" ? "PAUSED" : undefined });
      } else {
        nativeId = await createFacebookAd(connection.account_id, access_token, { name: ad.name, adSetId: group.platform_native_id, creative: ad.creative as any });
      }
      await updateAd(ad.id, { sync_status: "synced", platform_native_id: nativeId, last_push_error: null });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-ad", entity_type: "ad", entity_id: ad.id, after: { platform_native_id: nativeId }, ip: getClientIp(req) });
      res.json({ success: true, platform_native_id: nativeId });
    } catch (err: any) {
      await updateAd(ad.id, { sync_status: "push_error", last_push_error: err.message });
      await logAdsAction({ username: (req as any).session.username, role: (req as any).session.role, action: "push-ad-failed", entity_type: "ad", entity_id: ad.id, after: { error: err.message }, ip: getClientIp(req) });
      res.status(502).json({ success: false, error: err.message });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Audit log (Admin only — every create/edit/delete/push, since push can
// spend real money once a platform write API is live).
// ---------------------------------------------------------------------------
app.get("/api/audit-log", requireAuth("Admin"), async (req, res) => {
  try {
    const log = await getAuditLog(200);
    res.json({ success: true, log });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
