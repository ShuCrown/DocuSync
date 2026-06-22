import { useState, useCallback } from 'react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { DocumentViewer } from './components/DocumentViewer'
import { SummaryPanel } from './components/SummaryPanel'
import { useFileUpload } from './hooks/useFileUpload'
import { useSummary } from './hooks/useSummary'

export default function App() {
  const { uploadedFile, error: uploadError, handleFile, clearFile } = useFileUpload()
  const { summary, loading: summaryLoading, error: summaryError, summarize, clear: clearSummary } = useSummary()
  const [extractedText, setExtractedText] = useState('')

  const handleTextExtracted = useCallback((text: string) => {
    setExtractedText(text)
  }, [])

  const handleSummarize = useCallback(() => {
    summarize(extractedText)
  }, [summarize, extractedText])

  const handleClear = useCallback(() => {
    clearFile()
    clearSummary()
    setExtractedText('')
  }, [clearFile, clearSummary])

  return (
    <Layout>
      <div className="space-y-6">
        {/* Upload area */}
        <FileUpload
          onFile={handleFile}
          currentFile={uploadedFile}
          onClear={handleClear}
          error={uploadError}
        />

        {/* Content area */}
        {uploadedFile && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Document viewer - takes 2/3 width on large screens */}
            <div className="lg:col-span-2">
              <DocumentViewer
                uploaded={uploadedFile}
                onTextExtracted={handleTextExtracted}
              />
            </div>

            {/* Summary panel - takes 1/3 width on large screens */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-6">
                <SummaryPanel
                  summary={summary}
                  loading={summaryLoading}
                  error={summaryError}
                  onSummarize={handleSummarize}
                  hasText={extractedText.length > 0}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
