"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RegisterPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [myCompanyName, setMyCompanyName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/register?token=${token}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInvalid(true); }
        else { setCompanyName(data.companyName); }
      })
      .catch(() => setInvalid(true))
      .finally(() => setChecking(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== passwordConfirm) { setError("パスワードが一致しません"); return; }
    if (password.length < 4) { setError("パスワードは4文字以上必要です"); return; }

    setLoading(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, loginId: loginId.trim(), password, name: name.trim() || null, companyName: myCompanyName.trim() || null }),
    });
    const data = await res.json();
    if (res.ok) {
      setDone(true);
    } else {
      setError(data.error || "エラーが発生しました");
    }
    setLoading(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">確認中...</p>
      </div>
    );
  }

  if (invalid) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">⚠️</p>
          <p className="text-white font-bold text-lg mb-2">招待リンクが無効です</p>
          <p className="text-gray-400 text-sm">リンクの有効期限が切れているか、すでに使用済みです。</p>
          <p className="text-gray-500 text-sm mt-2">管理者に新しいリンクを発行してもらってください。</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-4xl mb-4">✅</p>
          <p className="text-white font-bold text-lg mb-2">登録が完了しました</p>
          <p className="text-gray-400 text-sm mb-6">設定したログインIDとパスワードでログインできます。</p>
          <button
            onClick={() => router.push("/login")}
            className="bg-blue-600 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-blue-700 transition"
          >
            ログイン画面へ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-sm p-8">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2">⚡</div>
          <h1 className="text-lg font-bold text-gray-800">アカウント設定</h1>
          {companyName && <p className="text-sm text-gray-500 mt-1">{companyName}</p>}
          <p className="text-xs text-gray-400 mt-2">ログインIDとパスワードを設定してください</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">お名前 <span className="text-red-400 text-xs">*</span></label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="例: 鈴木 太郎"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">屋号または会社名 <span className="text-red-400 text-xs">*</span></label>
            <input
              type="text"
              value={myCompanyName}
              onChange={e => setMyCompanyName(e.target.value)}
              required
              placeholder="例: 株式会社○○電気"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ログインID</label>
            <input
              type="text"
              value={loginId}
              onChange={e => setLoginId(e.target.value)}
              required
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="例: tanaka, abc123"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="4文字以上"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">パスワード（確認）</label>
            <input
              type="password"
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              required
              placeholder="もう一度入力"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !name.trim() || !myCompanyName.trim() || !loginId.trim() || !password || !passwordConfirm}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {loading ? "設定中..." : "設定して始める"}
          </button>
        </form>
      </div>
    </div>
  );
}
