"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";

interface SeasonalMsgItem { id: string; name: string; startMD: number; endMD: number; message: string; imageUrl: string | null; animation: string; enabled: boolean; order: number; targetType: string; targetUserIds: string[]; }
interface StockImage { id: string; filename: string; originalName: string; label: string | null; createdAt: string; }

export default function SettingsPage() {
  const { data: session, update } = useSession();
  const router = useRouter();

  const currentAvatarUrl = (session?.user as { avatarUrl?: string })?.avatarUrl;
  const currentPhone = (session?.user as { phone?: string })?.phone || "";
  const role = (session?.user as { role?: string })?.role;

  // アバター
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 電話番号
  const [phoneInput, setPhoneInput] = useState(currentPhone);
  const [savingPhone, setSavingPhone] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 感謝メッセージ設定
  const [thankYouEnabled, setThankYouEnabled] = useState<boolean>(true);
  const [thankYouImageUrl, setThankYouImageUrl] = useState<string | null>(null);
  const [thankYouPendingFile, setThankYouPendingFile] = useState<File | null>(null);
  const [thankYouPreview, setThankYouPreview] = useState<string | null>(null);
  const [savingThankYou, setSavingThankYou] = useState(false);
  const [thankYouSaveResult, setThankYouSaveResult] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [thankYouMsgInput, setThankYouMsgInput] = useState("今月はお疲れ様でした！\nまた来月もよろしくお願いします。");
  const [savingMsg, setSavingMsg] = useState(false);
  const [showMsgPreview, setShowMsgPreview] = useState(false);
  const thankYouFileRef = useRef<HTMLInputElement>(null);

  // 季節メッセージ
  const ANIM_LABELS: Record<string, string> = {
    none: "なし",
    sun: "☀️ 晴れ", rain: "🌧️ 雨", snow: "❄️ 雪", thunder: "⚡ 雷",
    wind: "🍃 風", wave: "🌊 波", stars: "⭐ 星空",
    sakura: "🌸 桜吹雪", leaves: "🍂 落ち葉",
    confetti: "🎊 紙吹雪", cracker: "🎉 クラッカー", fireworks: "🎆 花火",
  };
  const [seasonalMsgs, setSeasonalMsgs] = useState<SeasonalMsgItem[]>([]);
  const [editingSeasonId, setEditingSeasonId] = useState<string | null>(null);
  const [seasonForm, setSeasonForm] = useState({ name: "", startMonth: "1", startDay: "1", endMonth: "1", endDay: "1", message: "", imageUrl: null as string | null, animation: "none", targetType: "all", targetUserIds: [] as string[] });
  const [seasonImgFile, setSeasonImgFile] = useState<File | null>(null);
  const [seasonImgPreview, setSeasonImgPreview] = useState<string | null>(null);
  const [savingSeason, setSavingSeason] = useState(false);
  const [previewingSeason, setPreviewingSeason] = useState(false);
  const seasonImgRef = useRef<HTMLInputElement>(null);

  // パートナーユーザー一覧（送信先選択用）
  const [partnerUsers, setPartnerUsers] = useState<{ id: string; name: string; companyName: string | null }[]>([]);

  // ストレージ
  const [storage, setStorage] = useState<{ db: { used: number; limit: number }; blob: { used: number; limit: number } } | null>(null);
  const [loadingStorage, setLoadingStorage] = useState(false);

  // 画像ストック
  const [stockImages, setStockImages] = useState<StockImage[]>([]);
  const [showStockPicker, setShowStockPicker] = useState<"season" | "thankYou" | false>(false);
  const [uploadingStock, setUploadingStock] = useState(false);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const stockUploadRef = useRef<HTMLInputElement>(null);

  // アコーディオン
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const toggleSection = (key: string) => setOpenSections(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });
  const isOpen = (key: string) => openSections.has(key);

  // メッセージタブ
  const [msgTab, setMsgTab] = useState<"seasonal" | "thankyou">("seasonal");

  // 依頼名マスター
  const [workTypes, setWorkTypes] = useState<{ id: string; name: string; defaultAmount: number | null; defaultUrgency: string | null }[]>([]);
  const [newWorkType, setNewWorkType] = useState("");
  const [newWorkTypeAmount, setNewWorkTypeAmount] = useState("");
  const [newWorkTypeUrgency, setNewWorkTypeUrgency] = useState("");
  const [savingWorkType, setSavingWorkType] = useState(false);
  const [expandedWorkTypeId, setExpandedWorkTypeId] = useState<string | null>(null);
  const [editAmounts, setEditAmounts] = useState<Record<string, string>>({});
  const [editUrgencies, setEditUrgencies] = useState<Record<string, string>>({});

  useEffect(() => {
    if (role === "ADMIN") {
      fetch("/api/seasonal-messages").then((r) => r.json()).then(setSeasonalMsgs);
      fetch("/api/seasonal-image-stock").then((r) => r.json()).then(setStockImages);
      fetch("/api/work-types").then((r) => r.json()).then(setWorkTypes);
      fetch("/api/users").then((r) => r.json()).then((data) => {
        setPartnerUsers((data || []).filter((u: { role: string }) => u.role === "PARTNER"));
      }).catch(() => {});
      fetch("/api/auth/profile", { method: "GET" }).then((r) => r.json()).then((data) => {
        if (data.thankYouEnabled !== undefined) setThankYouEnabled(data.thankYouEnabled);
        if (data.thankYouImageUrl !== undefined) setThankYouImageUrl(data.thankYouImageUrl);
        if (data.thankYouMessage) setThankYouMsgInput(data.thankYouMessage);
      }).catch(() => {});
    }
  }, [role]);

  const uploadStockImage = async (file: File) => {
    setUploadingStock(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const up = await fetch("/api/upload", { method: "POST", body: fd });
      const { filename } = await up.json();
      const res = await fetch("/api/seasonal-image-stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename, originalName: file.name }),
      });
      const img = await res.json();
      setStockImages((prev) => [img, ...prev]);
    } finally {
      setUploadingStock(false);
    }
  };

  const deleteStockImage = async (id: string) => {
    if (!window.confirm("このストック画像を削除しますか？")) return;
    await fetch(`/api/seasonal-image-stock?id=${id}`, { method: "DELETE" });
    setStockImages((prev) => prev.filter((s) => s.id !== id));
  };

  const saveStockLabel = async (id: string) => {
    await fetch("/api/seasonal-image-stock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label: labelInput }),
    });
    setStockImages((prev) => prev.map((s) => s.id === id ? { ...s, label: labelInput } : s));
    setEditingLabelId(null);
  };

  const addWorkType = async () => {
    if (!newWorkType.trim()) return;
    setSavingWorkType(true);
    const res = await fetch("/api/work-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newWorkType.trim(),
        defaultAmount: newWorkTypeAmount || null,
        defaultUrgency: newWorkTypeUrgency || null,
      }),
    });
    if (res.ok) {
      const item = await res.json();
      setWorkTypes((prev) => [...prev, item]);
      setNewWorkType(""); setNewWorkTypeAmount(""); setNewWorkTypeUrgency("");
    }
    setSavingWorkType(false);
  };

  const saveWorkTypeDefaults = async (id: string) => {
    const res = await fetch("/api/work-types", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, defaultAmount: editAmounts[id] || null, defaultUrgency: editUrgencies[id] || null }),
    });
    if (res.ok) {
      const updated = await res.json();
      setWorkTypes((prev) => prev.map((w) => w.id === id ? updated : w));
      setExpandedWorkTypeId(null);
    }
  };

  const deleteWorkType = async (id: string) => {
    await fetch("/api/work-types", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setWorkTypes((prev) => prev.filter((w) => w.id !== id));
  };

  const saveThankYouSettings = async (enabled?: boolean, imageFile?: File | null) => {
    setSavingThankYou(true);
    setThankYouSaveResult(null);
    try {
      let newImageUrl = thankYouImageUrl;
      if (imageFile) {
        const formData = new FormData();
        formData.append("file", imageFile);
        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) throw new Error("アップロード失敗");
        const { filename } = await uploadRes.json();
        newImageUrl = filename;
        setThankYouImageUrl(filename);
        setThankYouPendingFile(null);
        setThankYouPreview(null);
      }
      const newEnabled = enabled !== undefined ? enabled : thankYouEnabled;
      await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thankYouEnabled: newEnabled, thankYouImageUrl: newImageUrl }),
      });
      setThankYouEnabled(newEnabled);
      setThankYouSaveResult({ type: "success", text: "保存しました" });
    } catch {
      setThankYouSaveResult({ type: "error", text: "保存に失敗しました" });
    }
    setSavingThankYou(false);
  };

  const mdNum = (m: string, d: string) => parseInt(m) * 100 + parseInt(d);
  const mdLabel = (md: number) => `${Math.floor(md / 100)}月${md % 100}日`;

  const openNewSeason = () => {
    setSeasonForm({ name: "", startMonth: "1", startDay: "1", endMonth: "1", endDay: "1", message: "", imageUrl: null, animation: "none", targetType: "all", targetUserIds: [] });
    setSeasonImgFile(null); setSeasonImgPreview(null);
    setEditingSeasonId("new");
  };

  const openEditSeason = (msg: SeasonalMsgItem) => {
    setSeasonForm({
      name: msg.name,
      startMonth: String(Math.floor(msg.startMD / 100)),
      startDay: String(msg.startMD % 100),
      endMonth: String(Math.floor(msg.endMD / 100)),
      endDay: String(msg.endMD % 100),
      message: msg.message,
      imageUrl: msg.imageUrl,
      animation: msg.animation,
      targetType: msg.targetType || "all",
      targetUserIds: msg.targetUserIds || [],
    });
    setSeasonImgFile(null); setSeasonImgPreview(null);
    setEditingSeasonId(msg.id);
  };

  const saveSeason = async () => {
    setSavingSeason(true);
    try {
      let imgUrl = seasonForm.imageUrl;
      if (seasonImgFile) {
        const fd = new FormData(); fd.append("file", seasonImgFile);
        const r = await fetch("/api/upload", { method: "POST", body: fd });
        if (r.ok) { const { filename } = await r.json(); imgUrl = filename; }
      }
      const payload = {
        name: seasonForm.name, message: seasonForm.message, imageUrl: imgUrl, animation: seasonForm.animation,
        startMD: mdNum(seasonForm.startMonth, seasonForm.startDay),
        endMD: mdNum(seasonForm.endMonth, seasonForm.endDay),
        targetType: seasonForm.targetType,
        targetUserIds: seasonForm.targetType === "all" ? [] : seasonForm.targetUserIds,
      };
      if (editingSeasonId === "new") {
        const r = await fetch("/api/seasonal-messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (r.ok) { const item = await r.json(); setSeasonalMsgs((p) => [...p, item]); }
      } else {
        const r = await fetch("/api/seasonal-messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingSeasonId, ...payload }) });
        if (r.ok) { const item = await r.json(); setSeasonalMsgs((p) => p.map((m) => m.id === editingSeasonId ? item : m)); }
      }
      setEditingSeasonId(null);
    } catch {}
    setSavingSeason(false);
  };

  const deleteSeason = async (id: string) => {
    await fetch(`/api/seasonal-messages?id=${id}`, { method: "DELETE" });
    setSeasonalMsgs((p) => p.filter((m) => m.id !== id));
  };

  const toggleSeasonEnabled = async (msg: SeasonalMsgItem) => {
    const r = await fetch("/api/seasonal-messages", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: msg.id, enabled: !msg.enabled }) });
    if (r.ok) { const updated = await r.json(); setSeasonalMsgs((p) => p.map((m) => m.id === msg.id ? updated : m)); }
  };

  const saveThankYouMsg = async () => {
    setSavingMsg(true);
    setThankYouSaveResult(null);
    try {
      await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thankYouMessage: thankYouMsgInput.trim() || null }),
      });
      setThankYouSaveResult({ type: "success", text: "メッセージを保存しました" });
    } catch {
      setThankYouSaveResult({ type: "error", text: "保存に失敗しました" });
    }
    setSavingMsg(false);
  };

  const urgencyLabel: Record<string, string> = { HIGH: "高", MEDIUM: "中", LOW: "低" };

  // パスワード
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 画像選択（プレビューのみ・未保存）
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingPreview(URL.createObjectURL(file));
    setPendingFile(file);
    setAvatarMessage(null);
  };

  const handleCancel = () => {
    setPendingFile(null);
    setPendingPreview(null);
    setAvatarMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 決定ボタン：圧縮→アップロード→DB保存→セッション更新
  const handleSaveAvatar = async () => {
    if (!pendingFile) return;
    setSavingAvatar(true);
    setAvatarMessage(null);
    try {
      // 正方形にトリミング＆圧縮
      const compressedFile = await new Promise<File>((resolve) => {
        const img = new window.Image();
        const url = URL.createObjectURL(pendingFile);
        img.onload = () => {
          const SIZE = 400;
          const min = Math.min(img.width, img.height);
          const scale = SIZE / min;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = SIZE; canvas.height = SIZE;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, (w - SIZE) / -2, (h - SIZE) / -2, w, h);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => {
            resolve(new File([blob!], "avatar.jpg", { type: "image/jpeg" }));
          }, "image/jpeg", 0.85);
        };
        img.src = url;
      });

      // アップロード
      const formData = new FormData();
      formData.append("file", compressedFile);
      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadRes.ok) throw new Error("アップロード失敗");
      const { filename } = await uploadRes.json();

      // DBに保存
      const saveRes = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarUrl: filename }),
      });
      if (!saveRes.ok) throw new Error("保存失敗");

      // セッションのJWTトークンを更新
      await update({ avatarUrl: filename });

      setPendingFile(null);
      setPendingPreview(null);
      setAvatarMessage({ type: "success", text: "プロフィール画像を保存しました" });
    } catch {
      setAvatarMessage({ type: "error", text: "アップロードに失敗しました" });
    }
    setSavingAvatar(false);
  };

  const handleRemoveAvatar = async () => {
    setSavingAvatar(true);
    await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarUrl: null }),
    });
    await update({ avatarUrl: null });
    setPendingFile(null);
    setPendingPreview(null);
    setAvatarMessage({ type: "success", text: "画像を削除しました" });
    setSavingAvatar(false);
  };

  const handleSavePhone = async () => {
    setSavingPhone(true);
    setPhoneMessage(null);
    const res = await fetch("/api/auth/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneInput }),
    });
    if (res.ok) {
      await update({ phone: phoneInput?.trim() || null });
      setPhoneMessage({ type: "success", text: "電話番号を保存しました" });
    } else {
      setPhoneMessage({ type: "error", text: "保存に失敗しました" });
    }
    setSavingPhone(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setMessage({ type: "error", text: "新しいパスワードが一致しません" });
      return;
    }
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    const data = await res.json();
    if (res.ok) {
      setMessage({ type: "success", text: "パスワードを変更しました" });
      setCurrent(""); setNext(""); setConfirm("");
    } else {
      setMessage({ type: "error", text: data.error || "エラーが発生しました" });
    }
    setLoading(false);
  };

  const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

  // 表示するアバター（未確定のプレビュー > 保存済み）
  const displayAvatar = pendingPreview
    ? pendingPreview
    : currentAvatarUrl
    ? (currentAvatarUrl.startsWith("http") ? currentAvatarUrl : `/uploads/${currentAvatarUrl}`)
    : null;

  const ANIM_PARTICLES_S: Record<string, { color: string; shape: string }[]> = {
    confetti: [{color:"#f87171",shape:"rotate(20deg)"},{color:"#60a5fa",shape:"rotate(-15deg)"},{color:"#34d399",shape:"rotate(45deg)"},{color:"#fbbf24",shape:"rotate(10deg)"},{color:"#a78bfa",shape:"rotate(-30deg)"},{color:"#f472b6",shape:"rotate(60deg)"},{color:"#38bdf8",shape:"rotate(-45deg)"},{color:"#fb923c",shape:"rotate(25deg)"},{color:"#4ade80",shape:"rotate(-10deg)"},{color:"#e879f9",shape:"rotate(35deg)"},{color:"#f87171",shape:"rotate(-20deg)"},{color:"#60a5fa",shape:"rotate(50deg)"}],
    snow: Array.from({length:16},(_,i)=>({color:`rgba(200,230,255,${0.6+i%4*0.1})`,shape:"rotate(0deg)"})),
    rain: Array.from({length:20},(_,i)=>({color:`rgba(147,197,253,${0.4+i%3*0.2})`,shape:`rotate(${15+i%5}deg)`})),
    sun: Array.from({length:12},(_,i)=>({color:`rgba(251,191,36,${0.4+i%4*0.15})`,shape:`rotate(${i*30}deg)`})),
  };
  const FIXED_POS_S = [8,15,22,30,38,45,52,60,68,75,82,90,12,25,48,65,78,35,55,20];
  const WIND_PS = [
    {c:"rgba(34,197,94,0.85)",w:20,h:7,dur:2.8,del:0},{c:"rgba(74,222,128,0.75)",w:15,h:5,dur:3.5,del:0.5},
    {c:"rgba(22,163,74,0.65)",w:22,h:8,dur:2.5,del:1.0},{c:"rgba(134,239,172,0.80)",w:12,h:5,dur:4.0,del:0.3},
    {c:"rgba(74,222,128,0.90)",w:18,h:6,dur:3.2,del:1.5},{c:"rgba(34,197,94,0.60)",w:10,h:4,dur:2.6,del:0.8},
    {c:"rgba(22,163,74,0.70)",w:25,h:8,dur:3.8,del:0.2},{c:"rgba(134,239,172,0.70)",w:14,h:5,dur:2.9,del:1.2},
    {c:"rgba(74,222,128,0.85)",w:16,h:6,dur:3.4,del:0.6},{c:"rgba(34,197,94,0.60)",w:20,h:7,dur:2.7,del:1.8},
    {c:"rgba(167,243,208,0.75)",w:13,h:5,dur:4.2,del:0.4},{c:"rgba(22,163,74,0.65)",w:18,h:6,dur:3.1,del:1.1},
    {c:"rgba(74,222,128,0.80)",w:11,h:4,dur:2.4,del:0.9},{c:"rgba(134,239,172,0.70)",w:23,h:8,dur:3.7,del:1.4},
    {c:"rgba(34,197,94,0.85)",w:15,h:5,dur:3.0,del:0.7},
  ];
  const WIND_TOPS_S = [5,12,20,28,36,45,53,62,70,78,86,15,33,58,73];
  const renderAnimS = (type: string) => {
    if (type === "none") return null;
    if (type === "wind") {
      return (<>
        {WIND_PS.map((p, i) => (
          <div key={i} style={{ position:"absolute", left:"-50px", top:`${WIND_TOPS_S[i]}%`, width:`${p.w}px`, height:`${p.h}px`, background:p.c, borderRadius:"50%", animation:`swfall ${p.dur}s ${p.del}s ease-in-out infinite`, pointerEvents:"none" }} />
        ))}
        <style>{`@keyframes swfall{0%{transform:translateX(0px) translateY(0px) rotate(0deg);opacity:0}8%{opacity:0.9}25%{transform:translateX(25vw) translateY(-45px) rotate(140deg)}50%{transform:translateX(52vw) translateY(35px) rotate(290deg)}75%{transform:translateX(80vw) translateY(-30px) rotate(430deg)}92%{opacity:0.85}100%{transform:translateX(120vw) translateY(20px) rotate(580deg);opacity:0}}`}</style>
      </>);
    }
    if (type === "cracker") {
      const dirs = [
        {tx:-90,ty:-150},{tx:-60,ty:-185},{tx:-25,ty:-200},{tx:15,ty:-200},
        {tx:50,ty:-190},{tx:80,ty:-165},{tx:105,ty:-130},{tx:120,ty:-95}
      ];
      const COLORS = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43","#ff6b6b","#4d96ff"];
      const CRACKERS = [{x:"18%",bd:0},{x:"50%",bd:1.5},{x:"82%",bd:3.0}];
      return (<>
        {CRACKERS.flatMap((cr,ci)=>dirs.map((d,di)=>(
          <div key={`${ci}-${di}`} style={{position:"absolute",bottom:"8%",left:cr.x,width:di%3===0?"8px":"6px",height:di%3===0?"8px":"6px",background:COLORS[di],borderRadius:di%2===0?"50%":"2px",animation:`scrk-d${di} 4.5s ${cr.bd+di*0.04}s ease-in infinite backwards`,pointerEvents:"none"}} />
        )))}
        <style>{`
          @keyframes scrk-d0{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-90px,-150px);opacity:0.9}100%{transform:translate(-110px,180px);opacity:0}}
          @keyframes scrk-d1{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-60px,-185px);opacity:0.9}100%{transform:translate(-75px,180px);opacity:0}}
          @keyframes scrk-d2{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(-25px,-200px);opacity:0.9}100%{transform:translate(-30px,180px);opacity:0}}
          @keyframes scrk-d3{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(15px,-200px);opacity:0.9}100%{transform:translate(20px,180px);opacity:0}}
          @keyframes scrk-d4{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(50px,-190px);opacity:0.9}100%{transform:translate(60px,180px);opacity:0}}
          @keyframes scrk-d5{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(80px,-165px);opacity:0.9}100%{transform:translate(100px,180px);opacity:0}}
          @keyframes scrk-d6{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(105px,-130px);opacity:0.9}100%{transform:translate(130px,180px);opacity:0}}
          @keyframes scrk-d7{0%,2%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(120px,-95px);opacity:0.9}100%{transform:translate(145px,180px);opacity:0}}
        `}</style>
      </>);
    }

    if (type === "thunder") {
      const drops = [5,10,14,18,22,27,31,35,40,44,48,52,57,61,65,70,74,78,83,87,91,3,20,38,55,72].map((l,i)=>({l,dur:0.55+(i%4)*0.1,del:(i%7)*0.12}));
      return (<>
        {drops.map((d,i)=>(
          <div key={i} style={{position:"absolute",left:`${d.l}%`,top:"-10px",width:"2px",height:"18px",background:`rgba(130,180,255,${0.6+i%3*0.2})`,borderRadius:"1px",animation:`sthr-rain ${d.dur}s ${d.del}s linear infinite`,pointerEvents:"none"}} />
        ))}
        <div style={{position:"absolute",inset:0,animation:"slflash1 6s linear 0.3s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,255,0.95)"}} />
        <div style={{position:"absolute",inset:0,animation:"slflash2 9s linear 3.5s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,200,0.9)"}} />
        <div style={{position:"absolute",inset:0,animation:"slflash3 7s linear 6.0s infinite normal backwards",pointerEvents:"none",background:"rgba(255,255,255,0.95)"}} />
        <style>{`
          @keyframes sthr-rain{to{transform:translateY(110vh) translateX(15px)}}
          @keyframes slflash1{0%,100%{opacity:0}2%{opacity:1}4%{opacity:0.05}6%{opacity:0.8}9%,100%{opacity:0}}
          @keyframes slflash2{0%,100%{opacity:0}3%{opacity:0.9}5%{opacity:0}7%{opacity:0.7}10%,100%{opacity:0}}
          @keyframes slflash3{0%,100%{opacity:0}2.5%{opacity:1}4.5%{opacity:0.1}7%{opacity:0.85}10%,100%{opacity:0}}
        `}</style>
      </>);
    }
    if (type === "sun") {
      const rayDegs = [0,25,50,75,100,125,150,170];
      const sparkles = [
        {l:"18%",t:"18%",s:5,dur:2.2,del:0.0},{l:"32%",t:"8%",s:3,dur:1.8,del:0.6},
        {l:"8%",t:"35%",s:4,dur:2.5,del:1.1},{l:"48%",t:"14%",s:3,dur:2.0,del:0.3},
        {l:"62%",t:"28%",s:4,dur:2.3,del:1.4},{l:"22%",t:"48%",s:3,dur:1.9,del:0.8},
      ];
      return (<>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 92% -5%, rgba(255,200,50,0.22) 0%, rgba(255,170,0,0.07) 45%, transparent 65%)",pointerEvents:"none"}} />
        {rayDegs.map((deg,i)=>(
          <div key={i} style={{position:"absolute",top:"15px",right:"15px",width:`${60+i%3*18}px`,height:"3px",background:"linear-gradient(to left, rgba(255,220,80,0), rgba(255,210,60,0.9))",transformOrigin:"right center",transform:`rotate(${deg}deg)`,animation:`ssunray ${3+i*0.4}s ${i*0.2}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <div style={{position:"absolute",top:"-50px",right:"-50px",width:"130px",height:"130px",borderRadius:"50%",background:"radial-gradient(circle, #fff7a0 0%, #ffd700 45%, rgba(255,180,0,0) 100%)",boxShadow:"0 0 45px 22px rgba(255,210,50,0.40)",animation:"ssunpulse 2.8s ease-in-out infinite",pointerEvents:"none"}} />
        {sparkles.map((sp,i)=>(
          <div key={`ss${i}`} style={{position:"absolute",left:sp.l,top:sp.t,width:`${sp.s}px`,height:`${sp.s}px`,borderRadius:"50%",background:"rgba(255,240,100,0.95)",animation:`ssunspk ${sp.dur}s ${sp.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`
          @keyframes ssunpulse{0%,100%{transform:scale(1);opacity:0.85}50%{transform:scale(1.1);opacity:1}}
          @keyframes ssunray{0%,100%{opacity:0.2}50%{opacity:0.95}}
          @keyframes ssunspk{0%,100%{transform:scale(0.2);opacity:0}45%,55%{transform:scale(1);opacity:1}}
        `}</style>
      </>);
    }
    if (type === "sakura") {
      const petals = [
        {l:5,s:9,dur:4.5,del:0},{l:12,s:7,dur:5.2,del:0.8},{l:20,s:10,dur:4.0,del:1.5},
        {l:28,s:8,dur:5.8,del:0.3},{l:36,s:9,dur:4.3,del:1.8},{l:44,s:7,dur:5.5,del:0.6},
        {l:52,s:10,dur:4.8,del:1.2},{l:60,s:8,dur:5.0,del:2.0},{l:68,s:9,dur:4.2,del:0.4},
        {l:75,s:7,dur:5.3,del:1.6},{l:82,s:10,dur:4.6,del:0.9},{l:90,s:8,dur:5.7,del:0.2},
        {l:15,s:9,dur:4.9,del:1.4},{l:38,s:7,dur:5.1,del:0.7},{l:62,s:8,dur:4.4,del:1.9},{l:78,s:9,dur:5.4,del:1.1},
      ];
      return (<>
        {petals.map((p,i)=>(
          <div key={i} style={{position:"absolute",left:`${p.l}%`,top:"-12px",width:`${p.s*1.4}px`,height:`${p.s}px`,background:`rgba(255,${150+i%4*20},${175+i%3*15},${0.75+i%3*0.07})`,borderRadius:"50% 50% 50% 50% / 60% 60% 40% 40%",animation:`ssakfall ${p.dur}s ${p.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes ssakfall{0%{transform:translateX(0) translateY(0) rotate(0deg);opacity:0.9}15%{transform:translateX(12px) translateY(15vh) rotate(45deg)}30%{transform:translateX(-8px) translateY(30vh) rotate(100deg)}45%{transform:translateX(15px) translateY(45vh) rotate(160deg)}60%{transform:translateX(-10px) translateY(60vh) rotate(220deg)}75%{transform:translateX(8px) translateY(75vh) rotate(280deg)}100%{transform:translateX(-5px) translateY(112vh) rotate(360deg);opacity:0.7}}`}</style>
      </>);
    }
    if (type === "leaves") {
      const LC = ["#f97316","#ef4444","#b45309","#fbbf24","#dc2626","#92400e","#ea580c","#ca8a04"];
      const leaves = [5,12,20,28,36,44,52,60,68,75,82,90,18,55].map((l,i)=>({l,s:8+i%3*2,dur:4.5+i%4*0.8,del:i*0.3,c:LC[i%8]}));
      return (<>
        {leaves.map((lf,i)=>(
          <div key={i} style={{position:"absolute",left:`${lf.l}%`,top:"-14px",width:`${lf.s}px`,height:`${Math.round(lf.s*1.3)}px`,background:lf.c,borderRadius:"60% 20% 60% 20%",animation:`sleaffall ${lf.dur}s ${lf.del}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes sleaffall{0%{transform:translateX(0) translateY(0) rotate(0deg);opacity:0.95}20%{transform:translateX(18px) translateY(20vh) rotate(80deg)}40%{transform:translateX(-14px) translateY(40vh) rotate(180deg)}60%{transform:translateX(20px) translateY(60vh) rotate(260deg)}80%{transform:translateX(-10px) translateY(80vh) rotate(350deg)}100%{transform:translateX(15px) translateY(112vh) rotate(440deg);opacity:0.6}}`}</style>
      </>);
    }
    if (type === "wave") {
      return (<>
        <div style={{position:"absolute",bottom:0,left:"-20%",width:"140%",height:"120px",background:"rgba(59,130,246,0.22)",borderRadius:"100% 100% 0 0",animation:"swave1 3.5s ease-in-out infinite",pointerEvents:"none"}} />
        <div style={{position:"absolute",bottom:0,left:"-15%",width:"130%",height:"90px",background:"rgba(96,165,250,0.18)",borderRadius:"100% 100% 0 0",animation:"swave2 4.2s 0.8s ease-in-out infinite",pointerEvents:"none"}} />
        <div style={{position:"absolute",bottom:0,left:"-25%",width:"150%",height:"65px",background:"rgba(186,230,253,0.20)",borderRadius:"100% 100% 0 0",animation:"swave3 2.8s 1.5s ease-in-out infinite",pointerEvents:"none"}} />
        {[15,30,48,65,80,95].map((l,i)=>(
          <div key={i} style={{position:"absolute",bottom:`${35+i%3*18}px`,left:`${l}%`,width:"3px",height:"3px",borderRadius:"50%",background:"rgba(255,255,255,0.75)",animation:`swspk 2s ${i*0.35}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`
          @keyframes swave1{0%,100%{transform:translateY(0) translateX(0)}50%{transform:translateY(-30px) translateX(15px)}}
          @keyframes swave2{0%,100%{transform:translateY(-8px) translateX(0)}50%{transform:translateY(-22px) translateX(-12px)}}
          @keyframes swave3{0%,100%{transform:translateY(-4px) translateX(8px)}50%{transform:translateY(-24px) translateX(-8px)}}
          @keyframes swspk{0%,100%{opacity:0;transform:scale(0.5)}50%{opacity:0.85;transform:scale(1.3)}}
        `}</style>
      </>);
    }
    if (type === "stars") {
      const stPos = [
        {l:5,t:8},{l:12,t:22},{l:18,t:5},{l:25,t:32},{l:32,t:15},
        {l:38,t:28},{l:45,t:8},{l:52,t:40},{l:58,t:18},{l:65,t:12},
        {l:72,t:35},{l:78,t:5},{l:85,t:25},{l:92,t:18},{l:8,t:48},
        {l:22,t:55},{l:35,t:42},{l:48,t:62},{l:62,t:50},{l:75,t:58},
        {l:88,t:45},{l:15,t:70},{l:42,t:75},{l:68,t:68},{l:82,t:80},
      ];
      return (<>
        {stPos.map((st,i)=>(
          <div key={i} style={{position:"absolute",left:`${st.l}%`,top:`${st.t}%`,width:`${2+i%3}px`,height:`${2+i%3}px`,borderRadius:"50%",background:`rgba(255,${235+i%3*7},${160+i%4*18},${0.8+i%4*0.05})`,animation:`sstartwinkle ${1.5+i%5*0.4}s ${i*0.14}s ease-in-out infinite`,pointerEvents:"none"}} />
        ))}
        <style>{`@keyframes sstartwinkle{0%,100%{opacity:0.12;transform:scale(0.7)}50%{opacity:1;transform:scale(1.3)}}`}</style>
      </>);
    }
    if (type === "fireworks") {
      const FWC = ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#c77dff","#ff9f43","#ff6bde","#6bffd6","#fff06b","#ffb6c1","#4d96ff","#c77dff"];
      const LAUNCHES = [{x:"25%",y:"22%",bd:0},{x:"65%",y:"18%",bd:1.8},{x:"45%",y:"38%",bd:3.5}];
      const PEAKS = [[110,0],[95,55],[55,95],[0,110],[-55,95],[-95,55],[-110,0],[-95,-55],[-55,-95],[0,-110],[55,-95],[95,-55]];
      const ENDS  = [[143,50],[124,105],[72,145],[0,160],[-72,145],[-124,105],[-143,50],[-124,-5],[-72,-45],[0,-60],[72,-45],[124,-5]];
      const sfwKF = PEAKS.map(([px,py],i)=>`@keyframes sfw-${i}{0%,4%{transform:translate(0,0);opacity:0}8%{opacity:1}45%{transform:translate(${px}px,${py}px);opacity:0.9}100%{transform:translate(${ENDS[i][0]}px,${ENDS[i][1]}px);opacity:0}}`).join("");
      return (<>
        {LAUNCHES.flatMap((lch,li)=>FWC.map((_,ai)=>(
          <div key={`${li}-${ai}`} style={{position:"absolute",left:lch.x,top:lch.y,width:"5px",height:"5px",borderRadius:"50%",background:FWC[ai],animation:`sfw-${ai} 3.5s ${lch.bd+ai*0.025}s ease-out infinite backwards`,pointerEvents:"none"}} />
        )))}
        <style>{sfwKF}</style>
      </>);
    }
    if (!ANIM_PARTICLES_S[type]) return null;
    const particles = ANIM_PARTICLES_S[type];
    const isSun = type === "sun";
    return (<>
      {particles.map((p, i) => (
        <div key={i} style={{ position:"absolute", left:`${FIXED_POS_S[i%FIXED_POS_S.length]}%`, top: isSun?`${FIXED_POS_S[(i+5)%FIXED_POS_S.length]}%`:"-10px", width: isSun?"6px":type==="rain"?"2px":"7px", height: isSun?"6px":type==="rain"?"12px":"7px", background:p.color, borderRadius:type==="snow"||isSun?"50%":"1px", transform:p.shape, animation:`sfall-${type} ${1.5+(i%5)*0.4}s ${(i%4)*0.3}s linear infinite`, pointerEvents:"none" }} />
      ))}
      <style>{`@keyframes sfall-confetti{to{transform:translateY(110vh) rotate(720deg)}} @keyframes sfall-snow{to{transform:translateY(110vh) translateX(10px)}} @keyframes sfall-rain{to{transform:translateY(110vh) translateX(20px)}} @keyframes sfall-sun{0%{transform:scale(1) rotate(0);opacity:0.6}50%{transform:scale(2.5) rotate(180deg);opacity:0.3}100%{transform:scale(1) rotate(360deg);opacity:0.6}}`}</style>
    </>);
  };

  const previewImageSrc = thankYouPreview
    || (thankYouImageUrl ? (thankYouImageUrl.startsWith("http") ? thankYouImageUrl : `/uploads/${thankYouImageUrl}`) : null)
    || (currentAvatarUrl ? (currentAvatarUrl.startsWith("http") ? currentAvatarUrl : `/uploads/${currentAvatarUrl}`) : null);
  const previewAdminName = session?.user?.name || "";

  return (
    <div className="min-h-screen flex flex-col">
      {/* メッセージプレビューモーダル */}
      {showMsgPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
          onClick={() => setShowMsgPreview(false)}
        >
          <div
            className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4" style={{ animation: "bow 1.2s ease-in-out infinite" }}>
              {previewImageSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewImageSrc} alt="プレビュー" className="w-24 h-24 rounded-full object-cover border-4 border-blue-100" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-600 flex items-center justify-center text-3xl font-bold text-white border-4 border-blue-100">
                  {previewAdminName[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-700 mb-6 text-center whitespace-pre-line">
              {thankYouMsgInput || "今月はお疲れ様でした！\nまた来月もよろしくお願いします。"}
            </p>
            <button
              onClick={() => setShowMsgPreview(false)}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition"
            >
              閉じる
            </button>
            <p className="text-xs text-gray-400 mt-3">※ これはプレビューです</p>
          </div>
          <style>{`
            @keyframes bow {
              0%, 100% { transform: rotate(0deg); transform-origin: bottom center; }
              30%, 70% { transform: rotate(15deg); transform-origin: bottom center; }
            }
          `}</style>
        </div>
      )}
      {/* 画像ストックピッカー */}
      {showStockPicker && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60" onClick={() => setShowStockPicker(false)}>
          <div className="bg-white rounded-t-2xl p-5 w-full max-w-sm max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-gray-800 mb-3">画像を選ぶ</h3>
            {stockImages.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">ストックに画像がありません</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {stockImages.map((img) => (
                  <button key={img.id} onClick={() => {
                    if (showStockPicker === "season") {
                      setSeasonForm((f) => ({ ...f, imageUrl: img.filename }));
                      setSeasonImgPreview(null); setSeasonImgFile(null);
                    } else if (showStockPicker === "thankYou") {
                      setThankYouImageUrl(img.filename);
                      setThankYouPreview(null); setThankYouPendingFile(null);
                      fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thankYouImageUrl: img.filename }) });
                    }
                    setShowStockPicker(false);
                  }} className="relative aspect-square rounded-xl overflow-hidden border-2 border-transparent hover:border-blue-500 transition">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.filename.startsWith("http") ? img.filename : `/uploads/${img.filename}`} alt={img.label || img.originalName} className="w-full h-full object-cover" />
                    {img.label && <p className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-xs text-center py-0.5 truncate">{img.label}</p>}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowStockPicker(false)} className="w-full py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50">キャンセル</button>
          </div>
        </div>
      )}

      {/* 季節メッセージプレビュー */}
      {previewingSeason && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 overflow-hidden" onClick={() => setPreviewingSeason(false)}>
          {renderAnimS(seasonForm.animation)}
          <div className="bg-white rounded-3xl p-8 flex flex-col items-center max-w-xs w-full shadow-2xl relative z-10" onClick={(e) => e.stopPropagation()}>
            {(seasonImgPreview || seasonForm.imageUrl) && (
              <div className="mb-4" style={{ animation: "bow 1.2s ease-in-out infinite" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={seasonImgPreview || (seasonForm.imageUrl?.startsWith("http") ? seasonForm.imageUrl! : `/uploads/${seasonForm.imageUrl}`)} alt="プレビュー" className="w-24 h-24 rounded-full object-cover border-4 border-blue-100" />
              </div>
            )}
            <p className="text-sm text-gray-700 mb-6 text-center whitespace-pre-line">{seasonForm.message || "メッセージを入力してください"}</p>
            <button onClick={() => setPreviewingSeason(false)} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium hover:bg-blue-700 transition">閉じる</button>
            <p className="text-xs text-gray-400 mt-3">※ これはプレビューです</p>
          </div>
        </div>
      )}
      <Header />
      <main className="flex-1 max-w-md mx-auto w-full px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-white">←</button>
          <h2 className="text-lg font-bold text-white">設定</h2>
        </div>

        {/* ストレージ残量 */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-700">💾 ストレージ残量</span>
              <button
                onClick={async () => {
                  setLoadingStorage(true);
                  const res = await fetch("/api/admin/storage");
                  if (res.ok) setStorage(await res.json());
                  setLoadingStorage(false);
                }}
                disabled={loadingStorage}
                className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {loadingStorage ? "確認中..." : "確認する"}
              </button>
            </div>
            {storage ? (
              <div className="space-y-2">
                {[
                  { label: "DB", ...storage.db },
                  { label: "写真", ...storage.blob },
                ].map(({ label, used, limit }) => {
                  const pct = Math.min(100, Math.round((used / limit) * 100));
                  const mb = (used / 1024 / 1024).toFixed(0);
                  const limitMb = (limit / 1024 / 1024).toFixed(0);
                  const color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-400" : "bg-blue-500";
                  return (
                    <div key={label}>
                      <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                        <span>{label}</span>
                        <span>{mb} MB / {limitMb} MB（{pct}%）</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-gray-400">ボタンを押すと現在の使用量を取得します</p>
            )}
          </div>
        )}

        {/* 依頼名マスター */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 mb-3">
            <button onClick={() => toggleSection("worktypes")} className="w-full flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold text-gray-800">📋 依頼名の管理</span>
              <span className="text-gray-400 text-xs">{isOpen("worktypes") ? "▲" : "▼"}</span>
            </button>
            {isOpen("worktypes") && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="space-y-1.5 mb-3">
                  <div className="flex gap-2">
                    <input type="text" value={newWorkType}
                      onChange={(e) => setNewWorkType(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addWorkType(); } }}
                      placeholder="依頼名を入力"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <button type="button" onClick={addWorkType} disabled={savingWorkType || !newWorkType.trim()} className="shrink-0 bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">追加</button>
                  </div>
                  <div className="flex gap-2">
                    <input type="text" inputMode="numeric" value={newWorkTypeAmount}
                      onChange={(e) => setNewWorkTypeAmount(e.target.value)}
                      onBlur={(e) => setNewWorkTypeAmount(e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, ""))}
                      placeholder="デフォルト金額（任意）"
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    <select value={newWorkTypeUrgency} onChange={(e) => setNewWorkTypeUrgency(e.target.value)} className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">緊急度（任意）</option>
                      <option value="HIGH">高</option>
                      <option value="MEDIUM">中</option>
                      <option value="LOW">低</option>
                    </select>
                  </div>
                </div>
                {workTypes.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">まだ登録されていません</p>
                ) : (
                  <div className="space-y-1">
                    {workTypes.map((w) => (
                      <div key={w.id} className="bg-gray-50 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-700 font-medium truncate">{w.name}</p>
                            <p className="text-xs text-gray-400">
                              {w.defaultAmount ? `¥${w.defaultAmount.toLocaleString()}` : "―"}
                              {" · "}
                              {w.defaultUrgency ? urgencyLabel[w.defaultUrgency] : "―"}
                            </p>
                          </div>
                          <button type="button" onClick={() => { setExpandedWorkTypeId(expandedWorkTypeId === w.id ? null : w.id); setEditAmounts((p) => ({ ...p, [w.id]: w.defaultAmount ? String(w.defaultAmount) : "" })); setEditUrgencies((p) => ({ ...p, [w.id]: w.defaultUrgency || "" })); }} className="text-blue-500 text-xs shrink-0">編集</button>
                          <button type="button" onClick={() => deleteWorkType(w.id)} className="text-red-400 text-xs shrink-0">削除</button>
                        </div>
                        {expandedWorkTypeId === w.id && (
                          <div className="px-3 pb-2.5 pt-1.5 space-y-1.5 border-t border-gray-200">
                            <div className="flex gap-2">
                              <input type="text" inputMode="numeric" value={editAmounts[w.id] || ""}
                                onChange={(e) => setEditAmounts((p) => ({ ...p, [w.id]: e.target.value }))}
                                onBlur={(e) => setEditAmounts((p) => ({ ...p, [w.id]: e.target.value.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "") }))}
                                placeholder="金額（税別）"
                                className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              <select value={editUrgencies[w.id] || ""} onChange={(e) => setEditUrgencies((p) => ({ ...p, [w.id]: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                <option value="">緊急度なし</option>
                                <option value="HIGH">高</option>
                                <option value="MEDIUM">中</option>
                                <option value="LOW">低</option>
                              </select>
                            </div>
                            <button type="button" onClick={() => saveWorkTypeDefaults(w.id)} className="w-full bg-blue-600 text-white text-xs py-1.5 rounded-lg hover:bg-blue-700 transition">保存</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* メッセージ管理（季節 + 月末 統合） */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 mb-3">
            <button onClick={() => toggleSection("messages")} className="w-full flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold text-gray-800">💬 メッセージ管理</span>
              <span className="text-gray-400 text-xs">{isOpen("messages") ? "▲" : "▼"}</span>
            </button>
            {isOpen("messages") && (
              <div className="border-t border-gray-100">
                {/* タブ */}
                <div className="flex border-b border-gray-100">
                  <button onClick={() => setMsgTab("seasonal")} className={`flex-1 py-2.5 text-xs font-medium transition ${msgTab === "seasonal" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>🌸 季節のメッセージ</button>
                  <button onClick={() => setMsgTab("thankyou")} className={`flex-1 py-2.5 text-xs font-medium transition ${msgTab === "thankyou" ? "text-blue-600 border-b-2 border-blue-600" : "text-gray-400"}`}>🙏 月末メッセージ</button>
                </div>

                {/* 季節タブ */}
                {msgTab === "seasonal" && (
                  <div className="px-4 pb-4 pt-3">
                    <div className="flex justify-end mb-3">
                      <button onClick={openNewSeason} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition">＋ 追加</button>
                    </div>
                    {editingSeasonId === "new" && (
                      <div className="border border-blue-200 rounded-xl p-4 mb-3 bg-blue-50/40 space-y-3">
                        <p className="text-xs font-bold text-blue-700">新規追加</p>
                        <input value={seasonForm.name} onChange={(e) => setSeasonForm((p) => ({ ...p, name: e.target.value }))} placeholder="名前（例: 夏の安全注意）" className={inputClass} />
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">開始日</p>
                            <div className="flex gap-1">
                              <select value={seasonForm.startMonth} onChange={(e) => setSeasonForm((p) => ({ ...p, startMonth: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}
                              </select>
                              <select value={seasonForm.startDay} onChange={(e) => setSeasonForm((p) => ({ ...p, startDay: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                {Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
                              </select>
                            </div>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">終了日</p>
                            <div className="flex gap-1">
                              <select value={seasonForm.endMonth} onChange={(e) => setSeasonForm((p) => ({ ...p, endMonth: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}
                              </select>
                              <select value={seasonForm.endDay} onChange={(e) => setSeasonForm((p) => ({ ...p, endDay: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                {Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                        <textarea value={seasonForm.message} onChange={(e) => setSeasonForm((p) => ({ ...p, message: e.target.value }))} rows={3} placeholder="表示するメッセージ" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                        <div>
                          <p className="text-xs text-gray-500 mb-1">アニメーション</p>
                          <select value={seasonForm.animation} onChange={(e) => setSeasonForm((p) => ({ ...p, animation: e.target.value }))} className={inputClass}>
                            {Object.entries(ANIM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                          </select>
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">画像（任意）</p>
                          <div className="flex items-center gap-3">
                            {(seasonImgPreview || seasonForm.imageUrl) && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={seasonImgPreview || (seasonForm.imageUrl?.startsWith("http") ? seasonForm.imageUrl : `/uploads/${seasonForm.imageUrl}`)} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                            )}
                            <button type="button" onClick={() => seasonImgRef.current?.click()} className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">アップロード</button>
                            <button type="button" onClick={() => setShowStockPicker("season")} className="text-xs border border-blue-300 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">ストックから選ぶ</button>
                            {(seasonImgPreview || seasonForm.imageUrl) && (
                              <button type="button" onClick={() => { setSeasonImgFile(null); setSeasonImgPreview(null); setSeasonForm((p) => ({...p, imageUrl: null})); }} className="text-xs text-red-400 hover:text-red-600">削除</button>
                            )}
                          </div>
                          <input ref={seasonImgRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setSeasonImgFile(f); setSeasonImgPreview(URL.createObjectURL(f)); }}} />
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-1">送信先</p>
                          <div className="flex gap-2 mb-1.5">
                            <button type="button" onClick={() => setSeasonForm((p) => ({ ...p, targetType: "all", targetUserIds: [] }))} className={`flex-1 text-xs rounded-lg py-1.5 border transition ${seasonForm.targetType === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}>全員</button>
                            <button type="button" onClick={() => setSeasonForm((p) => ({ ...p, targetType: "specific" }))} className={`flex-1 text-xs rounded-lg py-1.5 border transition ${seasonForm.targetType === "specific" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}>個別指定</button>
                          </div>
                          {seasonForm.targetType === "specific" && (
                            <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                              {partnerUsers.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-1">協力会社がいません</p>
                              ) : partnerUsers.map((u) => (
                                <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                                  <input type="checkbox" checked={seasonForm.targetUserIds.includes(u.id)} onChange={(e) => { setSeasonForm((p) => ({ ...p, targetUserIds: e.target.checked ? [...p.targetUserIds, u.id] : p.targetUserIds.filter((id) => id !== u.id) })); }} className="rounded" />
                                  <span className="text-xs text-gray-700">{u.name}{u.companyName ? `（${u.companyName}）` : ""}</span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setPreviewingSeason(true)} className="flex-1 border border-gray-300 text-gray-600 text-sm rounded-lg py-2 hover:bg-gray-50 transition">プレビュー</button>
                          <button onClick={saveSeason} disabled={savingSeason || !seasonForm.name || !seasonForm.message} className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition">{savingSeason ? "保存中..." : "保存する"}</button>
                          <button onClick={() => setEditingSeasonId(null)} className="px-3 border border-gray-200 text-gray-400 text-sm rounded-lg py-2 hover:bg-gray-50 transition">✕</button>
                        </div>
                      </div>
                    )}
                    {seasonalMsgs.length === 0 && editingSeasonId !== "new" && (
                      <p className="text-xs text-gray-400 text-center py-3">まだ登録されていません</p>
                    )}
                    <div className="space-y-2">
                      {seasonalMsgs.map((msg) => (
                        <div key={msg.id} className="bg-gray-50 rounded-xl overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2.5">
                            {msg.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={msg.imageUrl.startsWith("http") ? msg.imageUrl : `/uploads/${msg.imageUrl}`} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-700 truncate">{msg.name}</p>
                              <p className="text-xs text-gray-400">{mdLabel(msg.startMD)}〜{mdLabel(msg.endMD)}　{ANIM_LABELS[msg.animation] || "なし"}{msg.targetType === "specific" && <span className="ml-1.5 text-blue-500">個別({msg.targetUserIds.length})</span>}</p>
                            </div>
                            <button onClick={() => toggleSeasonEnabled(msg)} className={`w-10 h-5 rounded-full transition-colors relative shrink-0 ${msg.enabled ? "bg-blue-600" : "bg-gray-300"}`}>
                              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${msg.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                            </button>
                            <button onClick={() => openEditSeason(msg)} className="text-blue-500 text-xs shrink-0">編集</button>
                            <button onClick={() => deleteSeason(msg.id)} className="text-red-400 text-xs shrink-0">削除</button>
                          </div>
                          {editingSeasonId === msg.id && (
                            <div className="border-t border-gray-200 px-3 pb-3 pt-2 space-y-3">
                              <input value={seasonForm.name} onChange={(e) => setSeasonForm((p) => ({ ...p, name: e.target.value }))} placeholder="名前" className={inputClass} />
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">開始日</p>
                                  <div className="flex gap-1">
                                    <select value={seasonForm.startMonth} onChange={(e) => setSeasonForm((p) => ({ ...p, startMonth: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                      {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}
                                    </select>
                                    <select value={seasonForm.startDay} onChange={(e) => setSeasonForm((p) => ({ ...p, startDay: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                      {Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500 mb-1">終了日</p>
                                  <div className="flex gap-1">
                                    <select value={seasonForm.endMonth} onChange={(e) => setSeasonForm((p) => ({ ...p, endMonth: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                      {Array.from({length:12},(_,i)=><option key={i+1} value={i+1}>{i+1}月</option>)}
                                    </select>
                                    <select value={seasonForm.endDay} onChange={(e) => setSeasonForm((p) => ({ ...p, endDay: e.target.value }))} className="flex-1 border border-gray-300 rounded-lg px-2 py-2 text-sm text-gray-900">
                                      {Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}日</option>)}
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <textarea value={seasonForm.message} onChange={(e) => setSeasonForm((p) => ({ ...p, message: e.target.value }))} rows={3} placeholder="メッセージ" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                              <select value={seasonForm.animation} onChange={(e) => setSeasonForm((p) => ({ ...p, animation: e.target.value }))} className={inputClass}>
                                {Object.entries(ANIM_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                              </select>
                              <div className="flex items-center gap-3">
                                {(seasonImgPreview || seasonForm.imageUrl) && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={seasonImgPreview || (seasonForm.imageUrl?.startsWith("http") ? seasonForm.imageUrl : `/uploads/${seasonForm.imageUrl}`)} alt="" className="w-12 h-12 rounded-full object-cover border border-gray-200" />
                                )}
                                <button type="button" onClick={() => seasonImgRef.current?.click()} className="text-xs border border-gray-300 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition">アップロード</button>
                                <button type="button" onClick={() => setShowStockPicker("season")} className="text-xs border border-blue-300 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition">ストックから選ぶ</button>
                                {(seasonImgPreview || seasonForm.imageUrl) && (
                                  <button type="button" onClick={() => { setSeasonImgFile(null); setSeasonImgPreview(null); setSeasonForm((p) => ({...p, imageUrl: null})); }} className="text-xs text-red-400">削除</button>
                                )}
                              </div>
                              <div>
                                <p className="text-xs text-gray-500 mb-1">送信先</p>
                                <div className="flex gap-2 mb-1.5">
                                  <button type="button" onClick={() => setSeasonForm((p) => ({ ...p, targetType: "all", targetUserIds: [] }))} className={`flex-1 text-xs rounded-lg py-1.5 border transition ${seasonForm.targetType === "all" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}>全員</button>
                                  <button type="button" onClick={() => setSeasonForm((p) => ({ ...p, targetType: "specific" }))} className={`flex-1 text-xs rounded-lg py-1.5 border transition ${seasonForm.targetType === "specific" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-300"}`}>個別指定</button>
                                </div>
                                {seasonForm.targetType === "specific" && (
                                  <div className="space-y-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                                    {partnerUsers.length === 0 ? (
                                      <p className="text-xs text-gray-400 text-center py-1">協力会社がいません</p>
                                    ) : partnerUsers.map((u) => (
                                      <label key={u.id} className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={seasonForm.targetUserIds.includes(u.id)} onChange={(e) => { setSeasonForm((p) => ({ ...p, targetUserIds: e.target.checked ? [...p.targetUserIds, u.id] : p.targetUserIds.filter((id) => id !== u.id) })); }} className="rounded" />
                                        <span className="text-xs text-gray-700">{u.name}{u.companyName ? `（${u.companyName}）` : ""}</span>
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => setPreviewingSeason(true)} className="flex-1 border border-gray-300 text-gray-600 text-sm rounded-lg py-2 hover:bg-gray-50 transition">プレビュー</button>
                                <button onClick={saveSeason} disabled={savingSeason} className="flex-1 bg-blue-600 text-white text-sm rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50 transition">{savingSeason ? "保存中..." : "保存"}</button>
                                <button onClick={() => setEditingSeasonId(null)} className="px-3 border border-gray-200 text-gray-400 text-sm rounded-lg hover:bg-gray-50 transition">✕</button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 月末タブ */}
                {msgTab === "thankyou" && (
                  <div className="px-4 pb-4 pt-3">
                    {thankYouSaveResult && (
                      <div className={`text-xs px-3 py-2 rounded-lg mb-3 ${thankYouSaveResult.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                        {thankYouSaveResult.text}
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm text-gray-700">メッセージを表示する</span>
                      <button onClick={() => saveThankYouSettings(!thankYouEnabled)} disabled={savingThankYou} className={`w-12 h-6 rounded-full transition-colors relative ${thankYouEnabled ? "bg-blue-600" : "bg-gray-300"}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${thankYouEnabled ? "translate-x-6" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                    {thankYouEnabled && (
                      <>
                        <textarea value={thankYouMsgInput} onChange={(e) => setThankYouMsgInput(e.target.value)} rows={2} placeholder={"今月はお疲れ様でした！\nまた来月もよろしくお願いします。"} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-2" />
                        <div className="flex gap-2 mb-3">
                          <button type="button" onClick={() => setShowMsgPreview(true)} className="flex-1 border border-gray-300 text-gray-600 text-xs rounded-lg py-1.5 hover:bg-gray-50 transition">プレビュー</button>
                          <button type="button" onClick={saveThankYouMsg} disabled={savingMsg} className="flex-1 bg-blue-600 text-white text-xs rounded-lg py-1.5 hover:bg-blue-700 disabled:opacity-50 transition">{savingMsg ? "保存中..." : "保存する"}</button>
                        </div>
                        <input ref={thankYouFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setThankYouPendingFile(f); setThankYouPreview(URL.createObjectURL(f)); }} />
                        <div className="flex items-center gap-2">
                          {(thankYouPreview || thankYouImageUrl) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={thankYouPreview || (thankYouImageUrl?.startsWith("http") ? thankYouImageUrl : `/uploads/${thankYouImageUrl}`)} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-blue-200 shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-300 text-lg shrink-0">+</div>
                          )}
                          <button onClick={() => thankYouFileRef.current?.click()} className="text-xs border border-gray-300 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 transition">アップロード</button>
                          <button onClick={() => setShowStockPicker("thankYou")} className="text-xs border border-blue-300 text-blue-600 px-2.5 py-1.5 rounded-lg hover:bg-blue-50 transition">ストックから選ぶ</button>
                          {(thankYouPreview || thankYouImageUrl) && (
                            <button onClick={async () => { await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ thankYouImageUrl: null }) }); setThankYouImageUrl(null); setThankYouPreview(null); setThankYouPendingFile(null); }} className="text-xs text-red-400 hover:text-red-600">削除</button>
                          )}
                        </div>
                        {thankYouPendingFile && (
                          <button onClick={() => saveThankYouSettings(undefined, thankYouPendingFile)} disabled={savingThankYou} className="w-full mt-2 bg-blue-600 text-white text-xs rounded-lg py-1.5 hover:bg-blue-700 disabled:opacity-50 transition">{savingThankYou ? "保存中..." : "画像を保存する"}</button>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">未設定はプロフィール画像が使われます</p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 画像ストック */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 mb-3">
            <button onClick={() => toggleSection("stock")} className="w-full flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold text-gray-800">📸 画像ストック</span>
              <span className="text-gray-400 text-xs">{isOpen("stock") ? "▲" : "▼"}</span>
            </button>
            {isOpen("stock") && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                <div className="flex justify-end mb-2">
                  <button onClick={() => stockUploadRef.current?.click()} disabled={uploadingStock} className="text-xs bg-gray-700 text-white px-2.5 py-1 rounded-lg hover:bg-gray-800 disabled:opacity-50 transition">
                    {uploadingStock ? "..." : "＋ 追加"}
                  </button>
                </div>
                <input ref={stockUploadRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadStockImage(f); e.target.value = ""; }} />
                {stockImages.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-2">まだ画像がありません</p>
                ) : (
                  <div className="grid grid-cols-4 gap-1.5">
                    {stockImages.map((img) => (
                      <div key={img.id} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.filename.startsWith("http") ? img.filename : `/uploads/${img.filename}`} alt={img.label || img.originalName} className="w-full aspect-square object-cover rounded-lg border border-gray-200" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex flex-col items-center justify-center gap-1">
                          {img.label && <p className="text-white text-xs font-medium px-1 text-center truncate w-full">{img.label}</p>}
                          <button onClick={() => { setEditingLabelId(img.id); setLabelInput(img.label || ""); }} className="text-white/80 text-xs hover:text-white">✏️</button>
                          <button onClick={() => deleteStockImage(img.id)} className="text-red-300 text-xs hover:text-red-200">削除</button>
                        </div>
                        {editingLabelId === img.id && (
                          <div className="absolute inset-0 bg-black/80 rounded-lg flex flex-col items-center justify-center gap-1.5 p-1.5">
                            <input value={labelInput} onChange={(e) => setLabelInput(e.target.value)} placeholder="ラベル" className="w-full text-xs rounded px-1.5 py-1 text-gray-900" />
                            <div className="flex gap-1">
                              <button onClick={() => saveStockLabel(img.id)} className="text-white text-xs bg-blue-600 px-2 py-0.5 rounded">保存</button>
                              <button onClick={() => setEditingLabelId(null)} className="text-gray-300 text-xs">✕</button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ユーザー管理へのリンク（管理者） */}
        {role === "ADMIN" && (
          <Link href="/users" className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3 mb-3 text-sm text-gray-700 hover:bg-gray-50 transition">
            <span>👥 ユーザー管理</span>
            <span className="text-gray-400">→</span>
          </Link>
        )}

        {/* プロフィール画像 */}
        <div className="bg-white rounded-xl border border-gray-200 mb-3">
          <button onClick={() => toggleSection("avatar")} className="w-full flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-bold text-gray-800">👤 プロフィール画像</span>
            <span className="text-gray-400 text-xs">{isOpen("avatar") ? "▲" : "▼"}</span>
          </button>
          {isOpen("avatar") && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="flex flex-col items-center gap-4 pt-4">
                <div className="relative">
                  {displayAvatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={displayAvatar} alt="avatar" className="w-24 h-24 rounded-full object-cover border-2 border-gray-200" />
                  ) : (
                    <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-3xl font-bold text-blue-600 border-2 border-gray-200">
                      {session?.user?.name?.[0]?.toUpperCase() || "?"}
                    </div>
                  )}
                  {pendingPreview && (
                    <span className="absolute -top-1 -right-1 bg-yellow-400 text-white text-xs px-1.5 py-0.5 rounded-full font-medium">未保存</span>
                  )}
                </div>
                <p className="text-sm font-medium text-gray-800">{session?.user?.name}</p>
                <p className="text-xs text-gray-500">{session?.user?.email}</p>
                {!pendingPreview ? (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={savingAvatar} className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">画像を選択</button>
                    {currentAvatarUrl && (
                      <button type="button" onClick={handleRemoveAvatar} disabled={savingAvatar} className="text-sm border border-gray-300 text-gray-600 px-4 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">削除</button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2 w-full">
                    <button type="button" onClick={handleSaveAvatar} disabled={savingAvatar} className="flex-1 bg-blue-600 text-white text-sm py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition">{savingAvatar ? "保存中..." : "✓ 決定"}</button>
                    <button type="button" onClick={handleCancel} disabled={savingAvatar} className="flex-1 border border-gray-300 text-gray-600 text-sm py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition">キャンセル</button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                {avatarMessage && (
                  <p className={`text-xs ${avatarMessage.type === "success" ? "text-green-600" : "text-red-500"}`}>{avatarMessage.text}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 管理者電話番号 */}
        {role === "ADMIN" && (
          <div className="bg-white rounded-xl border border-gray-200 mb-3">
            <button onClick={() => toggleSection("phone")} className="w-full flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-bold text-gray-800">📞 電話番号</span>
              <span className="text-gray-400 text-xs">{isOpen("phone") ? "▲" : "▼"}</span>
            </button>
            {isOpen("phone") && (
              <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                {phoneMessage && (
                  <div className={`text-sm px-3 py-2 rounded-lg mb-3 ${phoneMessage.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {phoneMessage.text}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="tel" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="例: 090-1234-5678" className={inputClass} />
                  <button type="button" onClick={handleSavePhone} disabled={savingPhone} className="bg-blue-600 text-white text-sm px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition whitespace-nowrap">
                    {savingPhone ? "保存中" : "保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* パスワード変更 */}
        <div className="bg-white rounded-xl border border-gray-200 mb-3">
          <button onClick={() => toggleSection("password")} className="w-full flex items-center justify-between px-4 py-3.5">
            <span className="text-sm font-bold text-gray-800">🔑 パスワード変更</span>
            <span className="text-gray-400 text-xs">{isOpen("password") ? "▲" : "▼"}</span>
          </button>
          {isOpen("password") && (
            <div className="px-4 pb-4 border-t border-gray-100 pt-3">
              <form onSubmit={handlePasswordSubmit} className="space-y-2">
                {message && (
                  <div className={`text-xs px-3 py-2 rounded-lg ${message.type === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                    {message.text}
                  </div>
                )}
                <input type="password" required placeholder="現在のパスワード" value={current} onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
                <input type="password" required minLength={6} placeholder="新しいパスワード（6文字以上）" value={next} onChange={(e) => setNext(e.target.value)} className={inputClass} />
                <input type="password" required placeholder="新しいパスワード（確認）" value={confirm} onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition mt-1">
                  {loading ? "変更中..." : "パスワードを変更する"}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
