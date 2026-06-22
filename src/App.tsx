import { useState, useCallback, useEffect } from 'react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { DocumentViewer } from './components/DocumentViewer'
import { SummaryPanel } from './components/SummaryPanel'
import { AccountPanel } from './components/AccountPanel'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useSummary } from './hooks/useSummary'
import { useAccount } from './hooks/useAccount'
import type { FileRecord } from './hooks/useFileHistory'

export default function App() {
  const { uploadedFile, error: uploadError, uploading, handleFile, restoreFromRecord, clearFile } = useFileUpload()
  const { summary, loading: summaryLoading, error: summaryError, summarize, loadCached, clear: clearSummary } = useSummary()
  const { history, addHistory, removeHistory, clearHistory } = useFileHistory()
  const account = useAccount()
  const [extractedText, setExtractedText] = useState('')
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)

  // Check account status on mount
  useEffect(() => {
    account.checkStatus()
  }, [])

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
    await restoreFromRecord(record)
    clearSummary()
    setExtractedText('')
    setSummaryOpen(false)
    // Try loading cached summary
    await loadCached(record.id)
  }, [restoreFromRecord, clearSummary, loadCached])

  const handleAccountOpen = useCallback(() => {
    setAccountOpen(true)
  }, [])

  const handleAccountClose = useCallback(() => {
    setAccountOpen(false)
  }, [])

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
      email={account.email}
      onAccountOpen={handleAccountOpen}
    >
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

      <AccountPanel
        open={accountOpen}
        onClose={handleAccountClose}
        email={account.email}
        loading={account.loading}
        error={account.error}
        onBind={account.bindEmail}
        onVerify={account.verifyBind}
        onSendRecoverCode={account.sendRecoverCode}
        onRecover={account.recoverAccount}
        onUnbind={account.unbindEmail}
      />
    </Layout>
  )
}
