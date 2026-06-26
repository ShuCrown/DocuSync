import { useEffect, useRef, useState } from 'react'
import { renderAsync } from 'docx-preview'
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

/** Cache for extracted text (used by AI summary) */
const textCache = new Map<string, string>()

export function OfficeViewer({ file, category, cacheKey, onTextExtracted }: OfficeViewerProps) {
  const [tableData, setTableData] = useState<string[][][]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [pptHtml, setPptHtml] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestOnTextExtractedRef = useRef(onTextExtracted)

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
        if (!cancelled) setLoading(false)
      }
    }
    process()
    return () => { cancelled = true }
  }, [file, category, cacheKey])

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
            setSheetNames(names)
            setTableData(sheets)
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
