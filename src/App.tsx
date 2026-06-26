import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Loader2, X } from 'lucide-react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { DocumentViewer } from './components/DocumentViewer'
import { AccountPanel } from './components/AccountPanel'
import { SelectionToolbar } from './components/SelectionToolbar'
import { SplitPane } from './components/SplitPane'
import { PaneHeader } from './components/PaneHeader'
import { SimplePaneHeader } from './components/SimplePaneHeader'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useAccount } from './hooks/useAccount'
import { useSplitView } from './hooks/useSplitView'
import { useScrollPosition, findScrollable } from './hooks/useScrollPosition'
import { getFileCategory, isSupported } from './utils/fileType'
import * as api from './lib/api'
import type { FileRecord } from './hooks/useFileHistory'
import type { UploadedFile } from './hooks/useFileUpload'

export default function App() {
  const { uploadedFile, error: uploadError, uploading, downloading, downloadProgress, handleFile, restoreFromRecord, clearFile } = useFileUpload()
  const { history, addHistory, removeHistory, clearHistory } = useFileHistory()
  const account = useAccount()
  const {
    mode: splitMode, direction: splitDirection, activePane,
    paneA, paneB, splitRatio,
    enterSplit, enterSplitPicker, exitSplit,
    closePaneA, closePaneB, swapPanes,
    setActivePane, toggleDirection, setSplitRatio, setPaneA, replacePaneB,
  } = useSplitView()
  const paneBRef = useRef(paneB)
  const [accountOpen, setAccountOpen] = useState(false)
  const splitButtonRef = useRef<HTMLElement | null>(null)
  const singleScrollRef = useRef<HTMLDivElement | null>(null)
  const initialPaneAPos = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    paneBRef.current = paneB
  }, [paneB])

  // Capture single-viewer scroll position before entering split mode.
  const captureSingleScroll = useCallback(() => {
    const wrapper = singleScrollRef.current
    if (!wrapper) return
    const el = findScrollable(wrapper) ?? wrapper
    const maxY = el.scrollHeight - el.clientHeight
    const maxX = el.scrollWidth - el.clientWidth
    initialPaneAPos.current = {
      x: maxX > 0 ? el.scrollLeft / maxX : 0,
      y: maxY > 0 ? el.scrollTop / maxY : 0,
    }
  }, [])

  // Check account status on mount
  useEffect(() => {
    account.checkStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Get the active file based on which pane is active
  const activeFile = activePane === 'b' && paneB ? paneB : paneA

  // Stable pane callbacks using refs to avoid stale closures while keeping references stable
  const handlePaneAClose = useCallback(() => {
    if (paneBRef.current) {
      setPaneA(paneBRef.current)
    }
    closePaneA()
  }, [closePaneA, setPaneA])

  const handlePaneBClose = useCallback(() => {
    closePaneB()
  }, [closePaneB])

  const handleReplacePaneB = useCallback(() => {
    enterSplitPicker()
  }, [enterSplitPicker])

  const handlePaneFocus = useCallback((pane: 'a' | 'b') => {
    setActivePane(pane)
  }, [setActivePane])

  // Sync uploadedFile to paneA
  useEffect(() => {
    if (uploadedFile && !paneA) {
      setPaneA(uploadedFile)
    }
  }, [uploadedFile]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileWithHistory = useCallback(async (file: File) => {
    await handleFile(file)
    addHistory(file, 'unknown')
  }, [handleFile, addHistory])

  const handleClear = useCallback(() => {
    if (splitMode === 'split') {
      exitSplit()
    }
    clearFile()
    setPaneA(null)
  }, [clearFile, splitMode, exitSplit, setPaneA])

  const handleHistorySelect = useCallback(async (record: FileRecord) => {
    await restoreFromRecord(record)
  }, [restoreFromRecord])

  const handleAccountOpen = useCallback(() => {
    setAccountOpen(true)
  }, [])

  const handleAccountClose = useCallback(() => {
    setAccountOpen(false)
  }, [])

  // Split view handlers
  const handleSplitToggle = useCallback(() => {
    if (splitMode === 'split') {
      exitSplit()
    } else {
      captureSingleScroll()
      if (!paneA && uploadedFile) {
        setPaneA(uploadedFile)
      }
      enterSplitPicker()
    }
  }, [splitMode, exitSplit, enterSplitPicker, captureSingleScroll, paneA, uploadedFile, setPaneA])

  const handlePickerUpload = useCallback(async (file: File) => {
    if (!isSupported(file)) return

    const category = getFileCategory(file)
    const url = URL.createObjectURL(file)
    try {
      const result = await api.uploadDocument(file)
      const uploadedB: UploadedFile = { file, category, url, docId: result.id }
      captureSingleScroll()
      if (!paneA && uploadedFile) {
        setPaneA(uploadedFile)
      }
      enterSplit(uploadedB)
      addHistory(file, 'unknown')
    } catch {
      URL.revokeObjectURL(url)
    }
  }, [paneA, uploadedFile, setPaneA, enterSplit, addHistory, captureSingleScroll])

  const isSplit = splitMode === 'split' && paneA

  // Scroll position tracking — key by document identity so position follows the document on swap.
  const paneAScrollRef = useScrollPosition(
    paneA ? (paneA.docId ?? paneA.file.name) : null,
    initialPaneAPos.current, // eslint-disable-line react-hooks/refs -- stable ref, read once per mount
  )
  const paneBScrollRef = useScrollPosition(
    paneB ? (paneB.docId ?? paneB.file.name) : null,
  )
  const singleFile = paneA ?? uploadedFile
  const singleScrollPositionRef = useScrollPosition(
    singleFile ? (singleFile.docId ?? singleFile.file.name) : null,
  )
  const handleSingleScrollRef = useCallback((el: HTMLDivElement | null) => {
    singleScrollRef.current = el
    singleScrollPositionRef(el)
  }, [singleScrollPositionRef])

  // Memoize pane elements to prevent unmount/remount on layout direction change.
  // Only depend on pane data and stable callbacks, NOT on direction/splitRatio.
  const paneAElement = useMemo(() => (
    <div className="h-full flex flex-col">
      <PaneHeader
        file={paneA!}
        pane="a"
        isActive={activePane === 'a'}
        onClose={handlePaneAClose}
        onFocus={handlePaneFocus}
      />
      <div ref={paneAScrollRef} className="flex-1 overflow-auto">
        <DocumentViewer
          uploaded={paneA!}
          onTextExtracted={() => {}}
        />
      </div>
    </div>
  ), [paneA, activePane, handlePaneAClose, handlePaneFocus, paneAScrollRef])

  const paneBElement = useMemo(() => (
    <div className="h-full flex flex-col">
      <PaneHeader
        file={paneB!}
        pane="b"
        isActive={activePane === 'b'}
        onClose={handlePaneBClose}
        onReplace={handleReplacePaneB}
        onFocus={handlePaneFocus}
      />
      <div ref={paneBScrollRef} className="flex-1 overflow-auto">
        <DocumentViewer
          uploaded={paneB!}
          onTextExtracted={() => {}}
        />
      </div>
    </div>
  ), [paneB, activePane, handlePaneBClose, handleReplacePaneB, handlePaneFocus, paneBScrollRef])

  // Picker view for pane B when no file is selected (same layout as home page)
  const handlePickerFile = useCallback(async (file: File) => {
    if (!isSupported(file)) return
    await handlePickerUpload(file)
  }, [handlePickerUpload])

  const handlePickerHistorySelect = useCallback(async (record: FileRecord) => {
    try {
      const blob = await api.downloadDocument(record.id)
      if (blob.size === 0) return
      const file = new File([blob], record.name, { type: blob.type })
      const url = URL.createObjectURL(file)
      replacePaneB({ file, category: record.category, url, docId: record.id })
      addHistory(file, 'unknown')
    } catch {
      // silently fail, user can retry
    }
  }, [replacePaneB, addHistory])

  const paneBPickerElement = useMemo(() => (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-alt/40 shrink-0">
        <span className="text-xs font-medium text-text-secondary">选择对比文档</span>
        <button
          onClick={handlePaneBClose}
          className="p-1 rounded-md text-text-secondary hover:text-text hover:bg-surface-alt transition-colors"
          title="关闭分屏"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-auto flex items-start justify-center px-4 sm:px-6 py-8">
        <div className="w-full max-w-2xl">
          <FileUpload
            onFile={handlePickerFile}
            currentFile={null}
            uploading={false}
            error={null}
          />
          <FileHistory
            history={history}
            onSelect={handlePickerHistorySelect}
            onRemove={removeHistory}
            onClear={clearHistory}
          />
        </div>
      </div>
    </div>
  ), [handlePickerFile, history, handlePickerHistorySelect, removeHistory, clearHistory, handlePaneBClose])

  return (
    <Layout
      currentFileName={paneA?.file.name ?? uploadedFile?.file.name ?? null}
      onBack={handleClear}
      history={history}
      onHistorySelect={handleHistorySelect}
      onHistoryRemove={removeHistory}
      onHistoryClear={clearHistory}
      email={account.email}
      onAccountOpen={handleAccountOpen}
      splitMode={splitMode}
      onSplitToggle={handleSplitToggle}
      splitButtonRef={splitButtonRef}
    >
      {!paneA && !uploadedFile ? (
        <div className="flex-1 flex items-start justify-center px-4 sm:px-6 py-12">
          <div className="w-full max-w-2xl">
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
        </div>
      ) : isSplit ? (
        <SplitPane
          direction={splitDirection}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
          onSwap={swapPanes}
          onDirectionChange={toggleDirection}
          paneA={paneAElement}
          paneB={paneB ? paneBElement : paneBPickerElement}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <SimplePaneHeader
            fileName={singleFile!.file.name}
            onClose={handleClear}
          />
          <div ref={handleSingleScrollRef} className="flex-1 overflow-auto">
            <DocumentViewer
              uploaded={singleFile!}
              onTextExtracted={() => {}}
            />
          </div>
        </div>
      )}

      {/* Download loading overlay */}
      {downloading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="bg-surface-card rounded-xl p-6 shadow-xl flex flex-col items-center gap-3 min-w-[240px]">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="text-sm text-text font-medium">加载中</div>
            {downloadProgress !== null && (
              <div className="w-full">
                <div className="h-1.5 bg-surface-alt rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
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

      {/* Selection toolbar for AI Q&A */}
      {activeFile && <SelectionToolbar />}
    </Layout>
  )
}
