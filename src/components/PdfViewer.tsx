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
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [currentPage, setCurrentPage] = useState(1)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderTasks = useRef<Map<number, pdfjsLib.RenderTask>>(new Map())

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
    if (!pdf || !onTextExtracted) return
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
        onTextExtracted(texts.join('\n\n'))
      }
    }
    extract()
    return () => { cancelled = true }
  }, [pdf, onTextExtracted])

  // Render a single page into its container
  const renderPage = useCallback(async (num: number) => {
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
    const viewport = page.getViewport({ scale })

    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    canvas.style.width = `${viewport.width}px`
    canvas.style.height = `${viewport.height}px`
    canvas.className = 'mx-auto'
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
    }
  }, [pdf, scale])

  // Re-render all pages when scale changes
  useEffect(() => {
    if (!pdf) return
    for (let i = 1; i <= pdf.numPages; i++) {
      renderPage(i)
    }
  }, [pdf, scale, renderPage])

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

  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25))
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25))

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-center gap-3 py-2 px-4 bg-surface-card border-b border-border shrink-0">
        <button onClick={zoomOut} className="p-1.5 hover:text-primary transition-colors text-text-secondary">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-sm text-text-secondary min-w-[48px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
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
        className="flex-1 overflow-auto bg-[#525659]"
      >
        <div className="flex flex-col items-center py-4 gap-2">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => (
            <div
              key={num}
              data-page={num}
              ref={(el) => { if (el) pageRefs.current.set(num, el) }}
              className="bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              style={{ minHeight: '400px' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
