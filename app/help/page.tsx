"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/components/Header";

// ── バージョン・更新履歴 ──────────────────────────────
const VERSION = "2026年5月";
const CHANGELOG = [
  { date: "2026年5月", text: "カレンダー機能追加・訪問時間帯入力に対応" },
  { date: "2026年5月", text: "完了済依頼ページの追加・費用集計CSV出力" },
  { date: "2026年5月", text: "依頼名（作業種別）・絞り込み機能の強化" },
];
// ────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
        <p className="text-sm font-bold text-gray-700">{title}</p>
      </div>
      <div className="px-4 py-4 space-y-2 text-sm text-gray-700">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 text-gray-400 w-28 text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-gray-800 text-xs leading-relaxed">{children}</span>
    </div>
  );
}

function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium mr-1 ${color}`}>
      {children}
    </span>
  );
}

export default function HelpPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as { role?: string })?.role;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-500">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">使い方ガイド</h2>
            <p className="text-xs text-gray-500 mt-0.5">最終更新: {VERSION}</p>
          </div>
        </div>

        {/* ── 協力会社向け ── */}
        {role === "PARTNER" && (
          <>
            <Section title="📋 ホーム画面（依頼一覧）">
              <Row label="青い枠の依頼">未確認の更新があります。優先して確認してください。</Row>
              <Row label="カレンダーボタン">右上「📅 カレンダー」から訪問予定の一覧を確認できます。</Row>
              <Row label="完了済依頼">ヘッダーの「完了済依頼」から過去の案件・請求金額を確認できます。</Row>
            </Section>

            <Section title="✅ 依頼への対応">
              <Row label="受注する">依頼をタップし「受注する」ボタンを押してください。</Row>
              <Row label="辞退する">対応できない場合は「辞退する」を押すと管理者に戻ります。</Row>
              <Row label="通常の流れ">
                <span className="flex gap-1 flex-wrap items-center">
                  <Badge color="bg-yellow-100 text-yellow-700">依頼中</Badge>→
                  <Badge color="bg-blue-100 text-blue-700">受注済</Badge>→
                  <Badge color="bg-purple-100 text-purple-700">完了報告済</Badge>→
                  <Badge color="bg-green-100 text-green-700">確認済</Badge>
                </span>
              </Row>
              <Row label="見積りが必要な場合">
                <span className="flex gap-1 flex-wrap items-center">
                  <Badge color="bg-purple-100 text-purple-700">完了報告済</Badge>→
                  <Badge color="bg-orange-100 text-orange-700">見積依頼</Badge>→
                  <Badge color="bg-orange-100 text-orange-700">見積り中</Badge>→
                  <Badge color="bg-green-100 text-green-700">確認済</Badge>
                </span>
              </Row>
            </Section>

            <Section title="📅 訪問予定日・時間の設定（重要）">
              <Row label="設定場所">依頼詳細の「📅 訪問予定日」欄</Row>
              <Row label="手順">日付を選択 → 時間帯を選択（例：10時〜12時）→「保存」</Row>
              <Row label="ポイント">管理者のカレンダーにも反映されます。日程が決まったら必ず入力してください。</Row>
              <Row label="変更できる期間">受注済・再報告待ち中のみ変更可能です。</Row>
            </Section>

            <Section title="📷 作業完了後の報告">
              <Row label="提出場所">依頼詳細の「📋 完了報告する」ボタンから提出します。</Row>
              <Row label="入力内容">作業日・作業内容・写真（作業前後）</Row>
              <Row label="修理が必要な場合">作業内容で「修理・交換が必要」を選ぶと管理者に修理が必要な旨が伝わります。管理者から見積りを依頼される場合があります。</Row>
              <Row label="再報告">「再報告待ち」になった場合は内容を修正して再度「再報告する」を押してください。</Row>
              <Row label="注意">報告写真はチャットではなく「完了報告する」ボタンから提出してください。</Row>
            </Section>

            <Section title="📄 見積りの提出">
              <Row label="タイミング">管理者から見積りを依頼されると、ステータスが「見積依頼」になります。</Row>
              <Row label="提出場所">依頼詳細の「見積もりを提出する」ボタンをタップ</Row>
              <Row label="入力内容">金額・備考・見積書ファイル（PDF等）を添付して送信</Row>
              <Row label="提出後">管理者が確認するとステータスが「見積り中」に変わります。承認されると「確認済」になります。</Row>
              <Row label="ポイント">見積りを提出しても、管理者が「見積りなしで確認・完了」を選ぶ場合もあります。</Row>
            </Section>

            <Section title="💬 チャット">
              <Row label="使い方">依頼詳細の下部で管理者とやりとりができます。</Row>
              <Row label="送信">Enterキーで送信、Shift+Enterで改行。</Row>
              <Row label="用途">日程調整・質問・連絡事項などに使ってください。</Row>
            </Section>

            <Section title="📅 カレンダー">
              <Row label="表示内容">訪問予定日が入った案件が月カレンダーに表示されます。</Row>
              <Row label="日付タップ">その日の訪問予定が時間の早い順に一覧表示されます。</Row>
            </Section>

            <Section title="💰 完了済依頼・請求金額">
              <Row label="確認方法">ヘッダーの「完了済依頼」をタップ</Row>
              <Row label="表示内容">完了した案件と請求金額を月ごとに確認できます。</Row>
              <Row label="件名タップ">案件の詳細ページに移動します。</Row>
            </Section>
          </>
        )}

        {/* ── 管理者向け ── */}
        {role === "ADMIN" && (
          <>
            <Section title="📋 ホーム画面（依頼一覧）">
              <Row label="新規依頼">右上「＋ 新規依頼」から案件を登録します。</Row>
              <Row label="青い枠の依頼">協力会社から更新があった案件です（報告・コメントなど）。</Row>
              <Row label="絞り込み">「絞り込み」ボタンでステータス・緊急度・地域・協力会社で絞り込み可能。</Row>
              <Row label="並べ替え">訪問順 / 緊急順 / 状態順 / 地域順で切り替えられます。</Row>
              <Row label="進行中カード">7件超で黄色、9件超で赤に変わります。案件が増えすぎているサインです。</Row>
            </Section>

            <Section title="📝 新規依頼の登録">
              <Row label="依頼名">作業種別を入力。右端「▼」で設定済みのテンプレートから選択すると金額・緊急度が自動入力されます。</Row>
              <Row label="必須項目">物件名・住所・依頼名</Row>
              <Row label="担当割り当て">「担当協力会社」で担当を選択すると相手に通知されます。</Row>
            </Section>

            <Section title="📋 完了報告・見積りの確認と操作">
              <Row label="完了報告後の操作">
                <span>協力会社が報告を提出するとステータスが「完了報告済」になります。<br />
                ・そのまま完了 → 「✅ 確認・完了する」<br />
                ・修理見積りが必要 → 「📋 見積依頼する」<br />
                ・内容に問題あり → 「↩ 差し戻す（再報告要求）」</span>
              </Row>
              <Row label="見積り依頼後の流れ">
                <span>
                  <Badge color="bg-orange-100 text-orange-700">見積依頼</Badge>
                  → 協力会社が見積りを提出 →
                  <Badge color="bg-orange-100 text-orange-700">見積り中</Badge>
                  → 「✅ 確認・完了する」で完了
                </span>
              </Row>
              <Row label="見積書の確認">依頼詳細の「見積もり」セクションで提出内容・金額・添付ファイルを確認できます。</Row>
              <Row label="見積りなしで完了">修理報告後でも「見積依頼する」を使わず直接「確認・完了する」を押すことができます。</Row>
            </Section>

            <Section title="📅 カレンダー">
              <Row label="表示内容">全協力会社の訪問予定を一覧確認できます。</Row>
              <Row label="色分け">ユーザー管理でカラーを設定した会社はドットの色で識別できます。</Row>
              <Row label="絞り込み">右上ドロップダウンで会社ごとに絞り込み可能です。</Row>
            </Section>

            <Section title="💰 完了済依頼・費用集計">
              <Row label="確認方法">ヘッダーの「完了済依頼」をタップ</Row>
              <Row label="絞り込み">月・協力会社で絞り込めます。</Row>
              <Row label="CSV出力">「CSV出力」ボタンで費用データをダウンロードできます。</Row>
            </Section>

            <Section title="⚙️ 設定・ユーザー管理">
              <Row label="依頼名テンプレート">設定ページで依頼名と既定金額・緊急度を登録できます。</Row>
              <Row label="カラー設定">ユーザー管理ページで協力会社ごとにカレンダー表示カラーを設定できます。</Row>
              <Row label="PW変更">ユーザー管理ページから各ユーザーのパスワードを変更できます。</Row>
            </Section>
          </>
        )}

        {/* ── 更新履歴 ── */}
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden mt-6">
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-sm font-bold text-gray-300">🆕 アップデート履歴</p>
          </div>
          <div className="px-4 py-3 space-y-2">
            {CHANGELOG.map((c, i) => (
              <div key={i} className="flex gap-3">
                <span className="text-xs text-gray-500 shrink-0 w-20">{c.date}</span>
                <span className="text-xs text-gray-300">{c.text}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
