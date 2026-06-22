export type FileCategory = 'pdf' | 'markdown' | 'word' | 'excel' | 'powerpoint' | 'unknown'

const EXTENSION_MAP: Record<string, FileCategory> = {
  '.pdf': 'pdf',
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.doc': 'word',
  '.docx': 'word',
  '.xls': 'excel',
  '.xlsx': 'excel',
  '.ppt': 'powerpoint',
  '.pptx': 'powerpoint',
}

export function getFileCategory(file: File): FileCategory {
  const name = file.name.toLowerCase()
  const dotIndex = name.lastIndexOf('.')
  if (dotIndex === -1) return 'unknown'
  const ext = name.slice(dotIndex)
  return EXTENSION_MAP[ext] ?? 'unknown'
}

export function isSupported(file: File): boolean {
  return getFileCategory(file) !== 'unknown'
}

export function getCategoryLabel(cat: FileCategory): string {
  const labels: Record<FileCategory, string> = {
    pdf: 'PDF 文档',
    markdown: 'Markdown 文档',
    word: 'Word 文档',
    excel: 'Excel 表格',
    powerpoint: 'PPT 演示文稿',
    unknown: '不支持的格式',
  }
  return labels[cat]
}
