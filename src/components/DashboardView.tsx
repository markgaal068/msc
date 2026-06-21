"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, User } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import ProfileView from "@/components/ProfileView"

type Section = "main" | "profile" | "files"

interface DashboardViewProps {
  onLogout: () => void
  user: { email: string; name: string }
}

export default function DashboardView({ onLogout, user }: DashboardViewProps) {
  const [showMenu, setShowMenu] = useState(false)
  const [currentSection, setCurrentSection] = useState<Section>("main")
  const [inputs, setInputs] = useState({ faq: "", wellbeing: "", notes: "" })
  const [results, setResults] = useState({ faq: "", wellbeing: "", notes: "" })
  const [loading, setLoading] = useState<string | null>(null)

  const handleAiCall = async (type: "faq" | "wellbeing" | "notes") => {
    if (!inputs[type]) return
    setLoading(type)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputs[type], type: type }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.details || data.error || "Ismeretlen hiba")
      setResults(prev => ({ ...prev, [type]: data.text }))
    } catch (error: any) {
      setResults(prev => ({ ...prev, [type]: `Hiba: ${error.message}` }))
    } finally {
      setLoading(null)
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading("notes")
    try {
      const formData = new FormData()
      formData.append("file", file)

      const transRes = await fetch("/api/transcribe", { method: "POST", body: formData })
      const transData = await transRes.json()
      if (transData.error) throw new Error(transData.error)

      const summaryRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          message: `Készíts egy strukturált összefoglalót ebből az előadás szövegből magyarul:\n\n${transData.text}`, 
          type: "notes" 
        }),
      })
      const summaryData = await summaryRes.json()
      setResults(prev => ({ ...prev, notes: summaryData.text }))
    } catch (error: any) {
      setResults(prev => ({ ...prev, notes: `Hiba a feldolgozás során: ${error.message}` }))
    } finally {
      setLoading(null)
    }
  }

  const resetField = (type: "faq" | "wellbeing" | "notes") => {
    setResults(prev => ({ ...prev, [type]: "" }))
    setInputs(prev => ({ ...prev, [type]: "" }))
  }

  return (
    <main className="h-screen w-full bg-[#fcfcfc] text-[#1a1a1a] antialiased flex flex-col overflow-hidden font-sans">
      <div className="h-1 w-full bg-[#97c93e] shrink-0" />

      <div className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 flex flex-col min-h-0">
        
        <header className="flex justify-between items-center mb-10 shrink-0">
          <h1
            className="text-2xl font-black tracking-tighter text-[#004685] uppercase cursor-pointer"
            onClick={() => setCurrentSection("main")}
          >
            SZE <span className="text-[#97c93e]">ssistant</span>
          </h1>
          <div className="flex items-center space-x-6">
            <span className="text-[10px] font-bold tracking-[0.3em] text-slate-800 uppercase">
              SZE-IVK Informatika tanszék
            </span>
            <div
              className="relative"
              onMouseEnter={() => setShowMenu(true)}
              onMouseLeave={() => setShowMenu(false)}
            >
              <button className="w-9 h-9 rounded-full bg-[#97c93e] flex items-center justify-center hover:opacity-90 transition-opacity">
                <User className="w-5 h-5 text-white" />
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full w-44 bg-[#97c93e] shadow-lg z-50">
                  <button
                    onClick={() => { setCurrentSection("profile"); setShowMenu(false) }}
                    className="w-full text-left px-4 py-3 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#87b935] transition-colors"
                  >
                    Profil
                  </button>
                  <button
                    onClick={() => { setCurrentSection("files"); setShowMenu(false) }}
                    className="w-full text-left px-4 py-3 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#87b935] transition-colors"
                  >
                    Fileok
                  </button>
                  <div className="border-t border-white/30">
                    <button
                      onClick={onLogout}
                      className="w-full text-left px-4 py-3 text-white text-[11px] font-bold uppercase tracking-wider hover:bg-[#87b935] transition-colors"
                    >
                      Kijelentkezés
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {currentSection === "profile" && <ProfileView user={user} />}

        {currentSection === "files" && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-slate-300">Hamarosan</p>
          </div>
        )}

        <Tabs defaultValue="faq" className={`flex-1 flex flex-col min-h-0 ${currentSection !== "main" ? "hidden" : ""}`}>
          <TabsList className="bg-transparent h-auto p-0 mb-8 border-b border-slate-100 w-full justify-start space-x-10 shrink-0">
            {["faq", "wellbeing", "notes"].map((id) => (
              <TabsTrigger 
                key={id} 
                value={id} 
                className="rounded-none px-0 py-3 text-[11px] font-bold uppercase tracking-widest data-[state=active]:border-b-2 data-[state=active]:border-[#004685] data-[state=active]:text-[#004685] bg-transparent shadow-none transition-all opacity-50 data-[state=active]:opacity-100"
              >
                {id === "faq" ? "FAQ Generátor" : id === "wellbeing" ? "Well-being" : "Jegyzetek"}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0">
            {/* FAQ */}
            <TabsContent value="faq" className="h-full m-0 flex flex-col outline-none">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-2 flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Hallgatói levelezés</label>
                  {results.faq && <Button variant="ghost" className="h-6 text-[9px] uppercase font-bold text-[#004685]" onClick={() => resetField("faq")}>Új elemzés</Button>}
                </div>
                {results.faq ? (
                  <div className="flex-1 bg-white p-8 overflow-y-auto border-2 border-slate-100 shadow-inner prose prose-slate max-w-none prose-p:text-sm">
                    <ReactMarkdown>{results.faq}</ReactMarkdown>
                  </div>
                ) : (
                  <Textarea value={inputs.faq} onChange={(e) => setInputs(prev => ({ ...prev, faq: e.target.value }))} placeholder="Levelek tartalma..." className="flex-1 border-2 border-slate-100 bg-white rounded-none p-6 text-base font-light resize-none shadow-sm" />
                )}
                <Button onClick={() => handleAiCall("faq")} disabled={loading === "faq" || !inputs.faq} className="mt-4 self-end bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-12 py-7 font-bold uppercase tracking-widest text-[10px] shadow-lg">
                  {loading === "faq" ? <Loader2 className="animate-spin" /> : "Feldolgozás"}
                </Button>
              </div>
            </TabsContent>

            {/* Well-being */}
            <TabsContent value="wellbeing" className="h-full m-0 flex items-center justify-center outline-none">
              <div className="w-full max-w-2xl space-y-6 text-center">
                <h3 className="text-lg font-bold text-[#004685] uppercase tracking-tighter">Oktatói Reflexió</h3>
                {results.wellbeing ? (
                  <div className="p-8 bg-white border-2 border-[#97c93e]/30 shadow-sm prose prose-slate italic font-light">
                    <ReactMarkdown>{results.wellbeing}</ReactMarkdown>
                    <Button variant="link" className="mt-6 text-[10px] uppercase text-[#004685] font-bold" onClick={() => resetField("wellbeing")}>+ Új bejegyzés</Button>
                  </div>
                ) : (
                  <>
                    <Textarea value={inputs.wellbeing} onChange={(e) => setInputs(prev => ({ ...prev, wellbeing: e.target.value }))} placeholder="Hogy érzi magát ma?" className="h-48 border-2 border-slate-100 bg-white rounded-none p-6 text-lg font-light text-center focus-visible:ring-0 focus-visible:border-[#004685] resize-none shadow-sm italic" />
                    <Button onClick={() => handleAiCall("wellbeing")} disabled={loading === "wellbeing" || !inputs.wellbeing} className="bg-[#97c93e] hover:bg-[#004685] text-white rounded-none px-16 py-7 font-bold uppercase tracking-widest text-[10px] shadow-lg">
                      {loading === "wellbeing" ? <Loader2 className="animate-spin" /> : "Állapot elemzése"}
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* Jegyzetek */}
            <TabsContent value="notes" className="h-full m-0 outline-none">
              <div className="h-full border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center relative overflow-hidden group hover:border-[#97c93e] transition-all">
                {results.notes ? (
                  <div className="w-full h-full p-8 overflow-y-auto prose prose-slate max-w-none prose-headings:text-[#004685]">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Generált jegyzet</span>
                      <Button variant="outline" className="h-7 text-[9px] uppercase rounded-none" onClick={() => resetField("notes")}>Új feltöltés</Button>
                    </div>
                    <ReactMarkdown>{results.notes}</ReactMarkdown>
                  </div>
                ) : (
                  <>
                    <input 
                      type="file" 
                      accept="audio/*,video/*" 
                      className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                      onChange={handleFileUpload}
                      disabled={loading === "notes"}
                    />
                    <div className="flex flex-col items-center space-y-6">
                      <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#97c93e]/10 transition-colors">
                        {loading === "notes" ? <Loader2 className="animate-spin text-[#97c93e]" /> : <Upload className="w-6 h-6 text-slate-300 group-hover:text-[#97c93e]" />}
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 group-hover:text-[#004685]">
                          {loading === "notes" ? "Hang feldolgozása..." : "Kattints vagy húzd ide az előadás felvételt"}
                        </p>
                        <p className="text-[9px] text-slate-300 mt-2 font-light italic">MP3, M4A, WAV (Max 25MB)</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <footer className={`mt-8 pt-6 border-t border-slate-50 flex justify-between items-center shrink-0 ${currentSection !== "main" ? "hidden" : ""}`}>
          <p className="text-[8px] font-bold uppercase tracking-[0.5em] text-slate-800">SZE-IVK-IT-2026</p>
          <p className="text-[9px] text-slate-800 font-medium italic">it.sze.hu/assistant</p>
        </footer>
      </div>
    </main>
  )
}