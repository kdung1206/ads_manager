import React, { useEffect, useState } from "react";
import { PlusCircle, Trash2, CheckCircle2, AlertCircle, RefreshCw, Link2 } from "lucide-react";
import { safeFetchJson } from "../App";

type Platform = "facebook" | "google" | "tiktok";

interface Connection {
  id: string;
  platform: Platform;
  account_id: string;
  account_name: string;
  brand: string | null;
  is_active: boolean;
  last_checked_at: string | null;
  last_error: string | null;
  token_expired: boolean;
}

const PLATFORM_LABELS: Record<Platform, string> = { facebook: "Facebook", google: "Google Ads", tiktok: "TikTok" };

const PLATFORM_HELP: Record<Platform, { title: string; steps: string[]; ready: boolean }> = {
  facebook: {
    title: 'Cần Access Token có quyền "ads_management" (không phải chỉ ads_read — app này TẠO/SỬA/XÓA campaign thật).',
    steps: [
      "Vào Graph API Explorer → chọn App → Add Permissions → tick ads_management → Generate Access Token.",
      "Extend Access Token (Access Token Debugger) để lấy token dài hạn — khuyến nghị dùng System User token.",
      "Ad Account ID lấy tại Ads Manager, dạng act_1234567890 (nhập kèm tiền tố act_).",
    ],
    ready: true,
  },
  google: {
    title: "Chưa hỗ trợ đẩy lên thật ở phase này — cần Google Ads Developer Token + OAuth Client + refresh token của tài khoản có quyền trên MCC.",
    steps: ["Điền thông tin để lưu trước — route đẩy lên (push) sẽ báo rõ 'chưa hỗ trợ' cho tới khi Developer Token được cấp và code nối API thật được bổ sung."],
    ready: false,
  },
  tiktok: {
    title: "Chưa hỗ trợ đẩy lên thật ở phase này — cần app TikTok for Business riêng (khác app Login Kit đang dùng cho Social Report), scope Ads Management.",
    steps: ["Điền thông tin để lưu trước — tương tự Google, chờ TikTok Business API approval."],
    ready: false,
  },
};

export default function ConnectionsPage({ currentUser }: { currentUser: { role: "Admin" | "Editor" | "Viewer" } }) {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [brand, setBrand] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const isAdmin = currentUser.role === "Admin";

  async function load() {
    setIsLoading(true);
    try {
      const res = await safeFetchJson(`/api/connections?platform=${platform}`);
      if (res.success) setConnections(res.connections);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    setMessage(null);
  }, [platform]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await safeFetchJson("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, account_id: accountId.trim(), account_name: accountName.trim(), brand: brand.trim() || undefined, access_token: accessToken.trim() }),
      });
      if (res.success) {
        setMessage({ type: "success", text: "Đã lưu kết nối." });
        setAccountId("");
        setAccountName("");
        setBrand("");
        setAccessToken("");
        await load();
      } else {
        setMessage({ type: "error", text: res.error || "Lưu thất bại." });
      }
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xóa kết nối "${name}"? Campaign/ad group/ad thuộc kết nối này (chưa đẩy lên nền tảng thật) sẽ bị xóa theo.`)) return;
    try {
      const res = await safeFetchJson(`/api/connections/${id}`, { method: "DELETE" });
      if (res.success) await load();
      else setMessage({ type: "error", text: res.error || "Xóa thất bại." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  async function handleTest(id: string) {
    setTestingId(id);
    setMessage(null);
    try {
      const res = await safeFetchJson(`/api/connections/${id}/test`, { method: "POST" });
      if (res.success) setMessage({ type: "success", text: `Kết nối OK — ${res.account_name} (${res.account_status})` });
      else setMessage({ type: "error", text: res.error || "Kiểm tra thất bại." });
      await load();
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setTestingId(null);
    }
  }

  const help = PLATFORM_HELP[platform];

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-bold text-slate-900">Kết nối nền tảng</h2>
      </div>
      <p className="text-xs text-slate-500">Quản lý tập trung tài khoản quảng cáo Facebook / Google Ads / TikTok để dùng cho Campaigns.</p>

      <div className="flex gap-1.5 border-b border-slate-200">
        {(["facebook", "google", "tiktok"] as Platform[]).map((p) => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`rounded-t-lg px-4 py-2 text-xs font-bold transition ${platform === p ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-700"}`}
          >
            {PLATFORM_LABELS[p]}
          </button>
        ))}
      </div>

      {message && (
        <div className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.type === "success" ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {message.text}
        </div>
      )}

      {isAdmin && (
        <div className="space-y-3 rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
          <div className={`space-y-1.5 rounded-lg border p-3 text-[11px] ${help.ready ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
            <p className="font-semibold">{help.title}</p>
            <ol className="list-decimal space-y-1 pl-4">
              {help.steps.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          </div>

          <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Account ID</label>
              <input required value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder={platform === "facebook" ? "act_1234567890" : "ID tài khoản"} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Tên account</label>
              <input required value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Karofi - MKT" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Thương hiệu</label>
              <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Karofi / Livotec" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Access Token</label>
              <input required type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAAG..." className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
            </div>
            <div className="sm:col-span-4">
              <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
                <PlusCircle className="h-3.5 w-3.5" /> {isSaving ? "Đang lưu..." : "Thêm / Cập nhật kết nối"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Account</th>
              <th className="px-3 py-2 text-left">Thương hiệu</th>
              <th className="px-3 py-2 text-left">Kiểm tra gần nhất</th>
              <th className="px-3 py-2 text-left">Trạng thái</th>
              {isAdmin && <th className="px-3 py-2 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Đang tải...</td></tr>
            ) : connections.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Chưa có kết nối {PLATFORM_LABELS[platform]} nào.</td></tr>
            ) : (
              connections.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-700">{c.account_name}</div>
                    <div className="text-slate-400">{c.account_id}</div>
                  </td>
                  <td className="px-3 py-2">{c.brand ? <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">{c.brand}</span> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-3 py-2 text-slate-500">{c.last_checked_at ? new Date(c.last_checked_at).toLocaleString("vi-VN") : "Chưa kiểm tra"}</td>
                  <td className="px-3 py-2">
                    {c.token_expired ? (
                      <span className="font-semibold text-rose-600" title={c.last_error || ""}>🔴 Token hết hạn</span>
                    ) : c.last_error ? (
                      <span className="text-amber-600" title={c.last_error}>⚠️ {c.last_error.slice(0, 40)}{c.last_error.length > 40 ? "…" : ""}</span>
                    ) : (
                      <span className="text-emerald-600">OK</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {platform === "facebook" && (
                          <button onClick={() => handleTest(c.id)} disabled={testingId === c.id} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50">
                            <RefreshCw className={`h-3 w-3 ${testingId === c.id ? "animate-spin" : ""}`} /> Kiểm tra
                          </button>
                        )}
                        <button onClick={() => handleDelete(c.id, c.account_name)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-3 w-3" /> Xóa
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
