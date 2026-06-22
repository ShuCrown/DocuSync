import { useState, useCallback, useRef } from 'react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { DocumentViewer } from './components/DocumentViewer'
import { SummaryPanel } from './components/SummaryPanel'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useSummary } from './hooks/useSummary'
import type { FileRecord } from './hooks/useFileHistory'

export default function App() {
  const { uploadedFile, error: uploadError, uploading, handleFile, restoreFromRecord, clearFile } = useFileUpload()
  const { summary, loading: summaryLoading, error: summaryError, summarize, loadCached, clear: clearSummary } = useSummary()
  const { history, addHistory, removeHistory, clearHistory } = useFileHistory()
  const [extractedText, setExtractedText] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleTextExtracted = useCallback((text: string) => {
    setExtractedText(text)
  }, [])

  const handleSummarize = useCallback(() => {
    if (uploadedFile?.docId) {
      summarize(uploadedFile.docId, extractedText)
    }
  }, [summarize, uploadedFile, extractedText])

  const handleSummaryToggle = useCallback(() => {
    setSummaryOpen((v) => !v)
  }, [])

  const handleSummaryClose = useCallback(() => {
    setSummaryOpen(false)
  }, [])

  const handleFileWithHistory = useCallback(async (file: File) => {
    await handleFile(file)
    addHistory(file, 'unknown') // triggers refresh
    clearSummary()
    setExtractedText('')
    setSummaryOpen(false)
  }, [handleFile, addHistory, clearSummary])

  const handleClear = useCallback(() => {
    clearFile()
    clearSummary()
    setExtractedText('')
    setSummaryOpen(false)
  }, [clearFile, clearSummary])

  const handleHistorySelect = useCallback(async (record: FileRecord) => {
    // Restore from history: show doc info, try to load cached summary
    restoreFromRecord(record)
    clearSummary()
    setExtractedText('')
    setSummaryOpen(false)
    // Try loading cached summary
    await loadCached(record.id)
  }, [restoreFromRecord, clearSummary, loadCached])

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleFileWithHistory(file)
    }
    e.target.value = ''
  }, [handleFileWithHistory])

  return (
    <Layout
      currentFileName={uploadedFile?.file.name ?? null}
      onBack={handleClear}
      history={history}
      onHistorySelect={handleHistorySelect}
      onHistoryRemove={removeHistory}
      onHistoryClear={clearHistory}
      onSummaryToggle={uploadedFile ? handleSummaryToggle : undefined}
      summaryLoading={summaryLoading}
      hasSummary={!!summary}
    >
      {/* Hidden file input for re-upload */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileInputChange}
        accept=".pdf,.md,.markdown,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
      />

      {!uploadedFile ? (
        <div className="max-w-2xl mx-auto">
          <FileUpload
            onFile={handleFileWithHistory}
            currentFile={null}
            uploading={uploading}
            error={uploadError}
          />
          <FileHistory
            history={history}
            onSelect={handleHistorySelect}
            onRemove={removeHistory}
            onClear={clearHistory}
          />
        </div>
      ) : (
        <DocumentViewer
          uploaded={uploadedFile}
          onTextExtracted={handleTextExtracted}
        />
      )}

      {uploadedFile && (
        <SummaryPanel
          summary={summary}
          loading={summaryLoading}
          error={summaryError}
          onSummarize={handleSummarize}
          hasText={extractedText.length > 0 || !!uploadedFile?.docId}
          open={summaryOpen}
          onClose={handleSummaryClose}
        />
      )}
    </Layout>
  )
}
