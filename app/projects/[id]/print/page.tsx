"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

interface Project {
  id: string;
  title: string;
  location: string;
  roomNumber: string | null;
  workType: string | null;
  contractorName: string | null;
  contractorPhone: string | null;
  smsAllowed: boolean;
  description: string | null;
  preferredContactAt: string | null;
  preferredVisitAt: string | null;
  moveInDate: string | null;
  urgency: string;
  materialSupplied: boolean;
  dueDate: string | null;
  createdAt: string;
  assignedTo: { name: string; companyName: string | null } | null;
}

const urgencyLabel = (u: string) => (u === "HIGH" ? "高" : u === "MEDIUM" ? "中" : "低");

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value || <span style={{ color: "#bbb" }}>—</span>}</td>
    </tr>
  );
}

export default function ProjectPrintPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setProject(data);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return <div style={{ padding: 40, textAlign: "center", color: "#666" }}>読み込み中...</div>;
  }
  if (!project) {
    return <div style={{ padding: 40, textAlign: "center", color: "#666" }}>依頼が見つかりませんでした</div>;
  }

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("ja-JP") : "");

  return (
    <div className="print-root">
      {/* 操作バー（印刷時は非表示） */}
      <div className="toolbar no-print">
        <button onClick={() => router.back()} className="btn-ghost">← 戻る</button>
        <button onClick={() => window.print()} className="btn-primary">🖨 PDFで保存 / 印刷</button>
      </div>

      <div className="sheet">
        <h1 className="doc-title">依　頼　書</h1>
        <p className="doc-date">発行日: {fmtDate(project.createdAt)}</p>

        <table className="info">
          <tbody>
            <Row label="依頼名" value={project.workType} />
            <Row label="入居者名" value={project.contractorName} />
            <Row label="連絡先" value={project.contractorPhone} />
            <Row label="ショートメールでの連絡" value={project.smsAllowed ? "可" : "不可"} />
            <Row label="物件名・住所" value={project.location} />
            <Row label="部屋番号" value={project.roomNumber} />
            <Row label="連絡希望日時" value={project.preferredContactAt} />
            <Row label="訪問希望" value={project.preferredVisitAt} />
            <Row label="入居開始日" value={project.moveInDate} />
            <Row label="緊急度" value={urgencyLabel(project.urgency)} />
            <Row label="材料支給" value={project.materialSupplied ? "あり" : "なし"} />
            <Row label="期日" value={fmtDate(project.dueDate)} />
            <Row label="担当" value={project.assignedTo ? (project.assignedTo.companyName || project.assignedTo.name) : ""} />
          </tbody>
        </table>

        <div className="desc-block">
          <div className="desc-label">依頼内容</div>
          <div className="desc-body">{project.description || ""}</div>
        </div>
      </div>

      <style jsx global>{`
        @page {
          size: A4;
          margin: 14mm;
        }
        body {
          background: #f3f4f6;
        }
        .print-root {
          font-family: -apple-system, "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif;
          color: #111;
        }
        .toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          max-width: 720px;
          margin: 16px auto;
          padding: 0 16px;
        }
        .btn-ghost {
          background: none;
          border: none;
          color: #555;
          font-size: 14px;
          cursor: pointer;
        }
        .btn-primary {
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 10px 18px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .sheet {
          background: #fff;
          max-width: 720px;
          margin: 0 auto 40px;
          padding: 32px 36px;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.12);
        }
        .doc-title {
          text-align: center;
          font-size: 24px;
          font-weight: 700;
          letter-spacing: 0.1em;
          margin: 0 0 4px;
        }
        .doc-date {
          text-align: right;
          font-size: 12px;
          color: #555;
          margin: 0 0 20px;
        }
        table.info {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        table.info th,
        table.info td {
          border: 1px solid #999;
          padding: 7px 10px;
          text-align: left;
          vertical-align: top;
        }
        table.info th {
          background: #f1f1f1;
          width: 38%;
          font-weight: 600;
          white-space: nowrap;
        }
        .desc-block {
          margin-top: 16px;
          border: 1px solid #999;
        }
        .desc-label {
          background: #f1f1f1;
          border-bottom: 1px solid #999;
          padding: 7px 10px;
          font-size: 13px;
          font-weight: 600;
        }
        .desc-body {
          padding: 12px 10px;
          font-size: 13px;
          min-height: 80px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        @media print {
          body {
            background: #fff;
          }
          .no-print {
            display: none !important;
          }
          .sheet {
            box-shadow: none;
            margin: 0;
            padding: 0;
            max-width: none;
          }
        }
      `}</style>
    </div>
  );
}
