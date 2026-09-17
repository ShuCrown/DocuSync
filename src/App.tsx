import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { listen } from '@tauri-apps/api/event'
import { Loader2 } from 'lucide-react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { AccountPanel } from './components/AccountPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SplitGroup, type SplitGroupActions } from './components/SplitGroup'
import { ZoomScroller } from './components/ZoomScroller'
import { DuplicateConfirm } from './components/DuplicateConfirm'
import { ShareDialog } from './components/ShareDialog'
import { UpdateBanner } from './components/UpdateBanner'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useAccount } from './hooks/useAccount'
import { useEditorLayout, getActiveFile, findParentSplit } from './hooks/useEditorLayout'
import { autoCheckForUpdate } from './hooks/useUpdater'
import { getFileCategory, isSupported } from './utils/fileType'
import { isTauri } from './utils/tauri'
import { getStorageMode } from './lib/storage-mode'
import { ZoomScaleContext } from './hooks/useZoom'
import * as api from './lib/api'
import type { FileRecord } from './hooks/useFileHistory'
import type { UploadedFile } from './hooks/useFileUpload'

// Document-area zoom (browser-like scale of the document region only),
// persisted across sessions.
const LS_DOC_ZOOM = 'docusync.layout.docZoom'
// Global UI zoom — scales the whole interface to fit the window. Controlled
// from the Settings panel. The document-area zoom stacks on top of it.
const LS_UI_ZOOM = 'docusync.layout.uiZoom'

export const DOC_ZOOM_MIN = 0.4
export const DOC_ZOOM_MAX = 1.6
export const DOC_ZOOM_STEP = 0.1

const UI_ZOOM_MIN = 0.4
const UI_ZOOM_MAX = 1.6

function readDocZoom(): number {
  try {
    const v = Number(localStorage.getItem(LS_DOC_ZOOM))
    if (!Number.isFinite(v) || v <= 0) return 1
    return Math.max(DOC_ZOOM_MIN, Math.min(DOC_ZOOM_MAX, v))
  } catch {
    return 1
  }
}

function clampDocZoom(z: number): number {
  return Math.round(Math.max(DOC_ZOOM_MIN, Math.min(DOC_ZOOM_MAX, z)) * 10) / 10
}

function readUiZoom(): number {
  try {
    const v = Number(localStorage.getItem(LS_UI_ZOOM))
    if (!Number.isFinite(v) || v <= 0) return 1
    return Math.max(UI_ZOOM_MIN, Math.min(UI_ZOOM_MAX, v))
  } catch {
    return 1
  }
}

function clampUiZoom(z: number): number {
  return Math.round(Math.max(UI_ZOOM_MIN, Math.min(UI_ZOOM_MAX, z)) * 10) / 10
}

export default function App() {
  const { uploadedFile, error: uploadError, uploading, downloading, downloadProgress, handleFile, restoreFromRecord } = useFileUpload()
  const { history, allDocuments, addHistory, removeHistory, clearHistory, deleteDocument, markOpened, refresh: refreshHistory } = useFileHistory()
  const account = useAccount()
  const {
    root, activeLeafId,
    openTab, closeTab, closeOtherTabs, setActiveTab, setActiveLeaf,
    splitLeaf, closeLeaf, swapChildren, toggleDirection, setRatio,
    closeAll,
  } = useEditorLayout()
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareDoc, setShareDoc] = useState<{ id: string; name: string } | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null)
  // Transient success/info banner (e.g. "同名文件已覆盖").
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const showNotice = useCallback((text: string) => {
    setNotice(text)
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3500)
  }, [])
  // Leaf currently running an upload/download via its TabBar + picker — drives
  // the spinner on the + button and disables picker interactions.
  const [busyLeafId, setBusyLeafId] = useState<string | null>(null)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const localMode = getStorageMode() === 'local'
  // Browser-like zoom of the DOCUMENT area only.
  const [docZoom, setDocZoom] = useState<number>(readDocZoom)
  // Global UI zoom — whole-interface scale, controlled from the Settings
  // panel. The document-area zoom stacks on top.
  const [uiZoom, setUiZoom] = useState<number>(readUiZoom)

  useEffect(() => {
    try { localStorage.setItem(LS_DOC_ZOOM, String(docZoom)) } catch { /* ignore */ }
  }, [docZoom])
  useEffect(() => {
    try { localStorage.setItem(LS_UI_ZOOM, String(uiZoom)) } catch { /* ignore */ }
  }, [uiZoom])

  // OS-level zoom shortcuts registered by Rust (global-shortcut plugin) — they
  // fire even while focus is inside an embedded webview. They drive the
  // DOCUMENT-area zoom. Tauri only.
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    listen<string>('ui-zoom-shortcut', (e) => {
      if (e.payload === 'in') setDocZoom((z) => clampDocZoom(z + DOC_ZOOM_STEP))
      else if (e.payload === 'out') setDocZoom((z) => clampDocZoom(z - DOC_ZOOM_STEP))
      else if (e.payload === 'reset') setDocZoom(1)
    }).then((fn) => { unlisten = fn })
    return () => { unlisten?.() }
  }, [])

  // Browser-like zoom shortcuts: Cmd/Ctrl +/-, Cmd/Ctrl + 0 resets — drive the
  // DOCUMENT-area zoom.
  // NOTE: in a real browser, Cmd/Ctrl+Plus/Minus/0 are RESERVED by the browser
  // itself (native page zoom) and are never delivered to the page, so these
  // keys only fire in the Tauri desktop build. In the browser use the header
  // zoom button or Ctrl/Cmd + mouse wheel (see below).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key === '=' || e.key === '+') {
        e.preventDefault()
        setDocZoom((z) => clampDocZoom(z + DOC_ZOOM_STEP))
      } else if (e.key === '-') {
        e.preventDefault()
        setDocZoom((z) => clampDocZoom(z - DOC_ZOOM_STEP))
      } else if (e.key === '0') {
        e.preventDefault()
        setDocZoom(1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Layout shortcuts (as advertised on the landing page):
  //   ⇧⌘X   swap the two sides of the active pane's split
  //   ⌥⌘D   toggle that split's direction (horizontal ↔ vertical)
  // (⌘D split and ⌘1-9 tab switching were dropped: browsers reserve those
  // accelerators — bookmark / own tab switching — so they'd never reliably
  // reach the web app; the toolbar buttons cover both actions.)
  // Uses e.code (not e.key): with ⌥ held, macOS reports special chars in e.key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return

      if (e.code === 'KeyD' && e.altKey) {
        // ⌥⌘D: flip the enclosing split's direction
        if (!root || !activeLeafId) return
        const split = findParentSplit(root, activeLeafId)
        if (split) {
          e.preventDefault()
          toggleDirection(split.id)
        }
      } else if (e.code === 'KeyX' && e.shiftKey) {
        // ⇧⌘X: swap the two sides of the active pane's split
        if (!root || !activeLeafId) return
        const split = findParentSplit(root, activeLeafId)
        if (split) {
          e.preventDefault()
          swapChildren(split.id)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [root, activeLeafId, swapChildren, toggleDirection])

  // Ctrl/Cmd + mouse wheel zooms the DOCUMENT area like a browser. Wheel events
  // are always delivered to the page (they are not reserved browser
  // accelerators), so this works in the browser AND in Tauri — including
  // trackpad pinch-to-zoom, which browsers report as ctrl+wheel events.
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      // One typical mouse-wheel notch (~100 delta) = one 10% step, matching
      // native browser zoom feel; fast/wide scrolls accumulate up to 3 steps.
      const steps = Math.max(1, Math.min(3, Math.abs(Math.round(e.deltaY / 100))))
      setDocZoom((z) => clampDocZoom(z + (e.deltaY < 0 ? DOC_ZOOM_STEP * steps : -DOC_ZOOM_STEP * steps)))
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Check account status on mount
  useEffect(() => {
    account.checkStatus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check for app updates on startup (Tauri only; no-op in the browser).
  // Skipped in local development (`import.meta.env.DEV` is true for both
  // `vite dev` and `tauri dev`) so dev runs never hit the updater manifest;
  // the packaged app is a production build (DEV=false) and checks normally.
  useEffect(() => {
    if (isTauri() && !import.meta.env.DEV) autoCheckForUpdate()
  }, [])

  // Bridge useFileUpload's `uploadedFile` (set by home-page upload or history
  // restore) into the editor tree. The ref guard prevents double-opening when
  // `openTab`'s identity changes (it depends on activeLeafId).
  const lastOpenedRef = useRef<UploadedFile | null>(null)
  useEffect(() => {
    if (uploadedFile && uploadedFile !== lastOpenedRef.current) {
      lastOpenedRef.current = uploadedFile
      openTab(uploadedFile)
      if (uploadedFile.docId) markOpened(uploadedFile.docId)
    }
  }, [uploadedFile, openTab, markOpened])

  // Ref mirror of openTab so the TabBar picker callbacks stay stable (don't
  // re-create when activeLeafId changes). Without this, every leaf-focus
  // change would re-render the whole SplitGroup tree via prop identity change.
  const openTabRef = useRef(openTab)
  useEffect(() => { openTabRef.current = openTab }, [openTab])

  // The file currently shown in the active leaf — drives the Layout header's
  // file name.
  const activeFile = getActiveFile(root, activeLeafId)

  // Check if a file with the same name already exists in history
  const isDuplicate = useCallback((fileName: string) => {
    return history.some((r) => r.name === fileName)
  }, [history])

  // Actually perform the upload (called after duplicate check passes)
  const proceedUpload = useCallback(async (file: File) => {
    await handleFile(file)
    addHistory(file, 'unknown')
  }, [handleFile, addHistory])

  const handleFileWithHistory = useCallback(async (file: File) => {
    if (isDuplicate(file.name)) {
      setPendingDuplicate(file)
      return
    }
    await proceedUpload(file)
  }, [isDuplicate, proceedUpload])

  // Close all tabs / leave split tree — back to the home page.
  const handleClear = useCallback(() => {
    closeAll()
  }, [closeAll])

  const handleHistorySelect = useCallback(async (record: FileRecord) => {
    await restoreFromRecord(record)
    markOpened(record.id)
  }, [restoreFromRecord, markOpened])

  const handleAccountOpen = useCallback(() => {
    setAccountOpen(true)
  }, [])

  const handleAccountClose = useCallback(() => {
    setAccountOpen(false)
  }, [])

  const handleSettingsOpen = useCallback(() => {
    setSettingsOpen(true)
  }, [])

  const handleSettingsClose = useCallback(() => {
    setSettingsOpen(false)
  }, [])

  const handleShareOpen = useCallback((docId: string, docName: string) => {
    setShareDoc({ id: docId, name: docName })
  }, [])

  const handleShareClose = useCallback(() => {
    setShareDoc(null)
  }, [])

  // TabBar + picker: upload a brand-new file into a specific leaf. Uses
  // openTabRef so the callback identity is stable across activeLeafId changes
  // (otherwise the whole SplitGroup tree would re-render on every leaf focus).
  const handlePickFileInLeaf = useCallback(async (leafId: string, file: File) => {
    if (!isSupported(file)) {
      setPickerError('不支持的文件格式')
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      setPickerError('文件大小不能超过 50MB')
      return
    }
    setBusyLeafId(leafId)
    setPickerError(null)
    const url = URL.createObjectURL(file)
    try {
      const category = getFileCategory(file)
      const result = await api.uploadDocument(file)
      openTabRef.current({ file, category, url, docId: result.id }, leafId)
      addHistory(file, 'unknown')
      markOpened(result.id)
    } catch (err) {
      console.error('TabBar 上传失败:', err)
      URL.revokeObjectURL(url)
      setPickerError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setBusyLeafId(null)
    }
  }, [addHistory, markOpened])

  // TabBar + picker: reopen a history record into a specific leaf.
  const handlePickHistoryInLeaf = useCallback(async (leafId: string, record: FileRecord) => {
    setBusyLeafId(leafId)
    setPickerError(null)
    try {
      const blob = await api.downloadDocument(record.id)
      if (blob.size === 0) {
        setPickerError('文件下载失败，内容为空')
        return
      }
      const file = new File([blob], record.name, { type: blob.type })
      const url = URL.createObjectURL(file)
      openTabRef.current({ file, category: record.category, url, docId: record.id }, leafId)
      markOpened(record.id)
    } catch (err) {
      console.error('TabBar 历史下载失败:', err)
      setPickerError(err instanceof Error ? err.message : '加载历史文件失败')
    } finally {
      setBusyLeafId(null)
    }
  }, [markOpened])

  const handleDuplicateConfirm = useCallback(async () => {
    const file = pendingDuplicate
    setPendingDuplicate(null)
    if (!file) return

    // 1) Upload the NEW version first — a failure here never loses data.
    await proceedUpload(file)

    // 2) Overwrite semantics: remove older same-name docs (true server
    //    delete, unlike list-hiding). Failure only leaves a stale extra
    //    copy; the new file is already safely uploaded.
    const stale = history.filter((r) => r.name === file.name)
    try {
      await Promise.all(stale.map((r) => api.deleteDocument(r.id)))
    } catch (err) {
      console.error('Failed to remove overwritten copies:', err)
      showNotice(`「${file.name}」已上传，但部分旧版本清理失败`)
      refreshHistory()
      return
    }

    // 3) Re-pull so the replaced copies disappear from 最近查看.
    refreshHistory()
    showNotice(`已用新版本覆盖同名文件「${file.name}」`)
  }, [pendingDuplicate, proceedUpload, history, refreshHistory, showNotice])

  const handleDuplicateCancel = useCallback(() => {
    setPendingDuplicate(null)
  }, [])

  // Stable actions bundle for the recursive SplitGroup — identity is stable
  // across renders (all entries are useCallback'd in the hook), so memoized
  // subtrees skip re-render during divider drags.
  const splitGroupActions: SplitGroupActions = useMemo(() => ({
    setActiveTab,
    closeTab,
    closeOtherTabs,
    setActiveLeaf,
    splitLeaf,
    closeLeaf,
    swapChildren,
    toggleDirection,
    setRatio,
  }), [setActiveTab, closeTab, closeOtherTabs, setActiveLeaf, splitLeaf, closeLeaf, swapChildren, toggleDirection, setRatio])

  const handleShareForLeaf = useCallback((docId: string, fileName: string) => {
    handleShareOpen(docId, fileName)
  }, [handleShareOpen])

  // Main content: home page (no tabs) or the split tree.
  const mainContent = (
    <>
      {root === null ? (
        <ZoomScroller docZoom={docZoom}>
          <div className="flex-1 flex items-start justify-center px-4 sm:px-6 py-8">
            <div className="w-full max-w-2xl">
              <FileUpload
                onFile={handleFileWithHistory}
                currentFile={null}
                uploading={uploading}
                error={uploadError}
              />
              <FileHistory
                history={history}
                allDocuments={allDocuments}
                onSelect={handleHistorySelect}
                onRemove={removeHistory}
                onClear={clearHistory}
                onDelete={deleteDocument}
              />
            </div>
          </div>
        </ZoomScroller>
      ) : (
        <SplitGroup
          node={root}
          activeLeafId={activeLeafId}
          docZoom={docZoom}
          shareDisabled={localMode}
          history={history}
          allDocuments={allDocuments}
          onDeleteDocument={deleteDocument}
          busyLeafId={busyLeafId}
          actions={splitGroupActions}
          onShare={handleShareForLeaf}
          onPickFileInLeaf={handlePickFileInLeaf}
          onPickHistoryInLeaf={handlePickHistoryInLeaf}
        />
      )}
      {pickerError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-3 py-2 rounded-lg bg-error/10 border border-error/30 text-error text-xs shadow-[0_4px_16px_rgba(0,0,0,0.1)]">
          {pickerError}
        </div>
      )}
      {notice && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] px-3 py-2 rounded-lg bg-success/10 border border-success/30 text-success text-xs shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
          style={{ animation: 'docusync-toast-in 180ms ease-out' }}
        >
          {notice}
        </div>
      )}
    </>
  )

  return (
    <ZoomScaleContext.Provider value={uiZoom}>
      {/* Global zoom wrapper — the whole UI lays out in logical coordinates
          (100vw/uiZoom × 100vh/uiZoom) and is scaled to fill the real viewport,
          like browser page zoom. It becomes the containing block for all
          fixed-position elements, so they stay aligned after scaling. The
          document-area zoom layer stacks inside this wrapper — its transform
          multiplies with the global scale. */}
      <div
        className="overflow-hidden"
        style={{
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`,
          transform: `scale(${uiZoom})`,
          transformOrigin: 'top left',
        }}
      >
        <Layout
          currentFileName={activeFile?.file.name ?? null}
          onBack={handleClear}
          email={account.email}
          onAccountOpen={localMode ? undefined : handleAccountOpen}
          onSettingsOpen={isTauri() ? handleSettingsOpen : undefined}
          docZoom={docZoom}
          onDocZoomIn={() => setDocZoom((z) => clampDocZoom(z + DOC_ZOOM_STEP))}
          onDocZoomOut={() => setDocZoom((z) => clampDocZoom(z - DOC_ZOOM_STEP))}
          onDocZoomReset={() => setDocZoom(1)}
        >
          {/* Document area — each preview (home / split tree) is its own
              ZoomScroller-equivalent: TabContent wraps each tab's viewer in a
              ZoomScroller whose scroller sits OUTSIDE the zoom layer, so the
              viewport and scrollbar always stay full-height while only the
              content scales; and each leaf owns its own scroller, so panes
              scroll INDEPENDENTLY. */}
          <div className="flex-1 flex flex-col min-h-0">
            {mainContent}
          </div>

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

          <SettingsPanel
            open={settingsOpen}
            onClose={handleSettingsClose}
            uiZoom={uiZoom}
            onUiZoomChange={(z) => setUiZoom(clampUiZoom(z))}
          />

          {/* Startup update banner (Tauri only; renders nothing in the browser) */}
          <UpdateBanner />

          {shareDoc && (
            <ShareDialog
              open={!!shareDoc}
              onClose={handleShareClose}
              docId={shareDoc.id}
              fileName={shareDoc.name}
            />
          )}

          {/* Duplicate file confirmation */}
          {pendingDuplicate && (
            <DuplicateConfirm
              fileName={pendingDuplicate.name}
              onConfirm={handleDuplicateConfirm}
              onCancel={handleDuplicateCancel}
            />
          )}
        </Layout>
      </div>
    </ZoomScaleContext.Provider>
  )
}
