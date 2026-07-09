"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/components/Header";

const VERSION = "2026年6月";
const CHANGELOG = [
  { date: "2026年6月", text: "要対応ボックス・依頼タブのバッジ・放置検知を追加" },
  { date: "2026年6月", text: "チャット内のURLをタップで開けるように" },
  { date: "2026年6月", text: "モバイル用ボトムナビ追加（依頼/チャット/完了済/設定）" },
  { date: "2026年6月", text: "協力会社の招待リンク登録フロー追加" },
  { date: "2026年6月", text: "マイチャット（自分へのメモ）機能追加" },
  { date: "2026年5月", text: "完了済依頼ページ・費用集計CSV出力" },
];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden mb-4">
      <div className="px-4 py-3 bg-gray-800/50 border-b border-gray-700">
        <p className="text-sm font-bold text-gray-200">{title}</p>
      </div>
      <div className="px-4 py-4 space-y-2.5 text-sm text-gray-200">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 text-gray-400 w-28 text-xs pt-0.5">{label}</span>
      <span className="flex-1 text-gray-100 text-xs leading-relaxed">{children}</span>
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
    return <div className="min-h-full flex items-center justify-center bg-gray-950"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-full flex flex-col bg-gray-950">
      <Header />
      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white text-lg">←</button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">使い方ガイド</h2>
            <p className="text-xs text-gray-400 mt-0.5">最終更新: {VERSION}</p>
          </div>
        </div>

        {/* ── 共通：画面構成 ── */}
        <Section title="📱 画面構成（モバイル）">
          <Row label="下部タブバー">画面下に常時表示。5つのタブで各機能にアクセスできます。</Row>
          <Row label="依頼">案件一覧・新規作成はここから。対応が必要な件数が赤バッジで表示されます。</Row>
          <Row label="チャット">管理者・協力会社間のメッセージ。自分へのメモ（マイチャット）も使えます。</Row>
          <Row label="完了済">完了した案件と請求金額の確認。</Row>
          <Row label="設定">プロフィール・通知・各種設定はここから。</Row>
        </Section>

        {/* ── 協力会社向け ── */}
        {role === "PARTNER" && (
          <>
            <Section title="🚀 はじめてログインしたら">
              <Row label="初回設定">ログイン後に初回設定画面が表示されます。屋号または会社名・住所・生年月日・血液型・緊急連絡先・自社カラーをすべて入力すると利用開始できます。</Row>
              <Row label="自社カラー">依頼一覧で自社の依頼を色で識別するために使います。一度設定すると変更できません。</Row>
            </Section>

            <Section title="📋 依頼タブ（案件一覧）">
              <Row label="⚡ 要対応">一覧の最上部に、いま対応が必要な依頼が自動で表示されます（受注の判断・再報告・見積り提出など）。ここを上から処理すればOKです。</Row>
              <Row label="青い枠の依頼">未確認の更新があります。優先して確認してください。</Row>
              <Row label="ステータスの流れ">
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

            <Section title="✅ 依頼への対応">
              <Row label="受注する">依頼をタップし「受注する」ボタンを押してください。</Row>
              <Row label="辞退する">対応できない場合は「辞退する」を押すと管理者に戻ります。</Row>
            </Section>


            <Section title="📷 作業完了後の報告">
              <Row label="提出場所">依頼詳細の「📋 完了報告する」ボタンから提出します。</Row>
              <Row label="入力内容">作業日・作業内容・写真（作業前後）</Row>
              <Row label="修理が必要な場合">作業内容で「修理・交換が必要」を選ぶと、管理者から見積りを依頼される場合があります。</Row>
              <Row label="再報告">「再報告待ち」になった場合は内容を修正して「再報告する」を押してください。</Row>
            </Section>

            <Section title="📄 見積りの提出">
              <Row label="タイミング">管理者から依頼されるとステータスが「見積依頼」になります。</Row>
              <Row label="提出場所">依頼詳細の「見積もりを提出する」ボタンをタップ</Row>
              <Row label="入力内容">金額・備考・見積書ファイル（PDF等）を添付して送信</Row>
            </Section>

            <Section title="💬 チャットタブ">
              <Row label="スレッド一覧">管理者との会話が案件ごとに表示されます。</Row>
              <Row label="マイチャット">一番上の「📝 マイチャット」は自分だけのメモ帳として使えます。</Row>
              <Row label="未読バッジ">未読メッセージがあるとタブに数字バッジが表示されます。</Row>
            </Section>


            <Section title="💰 完了済タブ">
              <Row label="表示内容">完了した案件と請求金額を月ごとに確認できます。</Row>
              <Row label="件名タップ">案件の詳細ページに移動します。</Row>
            </Section>

            <Section title="⚙️ 設定タブ">
              <Row label="プロフィール画像">設定ページ上部から変更できます。</Row>
              <Row label="電話番号">設定ページから登録・変更できます。</Row>
              <Row label="基本情報">住所・生年月日・緊急連絡先などを更新できます。</Row>
              <Row label="パスワード変更">設定ページ下部から変更できます。</Row>
              <Row label="交換機種表">設定ページから参照できます。</Row>
            </Section>
          </>
        )}

        {/* ── 管理者向け ── */}
        {role === "ADMIN" && (
          <>
            <Section title="📋 依頼タブ（案件一覧）">
              <Row label="⚡ 要対応">一覧の最上部に、いま対応が必要な依頼が自動で表示されます（完了報告の確認・見積りの確認・担当未割り当て・3日以上未受注など）。ここを上から処理すればOKです。</Row>
              <Row label="新規依頼">右上「＋ 新規依頼」から案件を登録します。</Row>
              <Row label="青い枠の依頼">協力会社から更新があった案件です（報告・コメントなど）。</Row>
              <Row label="絞り込み">ステータス・緊急度・地域・協力会社で絞り込み可能。</Row>
              <Row label="並べ替え">緊急順 / 状態順 / 地域順で切り替えられます。</Row>
            </Section>

            <Section title="📝 新規依頼の登録">
              <Row label="依頼名">右端「▼」で設定済みのテンプレートから選択すると金額・緊急度が自動入力されます。</Row>
              <Row label="必須項目">物件名・住所・依頼名</Row>
              <Row label="担当割り当て">「担当協力会社」で担当を選択すると相手に通知されます。</Row>
            </Section>

            <Section title="📋 完了報告・見積りの確認">
              <Row label="完了報告後の操作">
                <span>協力会社が報告を提出するとステータスが「完了報告済」になります。<br />
                ・そのまま完了 → 「✅ 確認・完了する」<br />
                ・修理見積りが必要 → 「📋 見積依頼する」<br />
                ・内容に問題あり → 「↩ 差し戻す」</span>
              </Row>
              <Row label="見積り依頼後">
                <span>
                  <Badge color="bg-orange-100 text-orange-700">見積依頼</Badge>
                  → 協力会社が見積りを提出 →
                  <Badge color="bg-orange-100 text-orange-700">見積り中</Badge>
                  → 「✅ 確認・完了する」で完了
                </span>
              </Row>
            </Section>

            <Section title="💬 チャットタブ">
              <Row label="スレッド一覧">協力会社ごとの会話が表示されます。</Row>
              <Row label="マイチャット">一番上の「📝 マイチャット」は自分だけのメモ帳として使えます。</Row>
              <Row label="未読バッジ">未読メッセージがあるとタブに数字バッジが表示されます。</Row>
            </Section>


            <Section title="💰 完了済タブ">
              <Row label="絞り込み">月・協力会社で絞り込めます。</Row>
              <Row label="CSV出力">「CSV出力」ボタンで費用データをダウンロードできます。</Row>
            </Section>

            <Section title="⚙️ 設定タブ">
              <Row label="ユーザー管理">「＋ 追加」から管理者または協力会社を追加できます。協力会社は招待リンクを発行して相手に送ります。</Row>
              <Row label="招待リンク">相手がリンクを開いてログインID・パスワード・名前・会社名を自分で設定します。完了後に自動でログイン可能になります。</Row>
              <Row label="依頼名テンプレート">よく使う依頼名と既定金額・緊急度を登録できます。</Row>
              <Row label="季節メッセージ">月次の感謝メッセージや季節ごとのアニメーション付きメッセージを設定できます。</Row>
              <Row label="見積り">設定ページから見積り画面に移動できます。</Row>
              <Row label="交換機種表">設定ページから参照できます。</Row>
              <Row label="カラー設定">ユーザー管理ページで協力会社ごとに表示カラーを設定できます。</Row>
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
