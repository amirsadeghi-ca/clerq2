import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { fileUrl } from '../lib/fileUrl'
import { useState } from 'react'
import { useI18n } from '../context/i18n'

interface Props {
  imagePaths: string[]
  onClose: () => void
}

export function RunOutputViewer({ imagePaths, onClose }: Props) {
  const { t } = useI18n()
  const [lightbox, setLightbox] = useState<number | null>(null)

  function prev() {
    setLightbox(i => (i === null ? null : i > 0 ? i - 1 : imagePaths.length - 1))
  }
  function next() {
    setLightbox(i => (i === null ? null : i < imagePaths.length - 1 ? i + 1 : 0))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="flex h-[80vh] w-[80vw] flex-col rounded-xl border border-[var(--c-border-2)] bg-[var(--c-surface)] shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--c-border)] px-5 py-4">
          <div>
            <p className="text-[14px] font-semibold text-[var(--c-text-1)]">{t('runstatus.output.title')}</p>
            <p className="mt-0.5 text-[12px] text-[var(--c-text-4)]">{imagePaths.length !== 1 ? t('runstatus.output.pageCount', { count: imagePaths.length }) : t('runstatus.output.pageCountOne', { count: imagePaths.length })}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--c-text-5)] hover:text-[var(--c-text-3)] transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-3 gap-3">
            {imagePaths.map((rel, i) => (
              <button
                key={rel}
                onClick={() => setLightbox(i)}
                className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--c-border)] bg-[var(--c-surface-2)] transition-[border-color] hover:border-[var(--c-border-3)]"
              >
                <img
                  src={fileUrl(`${rel}`)}
                  alt={t('runstatus.output.page', { n: i + 1 })}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-[10px] text-[var(--c-text-2)]">p. {i + 1}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      {lightbox !== null && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/90"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={e => { e.stopPropagation(); prev() }}
            className="absolute left-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            <ChevronLeft size={16} />
          </button>

          <img
            src={fileUrl(`${imagePaths[lightbox]}`)}
            alt={t('runstatus.output.page', { n: lightbox + 1 })}
            className="max-h-[90vh] max-w-[85vw] rounded object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />

          <button
            onClick={e => { e.stopPropagation(); next() }}
            className="absolute right-4 rounded-full border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-3)] hover:text-[var(--c-text-2)] transition-colors"
          >
            <ChevronRight size={16} />
          </button>

          <div className="absolute bottom-4 text-[12px] text-[var(--c-text-4)]">
            {lightbox + 1} / {imagePaths.length}
          </div>

          <a
            href={fileUrl(`${imagePaths[lightbox]}`)}
            download
            onClick={e => e.stopPropagation()}
            className="absolute top-4 right-4 rounded border border-[var(--c-border-3)] bg-[var(--c-surface)] p-2 text-[var(--c-text-4)] hover:text-[var(--c-text-2)] transition-colors"
          >
            <Download size={14} />
          </a>
        </div>
      )}
    </div>
  )
}
