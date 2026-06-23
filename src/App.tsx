import { useState, useCallback, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
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
  const { uploadedFile, error: uploadError, uploading, downloading, downloadProgress, handleFile, restoreFromRecord, clearFile } = useFileUpload()
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

      {/* Download loading overlay */}
      {downloading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-surface-card rounded-xl p-6 shadow-xl flex flex-col items-center gap-3 min-w-[240px]">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="text-sm text-text font-medium">正在下载文件...</div>
            {downloadProgress !== null && (
              <div className="w-full">
                <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <div className="text-xs text-text-secondary text-center mt-1">
                  {downloadProgress}%
                </div>
              </div>
            )}
          </div>
        </div>
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
