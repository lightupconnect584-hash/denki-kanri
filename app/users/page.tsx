"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Header from "@/components/Header";
import { PREF_CITIES } from "@/lib/serviceArea";

interface User {
  serviceAreas?: string[];
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  role: string;
  avatarUrl: string | null;
  color: string | null;
  phone: string | null;
  lastLoginAt: string | null;
  inviteToken: string | null;
  loginLogs: { createdAt: string }[];
  // 基本情報
  address: string | null;
  birthDate: string | null;
  bloodType: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
  licenseType: string | null;
  licenseNumber: string | null;
  licenseExpiry: string | null;
  vehicleNumber: string | null;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#84cc16", "#6b7280",
];

export default function UsersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [areaOpenId, setAreaOpenId] = useState<string | null>(null); // 対応エリアの全件展開
  const [showAreaMap, setShowAreaMap] = useState(false); // 🗺 エリアマップ
  const [mapMode, setMapMode] = useState<"map" | "list">("map"); // 地図/一覧の切替
  const [geo, setGeo] = useState<{ w: number; h: number; m: { p: string; n: string; g: number[][][] }[] } | null>(null);
  const [selMuni, setSelMuni] = useState<{ p: string; n: string } | null>(null);
  const [hiddenPartners, setHiddenPartners] = useState<Set<string>>(new Set()); // 地図で非表示にする会社
  useEffect(() => {
    if (!showAreaMap || geo) return;
    fetch("/geo/kanto4.json").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setGeo(d); }).catch(() => {});
  }, [showAreaMap, geo]);
  const [uncoveredOpen, setUncoveredOpen] = useState<string | null>(null); // 未カバー市町村の展開
  // 受付→完了報告のリードタイム（直近90日・要アポ除外）
  const [leadtime, setLeadtime] = useState<Record<string, { n: number; avg: number; med: number }>>({});
  useEffect(() => {
    fetch("/api/leadtime").then((r) => (r.ok ? r.json() : {})).then((d: Record<string, { n: number; avg: number; med: number }>) => setLeadtime(d || {})).catch(() => {});
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [newRole, setNewRole] = useState<"PARTNER" | "ADMIN">("PARTNER");
  const [form, setForm] = useState({ name: "", email: "", password: "", companyName: "" });
  const [loading, setLoading] = useState(false);

  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState("");

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [loginLogId, setLoginLogId] = useState<string | null>(null);
  const [profileExpandId, setProfileExpandId] = useState<string | null>(null);

  const role = (session?.user as { role?: string })?.role;
  const myId = (session?.user as { id?: string })?.id;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
    if (status === "authenticated" && role !== "ADMIN") router.push("/dashboard");
  }, [status, role, router]);

  const fetchUsers = () => {
    fetch("/api/users").then((r) => r.json()).then(setUsers);
  };

  useEffect(() => {
    if (status === "authenticated") fetchUsers();
  }, [status]);

  // タブに戻ったとき自動再取得（招待完了後などに最新状態を反映）
  useEffect(() => {
    const onFocus = () => { if (status === "authenticated") fetchUsers(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [status]);

  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, role: newRole }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      alert(data.error || "追加に失敗しました");
      return;
    }
    setForm({ name: "", email: "", password: "", companyName: "" });
    setShowForm(false);
    fetchUsers();
    // 招待リンクが発行された場合は表示
    if (data.inviteToken) {
      setInviteUrl(`${window.location.origin}/register/${data.inviteToken}`);
    }
  };

  const handleResetPassword = async (userId: string) => {
    if (!resetPassword.trim()) return;
    setResetLoading(true);
    setResetError("");
    const res = await fetch(`/api/users?id=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: resetPassword }),
    });
    if (res.ok) {
      setResetUserId(null);
      setResetPassword("");
    } else {
      const data = await res.json();
      setResetError(data.error || "エラーが発生しました");
    }
    setResetLoading(false);
  };

  const handleDelete = async (userId: string) => {
    setDeleteLoading(true);
    setDeleteError((prev) => ({ ...prev, [userId]: "" }));
    try {
      const res = await fetch(`/api/users?id=${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (res.ok) {
        setConfirmDeleteId(null);
        fetchUsers();
      } else {
        setDeleteError((prev) => ({ ...prev, [userId]: data.error || "削除できませんでした" }));
      }
    } catch {
      setDeleteError((prev) => ({ ...prev, [userId]: "通信エラーが発生しました" }));
    }
    setDeleteLoading(false);
  };

  const handleColorSelect = async (userId: string, color: string | null) => {
    setSavingColor(true);
    await fetch(`/api/users?id=${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
    await fetchUsers();
    setSavingColor(false);
    setColorPickerId(null);
  };

  const inputClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const admins = users.filter((u) => u.role === "ADMIN");
  const partners = users.filter((u) => u.role === "PARTNER");

  const renderUserCard = (u: User) => (
    <div key={u.id} className="bg-gray-800 rounded-xl border border-gray-700 p-4 space-y-3">
      {/* 情報行 */}
      <div className="flex items-center gap-3">
        {u.role === "PARTNER" && (
          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: u.color || "#d1d5db" }} />
        )}
        {(() => {
          const tel = u.phone?.replace(/[^0-9+]/g, "");
          const avatar = u.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatarUrl.startsWith("http") ? u.avatarUrl : `/uploads/${u.avatarUrl}`}
              alt={u.name}
              className="w-10 h-10 rounded-full object-cover border border-gray-700"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white border border-gray-700"
              style={{ backgroundColor: u.role === "PARTNER" ? (u.color || "#9ca3af") : "#2563eb" }}
            >
              {(u.companyName || u.name)[0]?.toUpperCase()}
            </div>
          );
          // 電話番号があればアイコンタップで発信（📞バッジ付き）
          return tel ? (
            <a href={`tel:${tel}`} className="relative shrink-0 block active:scale-95 transition" title={`${u.companyName || u.name}に電話（${u.phone}）`}>
              {avatar}
              <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-600 border border-gray-800 flex items-center justify-center text-[9px] leading-none">📞</span>
            </a>
          ) : (
            <div className="shrink-0">{avatar}</div>
          );
        })()}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-medium text-gray-100 text-sm truncate">{u.companyName || (u.inviteToken ? "招待中" : u.name)}</p>
            {u.id === myId && <span className="text-xs bg-blue-900/50 text-blue-400 px-1.5 py-0.5 rounded-full shrink-0">自分</span>}
            {u.inviteToken && <span className="text-xs bg-yellow-900/40 text-yellow-300 px-1.5 py-0.5 rounded-full shrink-0">招待中</span>}
          </div>
          {u.companyName && !u.inviteToken && u.name !== "招待中" && <p className="text-xs text-gray-400 truncate">{u.name}</p>}
          <p className="text-xs text-gray-500 truncate">{u.inviteToken ? "（未登録）" : u.email}</p>
          {u.phone && (
            <a href={`tel:${u.phone.replace(/[^0-9+]/g, "")}`} className="text-xs text-green-400 hover:text-green-300 truncate inline-block">
              📞 {u.phone}
            </a>
          )}
          {u.role === "PARTNER" && (u.serviceAreas?.length ?? 0) > 0 && (() => {
            const areas = u.serviceAreas!;
            const open = areaOpenId === u.id;
            const LIMIT = 5;
            const shown = open ? areas : areas.slice(0, LIMIT);
            const isPref = (a: string) => a.endsWith("県");
            return (
              <div className="flex flex-wrap items-center gap-1 mt-1" title="対応エリア（本人が設定画面で編集）">
                <span className="text-xs text-sky-400 shrink-0">📍</span>
                {shown.map((a) => (
                  <span key={a} className={`text-[11px] rounded px-1.5 py-0.5 border ${isPref(a) ? "bg-sky-900/60 text-sky-200 border-sky-700 font-bold" : "bg-gray-700/60 text-gray-300 border-gray-600"}`}>
                    {isPref(a) ? `${a}全域` : a}
                  </span>
                ))}
                {areas.length > LIMIT && (
                  <button
                    onClick={() => setAreaOpenId(open ? null : u.id)}
                    className="text-[11px] text-sky-400 hover:text-sky-200 underline underline-offset-2 px-1"
                  >{open ? "たたむ ▲" : `他${areas.length - LIMIT}件 ▼`}</button>
                )}
              </div>
            );
          })()}
          {leadtime[u.id] && (() => {
            const lt = leadtime[u.id];
            // 件数を考慮したランク: 高負荷(30件〜)は基準を緩め、少件数は参考扱い
            const th = lt.n >= 30 ? [3, 5, 8] : [2, 4, 7];
            const grade = lt.med <= th[0] ? "S" : lt.med <= th[1] ? "A" : lt.med <= th[2] ? "B" : "C";
            const gradeColor = grade === "S" ? "bg-purple-600 text-white" : grade === "A" ? "bg-blue-600 text-white" : grade === "B" ? "bg-gray-600 text-gray-100" : "bg-red-600 text-white";
            const provisional = lt.n < 10; // 10件未満は参考評価
            return (
            <p className="text-xs text-amber-300/90 truncate flex items-center gap-1.5" title={`受付から最初の完了報告までの日数（直近90日・📅日程調整の案件は除外）。ランクは件数考慮: ${lt.n >= 30 ? "高負荷帯(30件〜) S≤3/A≤5/B≤8日" : "S≤2/A≤4/B≤7日"}${provisional ? "・10件未満は参考評価" : ""}`}>
              {lt.n >= 5 && (
                <span className={`shrink-0 text-[10px] font-bold rounded px-1.5 py-0.5 ${gradeColor} ${provisional ? "opacity-50" : ""}`}>
                  {grade}{provisional ? "?" : ""}
                </span>
              )}
              <span className="truncate">⏱ 受付→報告 中央値{lt.med}日・平均{lt.avg}日（{lt.n}件）</span>
            </p>
            );
          })()}
          {u.role === "PARTNER" && (
            <button
              onClick={() => setLoginLogId(loginLogId === u.id ? null : u.id)}
              className="text-xs text-gray-500 hover:text-blue-400 transition text-left truncate w-full"
            >
              最終アクセス：{u.lastLoginAt
                ? new Date(u.lastLoginAt).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) +
                  " " + new Date(u.lastLoginAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })
                : "未ログイン"}{u.loginLogs?.length > 0 ? " ▾" : ""}
            </button>
          )}
        </div>
      </div>
      {/* ボタン行 */}
      <div className="flex gap-2 flex-wrap justify-end">
        {u.inviteToken && (
          <button
            onClick={() => {
              const url = `${window.location.origin}/register/${u.inviteToken}`;
              navigator.clipboard.writeText(url);
              alert("招待リンクをコピーしました");
            }}
            className="text-xs text-yellow-400 border border-yellow-400 rounded px-2 py-1 hover:bg-yellow-900/30 transition"
          >
            🔗 招待リンク
          </button>
        )}
        {u.role === "PARTNER" && !u.color && !u.inviteToken && (
          <button
            onClick={() => setColorPickerId(colorPickerId === u.id ? null : u.id)}
            className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:bg-gray-700/40 transition flex items-center gap-1"
          >
            <span className="w-3 h-3 rounded-full inline-block bg-gray-600" />
            カラー未設定
          </button>
        )}
        <button
          onClick={() => {
            setResetUserId(resetUserId === u.id ? null : u.id);
            setResetPassword("");
            setResetError("");
          }}
          className="text-xs text-blue-400 border border-blue-700 rounded px-2 py-1 hover:bg-blue-900/40 transition"
        >
          PW変更
        </button>
        {u.id !== myId && u.role !== "ADMIN" && (
          <button
            onClick={() => setConfirmDeleteId(confirmDeleteId === u.id ? null : u.id)}
            className="text-xs text-red-400 border border-red-700 rounded px-2 py-1 hover:bg-red-900/30 transition"
          >
            削除
          </button>
        )}
      </div>

      {/* ログイン履歴 */}
      {loginLogId === u.id && u.loginLogs?.length > 0 && (
        <div className="border border-gray-700 bg-gray-700/40 rounded-xl p-3 space-y-1">
          <p className="text-xs font-medium text-gray-300 mb-2">ログイン履歴（直近 {u.loginLogs.length}件）</p>
          {u.loginLogs.map((log, i) => (
            <p key={i} className="text-xs text-gray-400">
              {new Date(log.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" })}
              {" "}
              {new Date(log.createdAt).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" })}
            </p>
          ))}
        </div>
      )}

      {/* 基本情報（協力会社のみ） */}
      {u.role === "PARTNER" && (
        <>
          <button
            onClick={() => setProfileExpandId(profileExpandId === u.id ? null : u.id)}
            className="w-full text-left"
          >
            <div className="flex items-center justify-between text-xs text-gray-400 hover:text-gray-200 transition">
              <span className="flex items-center gap-1">
                📋 基本情報
                {(!u.address || !u.birthDate || !u.bloodType || !u.emergencyName || !u.emergencyPhone) && (
                  <span className="bg-red-900/40 text-red-400 px-1.5 py-0.5 rounded-full text-[10px] font-medium">未入力あり</span>
                )}
              </span>
              <span>{profileExpandId === u.id ? "▲" : "▼"}</span>
            </div>
          </button>
          {profileExpandId === u.id && (
            <div className="border border-gray-700 bg-gray-700/40 rounded-xl p-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                <div>
                  <span className="text-gray-500">住所</span>
                  <p className="text-gray-100 font-medium mt-0.5">{u.address || <span className="text-red-400">未入力</span>}</p>
                </div>
                <div>
                  <span className="text-gray-500">生年月日</span>
                  <p className="text-gray-100 font-medium mt-0.5">
                    {u.birthDate ? new Date(u.birthDate).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" }) : <span className="text-red-400">未入力</span>}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">血液型</span>
                  <p className="text-gray-100 font-medium mt-0.5">{u.bloodType ? `${u.bloodType}型` : <span className="text-red-400">未入力</span>}</p>
                </div>
                <div>
                  <span className="text-gray-500">緊急連絡先</span>
                  <p className="text-gray-100 font-medium mt-0.5">
                    {u.emergencyName && u.emergencyPhone
                      ? <>{u.emergencyName}<br />{u.emergencyPhone}</>
                      : <span className="text-red-400">未入力</span>}
                  </p>
                </div>
                {(u.licenseType || u.licenseNumber) && (
                  <div>
                    <span className="text-gray-500">電気工事士免許</span>
                    <p className="text-gray-100 font-medium mt-0.5">
                      {u.licenseType && <span>{u.licenseType} </span>}
                      {u.licenseNumber && <span>{u.licenseNumber}</span>}
                      {u.licenseExpiry && <span className="text-gray-400"> （{new Date(u.licenseExpiry).toLocaleDateString("ja-JP", { year: "numeric", month: "numeric", day: "numeric" })}まで）</span>}
                    </p>
                  </div>
                )}
                {u.vehicleNumber && (
                  <div>
                    <span className="text-gray-500">車両ナンバー</span>
                    <p className="text-gray-100 font-medium mt-0.5">{u.vehicleNumber}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* カラーピッカー */}
      {colorPickerId === u.id && (
        <div className="border border-gray-700 bg-gray-700/40 rounded-xl p-3 space-y-2">
          <p className="text-xs font-medium text-gray-300">表示カラーを選択</p>
          <div className="flex gap-2 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleColorSelect(u.id, c)}
                disabled={savingColor}
                className="w-8 h-8 rounded-full border-2 transition hover:scale-110 disabled:opacity-50"
                style={{
                  backgroundColor: c,
                  borderColor: u.color === c ? "#1e40af" : "transparent",
                  outline: u.color === c ? "2px solid #93c5fd" : "none",
                }}
              />
            ))}
            {u.color && (
              <button
                onClick={() => handleColorSelect(u.id, null)}
                disabled={savingColor}
                className="w-8 h-8 rounded-full border-2 border-gray-600 bg-gray-800 text-gray-500 text-xs hover:bg-gray-700 transition disabled:opacity-50"
                title="カラーをリセット"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* 削除確認 */}
      {confirmDeleteId === u.id && (
        <div className="border border-red-800 bg-red-900/30 rounded-lg px-3 py-3 space-y-2">
          <p className="text-xs font-medium text-red-300">「{u.companyName || u.name}」を削除しますか？</p>
          <div className="flex gap-2">
            <button
              onClick={() => handleDelete(u.id)}
              disabled={deleteLoading}
              className="flex-1 bg-red-900/300 text-white text-xs rounded-lg py-2 font-medium hover:bg-red-600 disabled:opacity-50 transition"
            >
              {deleteLoading ? "削除中..." : "削除する"}
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1 border border-gray-600 text-gray-300 text-xs rounded-lg py-2 hover:bg-gray-700/40 transition"
            >
              キャンセル
            </button>
          </div>
          {deleteError[u.id] && (
            <p className="text-xs text-red-400 font-medium">{deleteError[u.id]}</p>
          )}
        </div>
      )}

      {/* PW変更フォーム */}
      {resetUserId === u.id && (
        <div className="border-t border-gray-700 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-300">新しいパスワードを設定</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={resetPassword}
              onChange={(e) => setResetPassword(e.target.value)}
              placeholder="新しいパスワード（4文字以上）"
              className="flex-1 border border-gray-600 rounded-lg px-3 py-1.5 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={() => handleResetPassword(u.id)}
              disabled={resetLoading || !resetPassword.trim()}
              className="bg-blue-600 text-white text-xs px-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap"
            >
              {resetLoading ? "保存中" : "保存"}
            </button>
            <button
              onClick={() => { setResetUserId(null); setResetPassword(""); }}
              className="text-gray-500 text-xs px-2 hover:text-gray-300"
            >
              ✕
            </button>
          </div>
          {resetError && <p className="text-xs text-red-500">{resetError}</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-full flex flex-col bg-gray-900 [color-scheme:dark]">
      <Header />
      <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">ユーザー管理</h2>
          <button
            onClick={() => { setShowForm(!showForm); setNewRole("PARTNER"); }}
            className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition"
          >
            ＋ 追加
          </button>
        </div>

        {/* 招待URL発行ダイアログ */}
        {inviteUrl && (
          <div className="bg-blue-900/40 border border-blue-700 rounded-xl p-4 mb-6 space-y-3">
            <p className="text-sm font-bold text-blue-300">🔗 招待リンクが発行されました</p>
            <p className="text-xs text-blue-400">このリンクを相手に送ってください。相手がリンクを開いてログインIDとパスワードを設定します。</p>
            <div className="flex gap-2">
              <input readOnly value={inviteUrl}
                className="flex-1 bg-gray-800 border border-blue-700 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none" />
              <button
                onClick={() => { navigator.clipboard.writeText(inviteUrl); alert("コピーしました"); }}
                className="bg-blue-600 text-white text-xs px-3 rounded-lg hover:bg-blue-700 transition whitespace-nowrap">
                コピー
              </button>
            </div>
            <button onClick={() => setInviteUrl(null)} className="text-xs text-blue-400 hover:text-blue-400">閉じる</button>
          </div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl border border-gray-700 p-5 mb-6 space-y-3" onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}>
            <h3 className="text-sm font-bold text-gray-200">新しいユーザーを追加</h3>
            <div className="flex gap-2">
              {(["PARTNER", "ADMIN"] as const).map((r) => (
                <button key={r} type="button" onClick={() => setNewRole(r)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    newRole === r ? "bg-blue-600 text-white border-blue-600" : "bg-gray-800 text-gray-300 border-gray-600 hover:border-blue-400"
                  }`}>
                  {r === "ADMIN" ? "管理者" : "協力会社"}
                </button>
              ))}
            </div>
            {newRole === "ADMIN" && (
              <>
                <input type="text" required placeholder="名前" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} />
                <input type="text" required placeholder="ログインID（例: admin01）" value={form.email}
                  autoCapitalize="none" autoCorrect="off"
                  onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputClass} />
                <input type="password" required placeholder="初期パスワード" value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputClass} />
              </>
            )}
            {newRole === "PARTNER" && (
              <p className="text-xs text-blue-400 bg-blue-900/40 rounded-lg px-3 py-2">
                🔗 追加すると招待リンクが発行されます。相手に送るとログインID・パスワード・名前などを自分で設定できます。
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={loading}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
                {loading ? "追加中..." : "追加する"}
              </button>
              <button type="button" onClick={() => setShowForm(false)}
                className="flex-1 border border-gray-600 text-gray-300 rounded-lg py-2 text-sm hover:bg-gray-700/40 transition">
                キャンセル
              </button>
            </div>
          </form>
        )}

        <div className="mb-6">
          <p className="text-xs font-bold text-gray-400 mb-2 px-1">👑 管理者 ({admins.length})</p>
          <div className="space-y-3">{admins.map(renderUserCard)}</div>
        </div>

        {/* 🗺 対応エリアマップ: 重なり・空白地帯の確認用 */}
        <div className="mb-4">
          <button
            onClick={() => setShowAreaMap(!showAreaMap)}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-800 rounded-xl border border-gray-700 text-sm text-gray-200 hover:bg-gray-700 transition"
          >
            <span>🗺 対応エリアマップ（重なり・手薄なところを確認）</span>
            <span className="text-gray-500">{showAreaMap ? "▲ 閉じる" : "▼ 表示"}</span>
          </button>
          {showAreaMap && (() => {
            const covered = partners.filter((u) => (u.serviceAreas?.length ?? 0) > 0);
            const colorOf = (u: User) => u.color || "#9ca3af";
            const nameOf = (u: User) => u.companyName || u.name;
            const prefOrder = ["群馬県", "栃木県", "埼玉県", "茨城県"];
            // 市町村ごとの対応会社（県全域は展開して含める）
            const coverOf = (pref: string, city: string) =>
              covered.filter((u) => u.serviceAreas!.includes(pref) || u.serviceAreas!.includes(city));
            return (
              <div className="mt-2 bg-gray-800 rounded-xl border border-gray-700 p-3 space-y-3">
                <div className="flex items-center gap-2">
                  {(["map", "list"] as const).map((md) => (
                    <button key={md} onClick={() => setMapMode(md)}
                      className={`text-xs rounded-lg px-3 py-1.5 border transition ${mapMode === md ? "bg-blue-600 text-white border-blue-600" : "text-gray-300 border-gray-600"}`}>
                      {md === "map" ? "🗾 地図" : "📋 一覧"}
                    </button>
                  ))}
                  <div className="flex flex-wrap gap-1.5 ml-auto">
                    {covered.map((u) => {
                      const off = hiddenPartners.has(u.id);
                      return (
                        <button key={u.id}
                          onClick={() => setHiddenPartners((prev) => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })}
                          className={`flex items-center gap-1 text-[11px] rounded-full px-2 py-1 border transition ${off ? "opacity-40 border-gray-700 text-gray-500" : "border-gray-600 text-gray-200"}`}
                          title="タップで地図の表示/非表示を切替">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: colorOf(u) }} />
                          {nameOf(u)}{off ? "（非表示）" : ""}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {mapMode === "map" && (
                  !geo ? (
                    <p className="text-center text-gray-500 text-sm py-8">地図を読み込み中...</p>
                  ) : (
                    <div>
                      <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="w-full h-auto rounded-lg bg-gray-950">
                        <defs>
                          {/* 重なり用ストライプ: 表示中の会社の組み合わせごとに生成 */}
                          {(() => {
                            const combos = new Map<string, User[]>();
                            geo.m.forEach((mu) => {
                              const cov = coverOf(mu.p, mu.n).filter((u) => !hiddenPartners.has(u.id));
                              if (cov.length > 1) combos.set(cov.map((u) => u.id).sort().join("+"), cov);
                            });
                            return Array.from(combos.entries()).map(([key, us]) => (
                              <pattern key={key} id={`pat-${key}`} patternUnits="userSpaceOnUse" width={10 * us.length} height={10 * us.length} patternTransform="rotate(45)">
                                {us.map((u, i) => (
                                  <rect key={u.id} x={i * 10} y={0} width={10} height={10 * us.length} fill={colorOf(u)} />
                                ))}
                              </pattern>
                            ));
                          })()}
                        </defs>
                        {geo.m.map((mu) => {
                          const cov = coverOf(mu.p, mu.n).filter((u) => !hiddenPartners.has(u.id));
                          const fill = cov.length === 0
                            ? "#1f2937"
                            : cov.length === 1
                            ? colorOf(cov[0])
                            : `url(#pat-${cov.map((u) => u.id).sort().join("+")})`;
                          const multi = cov.length > 1;
                          const isSel = selMuni?.p === mu.p && selMuni?.n === mu.n;
                          return mu.g.map((ring, ri) => (
                            <polygon
                              key={mu.p + mu.n + ri}
                              points={ring.map((pt) => pt.join(",")).join(" ")}
                              fill={fill}
                              fillOpacity={cov.length === 0 ? 1 : 0.85}
                              stroke={isSel ? "#ffffff" : multi ? "#fbbf24" : "#374151"}
                              strokeWidth={isSel ? 3 : multi ? 2 : 0.7}
                              onClick={() => setSelMuni(isSel ? null : { p: mu.p, n: mu.n })}
                              className="cursor-pointer"
                            />
                          ));
                        })}
                        {/* 市町村名ラベル（大きめの市町村＋選択中のみ。読みやすさ優先） */}
                        {geo.m.map((mu) => {
                          const ring = mu.g[0];
                          if (!ring) return null;
                          // 重心とおおよその横幅
                          let cx = 0, cy = 0, minX = 1e9, maxX = -1e9;
                          ring.forEach(([x, y]) => { cx += x; cy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
                          cx /= ring.length; cy /= ring.length;
                          const width = maxX - minX;
                          const isSel = selMuni?.p === mu.p && selMuni?.n === mu.n;
                          if (width < 34 && !isSel) return null; // 小さい町村はラベル省略（タップで名前が出る）
                          const short = mu.n.replace(/(市|町|村)$/, "");
                          return (
                            <text
                              key={`label-${mu.p}-${mu.n}`}
                              x={cx}
                              y={cy}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize={isSel ? 15 : 11}
                              fontWeight="bold"
                              fill="#ffffff"
                              stroke="#111827"
                              strokeWidth={2.5}
                              paintOrder="stroke"
                              pointerEvents="none"
                            >{short}</text>
                          );
                        })}
                      </svg>
                      <div className="flex items-center justify-between mt-1.5">
                        {selMuni ? (() => {
                          const cov = coverOf(selMuni.p, selMuni.n);
                          return (
                            <p className="text-xs text-gray-200">
                              <span className="font-bold">{selMuni.n}</span>（{selMuni.p}）:
                              {cov.length === 0 ? <span className="text-red-400"> 対応業者なし</span> : cov.map((u) => (
                                <span key={u.id} className="ml-1.5 text-white rounded px-1.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: colorOf(u) }}>{nameOf(u)}</span>
                              ))}
                            </p>
                          );
                        })() : (
                          <p className="text-[11px] text-gray-500">タップで詳細。<span className="text-amber-300">縞模様＝複数社が重なるエリア</span>（色の組合せ=その会社たち）、濃いグレー＝未カバー。上の会社名タップで表示切替</p>
                        )}
                        <p className="text-[10px] text-gray-600 shrink-0 ml-2">出典: 国土数値情報（国交省）を加工</p>
                      </div>
                    </div>
                  )
                )}
                {mapMode === "list" && (<>
                {covered.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">対応エリアを設定した協力会社がまだいません</p>
                )}
                {prefOrder.map((pref) => {
                  const cities = PREF_CITIES[pref];
                  const fullCover = covered.filter((u) => u.serviceAreas!.includes(pref));
                  const partials = covered
                    .map((u) => ({ u, cities: cities.filter((c) => u.serviceAreas!.includes(c)) }))
                    .filter((x) => x.cities.length > 0 && !x.u.serviceAreas!.includes(pref));
                  const coveredSet = new Set<string>();
                  if (fullCover.length > 0) cities.forEach((c) => coveredSet.add(c));
                  partials.forEach((x) => x.cities.forEach((c) => coveredSet.add(c)));
                  const uncovered = cities.filter((c) => !coveredSet.has(c));
                  const rate = Math.round((coveredSet.size / cities.length) * 100);
                  return (
                    <div key={pref} className="border border-gray-700 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-gray-900/60">
                        <p className="text-sm font-bold text-gray-100">{pref}</p>
                        <p className={`text-xs font-bold ${rate === 100 ? "text-green-400" : rate >= 50 ? "text-amber-300" : "text-red-400"}`}>
                          カバー率 {rate}%（{coveredSet.size}/{cities.length}）
                        </p>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {fullCover.length === 0 && partials.length === 0 && (
                          <p className="text-xs text-gray-500">対応している会社なし</p>
                        )}
                        {fullCover.map((u) => (
                          <div key={u.id} className="flex items-center gap-2 text-sm">
                            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: colorOf(u) }} />
                            <span className="text-gray-100 font-medium">{nameOf(u)}</span>
                            <span className="text-xs text-white rounded-full px-2 py-0.5 font-bold" style={{ backgroundColor: colorOf(u) }}>全域OK</span>
                          </div>
                        ))}
                        {partials.map(({ u, cities: cs }) => (
                          <div key={u.id} className="flex items-start gap-2 text-sm">
                            <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: colorOf(u) }} />
                            <span className="text-gray-100 font-medium shrink-0">{nameOf(u)}</span>
                            <span className="text-xs text-gray-300 leading-relaxed">{cs.join("・")}</span>
                          </div>
                        ))}
                        {uncovered.length > 0 ? (
                          <div className="pt-1 border-t border-gray-700/60">
                            <button
                              onClick={() => setUncoveredOpen(uncoveredOpen === pref ? null : pref)}
                              className="text-xs text-amber-300/90 hover:text-amber-200 underline underline-offset-2"
                            >⚠ 未カバー {uncovered.length}市町村 {uncoveredOpen === pref ? "▲ たたむ" : "▼ 見る"}</button>
                            {uncoveredOpen === pref && (
                              <p className="text-xs text-gray-500 leading-relaxed mt-1">{uncovered.join("・")}</p>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-green-400 pt-1 border-t border-gray-700/60">✓ 全市町村カバー</p>
                        )}
                      </div>
                    </div>
                  );
                })}
                </>)}
              </div>
            );
          })()}
        </div>

        <div>
          <p className="text-xs font-bold text-gray-400 mb-2 px-1">🏢 協力会社 ({partners.length})</p>
          <div className="space-y-3">
            {partners.map(renderUserCard)}
            {partners.length === 0 && (
              <p className="text-center text-gray-500 py-6 text-sm">協力会社が登録されていません</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
