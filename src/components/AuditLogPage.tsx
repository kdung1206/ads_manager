import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { safeFetchJson } from "../App";

interface LogRow {
  id: number;
  username: string;
  role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

export default function AuditLogPage() {
  const [log, setLog] = useState<LogRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    safeFetchJson("/api/audit-log")
      .then((res) => {
        if (res.success) setLog(res.log);
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-bold text-slate-900">Nhật ký hoạt động</h2>
      </div>
      <p className="text-xs text-slate-500">
        Mọi hành động tạo/sửa/xóa/đẩy lên nền tảng đều ghi lại ở đây — quan trọng vì "đẩy lên nền tảng" có thể tốn tiền thật.
      </p>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Thời gian</th>
              <th className="px-3 py-2 text-left">Người thực hiện</th>
              <th className="px-3 py-2 text-left">Hành động</th>
              <th className="px-3 py-2 text-left">Đối tượng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Đang tải...</td></tr>
            ) : log.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-400">Chưa có hoạt động nào.</td></tr>
            ) : (
              log.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 text-slate-500">{new Date(row.created_at).toLocaleString("vi-VN")}</td>
                  <td className="px-3 py-2 text-slate-700">{row.username} <span className="text-slate-400">({row.role})</span></td>
                  <td className="px-3 py-2 font-medium text-slate-700">{row.action}</td>
                  <td className="px-3 py-2 text-slate-500">{row.entity_type} · {row.entity_id.slice(0, 8)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
