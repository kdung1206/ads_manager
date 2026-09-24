import React, { useEffect, useState } from "react";
import { Users, PlusCircle, Trash2, Shield, UserCheck, Eye } from "lucide-react";
import { safeFetchJson } from "../App";

interface UserRow {
  username: string;
  name: string;
  role: "Admin" | "Editor" | "Viewer";
}

export default function UsersAdmin({ currentUser }: { currentUser: UserRow }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("Editor");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    setIsLoading(true);
    try {
      const res = await safeFetchJson("/api/users");
      if (res.success) setUsers(res.users);
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      const res = await safeFetchJson("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), name: name.trim(), role, newPassword: password || undefined }),
      });
      if (res.success) {
        setMessage({ type: "success", text: "Đã lưu tài khoản." });
        setUsername("");
        setName("");
        setPassword("");
        setRole("Editor");
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

  async function handleDelete(u: string) {
    if (!window.confirm(`Xóa tài khoản "${u}"?`)) return;
    try {
      const res = await safeFetchJson(`/api/users/${encodeURIComponent(u)}`, { method: "DELETE" });
      if (res.success) await load();
      else setMessage({ type: "error", text: res.error || "Xóa thất bại." });
    } catch (err: any) {
      setMessage({ type: "error", text: err.message });
    }
  }

  const roleIcon = (r: UserRow["role"]) => (r === "Admin" ? Shield : r === "Editor" ? UserCheck : Eye);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-bold text-slate-900">Quản lý tài khoản team Ads</h2>
      </div>
      <p className="text-xs text-slate-500">
        Admin quản lý kết nối/credentials. Editor tạo/sửa/xóa campaign — chính là tài khoản team Ads dùng hàng ngày. Viewer chỉ xem.
      </p>

      {message && (
        <div className={`rounded-lg border p-2.5 text-xs ${message.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Username</label>
          <input required value={username} onChange={(e) => setUsername(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Tên hiển thị</label>
          <input required value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Vai trò</label>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none">
            <option value="Admin">Admin</option>
            <option value="Editor">Editor</option>
            <option value="Viewer">Viewer</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-600">Mật khẩu (để trống nếu chỉ sửa)</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none" />
        </div>
        <div className="sm:col-span-4">
          <button type="submit" disabled={isSaving} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50">
            <PlusCircle className="h-3.5 w-3.5" /> {isSaving ? "Đang lưu..." : "Thêm / Cập nhật"}
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Tên</th>
              <th className="px-3 py-2 text-left">Vai trò</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Đang tải...</td></tr>
            ) : (
              users.map((u) => {
                const Icon = roleIcon(u.role);
                return (
                  <tr key={u.username}>
                    <td className="px-3 py-2 font-medium text-slate-700">{u.username}</td>
                    <td className="px-3 py-2 text-slate-600">{u.name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                        <Icon className="h-3 w-3" /> {u.role}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {u.username !== currentUser.username && (
                        <button onClick={() => handleDelete(u.username)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1 text-rose-600 hover:bg-rose-50">
                          <Trash2 className="h-3 w-3" /> Xóa
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
