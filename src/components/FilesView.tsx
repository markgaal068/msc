"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Loader2, FileText } from "lucide-react"
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx"

// ── Types ────────────────────────────────────────────────────────────────────

type FileType = "faq" | "reflexio" | "hangjegyzet" | "teszt" | "megoldokulcs"

interface SavedFile {
  _id: string
  name: string
  type: FileType
  content: string
  createdAt: string
}

interface FilesViewProps {
  user: { email: string; name: string }
}

// ── Constants ────────────────────────────────────────────────────────────────

const TYPE_META: Record<FileType, { label: string; bg: string; text: string }> = {
  faq:          { label: "FAQ",          bg: "bg-[#004685]/10", text: "text-[#004685]" },
  reflexio:     { label: "Reflexió",     bg: "bg-[#97c93e]/15", text: "text-[#4a7a1e]" },
  hangjegyzet:  { label: "Hangjegyzet",  bg: "bg-[#004685]/10", text: "text-[#004685]" },
  teszt:        { label: "Teszt",        bg: "bg-[#004685]/10", text: "text-[#004685]" },
  megoldokulcs: { label: "Megoldókulcs", bg: "bg-[#97c93e]/15", text: "text-[#4a7a1e]" },
}

const FILTERS = [
  { id: "all",          label: "Összes" },
  { id: "faq",         label: "FAQ" },
  { id: "reflexio",    label: "Reflexió" },
  { id: "hangjegyzet", label: "Hangjegyzet" },
  { id: "teszt",       label: "Teszt" },
  { id: "megoldokulcs",label: "Megoldókulcs" },
] as const

// ── docx download ─────────────────────────────────────────────────────────────

async function downloadAsDocx(content: string, filename: string) {
  type TR = InstanceType<typeof TextRun>

  const parseInline = (text: string): TR[] => {
    const runs: TR[] = []
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    for (const part of parts) {
      if (!part) continue
      if (part.startsWith("**") && part.endsWith("**"))
        runs.push(new TextRun({ text: part.slice(2, -2), bold: true }))
      else if (part.startsWith("*") && part.endsWith("*"))
        runs.push(new TextRun({ text: part.slice(1, -1), italics: true }))
      else
        runs.push(new TextRun({ text: part }))
    }
    return runs.length ? runs : [new TextRun({ text })]
  }

  const children: InstanceType<typeof Paragraph>[] = []
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trimEnd()
    if (line.startsWith("### "))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: parseInline(line.slice(4)) }))
    else if (line.startsWith("## "))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: parseInline(line.slice(3)) }))
    else if (line.startsWith("# "))
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: parseInline(line.slice(2)) }))
    else if (/^[-*] /.test(line))
      children.push(new Paragraph({ bullet: { level: 0 }, children: parseInline(line.slice(2)) }))
    else if (line.trim() === "")
      children.push(new Paragraph({ text: "" }))
    else
      children.push(new Paragraph({ children: parseInline(line) }))
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("hu-HU", {
    year: "numeric", month: "short", day: "numeric",
  })
}

function stripMarkdown(text: string) {
  return text.replace(/[#*`_>~\[\]]/g, "").replace(/\n+/g, " ").trim()
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FilesView({ user }: FilesViewProps) {
  const [files, setFiles]         = useState<SavedFile[]>([])
  const [loading, setLoading]     = useState(true)
  const [filter, setFilter]       = useState<"all" | FileType>("all")
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/files?email=${encodeURIComponent(user.email)}`)
      const data = await res.json()
      setFiles(data.files ?? [])
    } finally {
      setLoading(false)
    }
  }, [user.email])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/files?id=${id}&email=${encodeURIComponent(user.email)}`, { method: "DELETE" })
      setFiles(prev => prev.filter(f => f._id !== id))
    } finally {
      setDeletingId(null)
    }
  }

  const visible = filter === "all" ? files : files.filter(f => f.type === filter)

  // Count per type for badges
  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Header */}
      <div className="shrink-0 mb-6">
        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#004685] mb-5">
          Mentett Fájlok
        </h2>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ id, label }) => {
            const count  = id === "all" ? files.length : (counts[id] ?? 0)
            const active = filter === id
            return (
              <button
                key={id}
                onClick={() => setFilter(id as any)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  active
                    ? "bg-[#004685] text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-[#004685] hover:text-[#004685]"
                }`}
              >
                {label}
                {count > 0 && (
                  <span className={`text-[9px] font-black ${active ? "opacity-70" : "text-slate-400"}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-[#004685]" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <FileText className="w-8 h-8 text-slate-200" />
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-300">
              {filter === "all" ? "Még nincs mentett fájl" : `Nincs mentett ${TYPE_META[filter as FileType]?.label ?? ""}`}
            </p>
          </div>
        ) : (
          <div className="space-y-3 pb-4">
            {visible.map(file => {
              const meta = TYPE_META[file.type]
              return (
                <div
                  key={file._id}
                  className="bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all"
                >
                  {/* Card top border accent by type */}
                  <div className={`h-0.5 w-full ${file.type === "reflexio" || file.type === "megoldokulcs" ? "bg-[#97c93e]" : "bg-[#004685]"}`} />

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`shrink-0 text-[9px] font-black uppercase tracking-[0.2em] px-2 py-0.5 ${meta.bg} ${meta.text}`}>
                          {meta.label}
                        </span>
                        <span className="font-bold text-sm text-[#1a1a1a] truncate">{file.name}</span>
                      </div>
                      <span className="shrink-0 text-[10px] text-slate-400 font-medium">
                        {formatDate(file.createdAt)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 italic leading-relaxed line-clamp-2 mb-4">
                      {stripMarkdown(file.content).slice(0, 180)}
                    </p>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        className="h-7 text-[9px] uppercase rounded-none gap-1.5 border-slate-200 hover:border-[#004685] hover:text-[#004685]"
                        onClick={() => downloadAsDocx(file.content, file.name)}
                      >
                        <Download className="w-3 h-3" /> .docx
                      </Button>
                      <Button
                        variant="outline"
                        className="h-7 text-[9px] uppercase rounded-none gap-1.5 border-slate-200 hover:border-red-400 hover:text-red-500"
                        disabled={deletingId === file._id}
                        onClick={() => handleDelete(file._id)}
                      >
                        {deletingId === file._id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <><Trash2 className="w-3 h-3" /> Törlés</>}
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
