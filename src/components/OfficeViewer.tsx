import { useEffect, useRef, useState } from 'react'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import DOMPurify from 'dompurify'
import { Loader2 } from 'lucide-react'

interface OfficeViewerProps {
  file: File
  category: 'word' | 'excel' | 'powerpoint'
  cacheKey?: string
  onTextExtracted?: (text: string) => void
}

interface OfficeCacheEntry {
  category: 'word' | 'excel' | 'powerpoint'
  html: string
  tableData: string[][][]
  sheetNames: string[]
  extractedText: string
}

const officeCache = new Map<string, OfficeCacheEntry>()

function inferTocLevel(text: string) {
  const normalized = text.replace(/\u00a0/g, ' ').trim()
  const match = normalized.match(/^(\d+(?:\.\d+)*)/)

  if (!match) return 1

  return Math.min(match[1].split('.').length, 6)
}

function enhanceWordHtml(rawHtml: string) {
  if (!rawHtml || typeof DOMParser === 'undefined') return rawHtml

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div data-office-root="true">${rawHtml}</div>`, 'text/html')
  const root = doc.body.firstElementChild

  if (!root) return rawHtml

  for (const paragraph of Array.from(root.querySelectorAll('p'))) {
    const text = paragraph.textContent?.replace(/\u00a0/g, ' ').trim() ?? ''
    const firstChild = paragraph.firstElementChild
    const href = firstChild?.getAttribute('href')
    const isInternalAnchorOnly = paragraph.childElementCount === 1 &&
      firstChild?.tagName === 'A' &&
      typeof href === 'string' &&
      href.startsWith('#')

    if (!text) continue

    if (text === '目录') {
      paragraph.classList.add('office-doc-toc-title')
      continue
    }

    if (paragraph.classList.contains('office-doc-toc') || isInternalAnchorOnly) {
      paragraph.classList.add('office-doc-toc')
      if (!Array.from(paragraph.classList).some((name) => name.startsWith('office-doc-toc-level-'))) {
        paragraph.classList.add(`office-doc-toc-level-${inferTocLevel(text)}`)
      }
      firstChild?.classList.add('office-doc-toc-link')
    }
  }

  return root.innerHTML
}

export function OfficeViewer({ file, category, cacheKey, onTextExtracted }: OfficeViewerProps) {
  const [html, setHtml] = useState<string>('')
  const [tableData, setTableData] = useState<string[][][]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)

  useEffect(() => {
    latestOnTextExtractedRef.current = onTextExtracted
  }, [onTextExtracted])

  useEffect(() => {
    let cancelled = false
    const documentKey = cacheKey ?? `${category}:${file.name}:${file.size}:${file.lastModified}`
    const cached = officeCache.get(documentKey)

    if (cached && cached.category === category) {
      setHtml(cached.html)
      setTableData(cached.tableData)
      setSheetNames(cached.sheetNames)
      setError(null)
      setLoading(false)
      latestOnTextExtractedRef.current?.(cached.extractedText)
      return () => { cancelled = true }
    }

    const process = async () => {
      setLoading(true)
      setError(null)
      try {
        const buffer = await file.arrayBuffer()

        if (category === 'word') {
          // Pre-defined font size styleMap entries (6pt - 72pt)
          const fontSizeStyleMap: string[] = []
          for (let pt = 6; pt <= 72; pt++) {
            fontSizeStyleMap.push("r[style-name='__fs_" + pt + "__'] => span[style='font-size: " + pt + "pt']")
          }

          const result = await mammoth.convertToHtml(
            { arrayBuffer: buffer },
            {
              ignoreEmptyParagraphs: false,
              styleMap: [
                "p[style-name='toc 1'] => p.office-doc-toc.office-doc-toc-level-1:fresh",
                "p[style-name='TOC 1'] => p.office-doc-toc.office-doc-toc-level-1:fresh",
                "p[style-name='toc 2'] => p.office-doc-toc.office-doc-toc-level-2:fresh",
                "p[style-name='TOC 2'] => p.office-doc-toc.office-doc-toc-level-2:fresh",
                "p[style-name='toc 3'] => p.office-doc-toc.office-doc-toc-level-3:fresh",
                "p[style-name='TOC 3'] => p.office-doc-toc.office-doc-toc-level-3:fresh",
                // Alignment: synthetic styles (injected by transformDocument)
                "p[style-name='__align_center__'] => p[style='text-align: center']:fresh",
                "p[style-name='__align_right__'] => p[style='text-align: right']:fresh",
                "p[style-name='__align_justify__'] => p[style='text-align: justify']:fresh",
                // Alignment: common named styles (English)
                "p[style-name='Center'] => p[style='text-align: center']:fresh",
                "p[style-name='center'] => p[style='text-align: center']:fresh",
                "p[style-name='Right'] => p[style='text-align: right']:fresh",
                "p[style-name='right'] => p[style='text-align: right']:fresh",
                "p[style-name='Justify'] => p[style='text-align: justify']:fresh",
                "p[style-name='justify'] => p[style='text-align: justify']:fresh",
                // Alignment: common named styles (Chinese)
                "p[style-name='居中'] => p[style='text-align: center']:fresh",
                "p[style-name='右对齐'] => p[style='text-align: right']:fresh",
                "p[style-name='两端对齐'] => p[style='text-align: justify']:fresh",
                // Font sizes (6pt - 72pt)
                ...fontSizeStyleMap,
              ],
              transformDocument: (mammoth as any).transforms._elements(function (element: any) {
                // Paragraph: inject alignment into styleName (skip headings to preserve h1-h6 mapping)
                if (element.type === 'paragraph') {
                  const isHeading = (element.styleId && /^Heading/i.test(element.styleId)) ||
                    (element.styleName && /^heading/i.test(element.styleName))
                  if (!isHeading && element.alignment && element.alignment !== 'left') {
                    return Object.assign({}, element, {
                      styleName: '__align_' + element.alignment + '__',
                    })
                  }
                }

                // Run: inject fontSize into styleName
                // mammoth already converts half-points to points (w:sz / 2)
                if (element.type === 'run' && element.fontSize && element.fontSize > 0) {
                  return Object.assign({}, element, {
                    styleName: '__fs_' + element.fontSize + '__',
                  })
                }

                return element
              }),
            }
          )
          const enhancedHtml = enhanceWordHtml(result.value)
          const textResult = await mammoth.extractRawText({ arrayBuffer: buffer })
          const extractedText = textResult.value
          if (!cancelled) {
            setHtml(enhancedHtml)
            setSheetNames([])
            setTableData([])
            const nextEntry: OfficeCacheEntry = {
              category,
              html: enhancedHtml,
              tableData: [],
              sheetNames: [],
              extractedText,
            }
            officeCache.set(documentKey, nextEntry)
            latestOnTextExtractedRef.current?.(extractedText)
          }
        } else if (category === 'excel') {
          const workbook = XLSX.read(buffer, { type: 'array' })
          const names = workbook.SheetNames
          const sheets: string[][][] = []
          const texts: string[] = []
          for (const name of names) {
            const sheet = workbook.Sheets[name]
            if (sheet) {
              const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
              sheets.push(data as string[][])
              texts.push(`[${name}]\n${XLSX.utils.sheet_to_csv(sheet)}`)
            }
          }
          const extractedText = texts.join('\n\n')
          if (!cancelled) {
            setHtml('')
            setSheetNames(names)
            setTableData(sheets)
            const nextEntry: OfficeCacheEntry = {
              category,
              html: '',
              tableData: sheets,
              sheetNames: names,
              extractedText,
            }
            officeCache.set(documentKey, nextEntry)
            latestOnTextExtractedRef.current?.(extractedText)
          }
        } else if (category === 'powerpoint') {
          // PPT: extract basic text content
          // For simplicity, show a placeholder with extracted text
          const extractedText = 'PowerPoint 文件内容（需要服务端解析以获取完整文本）'
          const htmlContent = '<p class="text-text-secondary">PPT 预览暂以文本内容展示</p>'
          if (!cancelled) {
            setHtml(htmlContent)
            setSheetNames([])
            setTableData([])
            const nextEntry: OfficeCacheEntry = {
              category,
              html: htmlContent,
              tableData: [],
              sheetNames: [],
              extractedText,
            }
            officeCache.set(documentKey, nextEntry)
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

  if (category === 'word' || category === 'powerpoint') {
    return (
      <div
        className="office-doc p-8 bg-surface-card overflow-y-auto overflow-x-hidden h-full"
        dangerouslySetInnerHTML={{
          __html: DOMPurify.sanitize(html, {
            ADD_ATTR: ['class', 'style'],
          }),
        }}
      />
    )
  }

  // Excel: render tables
  return (
    <div className="p-4 bg-surface-card overflow-auto h-full">
      {sheetNames.map((name, idx) => (
        <div key={name} className="mb-6 last:mb-0">
          <h3 className="text-sm font-medium text-text mb-2 px-2">{name}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {(tableData[idx] ?? []).map((row, rowIdx) => (
                  <tr key={rowIdx} className={rowIdx === 0 ? 'bg-surface-alt font-medium' : ''}>
                    {row.map((cell, colIdx) => (
                      <td key={colIdx} className="border border-border px-3 py-1.5 text-text whitespace-nowrap">
                        {cell ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
