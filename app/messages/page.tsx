"use client";

import { useEffect, useState, useRef, useCallback, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Header from "@/components/Header";

interface UserMini {
  id: string;
  name: string;
  companyName: string | null;
  avatarUrl: string | null;
  role: string;
  color: string | null;
}

interface DirectMessage {
  id: string;
  content: string;
  createdAt: string;
  readAt: string | null;
  fromId: string;
  toId: string;
  from: UserMini;
  to: UserMini;
}

interface Thread {
  partner: UserMini;
  lastMessage: DirectMessage;
  unreadCount: number;
}

function UserAvatar({ user, size = 8 }: { user: UserMini; size?: number }) {
  const label = user.companyName || user.name;
  const sizeClass = `w-${size} h-${size}`;
  if (user.avatarUrl) {
    const src = user.avatarUrl.startsWith("http") ? user.avatarUrl : `/uploads/${user.avatarUrl}`;
    return <img src={src} alt={label} className={`${sizeClass} rounded-full object-cover border border-gray-600 shrink-0`} />;
  }
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center text-white font-bold shrink-0`}
      style={{ background: user.color || "#3b82f6", fontSize: size * 2 }}
    >
      {label[0]?.toUpperCase()}
    </div>
  );
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString("ja-JP", { weekday: "short" });
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

function formatDateTime(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-gray-950"><p className="text-gray-400">読み込み中...</p></div>}>
      <MessagesInner />
    </Suspense>
  );
}

function MessagesInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = (session?.user as { role?: string })?.role;
  const myId = (session?.user as { id?: string })?.id;

  const [threads, setThreads] = useState<Thread[]>([]);
  const [partners, setPartners] = useState<UserMini[]>([]); // ADMINのみ
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("userId"));
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const isInputFocusedRef = useRef(false);
  const forceScrollRef = useRef(false); // 送信後は強制スクロール

  // 最下部に近いか判定（100px以内）
  const isNearBottom = () => {
    const el = messagesContainerRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  };

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchThreads = useCallback(async () => {
    const res = await fetch("/api/messages");
    if (res.ok) setThreads(await res.json());
    setLoadingThreads(false);
  }, []);

  // 協力会社一覧（ADMIN用）
  const fetchPartners = useCallback(async () => {
    if (role !== "ADMIN") return;
    const res = await fetch("/api/users?role=PARTNER");
    if (res.ok) {
      const data = await res.json();
      setPartners(data.users || data || []);
    }
  }, [role]);

  const fetchMessages = useCallback(async (userId: string, showLoading = false) => {
    if (showLoading) setLoadingMessages(true);
    const res = await fetch(`/api/messages?userId=${userId}`);
    if (res.ok) setMessages(await res.json());
    if (showLoading) setLoadingMessages(false);
    // 既読（バックグラウンドで実行、レンダリングに影響しない）
    fetch(`/api/messages?userId=${userId}`, { method: "PATCH" }).then(() => fetchThreads());
  }, [fetchThreads]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchThreads();
      fetchPartners();
    }
  }, [status, fetchThreads, fetchPartners]);

  // パートナーが開いたとき：管理者との会話を自動選択
  useEffect(() => {
    if (role === "PARTNER" && !selectedId && threads.length > 0) {
      setSelectedId(threads[0].partner.id);
    }
  }, [role, threads, selectedId]);

  useEffect(() => {
    if (selectedId) {
      forceScrollRef.current = true;
      fetchMessages(selectedId, true); // 初回のみローディング表示
      // ポーリング（10秒・入力中はスキップ・ローディングなし）
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        if (!isInputFocusedRef.current) fetchMessages(selectedId, false);
      }, 10000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selectedId, fetchMessages]);

  // スクロール：送信後 or もともと最下部にいた時のみ
  useEffect(() => {
    if (messages.length === 0) return;
    if (forceScrollRef.current || isNearBottom()) {
      bottomRef.current?.scrollIntoView({ behavior: forceScrollRef.current ? "smooth" : "instant" });
      forceScrollRef.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const selectThread = (userId: string) => {
    setSelectedId(userId);
    setShowNewChat(false);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !selectedId || sending) return;
    setSending(true);
    const content = inputText.trim();
    setInputText("");
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toId: selectedId, content }),
      });
      if (res.ok) {
        forceScrollRef.current = true;
        await fetchMessages(selectedId, false);
        fetchThreads();
      } else {
        setInputText(content);
        alert("送信に失敗しました");
      }
    } catch {
      setInputText(content);
      alert("送信に失敗しました");
    } finally {
      setSending(false);
    }
  };

  const startNewChat = (partnerId: string) => {
    setSelectedId(partnerId);
    setShowNewChat(false);
    setMessages([]);
  };

  // 選択中のユーザー情報
  const selectedUser =
    threads.find(t => t.partner.id === selectedId)?.partner ||
    partners.find(p => p.id === selectedId) ||
    null;

  // 未接触の協力会社（スレッドにない）
  const untouchedPartners = partners.filter(p => !threads.find(t => t.partner.id === p.id));

  // マイチャット（自分宛てスレッド）を通常スレッドから除外
  const regularThreads = threads.filter(t => t.partner.id !== myId);
  const isSelfChat = selectedId === myId;

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center bg-gray-950"><p className="text-gray-400">読み込み中...</p></div>;
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      <Header />
      <main className="flex-1 flex overflow-hidden" style={{ height: "calc(100dvh - 57px)" }}>

        {/* ===== 左パネル：会話一覧 ===== */}
        <div className={`
          ${selectedId ? "hidden sm:flex" : "flex"}
          flex-col w-full sm:w-72 md:w-80 border-r border-gray-700 bg-gray-900 shrink-0
        `}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h2 className="text-base font-bold text-white">メッセージ</h2>
            {role === "ADMIN" && (
              <button
                onClick={() => setShowNewChat(v => !v)}
                className="text-xs bg-blue-600 text-white rounded-lg px-3 py-1.5 hover:bg-blue-700 transition"
              >
                ＋ 新規
              </button>
            )}
          </div>

          {/* 新規チャット選択（ADMIN） */}
          {showNewChat && role === "ADMIN" && (
            <div className="border-b border-gray-700 bg-gray-800 px-3 py-2">
              <p className="text-xs text-gray-400 mb-2">チャット相手を選択</p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {untouchedPartners.length === 0 && <p className="text-xs text-gray-500 py-2">全員と会話済みです</p>}
                {untouchedPartners.map(p => (
                  <button
                    key={p.id}
                    onClick={() => startNewChat(p.id)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-700 transition text-left"
                  >
                    <UserAvatar user={p} size={7} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-100 truncate">{p.companyName || p.name}</p>
                      {p.companyName && <p className="text-xs text-gray-400 truncate">{p.name}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {/* マイチャット（常に最上部に固定） */}
            <button
              onClick={() => selectThread(myId!)}
              className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-800 text-left transition ${
                selectedId === myId ? "bg-gray-700" : "hover:bg-gray-800"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-purple-700 flex items-center justify-center text-xl shrink-0">
                📝
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-100">マイチャット</p>
                  {threads.find(t => t.partner.id === myId) && (
                    <span className="text-xs text-gray-400 shrink-0 ml-1">
                      {formatTime(threads.find(t => t.partner.id === myId)!.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate mt-0.5">
                  {threads.find(t => t.partner.id === myId)?.lastMessage.content || "メモ・記録用"}
                </p>
              </div>
            </button>

            {loadingThreads ? (
              <p className="text-xs text-gray-400 text-center py-8">読み込み中...</p>
            ) : regularThreads.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-3xl mb-2">💬</p>
                <p className="text-sm text-gray-400">まだメッセージがありません</p>
                {role === "ADMIN" && (
                  <p className="text-xs text-gray-500 mt-1">「＋ 新規」から始めてください</p>
                )}
              </div>
            ) : (
              regularThreads.map(thread => (
                <button
                  key={thread.partner.id}
                  onClick={() => selectThread(thread.partner.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b border-gray-800 text-left transition ${
                    selectedId === thread.partner.id ? "bg-gray-700" : "hover:bg-gray-800"
                  }`}
                >
                  <div className="relative shrink-0">
                    <UserAvatar user={thread.partner} size={10} />
                    {thread.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                        {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-100 truncate">
                        {thread.partner.companyName || thread.partner.name}
                      </p>
                      <span className="text-xs text-gray-400 shrink-0 ml-1">
                        {formatTime(thread.lastMessage.createdAt)}
                      </span>
                    </div>
                    <p className={`text-xs truncate mt-0.5 ${thread.unreadCount > 0 ? "text-gray-200 font-medium" : "text-gray-400"}`}>
                      {thread.lastMessage.fromId === myId ? "自分: " : ""}{thread.lastMessage.content}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ===== 右パネル：チャットスレッド ===== */}
        <div className={`${selectedId ? "flex" : "hidden sm:flex"} flex-1 flex-col min-w-0`}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-4xl mb-3">💬</p>
                <p className="text-gray-400 text-sm">会話を選択してください</p>
              </div>
            </div>
          ) : (
            <>
              {/* スレッドヘッダー */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-700 bg-gray-900 shrink-0">
                <button
                  onClick={() => setSelectedId(null)}
                  className="sm:hidden text-gray-400 hover:text-white text-lg"
                >
                  ←
                </button>
                {isSelfChat ? (
                  <>
                    <div className="w-9 h-9 rounded-full bg-purple-700 flex items-center justify-center text-lg shrink-0">📝</div>
                    <div>
                      <p className="text-sm font-bold text-white">マイチャット</p>
                      <p className="text-xs text-gray-400">自分だけのメモ・記録</p>
                    </div>
                  </>
                ) : selectedUser && (
                  <>
                    <UserAvatar user={selectedUser} size={9} />
                    <div>
                      <p className="text-sm font-bold text-white">
                        {selectedUser.companyName || selectedUser.name}
                      </p>
                      {selectedUser.companyName && (
                        <p className="text-xs text-gray-400">{selectedUser.name}</p>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* メッセージ一覧 */}
              <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                {loadingMessages ? (
                  <p className="text-xs text-gray-400 text-center py-8">読み込み中...</p>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    {isSelfChat ? (
                      <>
                        <p className="text-3xl mb-2">📝</p>
                        <p className="text-sm text-gray-400">メモや記録を残しましょう</p>
                        <p className="text-xs text-gray-500 mt-1">自分だけが見られるスペースです</p>
                      </>
                    ) : (
                      <>
                        <p className="text-3xl mb-2">👋</p>
                        <p className="text-sm text-gray-400">まだメッセージはありません</p>
                        <p className="text-xs text-gray-500 mt-1">最初のメッセージを送りましょう</p>
                      </>
                    )}
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const isMine = msg.fromId === myId;
                    const showDate =
                      i === 0 ||
                      new Date(messages[i - 1].createdAt).toDateString() !== new Date(msg.createdAt).toDateString();
                    return (
                      <div key={msg.id}>
                        {showDate && (
                          <div className="text-center my-3">
                            <span className="text-xs text-gray-500 bg-gray-800 px-3 py-1 rounded-full">
                              {new Date(msg.createdAt).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
                            </span>
                          </div>
                        )}
                        <div className={`flex items-end gap-2 ${isMine ? "flex-row-reverse" : "flex-row"}`}>
                          {!isMine && (
                            <div className="shrink-0">
                              <UserAvatar user={msg.from} size={7} />
                            </div>
                          )}
                          <div className={`max-w-[75%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                            <div
                              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                isMine && isSelfChat
                                  ? "bg-purple-700 text-white rounded-br-sm"
                                  : isMine
                                  ? "bg-blue-600 text-white rounded-br-sm"
                                  : "bg-gray-700 text-gray-100 rounded-bl-sm"
                              }`}
                            >
                              {msg.content}
                            </div>
                            <span className="text-xs text-gray-500 px-1">
                              {formatDateTime(msg.createdAt)}
                              {isMine && msg.readAt && " · 既読"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* 入力欄 */}
              <div className="border-t border-gray-700 bg-gray-900 px-4 py-3 shrink-0">
                <div className="flex items-end gap-2">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onFocus={() => { isInputFocusedRef.current = true; }}
                    onBlur={() => { isInputFocusedRef.current = false; }}
                    placeholder={isSelfChat ? "メモを入力..." : "メッセージを入力..."}
                    rows={1}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-2xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    style={{ minHeight: "42px", maxHeight: "120px" }}
                    onInput={(e) => {
                      const t = e.currentTarget;
                      t.style.height = "auto";
                      t.style.height = Math.min(t.scrollHeight, 120) + "px";
                    }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!inputText.trim() || sending}
                    className="shrink-0 w-10 h-10 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-full flex items-center justify-center transition"
                  >
                    {sending ? (
                      <span className="text-xs">...</span>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
