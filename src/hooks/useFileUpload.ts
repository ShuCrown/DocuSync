import { useState, useCallback } from 'react'
import { getFileCategory, isSupported, type FileCategory } from '../utils/fileType'
import * as api from '../lib/api'

export interface UploadedFile {
  file: File
  category: FileCategory
  url: string // object URL for preview
  docId: string // server document ID
}

export function useFileUpload() {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const handleFile = useCallback(async (file: File, extractedText?: string) => {
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

    try {
      setUploading(true)
      const result = await api.uploadDocument(file, extractedText)
      setUploadedFile({ file, category, url, docId: result.id })
    } catch (err) {
      URL.revokeObjectURL(url)
      setError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setUploading(false)
    }
  }, [])

  const restoreFromRecord = useCallback(async (record: { id: string; name: string; category: FileCategory }) => {
    setError(null)
    setUploading(true)
    try {
      const blob = await api.downloadDocument(record.id)
      const file = new File([blob], record.name, { type: blob.type })
      const url = URL.createObjectURL(file)
      setUploadedFile({ file, category: record.category, url, docId: record.id })
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载历史文件失败')
    } finally {
      setUploading(false)
    }
  }, [])

  const clearFile = useCallback(() => {
    if (uploadedFile?.url) {
      URL.revokeObjectURL(uploadedFile.url)
    }
    setUploadedFile(null)
    setError(null)
  }, [uploadedFile])

  return { uploadedFile, error, uploading, handleFile, restoreFromRecord, clearFile }
}
