"use client"

import { useState, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Camera, Lock, Mail, CheckCircle2, AlertCircle } from "lucide-react"

interface ProfileViewProps {
  user: { email: string; name: string }
}

type Feedback = { section: string; type: "success" | "error"; text: string }

export default function ProfileView({ user }: ProfileViewProps) {
  const [avatar, setAvatar] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [passwords, setPasswords] = useState({ current: "", new: "", confirm: "" })
  const [pwLoading, setPwLoading] = useState(false)

  const [secEmail, setSecEmail] = useState("")
  const [secEmailEnabled, setSecEmailEnabled] = useState(false)
  const [secLoading, setSecLoading] = useState(false)

  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    fetch(`/api/profile?email=${encodeURIComponent(user.email)}`)
      .then(r => r.json())
      .then(data => {
        if (data.avatar) setAvatar(data.avatar)
        setSecEmail(data.securityEmail || "")
        setSecEmailEnabled(data.securityEmailEnabled || false)
      })
  }, [user.email])

  const showFeedback = (section: string, type: "success" | "error", text: string) => {
    setFeedback({ section, type, text })
    setTimeout(() => setFeedback(null), 4000)
  }

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500 * 1024) {
      showFeedback("avatar", "error", "A kép mérete maximum 500KB lehet.")
      return
    }
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string
      setAvatar(base64)
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action: "avatar", avatar: base64 }),
      })
      const data = await res.json()
      if (!res.ok) showFeedback("avatar", "error", data.error || "Hiba történt.")
    }
    reader.readAsDataURL(file)
  }

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (passwords.new !== passwords.confirm) {
      showFeedback("password", "error", "A két jelszó nem egyezik!")
      return
    }
    setPwLoading(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action: "password", currentPassword: passwords.current, newPassword: passwords.new }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Hiba történt.")
      showFeedback("password", "success", "Jelszó sikeresen megváltoztatva!")
      setPasswords({ current: "", new: "", confirm: "" })
    } catch (err: any) {
      showFeedback("password", "error", err.message)
    } finally {
      setPwLoading(false)
    }
  }

  const handleSecEmailSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSecLoading(true)
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, action: "securityEmail", securityEmail: secEmail, securityEmailEnabled: secEmailEnabled }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Hiba történt.")
      showFeedback("secEmail", "success", "Biztonsági e-mail beállítások mentve!")
    } catch (err: any) {
      showFeedback("secEmail", "error", err.message)
    } finally {
      setSecLoading(false)
    }
  }

  const FeedbackBox = ({ section }: { section: string }) => {
    if (feedback?.section !== section) return null
    return (
      <div className={`flex items-center space-x-2 p-3 text-xs ${feedback.type === "success" ? "bg-emerald-50 border border-emerald-100 text-emerald-700" : "bg-red-50 border border-red-100 text-red-600"}`}>
        {feedback.type === "success"
          ? <CheckCircle2 className="w-4 h-4 shrink-0" />
          : <AlertCircle className="w-4 h-4 shrink-0" />}
        <span>{feedback.text}</span>
      </div>
    )
  }

  const initials = user.name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-lg mx-auto py-4 space-y-12">

        {/* Avatar + Identity */}
        <div className="flex flex-col items-center space-y-4 pt-4">
          <div
            className="relative w-24 h-24 rounded-full cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            {avatar ? (
              <img src={avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover" />
            ) : (
              <div className="w-24 h-24 rounded-full bg-[#004685] flex items-center justify-center text-white text-2xl font-black tracking-widest">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <FeedbackBox section="avatar" />
          <div className="text-center">
            <p className="font-black text-[#004685] text-sm uppercase tracking-wider">{user.name}</p>
            <p className="text-[11px] text-slate-400 mt-1">{user.email}</p>
          </div>
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center space-x-3 mb-5">
            <Lock className="w-3.5 h-3.5 text-[#97c93e] shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Jelszó megváltoztatása</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <form onSubmit={handlePasswordChange} className="space-y-3">
            <Input
              type="password"
              placeholder="Jelenlegi jelszó"
              value={passwords.current}
              onChange={e => setPasswords(p => ({ ...p, current: e.target.value }))}
              className="border-slate-200 rounded-none h-10 focus-visible:ring-0 focus-visible:border-[#004685] text-sm"
            />
            <Input
              type="password"
              placeholder="Új jelszó"
              value={passwords.new}
              onChange={e => setPasswords(p => ({ ...p, new: e.target.value }))}
              className="border-slate-200 rounded-none h-10 focus-visible:ring-0 focus-visible:border-[#004685] text-sm"
            />
            <Input
              type="password"
              placeholder="Új jelszó megerősítése"
              value={passwords.confirm}
              onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
              className="border-slate-200 rounded-none h-10 focus-visible:ring-0 focus-visible:border-[#004685] text-sm"
            />
            <FeedbackBox section="password" />
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                disabled={pwLoading || !passwords.current || !passwords.new || !passwords.confirm}
                className="bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                {pwLoading ? "Mentés..." : "Jelszó mentése"}
              </Button>
            </div>
          </form>
        </div>

        {/* Security Email */}
        <div>
          <div className="flex items-center space-x-3 mb-2">
            <Mail className="w-3.5 h-3.5 text-[#97c93e] shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Biztonsági e-mail</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>
          <p className="text-[11px] text-slate-400 font-light mb-5 leading-relaxed">
            Opcionálisan megadhatsz egy másodlagos e-mail címet. Ha engedélyezed, a beléptető kód erre is kiküldésre kerül — bejelentkezésre <span className="font-semibold text-slate-500">nem</span> használható.
          </p>
          <form onSubmit={handleSecEmailSave} className="space-y-3">
            <Input
              type="email"
              placeholder="pelda@gmail.com"
              value={secEmail}
              onChange={e => setSecEmail(e.target.value)}
              className="border-slate-200 rounded-none h-10 focus-visible:ring-0 focus-visible:border-[#97c93e] text-sm"
            />
            <div className="flex items-center justify-between py-1.5 px-0.5">
              <span className="text-[11px] text-slate-500">Kód küldése erre a címre is</span>
              <button
                type="button"
                onClick={() => setSecEmailEnabled(v => !v)}
                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${secEmailEnabled ? "bg-[#97c93e]" : "bg-slate-200"}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${secEmailEnabled ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
            <FeedbackBox section="secEmail" />
            <div className="flex justify-end pt-1">
              <Button
                type="submit"
                disabled={secLoading}
                className="bg-[#97c93e] hover:bg-[#004685] text-white rounded-none px-10 py-5 text-[10px] font-black uppercase tracking-widest transition-colors"
              >
                {secLoading ? "Mentés..." : "Beállítások mentése"}
              </Button>
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
