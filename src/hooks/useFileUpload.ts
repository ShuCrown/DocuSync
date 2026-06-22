import { useState, useCallback } from 'react'
import { getFileCategory, isSupported, type FileCategory } from '../utils/fileType'

export interface UploadedFile {
  file: File
  category: FileCategory
  url: string // object URL for preview
}

export function useFileUpload() {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFile = useCallback((file: File) => {
    setError(null)

    if (!isSupported(file)) {
      setError('不支持的文件格式。支持: PDF, Markdown, Word, Excel, PPT')
      return
    }

    if (file.size > 50 * 1024 * 1024) {
      setError('文件大小不能超过 50MB')
      return
    }

    const category = getFileCategory(file)
    const url = URL.createObjectURL(file)
    setUploadedFile({ file, category, url })
  }, [])

  const clearFile = useCallback(() => {
    if (uploadedFile?.url) {
      URL.revokeObjectURL(uploadedFile.url)
    }
    setUploadedFile(null)
    setError(null)
  }, [uploadedFile])

  return { uploadedFile, error, handleFile, clearFile }
}
