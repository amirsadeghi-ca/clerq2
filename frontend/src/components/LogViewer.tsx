import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Terminal, Copy, Check, ArrowDown, Search, Minus, Maximize2 } from 'lucide-react'
import { useI18n } from '../context/i18n'

interface Props {
  title: string
  logs: string[]
  onClose: () => void
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'))
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="rounded-sm bg-yellow-400/30 text-yellow-200">{part}</mark>
      : part
  )
}

function LogLine({ line, query }: { line: string; query: string }) {
  const tsMatch = line.match(/^(\[\d{2}:\d{2}:\d{2}\.\d{3}\])\s(.*)$/s)
  if (tsMatch) {
    return (
      <div className="flex gap-3 px-4 py-px hover:bg-white/[0.04]">
        <span className="shrink-0 select-none text-[#569cd6]">{tsMatch[1]}</span>
        <span className="break-all whitespace-pre-wrap text-[#cccccc]">{highlight(tsMatch[2], query)}</span>
      </div>
    )
  }
  return (
    <div className="px-4 py-px hover:bg-white/[0.04]">
      <span className="break-all whitespace-pre-wrap text-[#cccccc]">{highlight(line, query)}</span>
    </div>
  )
}

const MIN_H = 180
const DEFAULT_H = 420

export function LogViewer({ title, logs, onClose }: Props) {
  const { t } = useI18n()
  const [height, setHeight] = useState(DEFAULT_H)
  const [maximized, setMaximized] = useState(false)
  const [query, setQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [copied, setCopied] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const bodyRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)

  const filtered = query
    ? logs.filter(l => l.toLowerCase().includes(query.toLowerCase()))
    : logs

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !query) {
      bottomRef.current?.scrollIntoView()
    }
  }, [logs, autoScroll, query])

  // Focus search when shown
  useEffect(() => {
    if (showSearch) searchRef.current?.focus()
  }, [showSearch])

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showSearch) { setShowSearch(false); setQuery('') }
        else onClose()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, showSearch])

  // Drag-to-resize
  const onDragMove = useCallback((e: MouseEvent) => {
    const delta = dragStartY.current - e.clientY
    const next = Math.max(MIN_H, Math.min(window.innerHeight * 0.9, dragStartH.current + delta))
    setHeight(next)
    setMaximized(false)
  }, [])

  const onDragUp = useCallback(() => {
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragUp)
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
  }, [onDragMove])

  function onDragStart(e: React.MouseEvent) {
    dragStartY.current = e.clientY
    dragStartH.current = height
    document.addEventListener('mousemove', onDragMove)
    document.addEventListener('mouseup', onDragUp)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'
  }

  function handleScroll() {
    const el = bodyRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }

  function copyAll() {
    navigator.clipboard.writeText(logs.join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const panelHeight = maximized ? '90vh' : `${height}px`

  return (
    <div
      style={{ height: panelHeight }}
      className="fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t border-[#252526] bg-[#1e1e1e] shadow-[0_-4px_24px_rgba(0,0,0,0.6)] transition-none"
    >
      {/* Resize handle */}
      <div
        onMouseDown={onDragStart}
        className="group flex h-[3px] shrink-0 cursor-ns-resize items-center justify-center hover:bg-indigo-500/60 active:bg-indigo-500"
      />

      {/* Tab bar — VSCode style */}
      <div className="flex shrink-0 items-center gap-0 border-b border-[#252526] bg-[#252526]">
        {/* Active tab */}
        <div className="flex items-center gap-2 border-r border-[#1e1e1e] bg-[#1e1e1e] px-4 py-1.5">
          <Terminal size={12} className="text-[#75beff]" />
          <span className="text-[12px] text-[#cccccc]">{title}</span>
          <span className="ml-1 text-[10px] text-[#666]">{t('runstatus.log.lines', { count: logs.length })}</span>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        <div className="flex items-center gap-0.5 px-2">
          <button
            onClick={() => setShowSearch(v => !v)}
            title={t('runstatus.log.search')}
            className={`flex h-7 w-7 items-center justify-center rounded text-[#888] transition-colors hover:bg-white/[0.07] hover:text-[#ccc] ${showSearch ? 'bg-white/[0.08] text-[#ccc]' : ''}`}
          >
            <Search size={13} />
          </button>
          <button
            onClick={copyAll}
            title={t('runstatus.log.copyAll')}
            className="flex h-7 w-7 items-center justify-center rounded text-[#888] transition-colors hover:bg-white/[0.07] hover:text-[#ccc]"
          >
            {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
          </button>
          <button
            onClick={() => setMaximized(v => !v)}
            title={maximized ? t('runstatus.log.restore') : t('runstatus.log.maximize')}
            className="flex h-7 w-7 items-center justify-center rounded text-[#888] transition-colors hover:bg-white/[0.07] hover:text-[#ccc]"
          >
            {maximized ? <Minus size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            title={t('runstatus.log.close')}
            className="flex h-7 w-7 items-center justify-center rounded text-[#888] transition-colors hover:bg-white/[0.07] hover:text-[#ccc]"
          >
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex shrink-0 items-center gap-2 border-b border-[#252526] bg-[#252526] px-3 py-1.5">
          <Search size={11} className="shrink-0 text-[#555]" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t('runstatus.log.find')}
            className="flex-1 bg-transparent text-[12px] text-[#ccc] placeholder-[#444] outline-none"
          />
          {query && (
            <span className="shrink-0 text-[10px] text-[#555]">
              {filtered.length} / {logs.length}
            </span>
          )}
          <button
            onClick={() => { setQuery(''); setShowSearch(false) }}
            className="shrink-0 text-[#555] hover:text-[#aaa]"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* Log body */}
      <div
        ref={bodyRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto py-1 font-mono text-[12px] leading-6"
      >
        {filtered.length === 0 ? (
          <p className="px-4 py-6 text-[12px] text-[#555]">
            {query ? t('runstatus.log.noMatches') : t('runstatus.log.empty')}
          </p>
        ) : (
          filtered.map((line, i) => <LogLine key={i} line={line} query={query} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Jump to bottom */}
      {!autoScroll && !query && (
        <button
          onClick={() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); setAutoScroll(true) }}
          className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded border border-[#444] bg-[#2d2d2d] px-3 py-1.5 text-[11px] text-[#aaa] shadow-lg transition-colors hover:bg-[#333]"
        >
          <ArrowDown size={11} /> {t('runstatus.log.jumpToBottom')}
        </button>
      )}
    </div>
  )
}
