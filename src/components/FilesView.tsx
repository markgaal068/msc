"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Download, Trash2, Loader2, FileText, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from "react-toastify"
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx"

// ── Types ────────────────────────────────────────────────────────────────────

type FileType = "faq" | "reflexio" | "hangjegyzet" | "teszt" | "megoldokulcs" | "moodle"
type SortType = "date-desc" | "date-asc" | "name-asc" | "name-desc"

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

const PAGE_SIZE = 5

const TYPE_META: Record<FileType, { label: string; bg: string; text: string }> = {
  faq:          { label: "FAQ",          bg: "bg-[#004685]/10", text: "text-[#004685]" },
  reflexio:     { label: "Reflexió",     bg: "bg-[#97c93e]/15", text: "text-[#4a7a1e]" },
  hangjegyzet:  { label: "Hangjegyzet",  bg: "bg-[#004685]/10", text: "text-[#004685]" },
  teszt:        { label: "Teszt",        bg: "bg-[#004685]/10", text: "text-[#004685]" },
  megoldokulcs: { label: "Megoldókulcs", bg: "bg-[#97c93e]/15", text: "text-[#4a7a1e]" },
  moodle:       { label: "Moodle GIFT",  bg: "bg-[#004685]/10", text: "text-[#004685]" },
}

const FILTERS = [
  { id: "all",          label: "Összes" },
  { id: "faq",         label: "FAQ" },
  { id: "reflexio",    label: "Reflexió" },
  { id: "hangjegyzet", label: "Hangjegyzet" },
  { id: "teszt",       label: "Teszt" },
  { id: "megoldokulcs",label: "Megoldókulcs" },
  { id: "moodle",      label: "Moodle GIFT" },
] as const

const SORTS: { id: SortType; label: string }[] = [
  { id: "date-desc", label: "Újabb elől" },
  { id: "date-asc",  label: "Régebbi elől" },
  { id: "name-asc",  label: "A–Z" },
  { id: "name-desc", label: "Z–A" },
]

// ── Pagination helper ─────────────────────────────────────────────────────────

function getPaginationRange(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const range: (number | "…")[] = [1]
  if (current > 3) range.push("…")
  const start = Math.max(2, current - 1)
  const end   = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) range.push(i)
  if (current < total - 2) range.push("…")
  range.push(total)
  return range
}

// ── plain-text download (for GIFT files) ─────────────────────────────────────

function downloadAsText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.txt`
  a.click()
  URL.revokeObjectURL(url)
}

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
  const [files, setFiles]             = useState<SavedFile[]>([])
  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<"all" | FileType>("all")
  const [search, setSearch]           = useState("")
  const [sort, setSort]               = useState<SortType>("date-desc")
  const [page, setPage]               = useState(1)
  const [pageLoading, setPageLoading] = useState(false)
  const [deletingId, setDeletingId]   = useState<string | null>(null)

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

  // Reset to page 1 on filter / search / sort change
  useEffect(() => { setPage(1) }, [filter, search, sort])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/files?id=${id}&email=${encodeURIComponent(user.email)}`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      setFiles(prev => prev.filter(f => f._id !== id))
      toast.success("Fájl sikeresen törölve!", { style: { borderRadius: 0 } })
    } catch {
      toast.error("A törlés sikertelen. Próbáld újra!", { style: { borderRadius: 0 } })
    } finally {
      setDeletingId(null)
    }
  }

  // Filter → Sort → Paginate
  const filtered = files
    .filter(f => filter === "all" || f.type === filter)
    .filter(f => !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()))

  const sorted = [...filtered].sort((a, b) => {
    switch (sort) {
      case "name-asc":  return a.name.localeCompare(b.name, "hu")
      case "name-desc": return b.name.localeCompare(a.name, "hu")
      case "date-desc": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      case "date-asc":  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    }
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const paged      = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const changePage = (newPage: number) => {
    if (newPage === safePage || newPage < 1 || newPage > totalPages || pageLoading) return
    setPageLoading(true)
    setTimeout(() => {
      setPage(newPage)
      setPageLoading(false)
    }, 160)
  }

  // Count per type for filter badges
  const counts = files.reduce<Record<string, number>>((acc, f) => {
    acc[f.type] = (acc[f.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Header ── */}
      <div className="shrink-0 mb-4">
        <h2 className="text-[11px] font-black uppercase tracking-[0.3em] text-[#004685] mb-5">
          Mentett Fájlok
        </h2>

        {/* Search */}
        <div className="mb-3">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Keresés név alapján..."
            className="w-full border border-slate-200 px-3 py-2 text-[12px] focus:outline-none focus:border-[#004685] rounded-none"
          />
        </div>

        {/* Sort pills */}
        <div className="flex flex-wrap gap-2 mb-3">
          {SORTS.map(({ id, label }) => {
            const active = sort === id
            return (
              <button
                key={id}
                onClick={() => setSort(id)}
                className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all ${
                  active
                    ? "bg-[#97c93e] text-white"
                    : "bg-white border border-slate-200 text-slate-500 hover:border-[#97c93e] hover:text-[#97c93e]"
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>

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

      {/* ── Content (scrollable) ── */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-5 h-5 animate-spin text-[#004685]" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-3">
            <FileText className="w-8 h-8 text-slate-200" />
            <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-slate-300">
              {search.trim()
                ? "Nincs találat"
                : filter === "all"
                  ? "Még nincs mentett fájl"
                  : `Nincs mentett ${TYPE_META[filter as FileType]?.label ?? ""}`}
            </p>
          </div>
        ) : pageLoading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-[#004685]" />
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-300">Betöltés...</span>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {paged.map(file => {
              const meta = TYPE_META[file.type]
              return (
                <div
                  key={file._id}
                  className="bg-white border border-slate-100 hover:border-slate-200 hover:shadow-sm transition-all"
                >
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
                      {file.type === "moodle"
                        ? file.content.slice(0, 180).replace(/\n+/g, " ")
                        : stripMarkdown(file.content).slice(0, 180)}
                    </p>

                    <div className="flex justify-end gap-2">
                      {file.type === "moodle" ? (
                        <Button
                          variant="outline"
                          className="h-7 text-[9px] uppercase rounded-none gap-1.5 border-slate-200 hover:border-[#004685] hover:text-[#004685]"
                          onClick={() => { downloadAsText(file.content, file.name); toast.info("Letöltés megkezdve!", { style: { borderRadius: 0 } }) }}
                        >
                          <Download className="w-3 h-3" /> .txt
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          className="h-7 text-[9px] uppercase rounded-none gap-1.5 border-slate-200 hover:border-[#004685] hover:text-[#004685]"
                          onClick={() => { downloadAsDocx(file.content, file.name); toast.info("Letöltés megkezdve!", { style: { borderRadius: 0 } }) }}
                        >
                          <Download className="w-3 h-3" /> .docx
                        </Button>
                      )}
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

      {/* ── Pagination (always visible, outside scroll area) ── */}
      {!loading && totalPages > 1 && (
        <div className="shrink-0 mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
          {/* File count */}
          <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 whitespace-nowrap">
            <span className="hidden sm:inline">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} /&nbsp;
            </span>
            {sorted.length} db
          </span>

          {/* Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => changePage(safePage - 1)}
              disabled={safePage === 1 || pageLoading}
              className="w-7 h-7 flex items-center justify-center border border-slate-200 text-slate-400 hover:border-[#004685] hover:text-[#004685] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>

            {/* Mobile: X / Y text */}
            <span className="sm:hidden text-[11px] font-bold text-slate-500 px-2 min-w-12 text-center">
              {safePage} / {totalPages}
            </span>

            {/* Desktop: numbered page buttons */}
            <div className="hidden sm:flex items-center gap-1">
              {getPaginationRange(safePage, totalPages).map((p, i) =>
                p === "…" ? (
                  <span key={`e${i}`} className="w-7 h-7 flex items-center justify-center text-[11px] text-slate-300 select-none">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    onClick={() => changePage(p as number)}
                    disabled={pageLoading}
                    className={`w-7 h-7 text-[10px] font-bold border transition-all ${
                      p === safePage
                        ? "bg-[#004685] text-white border-[#004685]"
                        : "border-slate-200 text-slate-500 hover:border-[#004685] hover:text-[#004685]"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}
            </div>

            <button
              onClick={() => changePage(safePage + 1)}
              disabled={safePage === totalPages || pageLoading}
              className="w-7 h-7 flex items-center justify-center border border-slate-200 text-slate-400 hover:border-[#004685] hover:text-[#004685] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
