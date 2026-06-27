"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, Search, Star, Paperclip, Send, Check, CheckCheck, X, FileText, ImageIcon } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConversationItem {
  _id: string
  otherUser: { email: string; name: string; avatar: string | null }
  lastMessage: { content: string; senderEmail: string; createdAt: string } | null
  unreadCount: number
  isFavorite: boolean
}

interface MessageItem {
  _id: string
  senderEmail: string
  content: string
  fileName: string | null
  fileData: string | null
  fileType: string | null
  readBy: string[]
  createdAt: string
}

interface SearchUser {
  email: string
  name: string
  avatar: string | null
}

interface ChatViewProps {
  user: { email: string; name: string }
  onUnreadChange: (count: number) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Avatar({ name, avatar, size = "sm" }: { name: string; avatar: string | null; size?: "sm" | "md" | "lg" }) {
  const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)
  const cls = size === "lg" ? "w-10 h-10 text-sm" : size === "md" ? "w-8 h-8 text-xs" : "w-7 h-7 text-[10px]"
  return avatar
    ? <img src={avatar} alt={name} className={`${cls} rounded-full object-cover shrink-0`} />
    : <div className={`${cls} rounded-full bg-[#004685] flex items-center justify-center text-white font-black shrink-0`}>{initials}</div>
}

function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-3 py-2">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block"
          style={{ animation: `typing-bounce 1.2s ${i * 0.2}s ease-in-out infinite` }}
        />
      ))}
    </div>
  )
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })
  return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" })
}

function isImage(type: string | null) {
  return type?.startsWith("image/") ?? false
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatView({ user, onUnreadChange }: ChatViewProps) {
  const [conversations, setConversations]   = useState<ConversationItem[]>([])
  const [selectedConv, setSelectedConv]     = useState<ConversationItem | null>(null)
  const [messages, setMessages]             = useState<MessageItem[]>([])
  const [messageInput, setMessageInput]     = useState("")
  const [searchQuery, setSearchQuery]       = useState("")
  const [searchResults, setSearchResults]   = useState<SearchUser[]>([])
  const [searching, setSearching]           = useState(false)
  const [otherTyping, setOtherTyping]       = useState(false)
  const [sendingMsg, setSendingMsg]         = useState(false)
  const [attachedFile, setAttachedFile]     = useState<{ name: string; data: string; type: string } | null>(null)
  const [convLoading, setConvLoading]       = useState(true)

  const messagesEndRef  = useRef<HTMLDivElement>(null)
  const typingTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const pollMsgRef      = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Fetch conversations ───────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    const res  = await fetch(`/api/direct/conversations?email=${encodeURIComponent(user.email)}`)
    const data = await res.json()
    const convs: ConversationItem[] = data.conversations ?? []
    setConversations(convs)
    onUnreadChange(data.total ?? 0)
    setConvLoading(false)
    // Keep selectedConv in sync (isFavorite, unreadCount may change)
    if (selectedConv) {
      const updated = convs.find(c => c._id === selectedConv._id)
      if (updated) setSelectedConv(updated)
    }
  }, [user.email, onUnreadChange, selectedConv])

  useEffect(() => {
    fetchConversations()
    const iv = setInterval(fetchConversations, 4000)
    return () => clearInterval(iv)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch messages + typing polling ──────────────────────────────────────────

  const fetchMessages = useCallback(async (convId: string) => {
    const res  = await fetch(`/api/direct/conversations/${convId}?email=${encodeURIComponent(user.email)}`)
    const data = await res.json()
    setMessages(data.messages ?? [])
  }, [user.email])

  const fetchTyping = useCallback(async (convId: string) => {
    const res  = await fetch(`/api/direct/typing?convId=${convId}&email=${encodeURIComponent(user.email)}`)
    const data = await res.json()
    setOtherTyping(data.typing ?? false)
  }, [user.email])

  useEffect(() => {
    if (pollMsgRef.current) clearInterval(pollMsgRef.current)
    if (!selectedConv) return

    fetchMessages(selectedConv._id)
    pollMsgRef.current = setInterval(() => {
      fetchMessages(selectedConv._id)
      fetchTyping(selectedConv._id)
    }, 2000)

    return () => {
      if (pollMsgRef.current) clearInterval(pollMsgRef.current)
    }
  }, [selectedConv?._id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, otherTyping])

  // ── User search ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (searchQuery.length < 2) { setSearchResults([]); return }
    setSearching(true)
    const t = setTimeout(async () => {
      const res  = await fetch(`/api/direct/search?q=${encodeURIComponent(searchQuery)}&email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      setSearchResults(data.users ?? [])
      setSearching(false)
    }, 350)
    return () => clearTimeout(t)
  }, [searchQuery, user.email])

  // ── Open conversation with a user ─────────────────────────────────────────────

  const openOrCreateConv = async (targetEmail: string) => {
    setSearchQuery("")
    setSearchResults([])
    const res  = await fetch("/api/direct/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: user.email, to: targetEmail }),
    })
    const data = await res.json()
    await fetchConversations()
    // Find and select the conversation
    const convs = await (await fetch(`/api/direct/conversations?email=${encodeURIComponent(user.email)}`)).json()
    const found = (convs.conversations as ConversationItem[]).find(c => c._id === data.conversationId)
    if (found) setSelectedConv(found)
    setConversations(convs.conversations ?? [])
    onUnreadChange(convs.total ?? 0)
  }

  // ── Send message ──────────────────────────────────────────────────────────────

  const sendMessage = async () => {
    if (!selectedConv) return
    if (!messageInput.trim() && !attachedFile) return
    setSendingMsg(true)
    try {
      await fetch(`/api/direct/conversations/${selectedConv._id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: user.email,
          content:     messageInput.trim(),
          fileName:    attachedFile?.name ?? null,
          fileData:    attachedFile?.data ?? null,
          fileType:    attachedFile?.type ?? null,
        }),
      })
      setMessageInput("")
      setAttachedFile(null)
      await fetchMessages(selectedConv._id)
    } finally {
      setSendingMsg(false)
    }
  }

  // ── Typing notification ───────────────────────────────────────────────────────

  const notifyTyping = () => {
    if (!selectedConv) return
    if (typingTimerRef.current) return // already notified recently
    fetch("/api/direct/typing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedConv._id, email: user.email }),
    })
    typingTimerRef.current = setTimeout(() => { typingTimerRef.current = null }, 2500)
  }

  // ── File attach ───────────────────────────────────────────────────────────────

  const handleFileAttach = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) { alert("Maximum 500KB méretű fájlt lehet küldeni."); return }
    const reader = new FileReader()
    reader.onload = ev => {
      setAttachedFile({ name: file.name, data: ev.target?.result as string, type: file.type })
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // ── Toggle favorite ───────────────────────────────────────────────────────────

  const toggleFavorite = async (conv: ConversationItem) => {
    await fetch("/api/direct/favorites", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userEmail: user.email, targetEmail: conv.otherUser.email }),
    })
    await fetchConversations()
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const favorites  = conversations.filter(c => c.isFavorite)
  const recents    = conversations.filter(c => !c.isFavorite)

  const ConvItem = ({ conv }: { conv: ConversationItem }) => (
    <button
      onClick={() => setSelectedConv(conv)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
        selectedConv?._id === conv._id ? "bg-[#004685]/8 border-l-2 border-[#004685]" : "hover:bg-slate-50 border-l-2 border-transparent"
      }`}
    >
      <div className="relative shrink-0">
        <Avatar name={conv.otherUser.name} avatar={conv.otherUser.avatar} size="md" />
        {conv.unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#004685] text-white text-[9px] font-black flex items-center justify-center">
            {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-baseline">
          <span className={`text-[11px] font-bold truncate ${conv.unreadCount > 0 ? "text-[#004685]" : "text-[#1a1a1a]"}`}>
            {conv.otherUser.name}
          </span>
          {conv.lastMessage && (
            <span className="text-[9px] text-slate-400 shrink-0 ml-2">{formatTime(conv.lastMessage.createdAt)}</span>
          )}
        </div>
        {conv.lastMessage && (
          <p className={`text-[10px] truncate mt-0.5 ${conv.unreadCount > 0 ? "font-semibold text-slate-600" : "text-slate-400 font-light"}`}>
            {conv.lastMessage.senderEmail === user.email ? "Te: " : ""}
            {conv.lastMessage.content || "📎 Fájl"}
          </p>
        )}
      </div>
    </button>
  )

  return (
    <div className="flex-1 flex min-h-0 border border-slate-100 bg-white overflow-hidden">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-slate-100 min-h-0">

        {/* Search */}
        <div className="p-3 border-b border-slate-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Keresés név alapján..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-[11px] border border-slate-200 focus:outline-none focus:border-[#004685] bg-slate-50 rounded-none"
            />
            {searchQuery && (
              <button onClick={() => { setSearchQuery(""); setSearchResults([]) }} className="absolute right-2 top-2">
                <X className="w-3.5 h-3.5 text-slate-400" />
              </button>
            )}
          </div>

          {/* Search results dropdown */}
          {(searchResults.length > 0 || searching) && (
            <div className="mt-1 border border-slate-200 bg-white shadow-md z-10 relative">
              {searching && <div className="px-3 py-2 flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin text-slate-400" /><span className="text-[10px] text-slate-400">Keresés...</span></div>}
              {searchResults.map(u => (
                <button
                  key={u.email}
                  onClick={() => openOrCreateConv(u.email)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left"
                >
                  <Avatar name={u.name} avatar={u.avatar} size="sm" />
                  <div>
                    <p className="text-[11px] font-bold text-[#1a1a1a]">{u.name}</p>
                    <p className="text-[9px] text-slate-400">{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {convLoading ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-[10px] text-slate-300 font-bold uppercase tracking-widest">
                Keresd meg a felhasználókat fent
              </p>
            </div>
          ) : (
            <>
              {favorites.length > 0 && (
                <>
                  <div className="px-4 py-2 flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-[#97c93e] fill-[#97c93e]" />
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Kedvencek</span>
                  </div>
                  {favorites.map(c => <ConvItem key={c._id} conv={c} />)}
                  <div className="my-1 border-t border-slate-100" />
                </>
              )}
              {recents.length > 0 && (
                <>
                  <div className="px-4 py-2">
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-slate-400">Legutóbbiak</span>
                  </div>
                  {recents.map(c => <ConvItem key={c._id} conv={c} />)}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {!selectedConv ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center">
              <Send className="w-5 h-5 text-slate-200" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-300">
              Válassz egy beszélgetést
            </p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0 bg-white">
              <div className="flex items-center gap-3">
                <Avatar name={selectedConv.otherUser.name} avatar={selectedConv.otherUser.avatar} size="lg" />
                <div>
                  <p className="text-sm font-bold text-[#004685]">{selectedConv.otherUser.name}</p>
                  <p className="text-[9px] text-slate-400">{selectedConv.otherUser.email}</p>
                </div>
              </div>
              <button
                onClick={() => toggleFavorite(selectedConv)}
                title={selectedConv.isFavorite ? "Eltávolítás a kedvencekből" : "Hozzáadás a kedvencekhez"}
                className="p-2 hover:bg-slate-50 transition-colors"
              >
                <Star
                  className={`w-4 h-4 transition-colors ${selectedConv.isFavorite ? "text-[#97c93e] fill-[#97c93e]" : "text-slate-300 hover:text-[#97c93e]"}`}
                />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 min-h-0 bg-[#fcfcfc]">
              {messages.map((msg, i) => {
                const isMe      = msg.senderEmail === user.email
                const isRead    = msg.readBy.includes(selectedConv.otherUser.email)
                const showAvatar = !isMe && (i === 0 || messages[i - 1].senderEmail !== msg.senderEmail)

                return (
                  <div key={msg._id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                    {/* Avatar placeholder to keep alignment */}
                    <div className="w-7 shrink-0">
                      {!isMe && showAvatar && (
                        <Avatar name={selectedConv.otherUser.name} avatar={selectedConv.otherUser.avatar} size="sm" />
                      )}
                    </div>

                    <div className={`max-w-[65%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-0.5`}>
                      {/* File attachment */}
                      {msg.fileData && (
                        <div className={`rounded-none border p-2.5 ${isMe ? "bg-[#004685]/10 border-[#004685]/20" : "bg-white border-slate-200"}`}>
                          {isImage(msg.fileType) ? (
                            <img
                              src={msg.fileData}
                              alt={msg.fileName ?? "kép"}
                              className="max-w-[200px] max-h-[200px] object-contain cursor-pointer"
                              onClick={() => window.open(msg.fileData!, "_blank")}
                            />
                          ) : (
                            <a
                              href={msg.fileData}
                              download={msg.fileName ?? "fájl"}
                              className="flex items-center gap-2 text-[11px] font-medium text-[#004685] hover:underline"
                            >
                              <FileText className="w-4 h-4 shrink-0" />
                              {msg.fileName}
                            </a>
                          )}
                        </div>
                      )}

                      {/* Text bubble */}
                      {msg.content && (
                        <div className={`px-3 py-2 text-[12px] leading-relaxed break-words ${
                          isMe
                            ? "bg-[#004685] text-white"
                            : "bg-white text-[#1a1a1a] border border-slate-200"
                        }`}>
                          {msg.content}
                        </div>
                      )}

                      {/* Timestamp + read receipt */}
                      <div className={`flex items-center gap-1 ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                        <span className="text-[9px] text-slate-400">{formatTime(msg.createdAt)}</span>
                        {isMe && (
                          isRead
                            ? <CheckCheck className="w-3 h-3 text-[#97c93e]" />
                            : <Check className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Typing indicator */}
              {otherTyping && (
                <div className="flex items-end gap-2">
                  <Avatar name={selectedConv.otherUser.name} avatar={selectedConv.otherUser.avatar} size="sm" />
                  <div className="bg-white border border-slate-200 px-1 py-1">
                    <TypingDots />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Attached file preview */}
            {attachedFile && (
              <div className="px-4 py-2 border-t border-slate-100 bg-white flex items-center gap-2 shrink-0">
                {isImage(attachedFile.type)
                  ? <ImageIcon className="w-4 h-4 text-[#004685]" />
                  : <FileText className="w-4 h-4 text-[#004685]" />}
                <span className="text-[11px] font-medium text-[#004685] flex-1 truncate">{attachedFile.name}</span>
                <button onClick={() => setAttachedFile(null)}>
                  <X className="w-3.5 h-3.5 text-slate-400 hover:text-red-500" />
                </button>
              </div>
            )}

            {/* Input area */}
            <div className="px-4 py-3 border-t border-slate-100 bg-white flex items-center gap-2 shrink-0">
              <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileAttach} />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 text-slate-400 hover:text-[#004685] transition-colors shrink-0"
                title="Fájl csatolása"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <input
                type="text"
                value={messageInput}
                onChange={e => { setMessageInput(e.target.value); notifyTyping() }}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
                placeholder="Üzenet..."
                className="flex-1 text-sm py-2 px-3 border border-slate-200 focus:outline-none focus:border-[#004685] bg-slate-50 rounded-none"
              />

              <Button
                onClick={sendMessage}
                disabled={sendingMsg || (!messageInput.trim() && !attachedFile)}
                className="bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-4 h-9 shrink-0"
              >
                {sendingMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
