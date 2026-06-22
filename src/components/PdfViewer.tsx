import { useEffect, useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [scale, setScale] = useState(1.5)
  const [rendering, setRendering] = useState(false)

  // Load PDF
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const loadingTask = pdfjsLib.getDocument({ url })
      const doc = await loadingTask.promise
      if (cancelled) return
      setPdf(doc)
      setTotalPages(doc.numPages)
      setPageNum(1)
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

  // Render current page
  useEffect(() => {
    if (!pdf || !canvasRef.current) return
    let cancelled = false
    const render = async () => {
      setRendering(true)
      const page = await pdf.getPage(pageNum)
      const viewport = page.getViewport({ scale })
      const canvas = canvasRef.current!
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({
        canvas,
        canvasContext: ctx,
        viewport,
      }).promise
      if (!cancelled) setRendering(false)
    }
    render()
    return () => { cancelled = true }
  }, [pdf, pageNum, scale])

  const prev = () => setPageNum((p) => Math.max(1, p - 1))
  const next = () => setPageNum((p) => Math.min(totalPages, p + 1))
  const zoomIn = () => setScale((s) => Math.min(3, s + 0.25))
  const zoomOut = () => setScale((s) => Math.max(0.5, s - 0.25))

  return (
    <div className="flex flex-col items-center">
      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-4 p-2 bg-surface-card rounded-lg border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
        <button onClick={prev} disabled={pageNum <= 1} className="p-1 disabled:opacity-30 hover:text-primary transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <span className="text-sm text-text-secondary min-w-[80px] text-center tabular-nums">
          {pageNum} / {totalPages}
        </span>
        <button onClick={next} disabled={pageNum >= totalPages} className="p-1 disabled:opacity-30 hover:text-primary transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
        <div className="w-px h-5 bg-border mx-1" />
        <button onClick={zoomOut} className="p-1 hover:text-primary transition-colors">
          <ZoomOut className="w-5 h-5" />
        </button>
        <span className="text-sm text-text-secondary min-w-[48px] text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <button onClick={zoomIn} className="p-1 hover:text-primary transition-colors">
          <ZoomIn className="w-5 h-5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative overflow-auto max-h-[70vh] border border-border rounded-lg bg-white shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        {rendering && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 z-10">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} />
      </div>
    </div>
  )
}
