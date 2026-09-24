import React, { useEffect, useState } from "react";
import { Megaphone, Link2, ListChecks, LogOut, ScrollText, Users, ShieldCheck } from "lucide-react";
import ConnectionsPage from "./components/ConnectionsPage";
import CampaignsPage from "./components/CampaignsPage";
import UsersAdmin from "./components/UsersAdmin";
import AuditLogPage from "./components/AuditLogPage";

// Session token issued by POST /api/login (see src/server/auth.ts). Kept as a
// module-level variable (mirrored to localStorage) rather than React state so
// safeFetchJson — used everywhere, including outside any component — can
// always read the current value without prop-drilling it through every call.
// Same convention as marketing_report_v2's App.tsx.
let authToken: string | null = typeof localStorage !== "undefined" ? localStorage.getItem("ads_manager_auth_token") : null;

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem("ads_manager_auth_token", token);
  else localStorage.removeItem("ads_manager_auth_token");
}

export async function safeFetchJson(url: string, options?: RequestInit) {
  const headers = { ...(options?.headers || {}), ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) };
  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  const trimmed = text.trim();
  if (response.status === 401) {
    window.dispatchEvent(new Event("auth:expired"));
  }
  if (trimmed.startsWith("<") || !response.ok) {
    const err: any = new Error(`API trả về phản hồi không hợp lệ (status: ${response.status})`);
    err.status = response.status;
    throw err;
  }
  return JSON.parse(text);
}

interface CurrentUser {
  username: string;
  name: string;
  role: "Admin" | "Editor" | "Viewer";
}

type Page = "connections" | "campaigns" | "users" | "audit-log";

function LoginScreen({ onLoggedIn }: { onLoggedIn: (user: CurrentUser, token: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error || "Đăng nhập thất bại.");
        return;
      }
      onLoggedIn(body.user, body.token);
    } catch (err: any) {
      setError(err.message || "Lỗi kết nối.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
            <Megaphone className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Ads Manager</h1>
            <p className="text-[11px] text-slate-500">Livotec & Karofi — quản lý quảng cáo tập trung</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{error}</div>}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Tên đăng nhập</label>
            <input
              type="text"
              required
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Mật khẩu</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isLoading ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}

const NAV_ITEMS: { id: Page; label: string; icon: typeof Link2; adminOnly?: boolean }[] = [
  { id: "connections", label: "Kết nối nền tảng", icon: Link2 },
  { id: "campaigns", label: "Campaigns", icon: ListChecks },
  { id: "users", label: "Người dùng", icon: Users, adminOnly: true },
  { id: "audit-log", label: "Nhật ký hoạt động", icon: ScrollText, adminOnly: true },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [checkedSession, setCheckedSession] = useState(false);
  const [page, setPage] = useState<Page>("connections");

  useEffect(() => {
    if (!authToken) {
      setCheckedSession(true);
      return;
    }
    safeFetchJson("/api/auth/me")
      .then((res) => setCurrentUser(res.user))
      .catch(() => setAuthToken(null))
      .finally(() => setCheckedSession(true));
  }, []);

  useEffect(() => {
    function handleExpired() {
      setAuthToken(null);
      setCurrentUser(null);
    }
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, []);

  function handleLoggedIn(user: CurrentUser, token: string) {
    setAuthToken(token);
    setCurrentUser(user);
  }

  function handleLogout() {
    setAuthToken(null);
    setCurrentUser(null);
  }

  if (!checkedSession) return null;
  if (!currentUser) return <LoginScreen onLoggedIn={handleLoggedIn} />;

  const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || currentUser.role === "Admin");
  const activePage = visibleNav.some((item) => item.id === page) ? page : "connections";

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Megaphone className="h-4 w-4" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-900">Ads Manager</p>
            <p className="text-[10px] text-slate-500">Livotec & Karofi</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition ${
                  isActive ? "bg-indigo-50 text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 p-3">
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-slate-700">{currentUser.name}</p>
              <p className="text-[10px] text-slate-400">{currentUser.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-500 hover:bg-slate-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        {activePage === "connections" && <ConnectionsPage currentUser={currentUser} />}
        {activePage === "campaigns" && <CampaignsPage currentUser={currentUser} />}
        {activePage === "users" && currentUser.role === "Admin" && <UsersAdmin currentUser={currentUser} />}
        {activePage === "audit-log" && currentUser.role === "Admin" && <AuditLogPage />}
      </main>
    </div>
  );
}
