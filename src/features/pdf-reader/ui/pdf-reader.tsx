import { useEffect, useRef, useState } from 'react'
import {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist'
import type { TextContent } from 'pdfjs-dist/types/src/display/api'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import { ChevronLeft, ChevronRight, Minus, Plus, Loader2 } from '@/shared/ui/icon'
import { desktop } from '@/shared/api/desktop'
import { Button } from '@/shared/ui/button'
import { errorText } from '@/shared/lib/utils'
import { useVault, type OpenDocument } from '@/entities/vault'
import { useI18n } from '@/shared/lib/i18n'
GlobalWorkerOptions.workerSrc = worker
export function PdfReader({ document: doc }: { document: OpenDocument }) {
  const { t } = useI18n()
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(doc.page)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(700)
  const [error, setError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)
  const textLayer = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let disposed = false
    let loaded: PDFDocumentProxy | undefined
    void desktop
      .pdf(doc.path)
      .then((data) => getDocument({ data }).promise)
      .then((value) => {
        loaded = value
        if (disposed) void value.destroy()
        else setPdf(value)
      })
      .catch((e) => {
        if (!disposed) {
          setError(errorText(e))
          setRendering(false)
        }
      })
    return () => {
      disposed = true
      void loaded?.destroy()
    }
  }, [doc.path])
  useEffect(() => {
    if (!container.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!pdf) return
    let disposed = false
    let task: RenderTask | undefined
    let layer: TextLayer | undefined
    let reader: ReadableStreamDefaultReader<TextContent> | undefined
    setRendering(true)
    setError(null)
    void (async () => {
      const current = await pdf.getPage(Math.min(page, pdf.numPages))
      if (disposed || !canvas.current || !textLayer.current) return
      const base = current.getViewport({ scale: 1 })
      const viewport = current.getViewport({
        scale: Math.max(0.25, (width - 72) / base.width) * zoom,
      })
      const ratio = window.devicePixelRatio || 1
      const element = canvas.current
      element.width = Math.floor(viewport.width * ratio)
      element.height = Math.floor(viewport.height * ratio)
      element.style.width = `${viewport.width}px`
      element.style.height = `${viewport.height}px`
      textLayer.current.replaceChildren()
      textLayer.current.style.setProperty('--scale-factor', String(viewport.scale))
      task = current.render({ canvas: element, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
      // Use the reader API so PDF text extraction works across embedded Chromium versions.
      // Consume the supported reader API directly; TextLayer also uses getReader().
      reader = (current.streamTextContent() as ReadableStream<TextContent>).getReader()
      const [, content] = await Promise.all([
        task.promise,
        (async () => {
          const text: TextContent = { items: [], styles: {}, lang: null }
          try {
            while (!disposed) {
              const chunk = await reader!.read()
              if (chunk.done) break
              text.items.push(...chunk.value.items)
              Object.assign(text.styles, chunk.value.styles)
              text.lang ??= chunk.value.lang
            }
            return text
          } finally {
            reader?.releaseLock()
            reader = undefined
          }
        })(),
      ])
      if (disposed) return
      layer = new TextLayer({ textContentSource: content, container: textLayer.current!, viewport })
      await layer.render()
      if (disposed) return
      const text = content.items.map((item) => ('str' in item ? item.str : '')).join(' ')
      useVault.getState().updatePdf(doc.path, page, text)
      setRendering(false)
    })().catch((e) => {
      if (!disposed) {
        setError(errorText(e))
        setRendering(false)
      }
    })
    return () => {
      disposed = true
      task?.cancel()
      layer?.cancel()
      void reader?.cancel().catch(() => {})
    }
  }, [pdf, page, width, zoom, doc.path])
  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      <div className="h-[51px] min-h-[51px] flex items-center justify-between gap-3 px-6">
        <span className="truncate text-xs text-muted-foreground">{doc.path.split('/').at(-1)}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('이전 페이지')}
            disabled={!pdf || page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft />
          </Button>
          <span className="min-w-12 text-center text-xs">
            {page} / {pdf?.numPages ?? '—'}
          </span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('다음 페이지')}
            disabled={!pdf || page >= pdf.numPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight />
          </Button>
          <span className="mx-2 h-4 border-l" />
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('축소')}
            disabled={zoom <= 0.5}
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          >
            <Minus />
          </Button>
          <Button variant="ghost" size="sm" className="w-12 px-1 text-xs" onClick={() => setZoom(1)}>
            {Math.round(zoom * 100)}%
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('확대')}
            disabled={zoom >= 3}
            onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
          >
            <Plus />
          </Button>
        </div>
      </div>
      <div ref={container} className="flex-1 min-h-0 overflow-auto bg-pdf p-8 relative">
        <div className="relative w-max mx-auto bg-white shadow-[0_4px_16px_#00000012]">
          <canvas ref={canvas} />
          <div className="textLayer absolute inset-0" ref={textLayer} />
        </div>
        {rendering && (
          <div className="sticky bottom-5 flex gap-2 items-center w-max mx-auto rounded-lg bg-popover px-3.5 py-2.5 text-xs shadow-[0_2px_15px_#0001]">
            <Loader2 className="animate-spin" size={18} />
            <span>{t('PDF 읽는 중')}</span>
          </div>
        )}
        {error && (
          <p className="m-5 rounded-lg bg-background p-4 text-sm text-destructive">{error}</p>
        )}
      </div>
    </div>
  )
}
