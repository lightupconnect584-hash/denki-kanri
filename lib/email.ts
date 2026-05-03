import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM = process.env.EMAIL_FROM || "noreply@resend.dev";
const APP_URL = process.env.NEXTAUTH_URL || "https://denki-kanri.vercel.app";

async function send(to: string | string[], subject: string, html: string) {
  if (!resend) return; // API key未設定時はスキップ
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch {
    // メール送信失敗はアプリの動作を止めない
  }
}

function card(title: string, body: string, projectId: string, projectTitle: string) {
  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="color:#1e40af;margin-bottom:4px">📋 ${title}</h2>
      <p style="color:#6b7280;font-size:14px;margin-top:0">案件: <b>${projectTitle}</b></p>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;font-size:14px;color:#374151">
        ${body}
      </div>
      <a href="${APP_URL}/projects/${projectId}"
         style="display:inline-block;background:#2563eb;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-size:14px">
        案件を確認する →
      </a>
    </div>`;
}

// 点検報告が届いた（→管理者へ）
export async function notifyInspectionSubmitted(
  adminEmails: string[], projectId: string, projectTitle: string,
  inspectorName: string, result: string, workDate: string
) {
  const resultText = result === "REPAIR_NEEDED" ? "🔧 修理が必要" : "✅ 問題なし";
  await send(adminEmails,
    `【点検報告】${projectTitle}`,
    card("点検報告が届きました", `
      <p>担当: <b>${inspectorName}</b></p>
      <p>作業日: <b>${workDate}</b></p>
      <p>結果: <b>${resultText}</b></p>`, projectId, projectTitle));
}

// 見積もりが届いた（→管理者へ）
export async function notifyQuoteSubmitted(
  adminEmails: string[], projectId: string, projectTitle: string,
  partnerName: string, amount: number | null
) {
  const amountText = amount ? `¥${amount.toLocaleString()}` : "金額未記入";
  await send(adminEmails,
    `【見積提出】${projectTitle}`,
    card("見積もりが届きました", `
      <p>提出者: <b>${partnerName}</b></p>
      <p>金額: <b>${amountText}</b></p>`, projectId, projectTitle));
}

// 見積もりが承認/却下された（→協力会社へ）
export async function notifyQuoteResult(
  partnerEmail: string, projectId: string, projectTitle: string, approved: boolean
) {
  const label = approved ? "✅ 承認されました" : "❌ 却下されました";
  await send(partnerEmail,
    `【見積${approved ? "承認" : "却下"}】${projectTitle}`,
    card(`見積もりが${approved ? "承認" : "却下"}されました`,
      `<p>提出した見積もりが<b>${label}</b></p>`, projectId, projectTitle));
}

// 新しいコメント（→相手側へ）
export async function notifyNewComment(
  toEmails: string[], projectId: string, projectTitle: string,
  authorName: string, content: string
) {
  await send(toEmails,
    `【コメント】${projectTitle}`,
    card("新しいコメントが届きました", `
      <p>投稿者: <b>${authorName}</b></p>
      <p>${content.replace(/\n/g, "<br>")}</p>`, projectId, projectTitle));
}

// 案件が割り当てられた（→協力会社へ）
export async function notifyProjectAssigned(
  partnerEmail: string, projectId: string, projectTitle: string, location: string
) {
  await send(partnerEmail,
    `【新規案件】${projectTitle}`,
    card("新しい案件が割り当てられました", `
      <p>物件名: <b>${projectTitle}</b></p>
      <p>住所: <b>${location}</b></p>`, projectId, projectTitle));
}
