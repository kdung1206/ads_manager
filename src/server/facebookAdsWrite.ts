// ---------------------------------------------------------------------------
// Facebook Marketing API — WRITE side (create/update/delete real campaigns/
// ad sets/ads). This is the one platform with real API access wired up in
// this phase (see plan) — Google/TikTok pushes are stubs in app.ts until
// their respective API access clears.
//
// Requires an access token with the `ads_management` permission (NOT just
// `ads_read`, which is all facebookAdsSync.ts in marketing_report_v2 needed
// for read-only reporting) — see .env.example.
//
// Same plain-fetch()-no-SDK convention as marketing_report_v2's
// facebookSync.ts/facebookAdsSync.ts, and the same GraphApiError/code-190
// shape so a dead token is easy to distinguish from any other failure.
// ---------------------------------------------------------------------------

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

export class GraphApiError extends Error {
  code?: number;
  subcode?: number;
  constructor(message: string, code?: number, subcode?: number) {
    super(message);
    this.code = code;
    this.subcode = subcode;
  }
}

export function isTokenInvalidError(err: unknown): boolean {
  return err instanceof GraphApiError && err.code === 190;
}

async function graphPost(path: string, accessToken: string, fields: Record<string, unknown>): Promise<any> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    body.set(key, typeof value === "string" ? value : JSON.stringify(value));
  }
  body.set("access_token", accessToken);

  const res = await fetch(`${GRAPH_API_BASE}${path}`, { method: "POST", body });
  const json = await res.json();
  if (!res.ok || json?.error) {
    throw new GraphApiError(json?.error?.message || `Graph API trả về lỗi HTTP ${res.status}`, json?.error?.code, json?.error?.error_subcode);
  }
  return json;
}

export interface PushCampaignInput {
  name: string;
  objective: string | null; // Facebook Outcome-Driven objective enum, e.g. OUTCOME_TRAFFIC, OUTCOME_LEADS, OUTCOME_ENGAGEMENT — validated by Facebook itself, not re-validated here
  daily_budget: number | null;
  lifetime_budget: number | null;
  start_date: string | null;
  end_date: string | null;
}

// Always creates PAUSED regardless of the local draft's intended status —
// deliberate safety guardrail for this first phase: a bug in this brand-new
// write path must never be able to autonomously start spending real budget.
// The ads team flips it live from Facebook Ads Manager itself (or a later
// explicit "activate" push, once this path has been trusted with real use).
//
// NOTE ON BUDGET UNITS: Facebook expects daily_budget/lifetime_budget in the
// ad account's smallest currency unit — cents for USD, but VND has no minor
// unit, so a VND-currency ad account expects the raw amount, not ×100. Verify
// against the specific ad account's currency (GET /act_<id>?fields=currency)
// before relying on this for a non-VND account.
export async function createFacebookCampaign(adAccountId: string, accessToken: string, input: PushCampaignInput): Promise<string> {
  const fields: Record<string, unknown> = {
    name: input.name,
    objective: input.objective || "OUTCOME_TRAFFIC",
    status: "PAUSED",
    special_ad_categories: [],
  };
  if (input.daily_budget) fields.daily_budget = Math.round(input.daily_budget);
  if (input.lifetime_budget) fields.lifetime_budget = Math.round(input.lifetime_budget);
  if (input.start_date) fields.start_time = `${input.start_date}T00:00:00+0700`;
  if (input.end_date) fields.stop_time = `${input.end_date}T23:59:59+0700`;

  const result = await graphPost(`/${adAccountId}/campaigns`, accessToken, fields);
  if (!result.id) throw new GraphApiError("Facebook không trả về campaign id.");
  return result.id;
}

export async function updateFacebookCampaign(campaignId: string, accessToken: string, input: Partial<PushCampaignInput> & { status?: string }): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.status !== undefined) fields.status = input.status;
  if (input.daily_budget !== undefined && input.daily_budget !== null) fields.daily_budget = Math.round(input.daily_budget);
  if (input.lifetime_budget !== undefined && input.lifetime_budget !== null) fields.lifetime_budget = Math.round(input.lifetime_budget);
  await graphPost(`/${campaignId}`, accessToken, fields);
}

// Facebook has no true hard-delete for campaigns via this endpoint — setting
// status to DELETED is the documented, reversible-in-Ads-Manager-history way
// to remove one. Never actually calls the HTTP DELETE verb (which behaves
// inconsistently across object types) on purpose.
export async function deleteFacebookCampaign(campaignId: string, accessToken: string): Promise<void> {
  await graphPost(`/${campaignId}`, accessToken, { status: "DELETED" });
}

export interface PushAdSetInput {
  name: string;
  campaignId: string;
  budget: number | null;
  bid_strategy: string | null;
  targeting: Record<string, unknown>;
}

// optimization_goal/billing_event are required by Facebook and have no safe
// universal default — LINK_CLICKS/IMPRESSIONS is the closest to a
// traffic-objective default, but a real deployment should let the ads team
// choose these explicitly per ad set once this path is exercised for real.
export async function createFacebookAdSet(adAccountId: string, accessToken: string, input: PushAdSetInput): Promise<string> {
  const fields: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: "LINK_CLICKS",
    targeting: Object.keys(input.targeting || {}).length > 0 ? input.targeting : { geo_locations: { countries: ["VN"] } },
  };
  if (input.budget) fields.daily_budget = Math.round(input.budget);
  if (input.bid_strategy) fields.bid_strategy = input.bid_strategy;

  const result = await graphPost(`/${adAccountId}/adsets`, accessToken, fields);
  if (!result.id) throw new GraphApiError("Facebook không trả về ad set id.");
  return result.id;
}

export async function updateFacebookAdSet(adSetId: string, accessToken: string, input: Partial<PushAdSetInput> & { status?: string }): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.status !== undefined) fields.status = input.status;
  if (input.budget !== undefined && input.budget !== null) fields.daily_budget = Math.round(input.budget);
  if (input.targeting) fields.targeting = input.targeting;
  await graphPost(`/${adSetId}`, accessToken, fields);
}

export async function deleteFacebookAdSet(adSetId: string, accessToken: string): Promise<void> {
  await graphPost(`/${adSetId}`, accessToken, { status: "DELETED" });
}

export interface PushAdInput {
  name: string;
  adSetId: string;
  creative: { headline?: string; body?: string; image_url?: string; link?: string };
}

// A real Facebook ad needs a creative that already references a page/link —
// object_story_spec below assumes `creative.link` points at an existing
// landing page and has no image/page validation. This is enough to prove the
// create/push plumbing end-to-end; a production-ready creative builder
// (page picker, image upload to Facebook, carousel/video support) is
// explicitly out of scope for this phase per the plan.
export async function createFacebookAd(adAccountId: string, accessToken: string, input: PushAdInput): Promise<string> {
  const creative = await graphPost(`/${adAccountId}/adcreatives`, accessToken, {
    name: `${input.name} — creative`,
    object_story_spec: {
      link_data: {
        link: input.creative.link || "https://karofi.com",
        message: input.creative.body || "",
        name: input.creative.headline || input.name,
        picture: input.creative.image_url || undefined,
      },
    },
  });
  if (!creative.id) throw new GraphApiError("Facebook không trả về creative id.");

  const result = await graphPost(`/${adAccountId}/ads`, accessToken, {
    name: input.name,
    adset_id: input.adSetId,
    status: "PAUSED",
    creative: { creative_id: creative.id },
  });
  if (!result.id) throw new GraphApiError("Facebook không trả về ad id.");
  return result.id;
}

export async function updateFacebookAd(adId: string, accessToken: string, input: { name?: string; status?: string }): Promise<void> {
  const fields: Record<string, unknown> = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.status !== undefined) fields.status = input.status;
  await graphPost(`/${adId}`, accessToken, fields);
}

export async function deleteFacebookAd(adId: string, accessToken: string): Promise<void> {
  await graphPost(`/${adId}`, accessToken, { status: "DELETED" });
}
