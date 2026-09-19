import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { renderAsync } from 'docx-preview'
import * as XLSX from 'xlsx'
import JSZip from 'jszip'
import { Loader2 } from 'lucide-react'
import { ImagePreviewModal } from './ImagePreviewModal'
import { parseXlsxCellStyles, type XlsxCellStyle } from '../utils/xlsxStyles'

interface OfficeViewerProps {
  file: File
  category: 'word' | 'excel' | 'powerpoint'
  cacheKey?: string
  onTextExtracted?: (text: string) => void
}

/** Cache for extracted text (used by AI summary) */
const textCache = new Map<string, string>()

/** OLE2 compound file magic — legacy binary Office formats (.doc/.ppt) */
function isLegacyOfficeBinary(buffer: ArrayBuffer): boolean {
  const sig = new Uint8Array(buffer.slice(0, 4))
  return sig[0] === 0xd0 && sig[1] === 0xcf && sig[2] === 0x11 && sig[3] === 0xe0
}

const LEGACY_HINT = '暂不支持旧版二进制格式，请先用 Word/PowerPoint 另存为 .docx/.pptx 后再上传'

/** Sheets with more rows than this render through the virtualized window. */
const VIRTUALIZE_THRESHOLD = 150
/** Estimated unmeasured row height (content px); measured heights win. */
const ROW_HEIGHT_EST = 30
/** Extra rows rendered above/below the visible window. */
const OVERSCAN = 12

/** Per-sheet windowing state, keyed in a ref so scroll events never re-render
 *  through React more than once per frame. */
interface VirtState {
  /** measured content heights (excl. border) per absolute row index */
  heights: number[]
  /** rows currently mounted (absolute indices) */
  rowSet: Set<number>
  start: number
  end: number
}

/**
 * Extract per-slide text from a .pptx (OOXML) with JSZip: slides live at
 * ppt/slides/slide{N}.xml; each paragraph (<a:p>) joins its text runs (<a:t>).
 */
async function extractPptxSlides(buffer: ArrayBuffer): Promise<string[][]> {
  const zip = await JSZip.loadAsync(buffer)
  const slidePaths: { num: number; path: string }[] = []
  zip.forEach((path) => {
    const m = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path)
    if (m) slidePaths.push({ num: Number(m[1]), path })
  })
  slidePaths.sort((a, b) => a.num - b.num)

  const decodeXml = (s: string) => s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

  const slides: string[][] = []
  for (const { path } of slidePaths) {
    const xml = await zip.file(path)!.async('string')
    const paragraphs = xml
      .split('</a:p>')
      .map((p) => decodeXml([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('')))
      .filter((t) => t.length > 0)
    slides.push(paragraphs)
  }
  return slides
}

/**
 * Enable click-to-preview on every image docx-preview rendered:
 *   - `<svg><image>`  — VML pictures (`w:pict`, legacy Word format)
 *   - plain `<img>`   — DrawingML pictures (`w:drawing`/`a:blip`, the modern
 *     Word default, rendered by docx-preview's renderImage()).
 * Without the second pass, DrawingML images are not clickable, so "some docx
 * images preview, some don't" — depending on which markup the file was saved
 * with.
 */
function normalizeDocxImages(container: HTMLElement, onImageClick?: (src: string) => void) {
  // 1) VML pictures → svg containing <image>
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

    // Ensure a viewBox so the CSS `width: 100%` actually SCALES the picture
    // content instead of just stretching an empty frame. docx-preview writes
    // the svg's width/height ATTRIBUTES in a requestAnimationFrame after
    // render, so they may not exist when this pass runs — fall back to the
    // rendered box (the svg is laid out by now) to build a valid viewBox.
    if (!svg.getAttribute('viewBox')) {
      let width = Number.parseFloat(svg.getAttribute('width') ?? '')
      let height = Number.parseFloat(svg.getAttribute('height') ?? '')

      if (!(Number.isFinite(width) && width > 0) || !(Number.isFinite(height) && height > 0)) {
        const rect = svg.getBoundingClientRect()
        if (!Number.isFinite(width) || width <= 0) width = rect.width
        if (!Number.isFinite(height) || height <= 0) height = rect.height
      }

      if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      }
    }
  })

  // 2) DrawingML pictures → <img> (src is a blob URL resolved asynchronously
  // by docx-preview after render; by the time we run this pass it is set).
  if (onImageClick) {
    container.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.classList.add('docx-render-image-img')
      if (img.dataset.previewBound) return
      img.dataset.previewBound = 'true'
      img.style.cursor = 'pointer'
      img.addEventListener('click', (e) => {
        e.stopPropagation()
        const src = img.currentSrc || img.src
        if (src) onImageClick(src)
      })

      // docx-preview wraps each DrawingML picture in a <div style="display:
      // inline-block; width: <fixed>; height: <fixed>">. The fixed inline-block
      // box wins over the image's `width:100%` (percentages resolve against
      // that fixed box), so the picture never scales with the preview width —
      // AND the fixed height keeps the wrapper shorter than the scaled image,
      // letting the image overflow and cover the content below. Force the
      // wrapper to block + auto so the image reflows and takes up its own
      // (scaled) height in the document flow.
      const parent = img.parentElement
      if (parent && parent.tagName === 'DIV' && getComputedStyle(parent).display === 'inline-block') {
        parent.style.display = 'block'
        parent.style.width = '100%'
        parent.style.height = 'auto'
      }
    })
  }
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
  // The scroller is the outer .doc-zoom-scroller (the zoom layer's parent);
  // fall back to the old inner .office-doc scroller for safety.
  const scroller = container.closest<HTMLElement>('.doc-zoom-layer')?.parentElement
    ?? container.closest<HTMLElement>('.office-doc')
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
  const [sheetCols, setSheetCols] = useState<XLSX.ColInfo[][]>([])
  const [sheetStyles, setSheetStyles] = useState<Map<string, XlsxCellStyle>[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [pptSlides, setPptSlides] = useState<string[][]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  /** Word display mode: continuous flow vs. document page layout */
  const [paged, setPaged] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)

  const handleImageClick = useCallback((src: string) => setPreviewSrc(src), [])
  const handleClosePreview = useCallback(() => setPreviewSrc(null), [])

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  // Word: render with docx-preview, extract text from the rendered DOM
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
        if (isLegacyOfficeBinary(buffer)) {
          throw new Error(`.doc 旧版格式无法解析。${LEGACY_HINT}`)
        }
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        })

        // Re-render from scratch on mode toggle
        el.innerHTML = ''

        // Wrap renderAsync with a 30s timeout to prevent infinite hang
        const renderPromise = renderAsync(blob, el, undefined, {
          // Paged mode: keep the document's page size/margins (ignoreWidth off)
          breakPages: paged,
          ignoreWidth: !paged,
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
        // scale document images with the preview pane, and bind click-to-preview
        // on BOTH svg (VML) and img (DrawingML) images. Also force a scroll-range
        // refresh for the outer scroller (WKWebView keeps a stale composited
        // range while the DOM is inserted asynchronously — see forceScrollReflow).
        requestAnimationFrame(() => {
          normalizeDocxImages(el, handleImageClick)
          requestAnimationFrame(() => {
            normalizeDocxImages(el, handleImageClick)
            forceScrollReflow(el)
            requestAnimationFrame(() => forceScrollReflow(el))
          })
        })

        // Extract text for AI summary (reuse cached if available).
        // docx-preview has already rendered the full document DOM, so reuse
        // it instead of re-parsing the whole file with mammoth.
        let extractedText = textCache.get(documentKey)
        if (extractedText === undefined) {
          extractedText = el.innerText
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
  }, [file, category, cacheKey, handleImageClick, paged])

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
          const workbook = XLSX.read(buffer, { type: 'array', cellStyles: true })
          // SheetJS CE drops cell styling — recover bold/color/fill/alignment
          // from styles.xml (see utils/xlsxStyles).
          const cellStyles = await parseXlsxCellStyles(buffer)
          const names = workbook.SheetNames
          const sheets: string[][][] = []
          const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[][] = []
          const cols: XLSX.ColInfo[][] = []
          const texts: string[] = []
          for (const name of names) {
            const sheet = workbook.Sheets[name]
            if (sheet) {
              // raw:false → formatted display text (cell.w). The default raw
              // mode turns date-formatted cells into JS Date objects, which
              // React rejects as children (error #31) and unmounts the whole
              // tree on switching to that sheet.
              const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false })
              sheets.push(data as string[][])
              // Preserve merge ranges for proper rowspan/colspan rendering
              merges.push((sheet['!merges'] as { s: { r: number; c: number }; e: { r: number; c: number } }[]) ?? [])
              // Preserve column widths (wpx px / wch char units) for faithful layout
              cols.push(sheet['!cols'] ?? [])
              texts.push(`[${name}]\n${XLSX.utils.sheet_to_csv(sheet)}`)
            } else {
              // Sheet name without a backing worksheet object: keep the arrays
              // index-aligned with sheetNames so tab N maps to data N.
              sheets.push([])
              merges.push([])
              cols.push([])
              texts.push(`[${name}]\n`)
            }
          }
          const extractedText = texts.join('\n\n')
          if (!cancelled) {
            setSheetNames(names)
            setTableData(sheets)
            setSheetMerges(merges)
            setSheetCols(cols)
            setSheetStyles(cellStyles)
            setActiveSheet(0)
            textCache.set(documentKey, extractedText)
            latestOnTextExtractedRef.current?.(extractedText)
          }
        } else if (category === 'powerpoint') {
          if (isLegacyOfficeBinary(buffer)) {
            throw new Error(`.ppt 旧版格式无法解析。${LEGACY_HINT}`)
          }
          const slides = await extractPptxSlides(buffer)
          const extractedText = slides
            .map((paras, i) => `[幻灯片 ${i + 1}]\n${paras.join('\n')}`)
            .join('\n\n')
          if (!cancelled) {
            setPptSlides(slides)
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

  // Excel: give the sheet layout a REAL pixel height. The zoom layer sizes
  // itself with min-height only, which is NOT a definite height per spec:
  // Chromium stretches flex-1 descendants anyway (so web looks fine) but
  // WebKit (the Tauri app) follows the spec and collapses the whole
  // h-full/flex-1 chain — the tab bar ends up mid-flow and the outer zoom
  // scroller scrolls past it. Measuring pane-height / zoom makes the chain
  // definite in every engine and keeps min-h-full working on EMPTY sheets,
  // where the percentage would otherwise resolve to 0 (invisible canvas).
  const excelRef = useRef<HTMLDivElement>(null)
  const [paneHeight, setPaneHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    if (category !== 'excel') return
    const el = excelRef.current
    if (!el) return
    const layer = el.closest<HTMLElement>('.doc-zoom-layer')
    const scroller = layer?.parentElement
    if (!layer || !scroller) return
    const update = () => {
      const t = getComputedStyle(layer).transform
      const scale = t === 'none' ? 1 : new DOMMatrixReadOnly(t).a || 1
      setPaneHeight(scroller.clientHeight / scale)
    }
    update()
    const ro = new ResizeObserver(update)
    // The layer's width is 100%/zoom, so observing it also catches zoom changes.
    ro.observe(layer)
    ro.observe(scroller)
    return () => ro.disconnect()
  }, [category, loading])

  // --- Large-sheet row virtualization --------------------------------------
  // Only rows inside (or merged into) the scroll window are mounted; the rest
  // collapse into top/bottom spacer rows. Scroll/measure corrections flow
  // through a ref + rAF instead of per-event React state.
  const rowCount = category === 'excel' ? (tableData[activeSheet]?.length ?? 0) : 0
  const virtualize = rowCount > VIRTUALIZE_THRESHOLD
  const [window_, setWindow_] = useState({ start: 0, end: 0, topPad: 0, bottomPad: 0 })
  const virtRef = useRef<VirtState>({ heights: [], rowSet: new Set(), start: -1, end: -1 })
  const tableRef = useRef<HTMLTableElement>(null)
  const virtRaf = useRef(0)

  // Reset measurements when the sheet/file changes
  useEffect(() => {
    virtRef.current = { heights: [], rowSet: new Set(), start: -1, end: -1 }
  }, [tableData, activeSheet])

  const updateWindow = useCallback(() => {
    if (!virtualize) return
    const table = tableRef.current
    if (!table) return
    const scroller = table.closest<HTMLElement>('.overflow-auto')
    if (!scroller) return

    const st = virtRef.current
    const { heights } = st
    const hAt = (r: number) => heights[r] ?? ROW_HEIGHT_EST
    // Prefix-sum walk from 0 is O(rows) ≈ 50µs at 10k rows — cheaper than
    // maintaining a Fenwick tree for this size.
    const topAt = (r: number) => {
      let y = 0
      for (let i = 0; i < r; i++) y += hAt(i) + 1 // +1: each row's border-bottom
      return y
    }
    const scrollTop = scroller.scrollTop
    const viewBottom = scrollTop + scroller.clientHeight

    // Header offset: table border-top + thead row (measured live)
    const theadH = (table.tHead?.offsetHeight ?? 0) + 16
    let r = 0
    while (r < rowCount && topAt(r + 1) + theadH < scrollTop) r++
    const firstVisible = r
    while (r < rowCount && topAt(r) + theadH < viewBottom) r++
    const lastVisible = Math.min(rowCount - 1, r + 1)

    // Expand to cover merges whose anchor lies above the window
    const merges = sheetMerges[activeSheet] ?? []
    let start = Math.max(0, firstVisible - OVERSCAN)
    for (const m of merges) {
      if (m.e.r >= start && m.s.r < start) start = m.s.r
    }
    const end = Math.min(rowCount, lastVisible + OVERSCAN)

    // Fresh spacer heights for the candidate window (latest measurements)
    let topSpacer = 0
    for (let i = 0; i < start; i++) topSpacer += hAt(i) + 1
    let bottomSpacer = 0
    for (let i = end; i < rowCount; i++) bottomSpacer += hAt(i) + 1

    // Correction: if the mounted window's anchor drifted from its assumed
    // offset (estimates were wrong), nudge scrollTop so content stays put.
    const anchorRow = table.querySelector<HTMLElement>('tr[data-vr]')
    if (anchorRow && st.start > 0 && st.start === start) {
      const firstVr = Number(anchorRow.dataset.vr)
      if (firstVr === st.start) {
        const rowY = anchorRow.getBoundingClientRect().top
          - scroller.getBoundingClientRect().top
          + scroller.scrollTop
        const assumedY = theadH + topSpacer
        const delta = rowY - assumedY
        if (delta !== 0) scroller.scrollTop += delta
      }
    }

    if (
      start !== st.start || end !== st.end
      || topSpacer !== window_.topPad || bottomSpacer !== window_.bottomPad
    ) {
      st.start = start
      st.end = end
      st.rowSet = new Set()
      for (let i = start; i < end; i++) st.rowSet.add(i)
      setWindow_({ start, end, topPad: topSpacer, bottomPad: bottomSpacer })
    }
  }, [virtualize, rowCount, activeSheet, sheetMerges, window_.topPad, window_.bottomPad])

  const scheduleWindow = useCallback(() => {
    if (virtRaf.current) return
    virtRaf.current = requestAnimationFrame(() => {
      virtRaf.current = 0
      updateWindow()
    })
  }, [updateWindow])

  // Scroll listener + initial window (layout effect: compute before paint so
  // a freshly opened large sheet never flashes an empty window)
  useLayoutEffect(() => {
    if (!virtualize) return
    const table = tableRef.current
    const scroller = table?.closest<HTMLElement>('.overflow-auto')
    if (!scroller) return
    updateWindow()
    scroller.addEventListener('scroll', scheduleWindow, { passive: true })
    return () => scroller.removeEventListener('scroll', scheduleWindow)
  }, [virtualize, updateWindow, scheduleWindow, paneHeight])

  // Measure mounted row heights after each window render
  useEffect(() => {
    if (!virtualize) return
    const table = tableRef.current
    if (!table) return
    const st = virtRef.current
    let changed = false
    table.querySelectorAll<HTMLElement>('tr[data-vr]').forEach((tr) => {
      const r = Number(tr.dataset.vr)
      // offsetHeight includes the 1px border-bottom; store content height
      const h = tr.offsetHeight - 1
      if (h > 0 && st.heights[r] !== h) {
        st.heights[r] = h
        changed = true
      }
    })
    if (changed) scheduleWindow()
  })

  useEffect(() => () => { if (virtRaf.current) cancelAnimationFrame(virtRaf.current) }, [])

  // Word: always keep container in DOM so ref is available for renderAsync
  if (category === 'word') {
    return (
      <>
        <div className="relative office-doc bg-surface-card overflow-y-auto flex-1">
          {/* 连续/分页 toggle — sticky so it stays reachable while scrolling;
              negative bottom margin cancels its flow height */}
          <div className="sticky top-2 z-20 -mb-9 flex h-9 justify-end pr-3 pointer-events-none">
            <div className="pointer-events-auto flex items-center rounded-full border border-border bg-surface-card/95 p-0.5 text-xs shadow-sm">
              {(['连续', '分页'] as const).map((label) => {
                const active = (label === '分页') === paged
                return (
                  <button
                    key={label}
                    onClick={() => setPaged(label === '分页')}
                    className={`rounded-full px-3 py-1 transition-colors ${
                      active ? 'bg-primary text-white' : 'text-text-secondary hover:text-text'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <div ref={containerRef} className={`docx-render-container py-4 px-10 ${paged ? 'docx-paged' : ''}`} />
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
      <div className="office-doc p-8 bg-surface-card overflow-y-auto overflow-x-hidden flex-1">
        {pptSlides.length === 0 ? (
          <p className="text-center text-text-secondary">未提取到幻灯片文本内容</p>
        ) : (
          <div className="max-w-3xl mx-auto flex flex-col gap-4">
            {pptSlides.map((paras, i) => (
              <div key={i} className="border border-border rounded-lg p-6 shadow-sm bg-white">
                <div className="text-xs text-text-secondary mb-3">幻灯片 {i + 1}</div>
                {paras.map((p, j) => (
                  <p key={j} className="text-sm text-text mb-1.5 whitespace-pre-wrap">{p}</p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Excel: render active sheet with merge-aware rowspan/colspan + bottom tab bar
  const activeData = tableData[activeSheet] ?? []
  const activeMerges = sheetMerges[activeSheet] ?? []
  const activeCols = sheetCols[activeSheet] ?? []
  const activeStyles = sheetStyles[activeSheet]
  const colCount = Math.max(activeCols.length, ...activeData.map((r) => r.length), 0)

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

  // Virtualization spacer heights come from the window state (refreshed by
  // updateWindow with the latest measurements)
  const topPad = virtualize ? window_.topPad : 0
  const bottomPad = virtualize ? window_.bottomPad : 0

  return (
    <div
      ref={excelRef}
      className={`flex flex-col bg-surface-card ${paneHeight == null ? 'flex-1' : ''}`}
      style={paneHeight != null ? { height: `${paneHeight}px` } : undefined}
    >
      {/* Table area — the sheet canvas fills the whole pane, so a small sheet
          no longer sits squeezed at the top; the white sheet background covers
          the rest, with the data grid anchored top-left like native Excel.
          The visual inset around the grid is the TABLE's own transparent
          border, not wrapper padding: sticky cells can never stick above
          their containing block (the table), so wrapper/scroller padding
          would leave a see-through gutter where scrolled rows bleed past the
          stuck header. The transparent border scrolls away with the content,
          letting header/row-numbers pin flush to the pane edges. */}
      <div className="flex-1 overflow-auto">
        <div className="flex min-h-full w-fit min-w-full flex-col">
          <div className="w-full flex-1 bg-white shadow-[0_1px_4px_rgba(0,0,0,0.08)]">
          {/* border-separate + zero spacing instead of border-collapse:
              with collapse, sticky cells' backgrounds/borders are painted by
              the table grid and get left behind when the cell sticks (data
              bleeds through the header/row-number column). In separate mode
              each cell paints its own background, so sticky works. Single
              gridlines come from per-cell bottom/right borders. */}
          <table
            ref={tableRef}
            className="w-full border-[16px_16px_4px_16px] border-transparent text-sm border-separate border-spacing-0"
          >
            <colgroup>
              <col className="w-10" />
              {Array.from({ length: colCount }, (_, i) => {
                const col = activeCols[i]
                // wpx = pixels; wch = character units (~7.5px each + padding)
                const wpx = col?.wpx ?? (col?.wch != null ? Math.round(col.wch * 7.5 + 5) : undefined)
                return wpx ? <col key={i} style={{ width: `${wpx}px` }} /> : <col key={i} />
              })}
            </colgroup>
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-20 border-t border-l border-b border-r border-border bg-surface-alt" />
                {Array.from({ length: colCount }, (_, i) => (
                  <th
                    key={i}
                    className="sticky top-0 z-10 border-t border-b border-r border-border bg-surface-alt px-3 py-1 text-xs font-medium text-text-secondary"
                  >
                    {XLSX.utils.encode_col(i)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {virtualize && topPad > 0 && (
                <tr aria-hidden="true">
                  <td style={{ height: topPad, padding: 0, border: 0 }} />
                  {Array.from({ length: colCount }, (_, i) => (
                    <td key={i} style={{ padding: 0, border: 0 }} />
                  ))}
                </tr>
              )}
              {activeData.map((row, rowIdx) => {
                if (virtualize && (rowIdx < window_.start || rowIdx >= window_.end)) return null
                return (
                <tr key={rowIdx} data-vr={virtualize ? rowIdx : undefined}>
                  <td className="sticky left-0 z-10 border-l border-b border-r border-border bg-surface-alt px-2 py-1 text-center text-xs text-text-secondary">
                    {rowIdx + 1}
                  </td>
                  {Array.from({ length: colCount }, (_, colIdx) => {
                    const cell = row[colIdx]
                    const key = `${rowIdx},${colIdx}`
                    if (skipCell.has(key)) return null
                    const mi = mergeInfo.get(key)
                    const cst = activeStyles?.get(XLSX.utils.encode_cell({ r: rowIdx, c: colIdx }))
                    return (
                      <td
                        key={colIdx}
                        className={`border-b border-r border-border px-3 py-1.5 text-text whitespace-pre-wrap break-words max-w-[360px] ${
                          rowIdx === 0 ? 'bg-surface-alt font-medium' : ''
                        }`}
                        style={cst ? {
                          fontWeight: cst.bold ? 600 : undefined,
                          fontStyle: cst.italic ? 'italic' : undefined,
                          color: cst.color,
                          backgroundColor: cst.bg,
                          textAlign: cst.halign,
                        } : undefined}
                        rowSpan={mi?.rowSpan}
                        colSpan={mi?.colSpan}
                      >
                        {cell ?? ''}
                      </td>
                    )
                  })}
                </tr>
                )
              })}
              {virtualize && bottomPad > 0 && (
                <tr aria-hidden="true">
                  <td style={{ height: bottomPad, padding: 0, border: 0 }} />
                  {Array.from({ length: colCount }, (_, i) => (
                    <td key={i} style={{ padding: 0, border: 0 }} />
                  ))}
                </tr>
              )}
            </tbody>
          </table>
          </div>
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
