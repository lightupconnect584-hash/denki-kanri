"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Header from "@/components/Header";

// Web Speech API の型（ブラウザ依存のため最小限定義）
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { resultIndex: number; results: { length: number; [i: number]: { isFinal: boolean; 0: { transcript: string } } } }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

interface UploadedPhoto {
  filename: string;
  originalName: string;
  preview: string;
  category: "before" | "during" | "after" | "other";
}

export default function InspectPage() {
  const { status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [result, setResult] = useState<"OK" | "REPAIR_NEEDED" | "">("");
  const [workDates, setWorkDates] = useState<string[]>([""]);

  // 最終日（最も遅い日付）を完了日・請求日の基準とする
  const finalWorkDate = workDates.filter(Boolean).sort().at(-1) ?? "";
  const addWorkDate = () => setWorkDates([...workDates, ""]);
  const removeWorkDate = (i: number) => setWorkDates(workDates.filter((_, idx) => idx !== i));
  const setWorkDate = (i: number, v: string) => setWorkDates(workDates.map((d, idx) => idx === i ? v : d));

  // 詳細内容テンプレート（4セクション）
  const [situation, setSituation] = useState("");
  const [cause, setCause] = useState("");
  const [response, setResponse] = useState("");
  const [materials, setMaterials] = useState("");
  const [insulation, setInsulation] = useState("");
  const [clamp, setClamp] = useState("");
  const [repairProposal, setRepairProposal] = useState("");
  const [needQuote, setNeedQuote] = useState(false);
  const [other, setOther] = useState("");

  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<{ score: number; missing: string[] } | null>(null);

  // ── 音声入力 ──
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    setSpeechSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition));
  }, []);

  const toggleListening = () => {
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = "ja-JP";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = (event) => {
      let added = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) added += event.results[i][0].transcript;
      }
      if (added) setTranscript((prev) => (prev ? prev + " " : "") + added);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognitionRef.current = rec;
    setListening(true);
    rec.start();
  };

  // 話した内容をAIで各項目に振り分け
  const distributeVoice = async () => {
    if (!transcript.trim()) return;
    if (listening) recognitionRef.current?.stop();
    setDistributing(true);
    try {
      const res = await fetch("/api/report-voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || "振り分けに失敗しました");
        return;
      }
      const d = json.data || {};
      const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      // 空でない項目だけ反映（既に入力済みの欄には追記）
      const merge = (prev: string, add: string) => (add ? (prev.trim() ? prev + "\n" + add : add) : prev);
      if (s(d.situation)) setSituation((p) => merge(p, s(d.situation)));
      if (s(d.cause)) setCause((p) => merge(p, s(d.cause)));
      if (s(d.response)) setResponse((p) => merge(p, s(d.response)));
      if (s(d.materials)) setMaterials((p) => merge(p, s(d.materials)));
      if (s(d.insulation)) setInsulation((p) => p || s(d.insulation));
      if (s(d.clamp)) setClamp((p) => p || s(d.clamp));
      if (s(d.repairProposal)) setRepairProposal((p) => merge(p, s(d.repairProposal)));
      if (s(d.other)) setOther((p) => merge(p, s(d.other)));
      if (d.needQuote === true) setNeedQuote(true);
      setTranscript("");
    } catch {
      alert("振り分けに失敗しました");
    } finally {
      setDistributing(false);
    }
  };
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState<"before" | "during" | "after" | "other" | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [uploadError, setUploadError] = useState("");

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const MAX_PHOTOS_TOTAL = 8;

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, category: "before" | "during" | "after" | "other") => {
    const files = e.target.files;
    if (!files) return;

    const currentCount = photos.length;
    const remaining = MAX_PHOTOS_TOTAL - currentCount;
    if (remaining <= 0) {
      setUploadError(`写真は合計${MAX_PHOTOS_TOTAL}枚までです`);
      e.target.value = "";
      return;
    }

    setUploading(category);
    setUploadError("");
    const uploaded: UploadedPhoto[] = [];
    const filesToUpload = Array.from(files).slice(0, remaining);

    if (Array.from(files).length > remaining) {
      setUploadError(`残り${remaining}枚しか追加できません`);
    }

    for (const file of filesToUpload) {
      try {
        const compressedFile = await new Promise<File>((resolve, reject) => {
          const img = new window.Image();
          const url = URL.createObjectURL(file);
          img.onload = () => {
            const MAX = 1600;
            let w = img.width;
            let h = img.height;
            if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (!ctx) { resolve(file); return; }
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
              URL.revokeObjectURL(url);
              if (!blob) { resolve(file); return; }
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }));
            }, "image/jpeg", 0.7);
          };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("画像の読み込みに失敗しました")); };
          img.src = url;
        });

        const formData = new FormData();
        formData.append("file", compressedFile);

        const res = await fetch("/api/upload", { method: "POST", body: formData });
        if (res.ok) {
          const data = await res.json();
          uploaded.push({
            filename: data.filename,
            originalName: data.originalName,
            preview: URL.createObjectURL(compressedFile),
            category,
          });
        } else {
          setUploadError(`アップロード失敗 (${file.name}, status:${res.status})`);
        }
      } catch (e) {
        setUploadError(`エラー: ${String(e)} (${file.name})`);
      }
    }

    setPhotos((prev) => {
      const canAdd = Math.max(0, MAX_PHOTOS_TOTAL - prev.length);
      return [...prev, ...uploaded.slice(0, canAdd)];
    });
    setUploading(null);
    e.target.value = "";
  };

  const removePhoto = (filename: string) => {
    setPhotos((prev) => prev.filter((p) => p.filename !== filename));
  };

  // 4セクションを1つの文字列に結合
  const buildNotes = () => {
    const parts = [
      `【状況】\n${situation.trim()}`,
      `【原因】\n${cause.trim()}`,
      `【実施内容】\n${response.trim()}`,
    ];
    if (materials.trim()) parts.push(`【使用部材】\n${materials.trim()}`);
    if (insulation.trim()) parts.push(`【絶縁抵抗値】${insulation.trim()}`);
    if (clamp.trim()) parts.push(`【クランプ値】${clamp.trim()}`);
    if (repairProposal.trim()) parts.push(`【修理提案】\n${repairProposal.trim()}`);
    if (needQuote) parts.push(`【見積り】見積り必要`);
    if (other.trim()) parts.push(`【その他】\n${other.trim()}`);
    return parts.join("\n\n");
  };

  const canSubmit = !!result && !!finalWorkDate && situation.trim() && cause.trim() && response.trim();

  // 送信前のAIチェック（報告品質の採点）
  const checkScore = async () => {
    setScoring(true);
    setScoreResult(null);
    try {
      const res = await fetch("/api/report-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          situation, cause, response, materials, insulation, clamp, repairProposal, needQuote,
          photos: {
            before: photos.filter((p) => p.category === "before").length,
            during: photos.filter((p) => p.category === "during").length,
            after: photos.filter((p) => p.category === "after").length,
          },
        }),
      });
      if (res.ok) setScoreResult(await res.json());
      else alert("採点に失敗しました");
    } catch {
      alert("採点に失敗しました");
    } finally {
      setScoring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    await fetch(`/api/projects/${id}/inspect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        result,
        workDate: finalWorkDate,
        workDates: workDates.filter(Boolean).sort(),
        notes: buildNotes(),
        photos: photos.map((p) => ({ filename: p.filename, originalName: p.originalName, category: p.category })),
      }),
    });

    router.push(`/projects/${id}`);
  };

  const fieldClass = "w-full border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none";

  return (
    <div className="min-h-full flex flex-col bg-gray-900 [color-scheme:dark]">
      <Header />
      <main className="flex-1 max-w-lg lg:max-w-2xl mx-auto w-full px-4 py-4 sm:py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-white">
            ←
          </button>
          <h2 className="text-lg font-bold text-white">完了報告</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" onKeyDown={(e) => { if (e.key === "Enter" && e.nativeEvent.isComposing) e.preventDefault(); }}>
          {/* 点検結果 */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <label className="block text-sm font-bold text-gray-200 mb-3">作業結果 *</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setResult("OK")}
                className={`py-4 rounded-xl border-2 text-sm font-medium transition ${
                  result === "OK"
                    ? "border-green-500 bg-green-900/30 text-green-300"
                    : "border-gray-700 text-gray-300 hover:border-green-700"
                }`}
              >
                ✅ 問題なし
              </button>
              <button
                type="button"
                onClick={() => setResult("REPAIR_NEEDED")}
                className={`py-4 rounded-xl border-2 text-sm font-medium transition ${
                  result === "REPAIR_NEEDED"
                    ? "border-red-500 bg-red-900/30 text-red-300"
                    : "border-gray-700 text-gray-300 hover:border-red-700"
                }`}
              >
                🔧 修理が必要
              </button>
            </div>
          </div>

          {/* 作業日（複数日対応） */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-bold text-gray-200">作業日 *</label>
              <button
                type="button"
                onClick={addWorkDate}
                className="text-xs text-blue-400 border border-blue-700 rounded px-2 py-1 hover:bg-blue-900/40 transition"
              >
                ＋ 日付を追加
              </button>
            </div>
            <div className="space-y-2">
              {workDates.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="date"
                    value={d}
                    onChange={(e) => setWorkDate(i, e.target.value)}
                    className="flex-1 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {workDates.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeWorkDate(i)}
                      className="text-gray-500 hover:text-red-500 text-sm px-2"
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
            {workDates.filter(Boolean).length > 1 && (
              <p className="text-xs text-gray-400 mt-2">
                最終日（完了日）: <span className="font-medium text-gray-200">{new Date(finalWorkDate).toLocaleDateString("ja-JP")}</span>
              </p>
            )}
          </div>

          {/* 音声でまとめて報告（AIが項目に振り分け） */}
          <div className="bg-indigo-900/30 border border-indigo-700/60 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-indigo-300">🎤 音声でまとめて報告</p>
              {speechSupported && (
                <button
                  type="button"
                  onClick={toggleListening}
                  className={`text-xs rounded-lg px-3 py-1.5 font-medium transition ${
                    listening
                      ? "bg-red-600 text-white animate-none"
                      : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                >
                  {listening ? "⏹ 停止" : "🎤 話す"}
                </button>
              )}
            </div>
            <p className="text-xs text-indigo-300/70">
              状況・原因・やった作業・部材・測定値などを<span className="font-bold text-indigo-200">まとめて話すだけ</span>でOK。AIが下の項目に振り分けます。
              {!speechSupported && "（キーボードのマイク🎤で下の欄に話してください）"}
            </p>
            <textarea
              rows={3}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder={speechSupported ? "「🎤 話す」を押して話すか、ここに直接入力（キーボードのマイクでも可）" : "ここをタップしてキーボードのマイク🎤で話してください"}
              className={fieldClass}
            />
            {listening && <p className="text-xs text-red-400">● 聞き取り中… 話し終わったら「⏹ 停止」を押してください</p>}
            <button
              type="button"
              onClick={distributeVoice}
              disabled={distributing || !transcript.trim()}
              className="w-full bg-indigo-600 text-white text-sm rounded-lg py-2 font-medium hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {distributing ? "振り分け中…" : "⬇ AIで各項目に振り分ける"}
            </button>
          </div>

          {/* 詳細内容（4セクション） */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-4">
            <p className="text-sm font-bold text-gray-200">詳細内容 *</p>
            <p className="text-xs text-gray-500 -mt-2">状況・原因・対応は必須入力です</p>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                状況 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-500 ml-1">例：漏電による共用ブレーカー落ち</span>
              </label>
              <textarea
                rows={2}
                value={situation}
                onChange={(e) => setSituation(e.target.value)}
                placeholder="どのような状況だったか"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                原因 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-500 ml-1">例：漏電箇所を具体的に</span>
              </label>
              <textarea
                rows={2}
                value={cause}
                onChange={(e) => setCause(e.target.value)}
                placeholder="原因の詳細"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                実施内容 <span className="text-red-500">*</span>
                <span className="font-normal text-gray-500 ml-1">例：漏電箇所を切り離して復旧させた</span>
              </label>
              <textarea
                rows={2}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="実施した作業内容"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                使用部材
                <span className="font-normal text-gray-500 ml-1">交換・使用した部品（任意）</span>
              </label>
              <textarea
                rows={2}
                value={materials}
                onChange={(e) => setMaterials(e.target.value)}
                placeholder="例: 漏電ブレーカー BJS3031N ×1"
                className={fieldClass}
              />
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-300 mb-1">絶縁抵抗値<span className="font-normal text-gray-500 ml-1">（任意）</span></label>
                <input
                  type="text"
                  value={insulation}
                  onChange={(e) => setInsulation(e.target.value)}
                  placeholder="例: 0.5MΩ以上"
                  className={fieldClass}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-300 mb-1">クランプ値<span className="font-normal text-gray-500 ml-1">（任意）</span></label>
                <input
                  type="text"
                  value={clamp}
                  onChange={(e) => setClamp(e.target.value)}
                  placeholder="例: 3.2A"
                  className={fieldClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                修理提案
                <span className="font-normal text-gray-500 ml-1">今後必要な修理・推奨事項（任意）</span>
              </label>
              <textarea
                rows={2}
                value={repairProposal}
                onChange={(e) => setRepairProposal(e.target.value)}
                placeholder="例: 経年劣化のため分電盤の交換を推奨"
                className={fieldClass}
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1.5">見積り</label>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => setNeedQuote(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    !needQuote ? "bg-gray-600 text-white border-gray-600" : "bg-gray-700 text-gray-300 border-gray-600 hover:border-gray-400"
                  }`}>不要</button>
                <button type="button"
                  onClick={() => setNeedQuote(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border transition ${
                    needQuote ? "bg-orange-600 text-white border-orange-600" : "bg-gray-700 text-gray-300 border-gray-600 hover:border-orange-400"
                  }`}>見積り必要</button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-300 mb-1">
                その他
                <span className="font-normal text-gray-500 ml-1">気になったことなど（任意）</span>
              </label>
              <textarea
                rows={2}
                value={other}
                onChange={(e) => setOther(e.target.value)}
                placeholder="その他、特記事項があれば"
                className={fieldClass}
              />
            </div>
          </div>

          {/* 写真（3セクション） */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-200">作業写真</p>
              <p className="text-xs text-gray-500">合計 {photos.length} / {MAX_PHOTOS_TOTAL}枚</p>
            </div>
            {(["before", "during", "after", "other"] as const).map((cat) => {
              const labels = { before: "点検前", during: "点検中", after: "点検後", other: "その他" };
              const catPhotos = photos.filter((p) => p.category === cat);
              const isFull = photos.length >= MAX_PHOTOS_TOTAL;
              return (
                <div key={cat}>
                  <p className="text-xs font-semibold text-gray-300 mb-2">{labels[cat]}</p>
                  <label
                    className={`flex items-center justify-center gap-2 w-full border-2 border-dashed rounded-xl py-3 transition ${isFull ? "border-gray-700 bg-gray-700/40 cursor-not-allowed opacity-50" : uploading === cat ? "border-blue-400 bg-blue-900/40 cursor-pointer" : "border-gray-600 hover:border-blue-400 hover:bg-blue-900/40 cursor-pointer"}`}
                    onClick={(e) => { if (isFull || uploading !== null) e.preventDefault(); }}
                  >
                    <span className="text-xl">📷</span>
                    <span className="text-sm text-gray-300">
                      {uploading === cat ? "アップロード中..." : isFull ? "上限に達しました（合計8枚）" : "写真を選択（複数可）"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handlePhotoUpload(e, cat)}
                      disabled={uploading !== null || isFull}
                    />
                  </label>
                  {catPhotos.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {catPhotos.map((photo) => (
                        <div key={photo.filename} className="relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={photo.preview} alt={photo.originalName} className="w-full h-24 object-cover rounded-lg" />
                          <button
                            type="button"
                            onClick={() => removePhoto(photo.filename)}
                            className="absolute top-1 right-1 bg-red-900/300 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center hover:bg-red-600"
                          >×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {uploadError && <p className="text-xs text-red-500 break-all">{uploadError}</p>}
          </div>

          {/* AIチェック（報告品質の採点） */}
          <div className="bg-indigo-900/30 border border-indigo-700/60 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-indigo-300">🤖 送信前のAIチェック</p>
              <button
                type="button"
                onClick={checkScore}
                disabled={scoring || !canSubmit}
                className="text-xs bg-indigo-600 text-white rounded-lg px-3 py-1.5 hover:bg-indigo-700 disabled:opacity-50 transition"
              >
                {scoring ? "採点中…" : "報告を採点する"}
              </button>
            </div>
            {scoreResult ? (
              <div className="space-y-1.5">
                <p className={`text-2xl font-bold ${scoreResult.score >= 90 ? "text-green-400" : scoreResult.score >= 70 ? "text-yellow-300" : "text-red-400"}`}>
                  報告品質 {scoreResult.score}点
                  {scoreResult.score >= 90 && <span className="text-sm ml-2">🎉</span>}
                </p>
                {scoreResult.missing.length > 0 ? (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">不足</p>
                    <ul className="space-y-0.5">
                      {scoreResult.missing.map((m, i) => (
                        <li key={i} className="text-xs text-amber-300">・{m}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-xs text-green-400">不足はありません。このまま送信できます</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-indigo-300/70">入力内容をAIが100点満点で採点し、不足項目をお知らせします（採点しなくても送信できます）</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition"
          >
            {submitting ? "送信中..." : "完了報告を送信する"}
          </button>
          {!canSubmit && (
            <p className="text-xs text-center text-red-400">作業結果・作業日・詳細内容（状況・原因・対応）は必須です</p>
          )}
        </form>
      </main>
    </div>
  );
}
