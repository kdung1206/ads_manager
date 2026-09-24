-- ---------------------------------------------------------------------------
-- ads_manager — Supabase schema. This is a SEPARATE Supabase project from
-- marketing_report_v2 on purpose (see plan) — real ad-spend write actions
-- stay isolated from the report dashboard's production database until the
-- two are deliberately merged. Run this whole file in Supabase Dashboard →
-- SQL Editor → New query; every statement uses `if not exists` so re-running
-- it (e.g. on a fresh project) is always safe.
-- ---------------------------------------------------------------------------

-- Single JSONB blob for anything that doesn't need relational queries yet
-- (currently just `users` — see appStateStore.ts). Same shape as
-- marketing_report_v2's app_state table.
create table if not exists app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table app_state enable row level security;

create table if not exists login_logs (
  id bigint generated always as identity primary key,
  username text not null,
  status text not null check (status in ('success', 'failure')),
  ip text,
  user_agent text,
  session_id text,
  created_at timestamptz not null default now()
);
alter table login_logs enable row level security;

-- Login rate-limiting (see src/server/app.ts) is in-memory only in this
-- phase, not a DB-backed table like marketing_report_v2's login_attempts —
-- acceptable simplification for a small internal ads-team tool; revisit if
-- this app grows a public-facing login surface.

-- ---------------------------------------------------------------------------
-- platform_connections — one row per connected ad account (Facebook Ad
-- Account / Google Ads Customer ID / TikTok Advertiser ID). Mirrors the
-- shape of marketing_report_v2's fb_ad_accounts, generalized across all 3
-- platforms since this app manages all of them from one screen.
-- credentials_encrypted holds a JSON string (access_token, and whatever
-- else a given platform needs — e.g. refresh_token for Google) encrypted
-- with src/server/crypto.ts before storage.
-- ---------------------------------------------------------------------------
create table if not exists platform_connections (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'google', 'tiktok')),
  account_id text not null, -- e.g. "act_1234567890" (FB), Customer ID (Google), Advertiser ID (TikTok)
  account_name text not null,
  brand text,
  credentials_encrypted text not null,
  is_active boolean not null default true,
  last_checked_at timestamptz,
  last_error text,
  token_expired boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  unique (platform, account_id)
);
alter table platform_connections enable row level security;

-- ---------------------------------------------------------------------------
-- ad_campaigns / ad_groups / ads — the app's own source of truth. Every
-- create/edit here writes ONLY to these tables; sync_status/platform_native_id
-- track whether that row has ever actually been pushed to the real platform
-- via POST /api/campaigns/:id/push (see facebookAdsWrite.ts). A row that
-- fails to push keeps its draft intact (sync_status='push_error') rather than
-- being discarded — see campaignsStore.ts.
-- ---------------------------------------------------------------------------
create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references platform_connections(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'google', 'tiktok')),
  name text not null,
  objective text,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  daily_budget numeric,
  lifetime_budget numeric,
  start_date date,
  end_date date,
  sync_status text not null default 'local_only' check (sync_status in ('local_only', 'pending_push', 'synced', 'push_error')),
  platform_native_id text,
  last_push_error text,
  extra jsonb not null default '{}'::jsonb,
  created_by text,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_campaigns_connection_idx on ad_campaigns (connection_id);
alter table ad_campaigns enable row level security;

create table if not exists ad_groups (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  name text not null,
  targeting jsonb not null default '{}'::jsonb,
  bid_strategy text,
  budget numeric,
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  sync_status text not null default 'local_only' check (sync_status in ('local_only', 'pending_push', 'synced', 'push_error')),
  platform_native_id text,
  last_push_error text,
  extra jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ad_groups_campaign_idx on ad_groups (campaign_id);
alter table ad_groups enable row level security;

create table if not exists ads (
  id uuid primary key default gen_random_uuid(),
  ad_group_id uuid not null references ad_groups(id) on delete cascade,
  name text not null,
  creative jsonb not null default '{}'::jsonb, -- headline/body/image_url/video_url/link
  status text not null default 'draft' check (status in ('draft', 'active', 'paused', 'archived')),
  sync_status text not null default 'local_only' check (sync_status in ('local_only', 'pending_push', 'synced', 'push_error')),
  platform_native_id text,
  last_push_error text,
  extra jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ads_ad_group_idx on ads (ad_group_id);
alter table ads enable row level security;

-- Every create/edit/delete/push is logged here — important because these
-- actions can spend real money once pushed to a live platform.
create table if not exists ads_audit_log (
  id bigint generated always as identity primary key,
  username text not null,
  role text not null,
  action text not null, -- e.g. "create-campaign", "push-campaign", "delete-ad"
  entity_type text not null, -- "connection" | "campaign" | "ad_group" | "ad" | "user"
  entity_id text not null,
  before jsonb,
  after jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists ads_audit_log_entity_idx on ads_audit_log (entity_type, entity_id);
alter table ads_audit_log enable row level security;
