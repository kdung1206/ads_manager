import React, { useEffect, useState } from "react";
import { X, PlusCircle, Trash2, UploadCloud, ChevronDown, ChevronRight, Tag } from "lucide-react";
import { safeFetchJson } from "../App";

type EntityStatus = "draft" | "active" | "paused" | "archived";
type SyncStatus = "local_only" | "pending_push" | "synced" | "push_error";

interface Campaign {
  id: string;
  platform: "facebook" | "google" | "tiktok";
  name: string;
  status: EntityStatus;
  sync_status: SyncStatus;
  platform_native_id: string | null;
}

interface Keyword {
  text: string;
  match_type: "BROAD" | "PHRASE" | "EXACT";
}

interface AdGroup {
  id: string;
  campaign_id: string;
  name: string;
  budget: number | null;
  status: EntityStatus;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
  extra?: { keywords?: Keyword[] } | null;
}

const MATCH_TYPE_LABELS: Record<Keyword["match_type"], string> = { BROAD: "Broad", PHRASE: "Phrase", EXACT: "Exact" };

interface Ad {
  id: string;
  ad_group_id: string;
  name: string;
  creative: { headline?: string; body?: string; link?: string; image_url?: string };
  status: EntityStatus;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
}

const STATUS_BADGE: Record<EntityStatus, string> = {
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  archived: "bg-slate-100 text-slate-400",
};

const SYNC_BADGE: Record<SyncStatus, { label: string; cls: string }> = {
  local_only: { label: "Chưa đẩy lên", cls: "bg-slate-100 text-slate-500" },
  pending_push: { label: "Chờ đẩy lên", cls: "bg-amber-100 text-amber-700" },
  synced: { label: "Đã đồng bộ", cls: "bg-emerald-100 text-emerald-700" },
  push_error: { label: "Lỗi đẩy lên", cls: "bg-rose-100 text-rose-700" },
};

function SyncBadge({ status }: { status: SyncStatus }) {
  const b = SYNC_BADGE[status];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${b.cls}`}>{b.label}</span>;
}

function AdsTable({ group, canEdit, onChanged }: { group: AdGroup; canEdit: boolean; onChanged: () => void }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      const res = await safeFetchJson(`/api/ad-groups/${group.id}/ads`);
      if (res.success) setAds(res.ads);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [group.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    try {
      await safeFetchJson(`/api/ad-groups/${group.id}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), creative: { headline: headline.trim(), body: body.trim(), link: link.trim() } }),
      });
      setName("");
      setHeadline("");
      setBody("");
      setLink("");
      setShowForm(false);
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message || "Tạo ad thất bại.");
    }
  }

  async function handleDelete(ad: Ad) {
    if (!window.confirm(`Xóa ad "${ad.name}"?${ad.platform_native_id ? " Ad đã lên nền tảng thật — sẽ set DELETED trên nền tảng trước." : ""}`)) return;
    try {
      const res = await safeFetchJson(`/api/ads/${ad.id}`, { method: "DELETE" });
      if (!res.success) {
        alert(res.error || "Xóa thất bại.");
        return;
      }
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message || "Xóa thất bại.");
    }
  }

  async function handlePush(ad: Ad) {
    setBusyId(ad.id);
    try {
      const res = await safeFetchJson(`/api/ads/${ad.id}/push`, { method: "POST" });
      if (!res.success) alert(res.error || "Đẩy lên thất bại.");
      await load();
      onChanged();
    } catch (err: any) {
      alert(err.message || "Đẩy lên thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="ml-6 space-y-2 border-l border-slate-100 pl-4 pb-3">
      {isLoading ? (
        <p className="text-[11px] text-slate-400">Đang tải ads...</p>
      ) : (
        ads.map((ad) => (
          <div key={ad.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-700">{ad.name}</p>
              <p className="truncate text-slate-400">{ad.creative?.headline || "—"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 font-semibold ${STATUS_BADGE[ad.status]}`}>{ad.status}</span>
              <SyncBadge status={ad.sync_status} />
              {canEdit && (
                <>
                  <button onClick={() => handlePush(ad)} disabled={busyId === ad.id} title="Đẩy lên nền tảng" className="rounded border border-indigo-200 p-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
                    <UploadCloud className="h-3 w-3" />
                  </button>
                  <button onClick={() => handleDelete(ad)} title="Xóa" className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </>
              )}
            </div>
          </div>
        ))
      )}
      {adErrorHint(ads)}

      {canEdit && (
        showForm ? (
          <form onSubmit={handleCreate} className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
            <input required placeholder="Tên ad" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none" />
            <input placeholder="Headline" value={headline} onChange={(e) => setHeadline(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none" />
            <input placeholder="Nội dung (body)" value={body} onChange={(e) => setBody(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none" />
            <input placeholder="Link đích (https://...)" value={link} onChange={(e) => setLink(e.target.value)} className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none" />
            <div className="flex gap-1.5">
              <button type="submit" className="rounded bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-700">Lưu ad</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500">Hủy</button>
            </div>
          </form>
        ) : (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
            <PlusCircle className="h-3 w-3" /> Thêm ad
          </button>
        )
      )}
    </div>
  );
}

function adErrorHint(ads: Ad[]) {
  const withError = ads.find((a) => a.sync_status === "push_error" && a.last_push_error);
  if (!withError) return null;
  return <p className="text-[10px] text-rose-600">Lỗi đẩy lên gần nhất ({withError.name}): {withError.last_push_error}</p>;
}

// Google Ads only — quản lý keyword/targeting criteria của ad group (AdGroupCriterionService
// khi API thật được nối). Lưu trong cột `extra` sẵn có của ad_groups, chưa cần bảng riêng.
function KeywordsSection({ group, canEdit, onChanged }: { group: AdGroup; canEdit: boolean; onChanged: () => void }) {
  const keywords = group.extra?.keywords || [];
  const [text, setText] = useState("");
  const [matchType, setMatchType] = useState<Keyword["match_type"]>("PHRASE");
  const [showForm, setShowForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function saveKeywords(next: Keyword[]) {
    setIsSaving(true);
    try {
      const res = await safeFetchJson(`/api/ad-groups/${group.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extra: { ...(group.extra || {}), keywords: next } }),
      });
      if (!res.success) {
        alert(res.error || "Lưu từ khóa thất bại.");
        return;
      }
      onChanged();
    } catch (err: any) {
      alert(err.message || "Lưu từ khóa thất bại.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await saveKeywords([...keywords, { text: text.trim(), match_type: matchType }]);
    setText("");
    setShowForm(false);
  }

  async function handleRemove(index: number) {
    await saveKeywords(keywords.filter((_, i) => i !== index));
  }

  return (
    <div className="ml-6 space-y-2 border-l border-slate-100 pl-4 pb-3">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Tag className="h-3 w-3" /> Từ khóa (Keywords)
      </p>
      {keywords.length === 0 ? (
        <p className="text-[11px] text-slate-400">Chưa có từ khóa nào.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((kw, i) => (
            <span key={i} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
              {kw.text} <span className="text-slate-400">· {MATCH_TYPE_LABELS[kw.match_type]}</span>
              {canEdit && (
                <button onClick={() => handleRemove(i)} disabled={isSaving} className="text-slate-400 hover:text-rose-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {canEdit && (
        showForm ? (
          <form onSubmit={handleAdd} className="flex items-end gap-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Từ khóa</label>
              <input required value={text} onChange={(e) => setText(e.target.value)} placeholder="máy lọc nước gia đình" className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="w-28 space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Match type</label>
              <select value={matchType} onChange={(e) => setMatchType(e.target.value as Keyword["match_type"])} className="w-full rounded border border-slate-200 px-2 py-1 text-[11px] focus:border-indigo-400 focus:outline-none">
                <option value="BROAD">Broad</option>
                <option value="PHRASE">Phrase</option>
                <option value="EXACT">Exact</option>
              </select>
            </div>
            <button type="submit" disabled={isSaving} className="rounded bg-indigo-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Thêm</button>
            <button type="button" onClick={() => setShowForm(false)} className="rounded border border-slate-200 px-2.5 py-1.5 text-[11px] text-slate-500">Hủy</button>
          </form>
        ) : (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700">
            <PlusCircle className="h-3 w-3" /> Thêm từ khóa
          </button>
        )
      )}
    </div>
  );
}

function AdGroupRow({ campaign, group, canEdit, onChanged }: { campaign: Campaign; group: AdGroup; canEdit: boolean; onChanged: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm(`Xóa ad group "${group.name}"? Ad con bên trong sẽ mất theo.`)) return;
    try {
      const res = await safeFetchJson(`/api/ad-groups/${group.id}`, { method: "DELETE" });
      if (!res.success) {
        alert(res.error || "Xóa thất bại.");
        return;
      }
      onChanged();
    } catch (err: any) {
      alert(err.message || "Xóa thất bại.");
    }
  }

  async function handlePush() {
    setBusy(true);
    try {
      const res = await safeFetchJson(`/api/ad-groups/${group.id}/push`, { method: "POST" });
      if (!res.success) alert(res.error || "Đẩy lên thất bại.");
      onChanged();
    } catch (err: any) {
      alert(err.message || "Đẩy lên thất bại.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200">
      <div className="flex items-center justify-between px-3 py-2">
        <button onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1.5 text-left text-xs font-semibold text-slate-700">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {group.name}
          {group.budget ? <span className="text-slate-400">· {group.budget.toLocaleString("vi-VN")}đ/ngày</span> : null}
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[group.status]}`}>{group.status}</span>
          <SyncBadge status={group.sync_status} />
          {canEdit && (
            <>
              <button onClick={handlePush} disabled={busy} title="Đẩy lên nền tảng" className="rounded border border-indigo-200 p-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
                <UploadCloud className="h-3 w-3" />
              </button>
              <button onClick={handleDelete} title="Xóa" className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50">
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
        </div>
      </div>
      {group.last_push_error && <p className="px-3 pb-1 text-[10px] text-rose-600">{group.last_push_error}</p>}
      {expanded && campaign.platform === "google" && <KeywordsSection group={group} canEdit={canEdit} onChanged={onChanged} />}
      {expanded && <AdsTable group={group} canEdit={canEdit} onChanged={onChanged} />}
    </div>
  );
}

export default function CampaignDetail({ campaign, canEdit, onClose }: { campaign: Campaign; canEdit: boolean; onClose: () => void }) {
  const [groups, setGroups] = useState<AdGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [budget, setBudget] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    try {
      const res = await safeFetchJson(`/api/campaigns/${campaign.id}/ad-groups`);
      if (res.success) setGroups(res.groups);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [campaign.id]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await safeFetchJson(`/api/campaigns/${campaign.id}/ad-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), budget: budget ? Number(budget) : undefined }),
      });
      setName("");
      setBudget("");
      setShowForm(false);
      await load();
    } catch (err: any) {
      setError(err.message || "Tạo ad group thất bại.");
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div>
            <h3 className="text-sm font-bold text-slate-900">{campaign.name}</h3>
            <p className="text-[11px] text-slate-400">Ad set / Ad group → Ad — {campaign.platform}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-5">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}
          {isLoading && groups.length === 0 ? (
            <p className="text-xs text-slate-400">Đang tải...</p>
          ) : groups.length === 0 ? (
            <p className="text-xs text-slate-400">Chưa có ad group nào.</p>
          ) : (
            // Keep rendering the existing rows while a background reload is in
            // flight (isLoading) instead of swapping to a loading placeholder —
            // that used to unmount/remount AdGroupRow on every reload and reset
            // its local `expanded` state (e.g. right after adding an ad).
            groups.map((g) => <AdGroupRow key={g.id} campaign={campaign} group={g} canEdit={canEdit} onChanged={load} />)
          )}
        </div>

        {canEdit && (
          <div className="border-t border-slate-100 p-4">
            {showForm ? (
              <form onSubmit={handleCreate} className="flex items-end gap-2">
                <div className="flex-1 space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tên ad group</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none" />
                </div>
                <div className="w-32 space-y-1">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Budget/ngày</label>
                  <input type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-indigo-400 focus:outline-none" />
                </div>
                <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-700">Lưu</button>
                <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500">Hủy</button>
              </form>
            ) : (
              <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700">
                <PlusCircle className="h-3.5 w-3.5" /> Thêm ad group
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
