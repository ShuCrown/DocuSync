import * as mammoth from 'mammoth'
import * as XLSX from 'xlsx'

export async function extractTextFromFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    return await file.text()
  }

  if (name.endsWith('.docx')) {
    const arrayBuffer = await file.arrayBuffer()
    const result = await mammoth.extractRawText({ arrayBuffer })
    return result.value
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const texts: string[] = []
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (sheet) {
        const csv = XLSX.utils.sheet_to_csv(sheet)
        texts.push(`[${sheetName}]\n${csv}`)
      }
    }
    return texts.join('\n\n')
  }

  if (name.endsWith('.pdf')) {
    // PDF text extraction is handled client-side by pdf.js
    // For summary, we send the file to the server
    return ''
  }

  return ''
}

export async function uploadFile(file: File): Promise<{ key: string }> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status}`)
  }

  return res.json()
}
