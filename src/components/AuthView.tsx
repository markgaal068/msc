"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Lock, User, Mail, AlertCircle, CheckCircle2, HelpCircle, X, ShieldCheck, Loader2 } from "lucide-react"

interface AuthViewProps {
  onAuthSuccess: (user: { email: string; name: string }) => void
}

interface TotpState {
  expiresAt: number
  targetUser: { email: string; name: string }
}

export default function AuthView({ onAuthSuccess }: AuthViewProps) {
  const [authMode, setAuthMode] = useState<"login" | "register" | "totp">("login")
  const [authInputs, setAuthInputs] = useState({ email: "", password: "", name: "" })

  const [totpState, setTotpState] = useState<TotpState | null>(null)
  const [inputTotp, setInputTotp] = useState("")

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [loading, setLoading] = useState<"submit" | "verify" | "resend" | "forgot" | null>(null)

  const [isForgotModalOpen, setIsForgotModalOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState("")
  const [modalMessage, setModalMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  // Shared code-sending logic (used by submit + resend)
  const sendCode = async (loadingKey: "submit" | "resend") => {
    const email = authInputs.email.trim().toLowerCase()
    if (!email.endsWith("@sze.hu") && !email.endsWith("@student.sze.hu")) {
      setError("Kizárólag egyetemi (@sze.hu vagy @student.sze.hu) e-mail címmel lehet belépni!")
      return
    }
    setLoading(loadingKey)
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: authMode === "register" ? "register" : "login",
          email: authInputs.email,
          password: authInputs.password,
          name: authInputs.name,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Szerveroldali hiba történt.")
      setTotpState({ expiresAt: Date.now() + 5 * 60 * 1000, targetUser: data.user })
      setAuthMode("totp")
      setSuccess("A biztonsági kódot elküldtük az egyetemi e-mail címedre! Kérjük, ellenőrizd a postafiókodat. (A kód 5 percig érvényes)")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    await sendCode("submit")
  }

  const handleResendCode = async () => {
    setError(null)
    await sendCode("resend")
  }

  const handleTotpVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!totpState) return
    setLoading("verify")
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: totpState.targetUser.email, code: inputTotp }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Hibás kód vagy lejárt munkamenet.")
      setSuccess(null)
      onAuthSuccess(data.user)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(null)
    }
  }

  const handleForgotPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setModalMessage(null)
    setLoading("forgot")
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Hiba a lekérés során.")
      setModalMessage({ type: "success", text: "Az új ideiglenes jelszót sikeresen elküldtük az e-mail címedre!" })
    } catch (err: any) {
      setModalMessage({ type: "error", text: err.message })
    } finally {
      setLoading(null)
    }
  }

  const handleModeChange = (mode: "login" | "register") => {
    setAuthMode(mode)
    setError(null)
    setSuccess(null)
    setTotpState(null)
  }

  return (
    <main className="h-screen w-full bg-[#fcfcfc] text-[#1a1a1a] flex items-center justify-center p-6 antialiased font-sans relative overflow-hidden">
      <div className={`absolute -top-40 -left-40 w-96 h-96 rounded-full blur-3xl opacity-10 transition-colors duration-700 ${authMode === 'register' ? 'bg-[#97c93e]' : 'bg-[#004685]'}`} />
      <div className={`absolute -bottom-40 -right-40 w-96 h-96 rounded-full blur-3xl opacity-10 transition-colors duration-700 ${authMode === 'register' ? 'bg-[#004685]' : 'bg-[#97c93e]'}`} />

      {/* Top loading bar */}
      {loading && (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 overflow-hidden bg-transparent">
          <div className={`h-full animate-[loading-bar_1.4s_ease-in-out_infinite] ${authMode === 'register' ? 'bg-[#97c93e]' : 'bg-[#004685]'}`} />
        </div>
      )}

      <div className="w-full max-w-md bg-white border border-slate-100 p-8 shadow-xl relative z-10 transition-all duration-300">
        <header className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter text-[#004685] uppercase">
            <span className="text-[#004685]">SZE</span><span className="text-[#97c93e]">SSISTANT</span>
          </h1>
          <p className="text-[9px] font-bold tracking-[0.2em] text-slate-400 uppercase mt-1">SZE-IVK Informatika Tanszék</p>
        </header>

        {authMode !== "totp" && (
          <div className="flex border-b border-slate-100 mb-6">
            <button
              type="button"
              onClick={() => handleModeChange("login")}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider transition-all rounded-none ${authMode === "login" ? "border-b-2 border-[#004685] text-[#004685] opacity-100" : "opacity-40 hover:opacity-70"}`}
            >
              Bejelentkezés
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("register")}
              className={`flex-1 pb-3 text-xs font-bold uppercase tracking-wider transition-all rounded-none ${authMode === "register" ? "border-b-2 border-[#97c93e] text-[#97c93e] opacity-100" : "opacity-40 hover:opacity-70"}`}
            >
              Regisztráció
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-600 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs flex items-start space-x-2 font-sans">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <span>{success}</span>
          </div>
        )}

        {authMode !== "totp" ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === "register" && (
              <div className="relative">
                <User className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Teljes név"
                  required
                  value={authInputs.name}
                  onChange={(e) => setAuthInputs(prev => ({ ...prev, name: e.target.value }))}
                  className="pl-10 border-slate-200 focus-visible:ring-0 focus-visible:border-[#97c93e] rounded-none h-11"
                />
              </div>
            )}

            <div className="relative">
              <Mail className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                type="email"
                placeholder="Egyetemi e-mail cím (@sze.hu)"
                required
                value={authInputs.email}
                onChange={(e) => setAuthInputs(prev => ({ ...prev, email: e.target.value }))}
                className={`pl-10 border-slate-200 rounded-none h-11 focus-visible:ring-0 transition-colors ${authMode === 'register' ? 'focus-visible:border-[#97c93e]' : 'focus-visible:border-[#004685]'}`}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
              <Input
                type="password"
                placeholder="Jelszó"
                required
                value={authInputs.password}
                onChange={(e) => setAuthInputs(prev => ({ ...prev, password: e.target.value }))}
                className={`pl-10 border-slate-200 rounded-none h-11 focus-visible:ring-0 transition-colors ${authMode === 'register' ? 'focus-visible:border-[#97c93e]' : 'focus-visible:border-[#004685]'}`}
              />
            </div>

            {authMode === "login" && (
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => { setIsForgotModalOpen(true); setModalMessage(null); setForgotEmail("") }}
                  className="text-[10px] text-slate-400 hover:text-[#004685] transition-colors font-medium"
                >
                  Elfelejtettem a jelszavam
                </button>
              </div>
            )}

            <Button
              type="submit"
              disabled={loading !== null}
              className={`w-full h-12 rounded-none font-bold uppercase tracking-widest text-[10px] text-white shadow-md transition-all duration-300 ${authMode === 'register' ? 'bg-[#97c93e] hover:bg-[#004685]' : 'bg-[#004685] hover:bg-[#97c93e]'}`}
            >
              {loading === "submit"
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : authMode === "login" ? "Kód igénylése" : "Regisztráció és kód küldése"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTotpVerify} className="space-y-6 text-center">
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-[#004685]/5 flex items-center justify-center mb-2">
                <ShieldCheck className="w-6 h-6 text-[#004685]" />
              </div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#004685]">Kétlépcsős azonosítás</h3>
              <p className="text-xs text-slate-400 font-light max-w-xs mx-auto">
                A biztonságos belépéshez kérjük gépeld be az egyetemi e-mail címedre érkezett 6 számjegyű azonosítót.
              </p>
            </div>

            <div className="relative">
              <Input
                type="text"
                maxLength={6}
                placeholder="000000"
                required
                value={inputTotp}
                onChange={(e) => setInputTotp(e.target.value.replace(/\D/g, ""))}
                className="border-2 border-slate-200 focus-visible:ring-0 focus-visible:border-[#004685] rounded-none h-14 text-center tracking-[0.5em] text-xl font-bold"
              />
            </div>

            <div className="flex flex-col space-y-3">
              <Button
                type="submit"
                disabled={loading !== null}
                className="w-full h-12 bg-[#004685] hover:bg-[#97c93e] rounded-none font-bold uppercase tracking-widest text-[10px] text-white shadow-md"
              >
                {loading === "verify"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Azonosítás és Belépés"}
              </Button>

              <button
                type="button"
                onClick={handleResendCode}
                disabled={loading !== null}
                className="text-[10px] text-slate-400 hover:text-[#004685] transition-colors font-bold uppercase tracking-wider disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {loading === "resend"
                  ? <><Loader2 className="w-3 h-3 animate-spin" /> Küldés...</>
                  : "Új kód kérése"}
              </button>

              <button
                type="button"
                onClick={() => handleModeChange("login")}
                disabled={loading !== null}
                className="text-[9px] text-slate-400 hover:text-red-500 transition-colors font-medium disabled:opacity-40"
              >
                Vissza a bejelentkezéshez
              </button>
            </div>
          </form>
        )}
      </div>

      {isForgotModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border border-slate-100 p-6 w-full max-w-sm shadow-2xl relative">
            <button type="button" onClick={() => setIsForgotModalOpen(false)} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center space-x-2 mb-4">
              <HelpCircle className="w-5 h-5 text-[#004685]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#004685]">Jelszó emlékeztető</h3>
            </div>
            <p className="text-xs text-slate-400 font-light mb-4">Add meg a regisztrált egyetemi e-mail címedet a jelszavad kikereséséhez.</p>

            {modalMessage && (
              <div className={`mb-4 p-3 border text-xs ${modalMessage.type === "success" ? "bg-emerald-50 border-emerald-100 text-emerald-700" : "bg-red-50 border-red-100 text-red-600"}`}>
                {modalMessage.text}
              </div>
            )}

            <form onSubmit={handleForgotPasswordSubmit} className="space-y-3">
              <Input
                type="email"
                placeholder="E-mail cím (@sze.hu)"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="border-slate-200 rounded-none h-10 focus-visible:ring-0 focus-visible:border-[#004685]"
              />
              <Button
                type="submit"
                disabled={loading === "forgot"}
                className="w-full bg-[#004685] hover:bg-[#97c93e] rounded-none h-10 text-[10px] uppercase font-bold tracking-wider text-white"
              >
                {loading === "forgot"
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : "Jelszó lekérése"}
              </Button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
