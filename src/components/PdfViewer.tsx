import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ZoomIn, ZoomOut } from 'lucide-react'

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

interface PdfViewerProps {
  url: string
  onTextExtracted?: (text: string) => void
}

export function PdfViewer({ url, onTextExtracted }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  /** User zoom relative to fit-width (1 = page fills the pane width) */
  const [userZoom, setUserZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  /** Pane width for fit-to-width scaling. Measured with offsetWidth, which is
   *  stable regardless of a vertical scrollbar being visible (contentRect
   *  would oscillate when the scrollbar appears/disappears). */
  const [paneWidth, setPaneWidth] = useState(0)
  /** Page sizes at scale 1 — unrendered placeholders keep the document's real
   *  height so the scrollbar stays accurate with lazy rendering. */
  const [baseSizes, setBaseSizes] = useState<Map<number, { w: number; h: number }>>(new Map())
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasks = useRef<Map<number, pdfjsLib.RenderTask>>(new Map())
  /** Scale each page was last rendered at — a mismatch means re-render needed. */
  const renderedScale = useRef<Map<number, number>>(new Map())

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  // Track the scroller's width so pages fit the pane (split view resizes it
  // live). offsetWidth keeps the measurement scrollbar-independent.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setPaneWidth((e.target as HTMLElement).offsetWidth)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Load PDF
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loadingTask = pdfjsLib.getDocument({ url })
      const doc = await loadingTask.promise
      if (cancelled) return
      setPdf(doc)
      setTotalPages(doc.numPages)
      setCurrentPage(1)
    }
    load()
    return () => { cancelled = true }
  }, [url])

  // Extract text for summary
  useEffect(() => {
    if (!pdf || !latestOnTextExtractedRef.current) return
    let cancelled = false
    const extract = async () => {
      const texts: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
        texts.push(pageText)
      }
      if (!cancelled) {
        latestOnTextExtractedRef.current?.(texts.join('\n\n'))
      }
    }
    extract()
    return () => { cancelled = true }
  }, [pdf])

  // Pre-measure page sizes (scale 1) so lazy rendering keeps an accurate
  // scrollbar before pages are actually rendered.
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    const measure = async () => {
      const sizes = new Map<number, { w: number; h: number }>()
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return
        const page = await pdf.getPage(i)
        const vp = page.getViewport({ scale: 1 })
        sizes.set(i, { w: vp.width, h: vp.height })
      }
      if (!cancelled) setBaseSizes(sizes)
    }
    measure()
    return () => { cancelled = true }
  }, [pdf])

  // Fit-to-width: effective scale = pane fit × user zoom. Capped at 2 so
  // small pages aren't blown up beyond readability on very wide panes.
  // 24px margin covers the vertical scrollbar + page shadow, so the page
  // never triggers a horizontal scrollbar at 100% zoom.
  const maxBaseW = baseSizes.size > 0
    ? Math.max(...Array.from(baseSizes.values(), (s) => s.w))
    : 0
  const fitScale = paneWidth > 0 && maxBaseW > 0 ? Math.min((paneWidth - 24) / maxBaseW, 2) : 0
  const scale = fitScale > 0 ? fitScale * userZoom : 0

  // Debounced mirror of `scale`, used ONLY for canvas rasterization. Split
  // drags change `scale` every frame — re-rasterizing on each is the jank.
  // Placeholders keep the live `scale` (smooth CSS sizing) while canvases
  // re-render once, after the drag settles.
  const [renderScale, setRenderScale] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setRenderScale(scale), 150)
    return () => clearTimeout(t)
  }, [scale])

  // Render a single page into its container (no-op if already at renderScale)
  const renderPage = useCallback(async (num: number) => {
    if (!pdf || renderScale <= 0) return
    const container = pageRefs.current.get(num)
    if (!container) return
    if (renderedScale.current.get(num) === renderScale) return

    // Cancel any existing render task for this page
    const existing = renderTasks.current.get(num)
    if (existing) {
      existing.cancel()
      renderTasks.current.delete(num)
    }

    // Clear container
    container.innerHTML = ''

    const page = await pdf.getPage(num)
    // Backing store at device resolution (crisp on HiDPI); CSS size tracks
    // the placeholder, so a stale canvas stretches smoothly until re-render.
    const dpr = window.devicePixelRatio || 1
    const viewport = page.getViewport({ scale: renderScale * dpr })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'
    container.appendChild(canvas)

    const ctx = canvas.getContext('2d')!
    const task = page.render({ canvas, canvasContext: ctx, viewport })
    renderTasks.current.set(num, task)

    try {
      await task.promise
    } catch {
      // Render was cancelled
    } finally {
      renderTasks.current.delete(num)
      renderedScale.current.set(num, renderScale)
    }
  }, [pdf, renderScale])

  // Lazy render: only pages in/near the viewport get a canvas. Re-created when
  // renderScale changes (renderPage identity changes), and re-observing fires
  // initial intersection callbacks so visible pages re-render at the new scale.
  // Pages scrolled far away drop their canvas to free memory and re-render on
  // return. Split drags don't churn this observer — renderScale is debounced.
  useEffect(() => {
    if (!containerRef.current || totalPages === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const pageNum = Number(entry.target.getAttribute('data-page'))
          if (!pageNum) continue
          if (entry.isIntersecting) {
            renderPage(pageNum)
          } else {
            const container = pageRefs.current.get(pageNum)
            if (container && renderedScale.current.has(pageNum)) {
              const task = renderTasks.current.get(pageNum)
              task?.cancel()
              renderTasks.current.delete(pageNum)
              container.innerHTML = ''
              renderedScale.current.delete(pageNum)
            }
          }
        }
      },
      {
        root: containerRef.current,
        rootMargin: '1000px 0px 1000px 0px',
        threshold: 0,
      }
    )

    pageRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages, renderPage])

  // Track current page via IntersectionObserver
  useEffect(() => {
    if (!containerRef.current || totalPages === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const pageNum = Number(entry.target.getAttribute('data-page'))
            if (pageNum) setCurrentPage(pageNum)
          }
        }
      },
      {
        root: containerRef.current,
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
      }
    )

    pageRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages])

  const zoomIn = () => setUserZoom((z) => Math.min(4, z + 0.25))
  const zoomOut = () => setUserZoom((z) => Math.max(0.5, z - 0.25))

  return (
    // min-h-0: without it the flex item's automatic min-height (content size)
    // forces this wrapper — and the scroller inside — to full document height
    // wherever the viewer stands alone (share preview), killing vertical
    // scrolling. Inside the app's zoom layer the CSS there forces the scroller
    // to height:auto, so this is a no-op there.
    <div className="flex flex-col flex-1 min-h-0">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-3 py-2 px-4 bg-surface-card border-b border-border shrink-0">
        <button onClick={zoomOut} className="p-1.5 hover:text-primary transition-colors text-text-secondary">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span
          onClick={() => setUserZoom(1)}
          title="重置为适应宽度"
          className="text-sm text-text-secondary min-w-[48px] text-center tabular-nums cursor-pointer hover:text-primary transition-colors"
        >
          {Math.round(userZoom * 100)}%
        </span>
        <button onClick={zoomIn} className="p-1.5 hover:text-primary transition-colors text-text-secondary">
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <span className="text-sm text-text-secondary tabular-nums">
          {currentPage} / {totalPages}
        </span>
      </div>

      {/* Scrollable page container */}
      <div
        ref={containerRef}
        className="pdf-scroller flex-1 overflow-auto bg-[#525659]"
      >
        <div className="flex flex-col items-center py-4 gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => {
            const base = baseSizes.get(num)
            return (
              <div
                key={num}
                data-page={num}
                ref={(el) => { if (el) pageRefs.current.set(num, el) }}
                className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
                style={{
                  minHeight: '400px',
                  width: base && scale > 0 ? `${base.w * scale}px` : undefined,
                  height: base && scale > 0 ? `${base.h * scale}px` : undefined,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
