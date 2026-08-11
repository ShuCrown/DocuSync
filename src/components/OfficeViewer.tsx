import { useEffect, useRef, useState, useCallback } from 'react'
import { renderAsync } from 'docx-preview'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import DOMPurify from 'dompurify'
import { Loader2 } from 'lucide-react'
import { ImagePreviewModal } from './ImagePreviewModal'

interface OfficeViewerProps {
  file: File
  category: 'word' | 'excel' | 'powerpoint'
  cacheKey?: string
  onTextExtracted?: (text: string) => void
}

/** Cache for extracted text (used by AI summary) */
const textCache = new Map<string, string>()

function normalizeDocxImageSvgs(container: HTMLElement, onImageClick?: (src: string) => void) {
  container.querySelectorAll<SVGSVGElement>('svg').forEach(svg => {
    const containsImage = Boolean(svg.querySelector('image'))

    if (containsImage) {
      svg.classList.add('docx-render-image-svg')
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      svg.style.cursor = 'pointer'

      // Add click handler for image preview
      if (onImageClick && !svg.dataset.previewBound) {
        svg.dataset.previewBound = 'true'
        svg.addEventListener('click', (e) => {
          e.stopPropagation()
          const imageEl = svg.querySelector('image')
          const src = imageEl?.getAttribute('href')
            || imageEl?.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
          if (src) onImageClick(src)
        })
      }
    }

    if (!svg.getAttribute('viewBox')) {
      const width = Number.parseFloat(svg.getAttribute('width') ?? '')
      const height = Number.parseFloat(svg.getAttribute('height') ?? '')

      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      }
    }
  })
}

/**
 * Force the engine to recompute layout & scrollable overflow AFTER docx-preview
 * finished inserting its DOM. docx-preview renders asynchronously (batches of
 * nodes across rAFs), and WKWebView (the packaged macOS app) caches the
 * composited scroll range of the outer scroller while that happens — with a
 * nested overflow container it can end up with a stale (single-page) scroll
 * range, so multi-page documents can't be scrolled. Chrome recomputes on its
 * own, which is why local dev looks fine. Reading layout properties and briefly
 * toggling the scroller's overflow forces WebKit to drop the stale range.
 */
function forceScrollReflow(container: HTMLElement) {
  const scroller = container.closest<HTMLElement>('.office-doc')
  // Reading these sizes synchronously forces a layout/reflow pass.
  void container.scrollHeight
  if (!scroller) return
  void scroller.scrollHeight
  if (scroller.scrollHeight > scroller.clientHeight) {
    const prev = scroller.style.overflow
    scroller.style.overflow = 'hidden'
    void scroller.offsetHeight
    scroller.style.overflow = prev
  }
}

export function OfficeViewer({ file, category, cacheKey, onTextExtracted }: OfficeViewerProps) {
  const [tableData, setTableData] = useState<string[][][]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [sheetMerges, setSheetMerges] = useState<{ s: { r: number; c: number }; e: { r: number; c: number } }[][]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [pptHtml, setPptHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)

  const handleImageClick = useCallback((src: string) => setPreviewSrc(src), [])
  const handleClosePreview = useCallback(() => setPreviewSrc(null), [])

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  // Word: render with docx-preview, extract text with mammoth
  useEffect(() => {
    if (category !== 'word') return
    const el = containerRef.current
    if (!el) return

    let cancelled = false
    const documentKey = cacheKey ?? `${category}:${file.name}:${file.size}:${file.lastModified}`

    const process = async () => {
      setLoading(true)
      setError(null)
      try {
        const buffer = await file.arrayBuffer()
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

        // Wrap renderAsync with a 30s timeout to prevent infinite hang
        const renderPromise = renderAsync(blob, el, undefined, {
          breakPages: false,
          ignoreWidth: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        })
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('文档渲染超时')), 30000)
        )
        await Promise.race([renderPromise, timeoutPromise])

        // docx-preview measures VML drawings in requestAnimationFrame and writes
        // fixed SVG width/height attributes. Normalize after that pass so CSS can
        // scale document images with the preview pane. Also force a scroll-range
        // refresh for the outer scroller (WKWebView keeps a stale composited
        // range while the DOM is inserted asynchronously — see forceScrollReflow).
        requestAnimationFrame(() => {
          normalizeDocxImageSvgs(el, handleImageClick)
          requestAnimationFrame(() => {
            normalizeDocxImageSvgs(el, handleImageClick)
            forceScrollReflow(el)
            requestAnimationFrame(() => forceScrollReflow(el))
          })
        })

        // Extract text for AI summary (reuse cached if available)
        let extractedText = textCache.get(documentKey)
        if (extractedText === undefined) {
          const textResult = await mammoth.extractRawText({ arrayBuffer: buffer })
          extractedText = textResult.value
          textCache.set(documentKey, extractedText)
        }

        if (!cancelled) {
          latestOnTextExtractedRef.current?.(extractedText)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '文件解析失败')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
          // Loading overlay removal changes the scroller's box — refresh the
          // WebKit composited scroll range once more after the overlay unmounts.
          requestAnimationFrame(() => {
            if (el.isConnected) forceScrollReflow(el)
          })
        }
      }
    }
    process()
    return () => { cancelled = true }
  }, [file, category, cacheKey, handleImageClick])

  // Excel / PowerPoint
  useEffect(() => {
    if (category === 'word') return

    let cancelled = false
    const documentKey = cacheKey ?? `${category}:${file.name}:${file.size}:${file.lastModified}`

    const process = async () => {
      setLoading(true)
      setError(null)
      try {
        const buffer = await file.arrayBuffer()

        if (category === 'excel') {
          const workbook = XLSX.read(buffer, { type: 'array' })
          const names = workbook.SheetNames
          const sheets: string[][][] = []
          const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[][] = []
          const texts: string[] = []
          for (const name of names) {
            const sheet = workbook.Sheets[name]
            if (sheet) {
              const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
              sheets.push(data as string[][])
              // Preserve merge ranges for proper rowspan/colspan rendering
              merges.push((sheet['!merges'] as { s: { r: number; c: number }; e: { r: number; c: number } }[]) ?? [])
              texts.push(`[${name}]\n${XLSX.utils.sheet_to_csv(sheet)}`)
            }
          }
          const extractedText = texts.join('\n\n')
          if (!cancelled) {
            setSheetNames(names)
            setTableData(sheets)
            setSheetMerges(merges)
            setActiveSheet(0)
            textCache.set(documentKey, extractedText)
            latestOnTextExtractedRef.current?.(extractedText)
          }
        } else if (category === 'powerpoint') {
          const extractedText = 'PowerPoint 文件内容（需要服务端解析以获取完整文本）'
          if (!cancelled) {
            setPptHtml('<p class="text-text-secondary">PPT 预览暂以文本内容展示</p>')
            setSheetNames([])
            setTableData([])
            textCache.set(documentKey, extractedText)
            latestOnTextExtractedRef.current?.(extractedText)
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '文件解析失败')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    process()
    return () => { cancelled = true }
  }, [file, category, cacheKey])

  // Word: always keep container in DOM so ref is available for renderAsync
  if (category === 'word') {
    return (
      <>
        <div className="relative office-doc bg-surface-card overflow-y-auto h-full">
          <div ref={containerRef} className="docx-render-container py-4 px-10" />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center p-12 text-text-secondary bg-surface-card/80">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              正在解析文件...
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <div className="text-center text-error bg-error/5 rounded-lg border border-error/10 p-6">
                {error}
              </div>
            </div>
          )}
        </div>
        {previewSrc && <ImagePreviewModal src={previewSrc} onClose={handleClosePreview} />}
      </>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-text-secondary">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        正在解析文件...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center text-error bg-error/5 rounded-lg border border-error/10">
        {error}
      </div>
    )
  }

  if (category === 'powerpoint') {
    return (
      <div
        className="office-doc p-8 bg-surface-card overflow-y-auto overflow-x-hidden h-full"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(pptHtml, { ADD_ATTR: ['class', 'style'] }),
        }}
      />
    )
  }

  // Excel: render active sheet with merge-aware rowspan/colspan + bottom tab bar
  const activeData = tableData[activeSheet] ?? []
  const activeMerges = sheetMerges[activeSheet] ?? []

  // Build skip-set and merge-info for the active sheet
  const skipCell = new Set<string>()
  const mergeInfo = new Map<string, { rowSpan: number; colSpan: number }>()
  for (const m of activeMerges) {
    const rowSpan = m.e.r - m.s.r + 1
    const colSpan = m.e.c - m.s.c + 1
    mergeInfo.set(`${m.s.r},${m.s.c}`, { rowSpan, colSpan })
    for (let r = m.s.r; r <= m.e.r; r++) {
      for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) skipCell.add(`${r},${c}`)
      }
    }
  }

  return (
    <div className="flex flex-col h-full bg-surface-card">
      {/* Table area */}
      <div className="flex-1 overflow-auto p-4 pb-1">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <tbody>
              {activeData.map((row, rowIdx) => (
                <tr key={rowIdx} className={rowIdx === 0 ? 'bg-surface-alt font-medium' : ''}>
                  {row.map((cell, colIdx) => {
                    const key = `${rowIdx},${colIdx}`
                    if (skipCell.has(key)) return null
                    const mi = mergeInfo.get(key)
                    return (
                      <td
                        key={colIdx}
                        className="border border-border px-3 py-1.5 text-text whitespace-nowrap"
                        rowSpan={mi?.rowSpan}
                        colSpan={mi?.colSpan}
                      >
                        {cell ?? ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sheet tab bar — anchored at bottom, like native Excel */}
      <div className="shrink-0 border-t border-border bg-surface-alt/30 px-2 py-1 flex items-center gap-0.5 overflow-x-auto">
        {sheetNames.map((name, idx) => (
          <button
            key={name}
            onClick={() => setActiveSheet(idx)}
            className={`shrink-0 px-3 py-1 text-xs rounded-t-md border border-border/50 transition-colors ${
              idx === activeSheet
                ? 'bg-surface-card text-text font-medium border-b-surface-card -mb-px'
                : 'bg-transparent text-text-secondary hover:bg-surface-card/50 border-b-transparent'
            }`}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
