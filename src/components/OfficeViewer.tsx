import { useEffect, useState } from 'react'
import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import DOMPurify from 'dompurify'
import { Loader2 } from 'lucide-react'

interface OfficeViewerProps {
  file: File
  category: 'word' | 'excel' | 'powerpoint'
  onTextExtracted?: (text: string) => void
}

export function OfficeViewer({ file, category, onTextExtracted }: OfficeViewerProps) {
  const [html, setHtml] = useState<string>('')
  const [tableData, setTableData] = useState<string[][][]>([])
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const process = async () => {
      setLoading(true)
      setError(null)
      try {
        const buffer = await file.arrayBuffer()

        if (category === 'word') {
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer })
          if (!cancelled) {
            setHtml(result.value)
            // Extract text for summary
            const textResult = await mammoth.extractRawText({ arrayBuffer: buffer })
            onTextExtracted?.(textResult.value)
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
          if (!cancelled) {
            setSheetNames(names)
            setTableData(sheets)
            onTextExtracted?.(texts.join('\n\n'))
          }
        } else if (category === 'powerpoint') {
          // PPT: extract basic text content
          // For simplicity, show a placeholder with extracted text
          if (!cancelled) {
            setHtml('<p class="text-text-secondary">PPT 预览暂以文本内容展示</p>')
            onTextExtracted?.('PowerPoint 文件内容（需要服务端解析以获取完整文本）')
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
  }, [file, category, onTextExtracted])

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
        className="p-6 bg-surface-card overflow-auto h-full prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
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
