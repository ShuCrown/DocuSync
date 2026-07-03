import { useEffect, useRef, useState, useCallback } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

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
  const [currentPage, setCurrentPage] = useState(1)
  const [containerWidth, setContainerWidth] = useState(0)
  // userZoom is a multiplier on top of the fit-to-width scale.
  // 1.0 = fit width, 0.5 = half width, 2.0 = double width.
  const [userZoom, setUserZoom] = useState(1)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasks = useRef<Map<number, pdfjsLib.RenderTask>>(new Map())

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  // Track container width so pages can fit the pane responsively.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const updateWidth = () => {
      setContainerWidth(el.clientWidth)
    }
    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(el)
    window.addEventListener('resize', updateWidth)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
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
      setUserZoom(1)
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

  // Compute the base scale that makes a page fill the container width (minus a small gap).
  const fitScale = useCallback(async () => {
    if (!pdf || containerWidth <= 0) return 1
    const firstPage = await pdf.getPage(1)
    const viewport = firstPage.getViewport({ scale: 1 })
    const gap = 32 // account for page shadow/gutter
    return Math.max(0.25, (containerWidth - gap) / viewport.width)
  }, [pdf, containerWidth])

  // Render a single page into its container
  const renderPage = useCallback(async (num: number, scaleOverride?: number) => {
    if (!pdf) return
    const container = pageRefs.current.get(num)
    if (!container) return

    // Cancel any existing render task for this page
    const existing = renderTasks.current.get(num)
    if (existing) {
      existing.cancel()
      renderTasks.current.delete(num)
    }

    // Clear container
    container.innerHTML = ''

    const page = await pdf.getPage(num)
    const base = await fitScale()
    const scale = scaleOverride ?? base * userZoom

    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    // Render at device pixel ratio for crisp output on HiDPI screens.
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.floor(viewport.width * dpr)
    canvas.height = Math.floor(viewport.height * dpr)
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.style.maxWidth = '100%'
    canvas.style.height = 'auto'
    canvas.className = 'mx-auto shadow-sm'
    container.appendChild(canvas)

    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const task = page.render({ canvas, canvasContext: ctx, viewport })
    renderTasks.current.set(num, task)

    try {
      await task.promise
    } catch {
      // Render was cancelled
    } finally {
      renderTasks.current.delete(num)
    }
  }, [pdf, userZoom, fitScale])

  // Re-render all pages when zoom or container width changes
  useEffect(() => {
    if (!pdf) return
    const renderAll = async () => {
      const base = await fitScale()
      for (let i = 1; i <= pdf.numPages; i++) {
        await renderPage(i, base * userZoom)
      }
    }
    renderAll()
  }, [pdf, userZoom, containerWidth, renderPage, fitScale])

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

  const zoomIn = () => setUserZoom((z) => Math.min(3, z + 0.1))
  const zoomOut = () => setUserZoom((z) => Math.max(0.5, z - 0.1))
  const resetZoom = () => setUserZoom(1)

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-3 py-2 px-4 bg-surface-card border-b border-border shrink-0">
        <button onClick={zoomOut} className="p-1.5 hover:text-primary transition-colors text-text-secondary" title="缩小">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm text-text-secondary min-w-[48px] text-center tabular-nums">{Math.round(userZoom * 100)}%</span>
        <button onClick={zoomIn} className="p-1.5 hover:text-primary transition-colors text-text-secondary" title="放大">
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={resetZoom}
          className="p-1.5 hover:text-primary transition-colors text-text-secondary"
          title="适应宽度"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <div className="w-px h-4 bg-border mx-1" />
        <span className="text-sm text-text-secondary tabular-nums">
          {currentPage} / {totalPages}
        </span>
      </div>

      {/* Scrollable page container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[#525659]"
      >
        <div className="flex flex-col items-center py-4 gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
            <div
              key={num}
              data-page={num}
              ref={(el) => { if (el) pageRefs.current.set(num, el) }}
              className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] px-2"
              style={{ minHeight: '400px', maxWidth: '100%' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
