"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// 🧩 写真まとめ（合成）の編集画面
// 配置（順番・列数）、サイズ（小/標準/大）、切り取り、左右反転をプレビューを見ながら調整できる
export interface CollagePhoto {
  id: string;
  name: string;
  url: string; // 同一オリジンの取得URL（/api/photos/[id]/file）
}

interface Edit {
  scale: number; // 幅の重み 0.7 / 1 / 1.4
  flipH: boolean;
  crop: { x: number; y: number; w: number; h: number } | null; // 画像ピクセル基準
}

const GAP = 12;
const CAP = 44;
const OUT_W = 1600;

export default function CollageEditor({
  photos,
  onConfirm,
  onCancel,
  confirming,
}: {
  photos: CollagePhoto[];
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
  confirming: boolean;
}) {
  const [bitmaps, setBitmaps] = useState<Map<string, ImageBitmap>>(new Map());
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<string[]>(photos.map((p) => p.id));
  const [edits, setEdits] = useState<Record<string, Edit>>(
    Object.fromEntries(photos.map((p) => [p.id, { scale: 1, flipH: false, crop: null }]))
  );
  const [perRow, setPerRow] = useState<number>(0); // 0=自動
  const [showNumbers, setShowNumbers] = useState(true); // 各写真に順番の番号バッジを描く
  const [cropTarget, setCropTarget] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  // 画像読み込み（同一オリジン経由なのでcanvasが汚染されない）
  useEffect(() => {
    let alive = true;
    (async () => {
      const m = new Map<string, ImageBitmap>();
      for (const p of photos) {
        try {
          const r = await fetch(p.url);
          const blob = await r.blob();
          m.set(p.id, await createImageBitmap(blob));
        } catch { /* skip */ }
      }
      if (alive) { setBitmaps(m); setLoading(false); }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const photoById = useCallback((id: string) => photos.find((p) => p.id === id)!, [photos]);

  // 実効サイズ（切り取り後）
  const effSize = useCallback((id: string) => {
    const bmp = bitmaps.get(id);
    if (!bmp) return { w: 4, h: 3 };
    const e = edits[id];
    if (e?.crop) return { w: e.crop.w, h: e.crop.h };
    return { w: bmp.width, h: bmp.height };
  }, [bitmaps, edits]);

  // 合成描画（プレビューも本番も同じロジック。scaleFactorで解像度を切替）
  const drawCollage = useCallback((canvas: HTMLCanvasElement, outW: number, withCaption: boolean) => {
    const ids = order.filter((id) => bitmaps.has(id));
    if (ids.length === 0) return;
    const n = ids.length;
    const pr = perRow || (n <= 4 ? 2 : 3);
    const rows: string[][] = [];
    for (let i = 0; i < n; i += pr) rows.push(ids.slice(i, i + pr));
    const gap = GAP * (outW / OUT_W);
    const cap = withCaption ? CAP * (outW / OUT_W) : 0;
    const maxRowH = 950 * (outW / OUT_W);

    const rowDims = rows.map((row) => {
      const aspects = row.map((id) => {
        const s = effSize(id);
        return (s.w / s.h) * (edits[id]?.scale ?? 1);
      });
      const sum = aspects.reduce((a, b) => a + b, 0);
      const h = Math.min(maxRowH, (outW - gap * (row.length + 1)) / sum);
      return { h, aspects };
    });
    const totalH = rowDims.reduce((a, r) => a + r.h + cap + gap, 0) + gap;
    canvas.width = outW;
    canvas.height = Math.round(totalH);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let y = gap;
    rows.forEach((row, ri) => {
      const { h, aspects } = rowDims[ri];
      const widths = aspects.map((a) => a * h);
      const rowW = widths.reduce((a, b) => a + b, 0) + gap * (row.length - 1);
      let x = (outW - rowW) / 2;
      row.forEach((id, ci) => {
        const bmp = bitmaps.get(id)!;
        const e = edits[id];
        const w = widths[ci];
        const crop = e?.crop || { x: 0, y: 0, w: bmp.width, h: bmp.height };
        ctx.save();
        if (e?.flipH) {
          ctx.translate(x + w, y);
          ctx.scale(-1, 1);
          ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
        } else {
          ctx.drawImage(bmp, crop.x, crop.y, crop.w, crop.h, x, y, w, h);
        }
        ctx.restore();
        ctx.strokeStyle = "#d1d5db";
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        if (withCaption) {
          ctx.fillStyle = "#111827";
          ctx.font = `bold ${Math.round(26 * (outW / OUT_W))}px sans-serif`;
          ctx.textBaseline = "middle";
          let label = photoById(id).name || "";
          while (label && ctx.measureText(label).width > w - 16) label = label.slice(0, -1);
          ctx.fillText(label, x + 8, y + h + cap / 2);
        }
        if (showNumbers) {
          // 順番の番号バッジ（左上の紺色の丸に白数字）
          const num = order.indexOf(id) + 1;
          const r = Math.max(14, 26 * (outW / OUT_W));
          const cx = x + r + 6 * (outW / OUT_W);
          const cy = y + r + 6 * (outW / OUT_W);
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(20, 35, 70, 0.92)";
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, 3 * (outW / OUT_W));
          ctx.strokeStyle = "#ffffff";
          ctx.stroke();
          ctx.fillStyle = "#ffffff";
          ctx.font = `bold ${Math.round(r * 1.15)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(num), cx, cy + r * 0.05);
          ctx.textAlign = "left";
        }
        x += w + gap;
      });
      y += h + cap + gap;
    });
  }, [order, bitmaps, edits, perRow, effSize, photoById, showNumbers]);

  // プレビュー更新
  useEffect(() => {
    if (loading || !previewRef.current) return;
    drawCollage(previewRef.current, 760, true);
  }, [loading, drawCollage]);

  // ≡ハンドルのドラッグ並び替え（Pointer Eventsなのでスマホのタッチでも動く）
  const listRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragStart = (id: string) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    setDraggingId(id);
  };
  const dragMove = (ev: React.PointerEvent) => {
    if (!draggingId || !listRef.current) return;
    const rows = Array.from(listRef.current.children) as HTMLElement[];
    const ids = order;
    const curIdx = ids.indexOf(draggingId);
    let newIdx = curIdx;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (ev.clientY < r.top + r.height / 2) { newIdx = i; break; }
      newIdx = i;
    }
    if (newIdx !== curIdx) {
      setOrder((prev) => {
        const next = prev.filter((v) => v !== draggingId);
        next.splice(newIdx, 0, draggingId);
        return next;
      });
    }
  };
  const dragEnd = () => setDraggingId(null);

  const move = (id: string, dir: -1 | 1) => {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i === -1 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const cycleScale = (id: string) => {
    setEdits((prev) => {
      const cur = prev[id]?.scale ?? 1;
      const next = cur === 1 ? 1.4 : cur === 1.4 ? 0.7 : 1;
      return { ...prev, [id]: { ...prev[id], scale: next } };
    });
  };

  const confirm = () => {
    const canvas = document.createElement("canvas");
    drawCollage(canvas, OUT_W, true);
    canvas.toBlob((blob) => { if (blob) onConfirm(blob); }, "image/jpeg", 0.85);
  };

  const scaleLabel = (s: number) => (s === 1.4 ? "大" : s === 0.7 ? "小" : "標準");

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col" onClick={onCancel}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl sm:mx-auto mt-auto sm:my-auto max-h-[94vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700 shrink-0">
          <p className="text-sm font-bold text-gray-100">🧩 写真まとめの編集（{photos.length}枚）</p>
          <button onClick={onCancel} className="text-gray-400 hover:text-white text-xl px-2">✕</button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {loading ? (
            <p className="text-center text-gray-400 text-sm py-10">写真を読み込み中...</p>
          ) : (
            <>
              {/* プレビュー */}
              <div className="bg-gray-950 rounded-lg p-2">
                <canvas ref={previewRef} className="w-full h-auto rounded" />
              </div>

              {/* 列数・番号 */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 shrink-0">列数:</span>
                {[0, 1, 2, 3].map((v) => (
                  <button key={v} onClick={() => setPerRow(v)}
                    className={`text-xs rounded-lg px-3 py-1.5 border transition ${perRow === v ? "bg-blue-600 text-white border-blue-600" : "text-gray-300 border-gray-600 hover:border-blue-500"}`}>
                    {v === 0 ? "自動" : `${v}列`}
                  </button>
                ))}
                <span className="w-px h-5 bg-gray-700 mx-1" />
                <button onClick={() => setShowNumbers(!showNumbers)}
                  className={`text-xs rounded-lg px-3 py-1.5 border transition ${showNumbers ? "bg-blue-600 text-white border-blue-600" : "text-gray-300 border-gray-600 hover:border-blue-500"}`}
                  title="各写真に①②③…の順番バッジを入れる">
                  🔢 番号 {showNumbers ? "あり" : "なし"}
                </button>
              </div>

              {/* 写真ごとの調整（≡をドラッグ or ↑↓で並び替え） */}
              <p className="text-[11px] text-gray-500 -mb-2">≡ を押したまま上下にドラッグで並び替え（↑↓ボタンでも可）</p>
              <div className="space-y-2" ref={listRef} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>
                {order.map((id, i) => {
                  const p = photoById(id);
                  const e = edits[id];
                  return (
                    <div key={id} className={`flex items-center gap-2 border rounded-lg px-2 py-1.5 transition ${draggingId === id ? "bg-blue-900/50 border-blue-500 shadow-lg" : "bg-gray-800 border-gray-700"}`}>
                      <span
                        onPointerDown={dragStart(id)}
                        className="text-gray-400 text-lg px-1.5 py-1 cursor-grab active:cursor-grabbing touch-none select-none shrink-0"
                        title="ドラッグで並び替え"
                      >≡</span>
                      <span className="text-xs text-gray-500 w-5 text-center shrink-0">{i + 1}</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className={`w-12 h-9 object-cover rounded shrink-0 ${e?.flipH ? "scale-x-[-1]" : ""}`} />
                      <span className="text-xs text-gray-300 flex-1 min-w-0 truncate">{p.name || "（名称なし）"}</span>
                      <button onClick={() => move(id, -1)} disabled={i === 0}
                        className="text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 disabled:opacity-30">↑</button>
                      <button onClick={() => move(id, 1)} disabled={i === order.length - 1}
                        className="text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 disabled:opacity-30">↓</button>
                      <button onClick={() => cycleScale(id)}
                        className={`text-xs rounded px-2 py-1 border transition ${e?.scale !== 1 ? "bg-amber-700 text-white border-amber-700" : "text-gray-300 border-gray-600"}`}
                        title="表示サイズ（小/標準/大）">{scaleLabel(e?.scale ?? 1)}</button>
                      <button onClick={() => setEdits((prev) => ({ ...prev, [id]: { ...prev[id], flipH: !prev[id].flipH } }))}
                        className={`text-xs rounded px-2 py-1 border transition ${e?.flipH ? "bg-blue-700 text-white border-blue-700" : "text-gray-300 border-gray-600"}`}
                        title="左右反転">↔</button>
                      <button onClick={() => setCropTarget(id)}
                        className={`text-xs rounded px-2 py-1 border transition ${e?.crop ? "bg-green-700 text-white border-green-700" : "text-gray-300 border-gray-600"}`}
                        title="切り取り">✂</button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-700 shrink-0">
          <button onClick={onCancel} className="text-sm text-gray-400 px-4 py-2 hover:text-gray-200">キャンセル</button>
          <button onClick={confirm} disabled={loading || confirming}
            className="flex-1 bg-purple-600 text-white text-sm font-bold rounded-xl py-2.5 hover:bg-purple-700 disabled:opacity-50 transition">
            {confirming ? "置き換え中..." : "🧩 この配置で1枚にまとめて置き換え"}
          </button>
        </div>
      </div>

      {/* ✂ 切り取りオーバーレイ */}
      {cropTarget && bitmaps.get(cropTarget) && (
        <CropOverlay
          bitmap={bitmaps.get(cropTarget)!}
          initial={edits[cropTarget]?.crop}
          onApply={(crop) => { setEdits((prev) => ({ ...prev, [cropTarget]: { ...prev[cropTarget], crop } })); setCropTarget(null); }}
          onClear={() => { setEdits((prev) => ({ ...prev, [cropTarget]: { ...prev[cropTarget], crop: null } })); setCropTarget(null); }}
          onCancel={() => setCropTarget(null)}
        />
      )}
    </div>
  );
}

// ── 切り取りUI: 画像の上で範囲をドラッグ（角の●で調整） ──
function CropOverlay({
  bitmap, initial, onApply, onClear, onCancel,
}: {
  bitmap: ImageBitmap;
  initial: { x: number; y: number; w: number; h: number } | null | undefined;
  onApply: (c: { x: number; y: number; w: number; h: number }) => void;
  onClear: () => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // 表示座標（0..1の正規化）で保持
  const [rect, setRect] = useState(() => initial
    ? { x: initial.x / bitmap.width, y: initial.y / bitmap.height, w: initial.w / bitmap.width, h: initial.h / bitmap.height }
    : { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
  const dragRef = useRef<{ mode: string; startX: number; startY: number; orig: typeof rect } | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const maxW = Math.min(700, window.innerWidth - 40);
    const scale = maxW / bitmap.width;
    c.width = maxW;
    c.height = bitmap.height * scale;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  }, [bitmap]);

  const pos = (ev: React.PointerEvent) => {
    const b = boxRef.current!.getBoundingClientRect();
    return { x: (ev.clientX - b.left) / b.width, y: (ev.clientY - b.top) / b.height };
  };

  const down = (mode: string) => (ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
    const p = pos(ev);
    dragRef.current = { mode, startX: p.x, startY: p.y, orig: { ...rect } };
  };

  const moveHandler = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const p = pos(ev);
    const dx = p.x - d.startX;
    const dy = p.y - d.startY;
    const o = d.orig;
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    let r = { ...o };
    if (d.mode === "move") {
      r.x = clamp(o.x + dx, 0, 1 - o.w);
      r.y = clamp(o.y + dy, 0, 1 - o.h);
    } else {
      if (d.mode.includes("e")) r.w = clamp(o.w + dx, 0.08, 1 - o.x);
      if (d.mode.includes("s")) r.h = clamp(o.h + dy, 0.08, 1 - o.y);
      if (d.mode.includes("w")) { const nx = clamp(o.x + dx, 0, o.x + o.w - 0.08); r.w = o.w + (o.x - nx); r.x = nx; }
      if (d.mode.includes("n")) { const ny = clamp(o.y + dy, 0, o.y + o.h - 0.08); r.h = o.h + (o.y - ny); r.y = ny; }
    }
    setRect(r);
  };

  const up = () => { dragRef.current = null; };

  const apply = () => {
    onApply({
      x: Math.round(rect.x * bitmap.width),
      y: Math.round(rect.y * bitmap.height),
      w: Math.round(rect.w * bitmap.width),
      h: Math.round(rect.h * bitmap.height),
    });
  };

  const handle = "absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-full -m-2.5";

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 flex flex-col items-center justify-center p-4" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-gray-200 mb-2 text-center">✂ 残す範囲をドラッグで調整</p>
        <div ref={boxRef} className="relative touch-none select-none" onPointerMove={moveHandler} onPointerUp={up}>
          <canvas ref={canvasRef} className="block rounded" />
          {/* 暗幕 */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute bg-black/60" style={{ left: 0, top: 0, width: "100%", height: `${rect.y * 100}%` }} />
            <div className="absolute bg-black/60" style={{ left: 0, top: `${(rect.y + rect.h) * 100}%`, width: "100%", bottom: 0 }} />
            <div className="absolute bg-black/60" style={{ left: 0, top: `${rect.y * 100}%`, width: `${rect.x * 100}%`, height: `${rect.h * 100}%` }} />
            <div className="absolute bg-black/60" style={{ left: `${(rect.x + rect.w) * 100}%`, top: `${rect.y * 100}%`, right: 0, height: `${rect.h * 100}%` }} />
          </div>
          {/* 枠＋ハンドル */}
          <div
            className="absolute border-2 border-blue-400 cursor-move"
            style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, height: `${rect.h * 100}%` }}
            onPointerDown={down("move")}
          >
            <div className={`${handle} left-0 top-0 cursor-nwse-resize`} onPointerDown={down("nw")} />
            <div className={`${handle} right-0 top-0 cursor-nesw-resize`} style={{ marginRight: "-10px" }} onPointerDown={down("ne")} />
            <div className={`${handle} left-0 bottom-0 cursor-nesw-resize`} style={{ marginBottom: "-10px" }} onPointerDown={down("sw")} />
            <div className={`${handle} right-0 bottom-0 cursor-nwse-resize`} style={{ marginRight: "-10px", marginBottom: "-10px" }} onPointerDown={down("se")} />
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 mt-3">
          <button onClick={onCancel} className="text-sm text-gray-400 px-4 py-2 hover:text-gray-200">キャンセル</button>
          <button onClick={onClear} className="text-sm text-gray-300 border border-gray-600 rounded-lg px-4 py-2 hover:border-red-500 hover:text-red-300">切り取り解除</button>
          <button onClick={apply} className="text-sm bg-blue-600 text-white font-bold rounded-lg px-5 py-2 hover:bg-blue-700">✂ 適用</button>
        </div>
      </div>
    </div>
  );
}
