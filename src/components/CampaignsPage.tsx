import React, { useEffect, useState } from "react";
import { ListChecks, PlusCircle, Trash2, UploadCloud, Settings2, X } from "lucide-react";
import { safeFetchJson } from "../App";
import CampaignDetail from "./CampaignDetail";

type Platform = "facebook" | "google" | "tiktok";
type EntityStatus = "draft" | "active" | "paused" | "archived";
type SyncStatus = "local_only" | "pending_push" | "synced" | "push_error";

interface Connection {
  id: string;
  platform: Platform;
  account_id: string;
  account_name: string;
  brand: string | null;
}

interface Campaign {
  id: string;
  connection_id: string;
  platform: Platform;
  name: string;
  objective: string | null;
  status: EntityStatus;
  daily_budget: number | null;
  lifetime_budget: number | null;
  sync_status: SyncStatus;
  platform_native_id: string | null;
  last_push_error: string | null;
  extra?: { campaign_type?: string } | null;
}

const GOOGLE_CAMPAIGN_TYPE_LABELS: Record<string, string> = { SEARCH: "Search", VIDEO: "Video (YouTube)" };

const PLATFORM_LABELS: Record<Platform, string> = { facebook: "Facebook", google: "Google Ads", tiktok: "TikTok" };
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

function CreateCampaignModal({ connections, onClose, onCreated }: { connections: Connection[]; onClose: () => void; onCreated: () => void }) {
  const [connectionId, setConnectionId] = useState(connections[0]?.id || "");
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("OUTCOME_TRAFFIC");
  const [campaignType, setCampaignType] = useState("SEARCH");
  const [dailyBudget, setDailyBudget] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedConnection = connections.find((c) => c.id === connectionId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connectionId) {
      setError("Chưa có kết nối nào — thêm kết nối ở mục 'Kết nối nền tảng' trước.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await safeFetchJson("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connection_id: connectionId,
          name: name.trim(),
          objective: selectedConnection?.platform === "facebook" ? objective : undefined,
          extra: selectedConnection?.platform === "google" ? { campaign_type: campaignType } : undefined,
          daily_budget: dailyBudget ? Number(dailyBudget) : undefined,
          start_date: startDate || undefined,
          end_date: endDate || undefined,
        }),
      });
      if (res.success) onCreated();
      else setError(res.error || "Tạo campaign thất bại.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <h3 className="text-sm font-bold text-slate-900">Tạo campaign mới</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3 p-5">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Kết nối / Ad Account</label>
            <select required value={connectionId} onChange={(e) => setConnectionId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
              {connections.length === 0 && <option value="">— Chưa có kết nối nào —</option>}
              {connections.map((c) => (
                <option key={c.id} value={c.id}>{PLATFORM_LABELS[c.platform]} — {c.account_name}{c.brand ? ` (${c.brand})` : ""}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Tên campaign</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
          </div>

          {selectedConnection?.platform === "facebook" && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Objective</label>
              <select value={objective} onChange={(e) => setObjective(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                <option value="OUTCOME_TRAFFIC">Traffic</option>
                <option value="OUTCOME_LEADS">Leads</option>
                <option value="OUTCOME_ENGAGEMENT">Engagement</option>
                <option value="OUTCOME_AWARENESS">Awareness</option>
                <option value="OUTCOME_SALES">Sales</option>
              </select>
            </div>
          )}

          {selectedConnection?.platform === "google" && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Loại chiến dịch</label>
              <select value={campaignType} onChange={(e) => setCampaignType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
                <option value="SEARCH">Search</option>
                <option value="VIDEO">Video (YouTube)</option>
              </select>
              <p className="text-[11px] text-slate-400">Phạm vi campaign type đã đăng ký trong Google Ads API Basic Access application.</p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Budget/ngày</label>
              <input type="number" min="0" value={dailyBudget} onChange={(e) => setDailyBudget(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Bắt đầu</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Kết thúc</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">Hủy</button>
            <button type="submit" disabled={isSaving} className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50">{isSaving ? "Đang tạo..." : "Tạo campaign (draft)"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function CampaignsPage({ currentUser }: { currentUser: { role: "Admin" | "Editor" | "Viewer" } }) {
  const [platformTab, setPlatformTab] = useState<"all" | Platform>("all");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<Campaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const canEdit = currentUser.role === "Admin" || currentUser.role === "Editor";

  async function load() {
    setIsLoading(true);
    try {
      const [campaignsRes, connectionsRes] = await Promise.all([
        safeFetchJson(`/api/campaigns?platform=${platformTab}`),
        safeFetchJson("/api/connections"),
      ]);
      if (campaignsRes.success) setCampaigns(campaignsRes.campaigns);
      if (connectionsRes.success) setConnections(connectionsRes.connections);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [platformTab]);

  function connectionFor(c: Campaign) {
    return connections.find((conn) => conn.id === c.connection_id);
  }

  async function handleDelete(c: Campaign) {
    if (!window.confirm(`Xóa campaign "${c.name}"?${c.platform_native_id ? " Campaign đã lên nền tảng thật — sẽ set DELETED trên nền tảng trước." : ""}`)) return;
    setMessage(null);
    try {
      const res = await safeFetchJson(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (!res.success) setMessage(res.error || "Xóa thất bại.");
      await load();
    } catch (err: any) {
      setMessage(err.message || "Xóa thất bại.");
    }
  }

  async function handlePush(c: Campaign) {
    setBusyId(c.id);
    setMessage(null);
    try {
      const res = await safeFetchJson(`/api/campaigns/${c.id}/push`, { method: "POST" });
      if (!res.success) setMessage(res.error || "Đẩy lên thất bại.");
      await load();
    } catch (err: any) {
      setMessage(err.message || "Đẩy lên thất bại.");
    } finally {
      setBusyId(null);
    }
  }

  const connectionsForPlatform = platformTab === "all" ? connections : connections.filter((c) => c.platform === platformTab);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-bold text-slate-900">Campaigns</h2>
        </div>
        {canEdit && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700">
            <PlusCircle className="h-3.5 w-3.5" /> Tạo campaign
          </button>
        )}
      </div>

      <div className="flex gap-1.5 border-b border-slate-200">
        {(["all", "facebook", "google", "tiktok"] as const).map((p) => (
          <button key={p} onClick={() => setPlatformTab(p)} className={`rounded-t-lg px-4 py-2 text-xs font-bold transition ${platformTab === p ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}>
            {p === "all" ? "Tất cả" : PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {message && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{message}</div>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Campaign</th>
              <th className="px-3 py-2 text-left">Kết nối</th>
              <th className="px-3 py-2 text-left">Budget/ngày</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Đồng bộ</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Đang tải...</td></tr>
            ) : campaigns.length === 0 ? (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400">Chưa có campaign nào.</td></tr>
            ) : (
              campaigns.map((c) => {
                const conn = connectionFor(c);
                const syncBadge = SYNC_BADGE[c.sync_status];
                return (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{c.name}</div>
                      <div className="text-slate-400">
                        {PLATFORM_LABELS[c.platform]}
                        {c.objective ? ` · ${c.objective}` : ""}
                        {c.extra?.campaign_type ? ` · ${GOOGLE_CAMPAIGN_TYPE_LABELS[c.extra.campaign_type] || c.extra.campaign_type}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{conn ? `${conn.account_name}${conn.brand ? ` (${conn.brand})` : ""}` : "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{c.daily_budget ? `${c.daily_budget.toLocaleString("vi-VN")}đ` : "—"}</td>
                    <td className="px-3 py-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_BADGE[c.status]}`}>{c.status}</span></td>
                    <td className="px-3 py-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${syncBadge.cls}`}>{syncBadge.label}</span>
                      {c.last_push_error && <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-rose-600" title={c.last_push_error}>{c.last_push_error}</p>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setDetailCampaign(c)} title="Quản lý ad group / ad" className="rounded border border-slate-200 p-1 text-slate-600 hover:bg-slate-50">
                          <Settings2 className="h-3 w-3" />
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => handlePush(c)}
                              disabled={busyId === c.id || c.platform !== "facebook"}
                              title={c.platform === "facebook" ? "Đẩy lên nền tảng" : "Chưa hỗ trợ platform này"}
                              className="rounded border border-indigo-200 p-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-40"
                            >
                              <UploadCloud className="h-3 w-3" />
                            </button>
                            <button onClick={() => handleDelete(c)} title="Xóa" className="rounded border border-rose-200 p-1 text-rose-600 hover:bg-rose-50">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateCampaignModal
          connections={connectionsForPlatform}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            load();
          }}
        />
      )}

      {detailCampaign && <CampaignDetail campaign={detailCampaign} canEdit={canEdit} onClose={() => setDetailCampaign(null)} />}
    </div>
  );
}
