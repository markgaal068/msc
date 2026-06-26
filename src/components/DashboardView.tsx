"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, User, FileText, X, Download } from "lucide-react"
import ReactMarkdown from 'react-markdown'
import ProfileView from "@/components/ProfileView"

type Section = "main" | "profile" | "files"

interface DashboardViewProps {
  onLogout: () => void
  user: { email: string; name: string }
}

interface TestSettings {
  testFileName: string
  difficulty: "easy" | "medium" | "hard"
  taskTypes: string[]
  questionCounts: Record<string, number>
  includeScoring: boolean
  includeAnswerKey: boolean
  answerKeyFileName: string
}

const TASK_TYPES = [
  { id: "essay",     label: "Esszé" },
  { id: "short",     label: "Rövid kifejtős" },
  { id: "multiple",  label: "Többválasztós" },
  { id: "truefalse", label: "Igaz / Hamis" },
]

const DEFAULT_COUNTS: Record<string, number> = {
  essay: 3, short: 5, multiple: 10, truefalse: 5,
}

const TABS = [
  { id: "faq",       label: "FAQ Generátor" },
  { id: "wellbeing", label: "Reflexió" },
  { id: "notes",     label: "Jegyzet Generátor" },
  { id: "test",      label: "Teszt Generátor" },
]

// ── Markdown → docx converter ────────────────────────────────────────────────
async function downloadAsDocx(content: string, filename: string) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import("docx")

  type TR = InstanceType<typeof TextRun>

  const parseInline = (text: string): TR[] => {
    const runs: TR[] = []
    // Split on **bold** and *italic* spans
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    for (const part of parts) {
      if (!part) continue
      if (part.startsWith("**") && part.endsWith("**")) {
        runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
      } else if (part.startsWith("*") && part.endsWith("*")) {
        runs.push(new TextRun({ text: part.slice(1, -1), italics: true }))
      } else {
        runs.push(new TextRun({ text: part }))
      }
    }
    return runs.length ? runs : [new TextRun({ text })]
  }

  const children: InstanceType<typeof Paragraph>[] = []

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd()
    if (line.startsWith("### ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(line.slice(4)) }))
    } else if (line.startsWith("## ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(line.slice(3)) }))
    } else if (line.startsWith("# ")) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(line.slice(2)) }))
    } else if (/^[-*] /.test(line)) {
      children.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(line.slice(2)) }))
    } else if (/^\d+\. /.test(line)) {
      children.push(new Paragraph({ children: parseInline(line) }))
    } else if (line.trim() === "") {
      children.push(new Paragraph({ text: "" }))
    } else {
      children.push(new Paragraph({ children: parseInline(line) }))
    }
  }

  const doc = new Document({ sections: [{ properties: {}, children }] })
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.docx`
  a.click()
  URL.revokeObjectURL(url)
}

// ────────────────────────────────────────────────────────────────────────────

export default function DashboardView({ onLogout, user }: DashboardViewProps) {
  const [showMenu, setShowMenu]             = useState(false)
  const [currentSection, setCurrentSection] = useState<Section>("main")
  const [inputs, setInputs]                 = useState({ faq: "", wellbeing: "", notes: "" })
  const [results, setResults]               = useState({ faq: "", wellbeing: "", notes: "" })
  const [loading, setLoading]               = useState<string | null>(null)

  // Test tab state
  const [testPdfs, setTestPdfs]           = useState<File[]>([])
  const [showTestModal, setShowTestModal]   = useState(false)
  const [testSettings, setTestSettings]     = useState<TestSettings>({
    testFileName:      "teszt",
    difficulty:        "medium",
    taskTypes:         ["multiple", "truefalse"],
    questionCounts:    { ...DEFAULT_COUNTS },
    includeScoring:    true,
    includeAnswerKey:  false,
    answerKeyFileName: "megoldokulcs",
  })
  const [testResult, setTestResult] = useState<{ test: string; answerKey?: string } | null>(null)

  // ── Existing handlers ───────────────────────────────────────────────────────

  const handleAiCall = async (type: "faq" | "wellbeing" | "notes") => {
    if (!inputs[type]) return
    setLoading(type)
    try {
      const res  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: inputs[type], type }),
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
      const transRes  = await fetch("/api/transcribe", { method: "POST", body: formData })
      const transData = await transRes.json()
      if (transData.error) throw new Error(transData.error)
      const summaryRes  = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Készíts egy strukturált összefoglalót ebből az előadás szövegből magyarul:\n\n${transData.text}`,
          type: "notes",
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

  // ── Test handlers ───────────────────────────────────────────────────────────

  const handlePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files || [])
    setTestPdfs(prev => {
      const existing = new Set(prev.map(f => f.name))
      return [...prev, ...incoming.filter(f => !existing.has(f.name))]
    })
    e.target.value = ""
  }

  const removePdf = (index: number) =>
    setTestPdfs(prev => prev.filter((_, i) => i !== index))

  const toggleTaskType = (id: string) =>
    setTestSettings(prev => ({
      ...prev,
      taskTypes: prev.taskTypes.includes(id)
        ? prev.taskTypes.filter(t => t !== id)
        : [...prev.taskTypes, id],
    }))

  const setQuestionCount = (id: string, value: number) =>
    setTestSettings(prev => ({
      ...prev,
      questionCounts: { ...prev.questionCounts, [id]: Math.max(1, Math.min(50, value || 1)) },
    }))

  const handleGenerateTest = async () => {
    if (!testPdfs.length || !testSettings.taskTypes.length) return
    setShowTestModal(false)
    setLoading("test")
    setTestResult(null)
    try {
      const formData = new FormData()
      testPdfs.forEach(f => formData.append("files", f))
      formData.append("settings", JSON.stringify(testSettings))
      const res  = await fetch("/api/generate-test", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || "Ismeretlen hiba")
      setTestResult(data)
    } catch (error: any) {
      setTestResult({ test: `Hiba: ${error.message}` })
    } finally {
      setLoading(null)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className="h-screen w-full bg-[#fcfcfc] text-[#1a1a1a] antialiased flex flex-col overflow-hidden font-sans">
      <div className="h-1 w-full bg-[#97c93e] shrink-0" />

      {/* ── Test Settings Modal ── */}
      {showTestModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-md shadow-2xl border border-slate-100">

            {/* Header */}
            <div className="flex justify-between items-center px-8 py-5 border-b border-slate-100">
              <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#004685]">
                Teszt beállítások
              </h2>
              <button
                onClick={() => setShowTestModal(false)}
                className="text-slate-400 hover:text-[#004685] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-6 max-h-[68vh] overflow-y-auto">

              {/* File name */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 block mb-2">
                  Generált file neve
                </label>
                <input
                  type="text"
                  value={testSettings.testFileName}
                  onChange={e => setTestSettings(prev => ({ ...prev, testFileName: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm font-light focus:outline-none focus:border-[#004685] rounded-none"
                />
              </div>

              {/* Difficulty */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 block mb-3">
                  Nehézség
                </label>
                <div className="flex gap-6">
                  {(["easy", "medium", "hard"] as const).map((val, i) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="difficulty"
                        value={val}
                        checked={testSettings.difficulty === val}
                        onChange={() => setTestSettings(prev => ({ ...prev, difficulty: val }))}
                        className="accent-[#004685]"
                      />
                      <span className="text-[11px] font-medium">
                        {["Könnyű", "Közepes", "Nehéz"][i]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Task types + question counts */}
              <div>
                <label className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 block mb-3">
                  Feladattípusok
                </label>
                <div className="space-y-3">
                  {TASK_TYPES.map(({ id, label }) => {
                    const checked = testSettings.taskTypes.includes(id)
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <label className="flex items-center gap-3 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleTaskType(id)}
                            className="accent-[#004685] w-4 h-4 shrink-0"
                          />
                          <span className="text-[11px] font-medium">{label}</span>
                        </label>
                        {checked && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <input
                              type="number"
                              min={1}
                              max={50}
                              value={testSettings.questionCounts[id] ?? DEFAULT_COUNTS[id]}
                              onChange={e => setQuestionCount(id, parseInt(e.target.value))}
                              className="w-14 border border-slate-200 px-2 py-1 text-[12px] text-center font-medium focus:outline-none focus:border-[#004685] rounded-none"
                            />
                            <span className="text-[10px] text-slate-400 font-medium">db</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Scoring */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={testSettings.includeScoring}
                  onChange={e => setTestSettings(prev => ({ ...prev, includeScoring: e.target.checked }))}
                  className="accent-[#004685] w-4 h-4"
                />
                <span className="text-[11px] font-bold uppercase tracking-wider">Pontozás megadása</span>
              </label>

              {/* Answer key */}
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={testSettings.includeAnswerKey}
                    onChange={e => setTestSettings(prev => ({ ...prev, includeAnswerKey: e.target.checked }))}
                    className="accent-[#97c93e] w-4 h-4"
                  />
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Megoldókulcs generálása (külön fájlba)
                  </span>
                </label>
                {testSettings.includeAnswerKey && (
                  <div className="ml-7">
                    <label className="text-[9px] font-bold uppercase tracking-[0.25em] text-slate-400 block mb-2">
                      Megoldókulcs neve
                    </label>
                    <input
                      type="text"
                      value={testSettings.answerKeyFileName}
                      onChange={e => setTestSettings(prev => ({ ...prev, answerKeyFileName: e.target.value }))}
                      className="w-full border border-slate-200 px-3 py-2 text-sm font-light focus:outline-none focus:border-[#97c93e] rounded-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-8 py-5 border-t border-slate-100">
              <Button
                variant="ghost"
                className="rounded-none text-[10px] uppercase font-bold tracking-widest"
                onClick={() => setShowTestModal(false)}
              >
                Mégse
              </Button>
              <Button
                onClick={handleGenerateTest}
                disabled={!testSettings.taskTypes.length || !testSettings.testFileName.trim()}
                className="bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-8 text-[10px] uppercase font-bold tracking-widest"
              >
                Generálás
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Main layout ── */}
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

        <Tabs
          defaultValue="faq"
          className={`flex-1 flex flex-col min-h-0 ${currentSection !== "main" ? "hidden" : ""}`}
        >
          <TabsList className="bg-transparent h-auto p-0 mb-8 border-b border-slate-100 w-full justify-start space-x-10 shrink-0">
            {TABS.map(({ id, label }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="rounded-none px-0 py-3 text-[11px] font-bold uppercase tracking-widest data-[state=active]:border-b-2 data-[state=active]:border-[#004685] data-[state=active]:text-[#004685] bg-transparent shadow-none transition-all opacity-50 data-[state=active]:opacity-100"
              >
                {label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-h-0">

            {/* ── FAQ ── */}
            <TabsContent value="faq" className="h-full m-0 flex flex-col outline-none">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="mb-2 flex justify-between items-end">
                  <label className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Hallgatói levelezés</label>
                  {results.faq && (
                    <Button variant="ghost" className="h-6 text-[9px] uppercase font-bold text-[#004685]" onClick={() => resetField("faq")}>
                      Új elemzés
                    </Button>
                  )}
                </div>
                {results.faq ? (
                  <div className="flex-1 bg-white p-8 overflow-y-auto border-2 border-slate-100 shadow-inner prose prose-slate max-w-none prose-p:text-sm">
                    <ReactMarkdown>{results.faq}</ReactMarkdown>
                  </div>
                ) : (
                  <Textarea
                    value={inputs.faq}
                    onChange={e => setInputs(prev => ({ ...prev, faq: e.target.value }))}
                    placeholder="Levelek tartalma..."
                    className="flex-1 border-2 border-slate-100 bg-white rounded-none p-6 text-base font-light resize-none shadow-sm"
                  />
                )}
                <Button
                  onClick={() => handleAiCall("faq")}
                  disabled={loading === "faq" || !inputs.faq}
                  className="mt-4 self-end bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-12 py-7 font-bold uppercase tracking-widest text-[10px] shadow-lg"
                >
                  {loading === "faq" ? <Loader2 className="animate-spin" /> : "Feldolgozás"}
                </Button>
              </div>
            </TabsContent>

            {/* ── Reflexió ── */}
            <TabsContent value="wellbeing" className="h-full m-0 flex items-center justify-center outline-none">
              <div className="w-full max-w-2xl space-y-6 text-center">
                <h3 className="text-lg font-bold text-[#004685] uppercase tracking-tighter">Oktatói Reflexió</h3>
                {results.wellbeing ? (
                  <div className="p-8 bg-white border-2 border-[#97c93e]/30 shadow-sm prose prose-slate italic font-light">
                    <ReactMarkdown>{results.wellbeing}</ReactMarkdown>
                    <Button variant="link" className="mt-6 text-[10px] uppercase text-[#004685] font-bold" onClick={() => resetField("wellbeing")}>
                      + Új bejegyzés
                    </Button>
                  </div>
                ) : (
                  <>
                    <Textarea
                      value={inputs.wellbeing}
                      onChange={e => setInputs(prev => ({ ...prev, wellbeing: e.target.value }))}
                      placeholder="Hogy érzi magát ma?"
                      className="h-48 border-2 border-slate-100 bg-white rounded-none p-6 text-lg font-light text-center focus-visible:ring-0 focus-visible:border-[#004685] resize-none shadow-sm italic"
                    />
                    <Button
                      onClick={() => handleAiCall("wellbeing")}
                      disabled={loading === "wellbeing" || !inputs.wellbeing}
                      className="bg-[#97c93e] hover:bg-[#004685] text-white rounded-none px-16 py-7 font-bold uppercase tracking-widest text-[10px] shadow-lg"
                    >
                      {loading === "wellbeing" ? <Loader2 className="animate-spin" /> : "Állapot elemzése"}
                    </Button>
                  </>
                )}
              </div>
            </TabsContent>

            {/* ── Hanganyag → Jegyzet ── */}
            <TabsContent value="notes" className="h-full m-0 outline-none">
              <div className="h-full border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center relative overflow-hidden group hover:border-[#97c93e] transition-all">
                {results.notes ? (
                  <div className="w-full h-full p-8 overflow-y-auto prose prose-slate max-w-none prose-headings:text-[#004685]">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-bold uppercase text-slate-400">Generált jegyzet</span>
                      <Button variant="outline" className="h-7 text-[9px] uppercase rounded-none" onClick={() => resetField("notes")}>
                        Új feltöltés
                      </Button>
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
                        {loading === "notes"
                          ? <Loader2 className="animate-spin text-[#97c93e]" />
                          : <Upload className="w-6 h-6 text-slate-300 group-hover:text-[#97c93e]" />}
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

            {/* ── Teszt Generátor ── */}
            <TabsContent value="test" className="h-full m-0 outline-none flex flex-col">
              {testResult ? (
                /* Result view */
                <div className="flex-1 flex flex-col min-h-0">
                  <div className="flex justify-between items-center mb-4 shrink-0 flex-wrap gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Generált teszt</span>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        className="h-7 text-[9px] uppercase rounded-none gap-1.5"
                        onClick={() => downloadAsDocx(testResult.test, testSettings.testFileName)}
                      >
                        <Download className="w-3 h-3" /> Vizsgasor (.docx)
                      </Button>
                      {testResult.answerKey && (
                        <Button
                          variant="outline"
                          className="h-7 text-[9px] uppercase rounded-none gap-1.5 border-[#97c93e] text-[#97c93e] hover:bg-[#97c93e]/5"
                          onClick={() => downloadAsDocx(testResult.answerKey!, testSettings.answerKeyFileName)}
                        >
                          <Download className="w-3 h-3" /> Megoldókulcs (.docx)
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        className="h-7 text-[9px] uppercase font-bold text-[#004685]"
                        onClick={() => { setTestResult(null); setTestPdfs([]) }}
                      >
                        Új generálás
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 bg-white p-8 overflow-y-auto border-2 border-slate-100 shadow-inner prose prose-slate max-w-none prose-headings:text-[#004685] prose-p:text-sm">
                    <ReactMarkdown>{testResult.test}</ReactMarkdown>
                  </div>
                </div>
              ) : (
                /* Upload + generate view */
                <div className="flex-1 flex flex-col min-h-0 gap-4">

                  {/* PDF drop area */}
                  <div
                    className="relative border-2 border-dashed border-slate-200 bg-white flex flex-col items-center justify-center group hover:border-[#004685] transition-all"
                    style={{ minHeight: "180px" }}
                  >
                    <input
                      type="file"
                      accept=".pdf"
                      multiple
                      className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      onChange={handlePdfUpload}
                      disabled={loading === "test"}
                    />
                    <div className="flex flex-col items-center space-y-4 pointer-events-none">
                      <div className="w-14 h-14 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#004685]/10 transition-colors">
                        {loading === "test"
                          ? <Loader2 className="animate-spin text-[#004685]" />
                          : <FileText className="w-6 h-6 text-slate-300 group-hover:text-[#004685]" />}
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 group-hover:text-[#004685]">
                          {loading === "test"
                            ? "Teszt generálása folyamatban..."
                            : "Kattints vagy húzd ide a tananyag PDF-eket"}
                        </p>
                        <p className="text-[9px] text-slate-300 mt-1 font-light italic">
                          Csak PDF — több fájl is feltölthető
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Uploaded file chips */}
                  {testPdfs.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {testPdfs.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 bg-[#004685]/5 border border-[#004685]/20 px-3 py-1.5 text-[10px] font-medium text-[#004685]"
                        >
                          <FileText className="w-3 h-3 shrink-0" />
                          <span className="max-w-40 truncate">{file.name}</span>
                          <button
                            onClick={() => removePdf(i)}
                            className="text-[#004685]/40 hover:text-[#004685] transition-colors ml-1"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="mt-auto shrink-0 flex justify-end">
                    <Button
                      onClick={() => setShowTestModal(true)}
                      disabled={!testPdfs.length || loading === "test"}
                      className="bg-[#004685] hover:bg-[#97c93e] text-white rounded-none px-12 py-7 font-bold uppercase tracking-widest text-[10px] shadow-lg"
                    >
                      {loading === "test"
                        ? <Loader2 className="animate-spin" />
                        : "Teszt generálása"}
                    </Button>
                  </div>
                </div>
              )}
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
