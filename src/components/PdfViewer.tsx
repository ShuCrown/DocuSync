import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ListTree, ZoomIn, ZoomOut } from 'lucide-react'
import 'pdfjs-dist/web/pdf_viewer.css'

interface OutlineItem {
  title: string
  page: number | null
  items: OutlineItem[]
}

/** Resolve an outline entry's dest (named or explicit) to a 1-based page. */
async function resolveDestPage(pdf: pdfjsLib.PDFDocumentProxy, dest: unknown): Promise<number | null> {
  try {
    let arr = dest
    if (typeof dest === 'string') arr = await pdf.getDestination(dest)
    if (!Array.isArray(arr) || arr.length === 0) return null
    const ref = arr[0]
    if (typeof ref === 'number') return ref + 1
    if (ref && typeof ref === 'object') return (await pdf.getPageIndex(ref as Parameters<typeof pdf.getPageIndex>[0])) + 1
    return null
  } catch {
    return null
  }
}

/**
 * Fallback outline for PDFs WITHOUT a bookmark tree. Print-to-PDF engines
 * (Skia/Chrome etc.) write chapter link anchors as named destinations but no
 * /Outlines, so getOutline() is null while the document clearly has chapters.
 * Each dest name (ch1…) gets its real heading text pulled from the page at
 * the dest's /XYZ coordinates.
 */
async function outlineFromDestinations(pdf: pdfjsLib.PDFDocumentProxy): Promise<OutlineItem[]> {
  const dests = await pdf.getDestinations()
  const names = [...dests.keys()].slice(0, 100)
  const out: OutlineItem[] = []
  for (const name of names) {
    const dest = dests.get(name)
    const page = await resolveDestPage(pdf, dest)
    let title = name
    const x = Array.isArray(dest) ? dest[2] : undefined
    const y = Array.isArray(dest) ? dest[3] : undefined
    if (page != null && typeof x === 'number' && typeof y === 'number') {
      try {
        const p = await pdf.getPage(page)
        const tc = await p.getTextContent()
        // Skia's anchor sits well ABOVE the heading glyph box (here ~86pt), so
        // point-matching finds nothing. Group items into lines and take the
        // first line at/below the dest point (within a 200pt window).
        const pts: { str: string; x: number; y: number }[] = []
        for (const item of tc.items) {
          if ('str' in item && item.str.trim()) {
            pts.push({ str: item.str, x: item.transform[4], y: item.transform[5] })
          }
        }
        pts.sort((a, b) => b.y - a.y || a.x - b.x)
        const lines: { y: number; text: string }[] = []
        for (const pt of pts) {
          const last = lines[lines.length - 1]
          if (last && Math.abs(last.y - pt.y) <= 2) last.text += pt.str
          else lines.push({ y: pt.y, text: pt.str })
        }
        const line = lines.find((l) => l.y <= y + 4 && l.y > y - 200)
        if (line) {
          const t = line.text.trim()
          if (t) title = t.length > 80 ? `${t.slice(0, 80)}…` : t
        }
      } catch {
        // keep the raw dest name
      }
    }
    out.push({ title, page, items: [] })
  }
  return out
}

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
  const rootRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [showOutline, setShowOutline] = useState(false)
  /** User zoom relative to fit-width (1 = page fills the pane width) */
  const [userZoom, setUserZoom] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  /** Page sizes at scale 1 — unrendered placeholders keep the document's real
   *  height so the scrollbar stays accurate with lazy rendering. */
  const [baseSizes, setBaseSizes] = useState<Map<number, { w: number; h: number }>>(new Map())
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasks = useRef<Map<number, pdfjsLib.RenderTask>>(new Map())
  /** Scale each page was last rendered at — a mismatch means re-render needed. */
  const renderedScale = useRef<Map<number, number>>(new Map())
  const baseSizesRef = useRef(baseSizes)
  baseSizesRef.current = baseSizes
  /** Live target scale (fit × zoom). Kept in a ref — split drags update it
   *  every frame via direct DOM writes, NOT React state, so the page list is
   *  never reconciled during a drag. */
  const targetScaleRef = useRef(0)
  const rerasterTimer = useRef<number | null>(null)
  /** Raster scale = debounced live scale. Canvases re-rasterize once, ~150ms
   *  after the drag settles; meanwhile the existing canvas CSS-stretches. */
  const [renderScale, setRenderScale] = useState(0)

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  // Load PDF
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const loadingTask = pdfjsLib.getDocument({ url })
        const doc = await loadingTask.promise
        if (cancelled) return
        setPdf(doc)
        setTotalPages(doc.numPages)
        setCurrentPage(1)
        // New document: reset per-page render bookkeeping
        renderedScale.current.clear()
      } catch (err) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        setLoadError(
          name === 'PasswordException'
            ? '该 PDF 受密码保护，暂不支持预览'
            : 'PDF 加载失败，文件可能已损坏'
        )
      }
    }
    load()
    return () => { cancelled = true }
  }, [url])

  // Load outline (bookmarks) once the document is ready; fall back to named
  // destinations when the file has no bookmark tree (see outlineFromDestinations)
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    const load = async () => {
      try {
        const raw = await pdf.getOutline()
        let tree: OutlineItem[] = []
        if (raw && raw.length > 0) {
          const walk = async (items: typeof raw): Promise<OutlineItem[]> =>
            Promise.all(
              items.map(async (it) => ({
                title: it.title,
                page: await resolveDestPage(pdf, it.dest),
                items: await walk(it.items ?? []),
              }))
            )
          tree = await walk(raw)
        } else {
          tree = await outlineFromDestinations(pdf).catch(() => [])
        }
        if (!cancelled && tree.length > 0) {
          setOutline(tree)
          setShowOutline(true)
        }
      } catch {
        // Malformed outline — preview works without it
      }
    }
    load()
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

  /** Fit scale for the current pane width. Capped at 2 so small pages aren't
   *  blown up beyond readability on very wide panes. 24px margin covers the
   *  vertical scrollbar + page shadow, so the page never triggers a
   *  horizontal scrollbar at 100% zoom. offsetWidth is scrollbar-stable. */
  const computeFitScale = useCallback(() => {
    const sizes = baseSizesRef.current
    if (sizes.size === 0) return 0
    const paneW = containerRef.current?.offsetWidth ?? 0
    if (paneW <= 0) return 0
    let maxW = 0
    sizes.forEach((s) => { if (s.w > maxW) maxW = s.w })
    return Math.min((paneW - 24) / maxW, 2)
  }, [])

  /** Write live sizes straight to the placeholder divs (no React round-trip):
   *  a split drag fires ResizeObserver every frame — routing that through
   *  state would reconcile the whole page list per frame and stall. */
  const applyLiveSizes = useCallback((zoom: number) => {
    const fit = computeFitScale()
    if (fit <= 0) return
    const scale = fit * zoom
    targetScaleRef.current = scale
    const sizes = baseSizesRef.current
    pageRefs.current.forEach((el, num) => {
      const base = sizes.get(num)
      if (!base) return
      el.style.width = `${base.w * scale}px`
      el.style.height = `${base.h * scale}px`
    })
  }, [computeFitScale])

  /** Re-raster visible pages once, after the drag/zoom settles. */
  const scheduleReraster = useCallback((scale: number) => {
    if (scale <= 0) return
    if (rerasterTimer.current != null) window.clearTimeout(rerasterTimer.current)
    rerasterTimer.current = window.setTimeout(() => {
      rerasterTimer.current = null
      setRenderScale(scale)
    }, 150)
  }, [])

  useEffect(() => () => {
    if (rerasterTimer.current != null) window.clearTimeout(rerasterTimer.current)
  }, [])

  // Track the pane width so pages fit it (split view resizes it live).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      applyLiveSizes(userZoom)
      scheduleReraster(targetScaleRef.current)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [applyLiveSizes, scheduleReraster, userZoom])

  // Apply sizes when measurement completes or the user zooms (buttons).
  useEffect(() => {
    if (baseSizes.size === 0) return
    applyLiveSizes(userZoom)
    scheduleReraster(targetScaleRef.current)
  }, [baseSizes, userZoom, applyLiveSizes, scheduleReraster])

  // Extract text for summary. Delayed + batched: the pdf.js worker is
  // single-threaded, so queuing numPages text requests upfront would starve
  // render tasks (initial paint AND resize re-rasters). Wait for first paint,
  // then yield every few pages so renders interleave.
  useEffect(() => {
    if (!pdf || !latestOnTextExtractedRef.current) return
    let cancelled = false
    const extract = async () => {
      const texts: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        if (cancelled) return
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
        texts.push(pageText)
        if (i % 8 === 0) await new Promise((r) => setTimeout(r, 60))
      }
      if (!cancelled) {
        latestOnTextExtractedRef.current?.(texts.join('\n\n'))
      }
    }
    const timer = window.setTimeout(extract, 800)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [pdf])

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
    // the live placeholder size, so a stale canvas stretches smoothly until
    // the debounced re-raster catches up.
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
      // Mark rendered ONLY on success — a cancelled task must not fake a
      // completed render (the next observer pass would skip re-rendering).
      renderedScale.current.set(num, renderScale)

      // Transparent text layer on top of the canvas → select/copy/search in
      // the browser. --total-scale-factor drives the official .textLayer CSS
      // (font sizes are calc'd from it); the viewer's own geometry comes from
      // the placeholder's explicit pixel size + inset:0.
      container.style.setProperty('--total-scale-factor', String(renderScale))
      const textLayerDiv = document.createElement('div')
      textLayerDiv.className = 'textLayer'
      container.appendChild(textLayerDiv)
      try {
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: await page.getTextContent(),
          container: textLayerDiv,
          viewport: page.getViewport({ scale: renderScale }),
        })
        await textLayer.render()
      } catch {
        // Best-effort: a missing text layer only costs select/copy, not the page
      }
    } catch {
      // Render was cancelled
    } finally {
      renderTasks.current.delete(num)
    }
  }, [pdf, renderScale])

  /** Effective scrollport: in the app shell the outer .doc-zoom-scroller
   *  scrolls (the inner .pdf-scroller is stretched to full content height —
   *  using IT as observer root would intersect every page and defeat lazy
   *  rendering); standalone, the inner scroller is the scrollport. */
  const getScrollRoot = useCallback((): HTMLElement | null => (
    rootRef.current?.closest<HTMLElement>('.doc-zoom-scroller') ?? containerRef.current
  ), [])

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
        root: getScrollRoot(),
        rootMargin: '1000px 0px 1000px 0px',
        threshold: 0,
      }
    )

    pageRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages, renderPage, getScrollRoot])

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
        root: getScrollRoot(),
        rootMargin: '-40% 0px -40% 0px',
        threshold: 0,
      }
    )

    pageRefs.current.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [totalPages, getScrollRoot])

  // Outline sidebar height: in the app shell the outer .doc-zoom-scroller is
  // the scrollport (the inner .pdf-scroller is stretched to content height);
  // standalone, the inner one is. Cap the sticky sidebar at the scrollport
  // height minus the toolbar so it stays pinned while pages scroll.
  const [sidebarMaxH, setSidebarMaxH] = useState<number | null>(null)
  const [toolbarH, setToolbarH] = useState(0)
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || !showOutline) return
    const outer = root.closest<HTMLElement>('.doc-zoom-scroller')
    const sc = outer ?? containerRef.current
    if (!sc) return
    const update = () => {
      const h = toolbarRef.current?.offsetHeight ?? 0
      setToolbarH(h)
      setSidebarMaxH(Math.max(120, sc.clientHeight - h))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(sc)
    return () => ro.disconnect()
  }, [showOutline, pdf])

  // Static page list: memoized so currentPage updates during scrolling (and
  // any state change) skip reconciling hundreds of placeholder divs.
  const pageList = useMemo(() => (
    Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
      <div
        key={num}
        data-page={num}
        ref={(el) => { if (el) pageRefs.current.set(num, el) }}
        className="relative bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
        style={{ minHeight: '400px' }}
      />
    ))
  ), [totalPages])

  const zoomIn = () => setUserZoom((z) => Math.min(4, z + 0.25))
  const zoomOut = () => setUserZoom((z) => Math.max(0.5, z - 0.25))

  // Page jump input — tracks currentPage via render-time derived state
  const [pageInput, setPageInput] = useState('1')
  const [lastTrackedPage, setLastTrackedPage] = useState(currentPage)
  if (lastTrackedPage !== currentPage) {
    setLastTrackedPage(currentPage)
    setPageInput(String(currentPage))
  }
  const scrollToPage = useCallback((n: number) => {
    const clamped = Math.min(Math.max(1, n), totalPages)
    pageRefs.current.get(clamped)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [totalPages])
  const jumpToPage = () => {
    const n = Number.parseInt(pageInput, 10)
    if (!Number.isFinite(n)) {
      setPageInput(String(currentPage))
      return
    }
    const clamped = Math.min(Math.max(1, n), totalPages)
    setPageInput(String(clamped))
    scrollToPage(clamped)
  }

  // Active outline entry: last item (document order) at/before currentPage
  const flatOutline = useMemo(() => {
    const flat: OutlineItem[] = []
    const walk = (items: OutlineItem[]) => items.forEach((it) => { flat.push(it); walk(it.items) })
    walk(outline)
    return flat
  }, [outline])
  const activeOutline = useMemo(() => {
    let best: OutlineItem | null = null
    for (const it of flatOutline) {
      if (it.page == null) continue
      if (it.page <= currentPage) best = it
      else break
    }
    return best
  }, [flatOutline, currentPage])

  if (loadError) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="text-center text-error bg-error/5 rounded-lg border border-error/10 p-6">
          {loadError}
        </div>
      </div>
    )
  }

  return (
    // min-h-0: without it the flex item's automatic min-height (content size)
    // forces this wrapper — and the scroller inside — to full document height
    // wherever the viewer stands alone (share preview), killing vertical
    // scrolling. Inside the app's zoom layer the CSS there forces the scroller
    // to height:auto, so this is a no-op there.
    <div ref={rootRef} className="flex flex-col flex-1 min-h-0">
      {/* Toolbar — sticky: in the app shell the outer .doc-zoom-scroller
          scrolls the whole viewer, so without pinning the page-jump input
          would scroll away with the pages */}
      <div ref={toolbarRef} className="sticky top-0 z-20 flex items-center justify-center gap-3 py-2 px-4 bg-surface-card border-b border-border shrink-0">
        {outline.length > 0 && (
          <>
            <button
              onClick={() => setShowOutline((v) => !v)}
              title="目录导航"
              aria-label="目录导航"
              className={`p-1.5 transition-colors ${showOutline ? 'text-primary' : 'text-text-secondary hover:text-primary'}`}
            >
              <ListTree className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-border mx-1" />
          </>
        )}
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
        <div className="flex items-center gap-1 text-sm text-text-secondary tabular-nums">
          <input
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') jumpToPage() }}
            onBlur={() => setPageInput(String(currentPage))}
            onFocus={(e) => e.target.select()}
            aria-label="跳转到页码"
            className="w-10 rounded border border-border bg-transparent px-1 py-0.5 text-center text-sm text-text outline-none focus:border-primary"
          />
          <span>/ {totalPages}</span>
        </div>
      </div>

      {/* Body: optional outline sidebar + scrollable page container */}
      <div className="flex flex-1 min-h-0">
        {showOutline && outline.length > 0 && (
          <div
            className="pdf-outline w-52 shrink-0 self-start sticky overflow-y-auto border-r border-border bg-surface-card py-2"
            style={{
              // Stick below the (also sticky) toolbar, not at the scrollport top
              top: toolbarH,
              ...(sidebarMaxH != null ? { maxHeight: sidebarMaxH } : {}),
            }}
          >
            {renderOutlineItems(outline, 0)}
          </div>
        )}
        <div
          ref={containerRef}
          className="pdf-scroller flex-1 overflow-auto bg-[#504e49]"
        >
          <div className="flex flex-col items-center py-4 gap-2">
            {pageList}
          </div>
        </div>
      </div>
    </div>
  )

  function renderOutlineItems(items: OutlineItem[], depth: number) {
    return items.map((item, i) => (
      <div key={`${depth}-${i}-${item.title}`}>
        <button
          onClick={() => item.page != null && scrollToPage(item.page)}
          disabled={item.page == null}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`w-full truncate py-1.5 pr-3 text-left text-[13px] transition-colors ${
            activeOutline === item
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-text-secondary hover:bg-surface-alt hover:text-text'
          } ${item.page == null ? 'opacity-50' : ''}`}
          title={item.title}
        >
          {item.title}
        </button>
        {item.items.length > 0 && renderOutlineItems(item.items, depth + 1)}
      </div>
    ))
  }
}
