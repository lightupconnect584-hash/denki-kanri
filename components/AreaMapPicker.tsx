"use client";

import { useEffect, useState } from "react";
import { PREF_CITIES } from "@/lib/serviceArea";

// 📍 対応エリアを地図タップで選ぶピッカー（設定画面用）
// tokens には県名（全域）と市町村名が混在。タップで市町村のON/OFFを親に通知する。
interface Geo {
  w: number;
  h: number;
  m: { p: string; n: string; g: number[][][] }[];
}

export default function AreaMapPicker({
  tokens,
  onToggleCity,
}: {
  tokens: string[];
  onToggleCity: (city: string) => void;
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [tapped, setTapped] = useState<string | null>(null);

  useEffect(() => {
    fetch("/geo/kanto4.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setGeo(d); })
      .catch(() => {});
  }, []);

  if (!geo) return <p className="text-center text-gray-500 text-xs py-6">地図を読み込み中...</p>;

  const prefOn = (pref: string) => tokens.includes(pref);
  const cityOn = (city: string) => tokens.includes(city);

  return (
    <div>
      <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="w-full h-auto rounded-lg bg-gray-950">
        {geo.m.map((mu) => {
          const viaPref = prefOn(mu.p);
          const on = cityOn(mu.n) || viaPref;
          const fill = viaPref ? "#0369a1" : cityOn(mu.n) ? "#0ea5e9" : "#1f2937";
          return mu.g.map((ring, ri) => (
            <polygon
              key={mu.p + mu.n + ri}
              points={ring.map((pt) => pt.join(",")).join(" ")}
              fill={fill}
              stroke={on ? "#7dd3fc" : "#374151"}
              strokeWidth={on ? 1.2 : 0.7}
              className="cursor-pointer"
              onClick={() => {
                setTapped(mu.n);
                if (viaPref) return; // 県全域ON中は個別タップ不要
                onToggleCity(mu.n);
              }}
            />
          ));
        })}
        {geo.m.map((mu) => {
          const ring = mu.g[0];
          if (!ring) return null;
          let cx = 0, cy = 0, minX = 1e9, maxX = -1e9;
          ring.forEach(([x, y]) => { cx += x; cy += y; minX = Math.min(minX, x); maxX = Math.max(maxX, x); });
          cx /= ring.length; cy /= ring.length;
          if (maxX - minX < 34 && tapped !== mu.n) return null;
          return (
            <text key={`l-${mu.p}-${mu.n}`} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
              fontSize={tapped === mu.n ? 15 : 11} fontWeight="bold" fill="#ffffff" stroke="#111827" strokeWidth={2.5}
              paintOrder="stroke" pointerEvents="none">{mu.n.replace(/(市|町|村|区)$/, "")}</text>
          );
        })}
      </svg>
      <p className="text-[11px] text-gray-500 mt-1">
        {tapped ? <span className="text-sky-300 font-bold">{tapped} をタップしました。</span> : "地図の市町村をタップで対応エリアをON/OFFできます。"}
        濃い青＝県全域で対応中（県全域ボタンで解除）／明るい青＝個別に選択中
      </p>
    </div>
  );
}
