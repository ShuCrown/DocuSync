import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import {
  Loader2,
  X,
  Columns2,
  Rows2,
  ArrowLeftRight,
  PanelLeftOpen,
  PanelRightClose,
  MessageSquare,
  FileText,
} from 'lucide-react'
import { Layout } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { DocumentViewer } from './components/DocumentViewer'
import { AccountPanel } from './components/AccountPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SelectionToolbar } from './components/SelectionToolbar'
import { SplitPane } from './components/SplitPane'
import { PaneHeader } from './components/PaneHeader'
import { SimplePaneHeader } from './components/SimplePaneHeader'
import { DuplicateConfirm } from './components/DuplicateConfirm'
import { ShareDialog } from './components/ShareDialog'
import { ChatPanelContainer } from './components/ChatPanelContainer'
import { ChatPanel, ChatRestoreBubble } from './components/ChatPanel'
import { UpdateBanner } from './components/UpdateBanner'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useAccount } from './hooks/useAccount'
import { useSplitView } from './hooks/useSplitView'
import { useAIServices, type AIService } from './hooks/useAIServices'
import { useScrollPosition, findScrollable } from './hooks/useScrollPosition'
import { autoCheckForUpdate } from './hooks/useUpdater'
import { getFileCategory, isSupported } from './utils/fileType'
import { isTauri } from './utils/tauri'
import { getStorageMode } from './lib/storage-mode'
import * as api from './lib/api'
import type { FileRecord } from './hooks/useFileHistory'
import type { UploadedFile } from './hooks/useFileUpload'

/**
 * Resolve the AI service hosting a chat panel by its `currentUrl`. Exact URL
 * match first, then a containment match (covers services whose URL was edited
 * after the panel was opened). Used to show the service's icon on collapsed /
 * minimized restore bubbles so multiple panels are distinguishable.
 */
function findServiceByUrl(services: AIService[], url: string | null): AIService | undefined {
  if (!url) return undefined
  return (
    services.find((s) => s.url === url) ??
    services.find((s) => url.includes(s.url) || s.url.includes(url))
  )
}

// Collapse state for the docked chat sidebar, persisted across sessions so
// the user's layout preference survives restarts.
const LS_CHAT_COLLAPSED = 'docusync.layout.chatCollapsed'

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Shorten a file name for the document restore bubbles. */
function truncateFileName(name: string, max = 10): string {
  return name.length > max ? `${name.slice(0, max)}…` : name
}

export default function App() {
  const { uploadedFile, error: uploadError, uploading, downloading, downloadProgress, handleFile, restoreFromRecord, clearFile } = useFileUpload()
  const { history, addHistory, removeHistory, clearHistory } = useFileHistory()
  const account = useAccount()
  const { services } = useAIServices()
  const {
    mode: splitMode, direction: splitDirection, activePane,
    paneA, paneB, splitRatio, hiddenPane,
    enterSplit, enterSplitPicker, exitSplit,
    closePaneA, closePaneB, swapPanes,
    setActivePane, toggleDirection, setSplitRatio, setPaneA, replacePaneB,
    hidePane, showPane,
  } = useSplitView()
  const paneBRef = useRef(paneB)
  const [accountOpen, setAccountOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shareDoc, setShareDoc] = useState<{ id: string; name: string } | null>(null)
  const splitButtonRef = useRef<HTMLElement | null>(null)
  const singleScrollRef = useRef<HTMLDivElement | null>(null)
  const initialPaneAPos = useRef<{ x: number; y: number } | null>(null)
  const [pendingDuplicate, setPendingDuplicate] = useState<File | null>(null)
  const localMode = getStorageMode() === 'local'
  // Docked chat sidebar collapsed / expanded (edge tab on the right restores it).
  const [chatCollapsed, setChatCollapsed] = useState(() => readCollapsed(LS_CHAT_COLLAPSED))

  useEffect(() => {
    try { localStorage.setItem(LS_CHAT_COLLAPSED, chatCollapsed ? '1' : '0') } catch { /* ignore */ }
  }, [chatCollapsed])

  // Live viewport size — drives the layout of docked chat panes.
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1200,
    height: typeof window !== 'undefined' ? window.innerHeight : 800,
  }))
  useEffect(() => {
    const onResize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const viewportWidth = viewportSize.width
  const viewportHeight = viewportSize.height

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

  // Check for app updates on startup (Tauri only; no-op in the browser).
  // Skipped in local development (`import.meta.env.DEV` is true for both
  // `vite dev` and `tauri dev`) so dev runs never hit the updater manifest;
  // the packaged app is a production build (DEV=false) and checks normally.
  useEffect(() => {
    if (isTauri() && !import.meta.env.DEV) autoCheckForUpdate()
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
    } catch (err) {
      console.error('分屏上传失败:', err)
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
        onHide={() => hidePane('a')}
        onShare={!localMode && paneA?.docId ? () => handleShareOpen(paneA.docId!, paneA.file.name) : undefined}
      />
      <div ref={paneAScrollRef} className="flex-1 overflow-auto">
        <DocumentViewer
          uploaded={paneA!}
          onTextExtracted={() => {}}
        />
      </div>
    </div>
  ), [paneA, activePane, handlePaneAClose, handlePaneFocus, paneAScrollRef, handleShareOpen, localMode, hidePane])

  const paneBElement = useMemo(() => (
    <div className="h-full flex flex-col">
      <PaneHeader
        file={paneB!}
        pane="b"
        isActive={activePane === 'b'}
        onClose={handlePaneBClose}
        onReplace={handleReplacePaneB}
        onFocus={handlePaneFocus}
        onHide={() => hidePane('b')}
        onShare={!localMode && paneB?.docId ? () => handleShareOpen(paneB.docId!, paneB.file.name) : undefined}
      />
      <div ref={paneBScrollRef} className="flex-1 overflow-auto">
        <DocumentViewer
          uploaded={paneB!}
          onTextExtracted={() => {}}
        />
      </div>
    </div>
  ), [paneB, activePane, handlePaneBClose, handleReplacePaneB, handlePaneFocus, paneBScrollRef, handleShareOpen, localMode, hidePane])

  // Picker view for pane B when no file is selected (same layout as home page)
  const handlePickerFile = useCallback(async (file: File) => {
    if (!isSupported(file)) return
    if (isDuplicate(file.name)) {
      setPendingDuplicate(file)
      return
    }
    await handlePickerUpload(file)
  }, [isDuplicate, handlePickerUpload])

  const handleDuplicateConfirm = useCallback(async () => {
    const file = pendingDuplicate
    setPendingDuplicate(null)
    if (!file) return
    if (isSplit) {
      await handlePickerUpload(file)
    } else {
      await proceedUpload(file)
    }
  }, [pendingDuplicate, isSplit, handlePickerUpload, proceedUpload])

  const handleDuplicateCancel = useCallback(() => {
    setPendingDuplicate(null)
  }, [])

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-surface-alt/40 shrink-0">
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

  // Main content (home / split-comparison / single document) — wrapped in a
  // split row when the chat panel is docked so the document pane shrinks to
  // make room for it.
  const mainContent = (
    <>
      {!paneA && !uploadedFile ? (
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
              onSelect={handleHistorySelect}
              onRemove={removeHistory}
              onClear={clearHistory}
            />
          </div>
        </div>
      ) : isSplit ? (
        // SplitPane stays mounted across hide/restore — the hidden pane is
        // display:none (CSS only), so neither DocumentViewer remounts and both
        // keep their scroll position / viewer state.
        <SplitPane
          direction={splitDirection}
          splitRatio={splitRatio}
          onSplitRatioChange={setSplitRatio}
          onSwap={swapPanes}
          onDirectionChange={toggleDirection}
          hiddenPane={hiddenPane}
          paneA={paneAElement}
          paneB={paneB ? paneBElement : paneBPickerElement}
        />
      ) : (
        <div className="flex-1 flex flex-col min-h-0">
          <SimplePaneHeader
            fileName={singleFile!.file.name}
            docId={singleFile?.docId}
            onClose={handleClear}
            onShare={!localMode && singleFile?.docId ? () => handleShareOpen(singleFile.docId!, singleFile.file.name) : undefined}
          />
          <div ref={handleSingleScrollRef} className="flex-1 overflow-auto">
            <DocumentViewer
              uploaded={singleFile!}
              onTextExtracted={() => {}}
            />
          </div>
        </div>
      )}
    </>
  )

  return (
    <ChatPanelContainer>
      {(openChat, panels, resizeDock, swapDockPanels) => {
        const splitPanels = panels.filter((p) => p.mode === 'split')
        const splitWidth = splitPanels[0]?.splitWidth
        // Floating pills / restore bubbles shift left of a VISIBLE docked panel
        // (its webview would swallow their clicks). When the whole sidebar is
        // collapsed there is no webview to avoid, so they keep the default spot.
        const dockedPillRight = !chatCollapsed && splitWidth ? splitWidth + 24 : undefined
        const collapsedPanels = panels.filter((p) => p.mode === 'collapsed')

        // Opening a chat should always show it — expand a collapsed sidebar first.
        const handleOpenChat = (url: string, title: string) => {
          setChatCollapsed(false)
          openChat(url, title)
        }

        // Dock layout: every split panel is visible at once, arranged either
        // vertically (stacked, like document split panes) or horizontally
        // (side by side). Shares come from `dockRatio`. Each divider gets its
        // own 12px gap BETWEEN panels so it never overlaps a native webview
        // (which would swallow its clicks).
        const dockDirection = splitPanels[0]?.dockDirection ?? 'vertical'
        const toggleDockDirection = splitPanels[0]?.toggleDockDirection
        // Slim gap between docked panels. The direction-toggle pill overflows
        // slightly on hover — the overflow lands on adjacent panels' DOM
        // (header/edge), not on their native webviews, so it stays visible
        // and clickable.
        const DOCK_DIVIDER = 8
        const dividerTotal = Math.max(0, splitPanels.length - 1) * DOCK_DIVIDER
        // Vertical mode spans the viewport height; horizontal mode splits the
        // docked sidebar column (splitWidth wide) itself.
        const dockAvail = Math.max(
          0,
          (dockDirection === 'vertical' ? viewportHeight : splitWidth ?? 420) - 12 - dividerTotal,
        )
        const dockRects = new Map<string, { top: number; height: number }>()
        const dockBoxes = new Map<string, { left: number; width: number }>()
        if (dockDirection === 'vertical') {
          let acc = 6
          for (const p of splitPanels) {
            const height = Math.max(0, p.dockRatio * dockAvail)
            dockRects.set(p.id, { top: acc, height })
            acc += height + DOCK_DIVIDER
          }
        } else {
          // Horizontal panes live inside the docked sidebar column: left edge
          // of that column is (viewportWidth - 6 - splitWidth).
          const dockLeft0 = viewportWidth - 6 - (splitWidth ?? 420)
          let acc = 0
          for (const p of splitPanels) {
            const width = Math.max(0, p.dockRatio * dockAvail)
            dockBoxes.set(p.id, { left: dockLeft0 + acc, width })
            acc += width + DOCK_DIVIDER
          }
        }

        // Drag a divider between two adjacent docked panels to resize them.
        const handleDockDividerDrag = (
          e: React.MouseEvent,
          topId: string,
          bottomId: string,
          startRatio: number,
        ) => {
          e.preventDefault()
          const isVertical = dockDirection === 'vertical'
          const startPos = isVertical ? e.clientY : e.clientX
          document.body.style.cursor = isVertical ? 'row-resize' : 'col-resize'
          document.body.style.userSelect = 'none'
          let raf = 0
          const onMove = (ev: MouseEvent) => {
            if (raf) return
            raf = requestAnimationFrame(() => {
              raf = 0
              const pos = isVertical ? ev.clientY : ev.clientX
              const delta = (pos - startPos) / dockAvail
              resizeDock(topId, bottomId, startRatio + delta)
            })
          }
          const stop = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', stop)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', stop)
        }

        // Drag the divider between the document area and the docked chat
        // panels to resize the chat width (drives the shared splitWidth).
        const handleChatWidthDrag = (e: React.MouseEvent) => {
          e.preventDefault()
          const startX = e.clientX
          const startWidth = splitWidth ?? 420
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
          let raf = 0
          const onMove = (ev: MouseEvent) => {
            if (raf) return
            raf = requestAnimationFrame(() => {
              raf = 0
              const next = startWidth + (startX - ev.clientX)
              splitPanels[0]?.setSplitWidth(next)
            })
          }
          const stop = () => {
            document.removeEventListener('mousemove', onMove)
            document.removeEventListener('mouseup', stop)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
          }
          document.addEventListener('mousemove', onMove)
          document.addEventListener('mouseup', stop)
        }

        return (
        <Layout
          currentFileName={paneA?.file.name ?? uploadedFile?.file.name ?? null}
          onBack={handleClear}
          history={history}
          onHistorySelect={handleHistorySelect}
          onHistoryRemove={removeHistory}
          onHistoryClear={clearHistory}
          email={account.email}
          onAccountOpen={localMode ? undefined : handleAccountOpen}
          onSettingsOpen={handleSettingsOpen}
          splitMode={splitMode}
          onSplitToggle={handleSplitToggle}
          splitButtonRef={splitButtonRef}
          chatSplitWidth={splitWidth != null && !chatCollapsed ? splitWidth + 14 : undefined}
        >
          {mainContent}

          {/* One ChatPanel per AI service — multiple panels coexist; docked
              ones stack vertically and are ALL visible (like document split
              panes), the rest float as their own windows/overlays. Uses fixed
              positioning for all modes; split mode reserves space via
              marginRight on the main content above. Floating control pills
              are shifted left of the docked panel: its native child webview
              draws over the React DOM, which would otherwise hide them. */}
          {panels.map((p) => {
            if (p.mode === 'closed') return null
            const pillIndex = p.mode === 'floating'
              ? Math.max(0, panels.filter((x) => x.mode === 'floating').findIndex((x) => x.id === p.id))
              : 0
            const isSplit = p.mode === 'split'
            const dockRect = isSplit && dockDirection === 'vertical' ? dockRects.get(p.id) : undefined
            const dockBox = isSplit && dockDirection === 'horizontal' ? dockBoxes.get(p.id) : undefined
            return (
              <ChatPanel
                key={p.id}
                panel={p}
                floatingPillIndex={pillIndex}
                floatingPillRight={dockedPillRight}
                bubbleBaseIndex={collapsedPanels.length}
                restoreService={findServiceByUrl(services, p.currentUrl)}
                dockTop={dockRect?.top}
                dockHeight={dockRect?.height}
                dockLeft={dockBox?.left}
                dockWidth={dockBox?.width}
                hidden={isSplit && chatCollapsed}
              />
            )
          })}

          {/* Divider strips in the gaps BETWEEN docked panels — drag to resize.
              Rendered after the panels (topmost DOM) and inside their own gap,
              clear of every native webview, so they stay clickable. The hover
              pill offers the same actions as the document split pane divider:
              swap the two adjacent panels' order + toggle the dock direction.
              Hidden while the whole chat sidebar is collapsed. */}
          {!chatCollapsed && splitPanels.slice(0, -1).map((p, i) => {
            const next = splitPanels[i + 1]
            const dividerPill = (
              <div
                className={`absolute left-1/2 -translate-x-1/2 flex items-center gap-0.5 rounded-full bg-surface-card border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] text-text-secondary ${
                  dockDirection === 'vertical'
                    ? // Vertical dock: the divider is a horizontal strip between
                      // stacked panels. Anchor the pill to the strip's TOP so
                      // it only overflows DOWNWARD into the panel below's
                      // header (plain React DOM) — overflowing upward would
                      // hide it under the panel above's native webview, which
                      // draws over the React DOM.
                      'top-0 flex-row px-1 py-0.5'
                    : // Horizontal dock: keep the pill centered on the strip.
                      'top-1/2 -translate-y-1/2 flex-col py-1 px-0.5'
                }`}
              >
                {/* Swap the two adjacent panels' order */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => swapDockPanels(p.id, next.id)}
                  className="p-1 rounded-full hover:text-primary hover:bg-surface-alt transition-colors"
                  title={dockDirection === 'vertical' ? '交换上下位置' : '交换左右位置'}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </button>
                {/* Toggle dock direction */}
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={toggleDockDirection}
                  className="p-1 rounded-full hover:text-primary hover:bg-surface-alt transition-colors"
                  title={dockDirection === 'vertical' ? '切换为横向分栏' : '切换为纵向分栏'}
                >
                  {dockDirection === 'vertical'
                    ? <Columns2 className="w-3.5 h-3.5" />
                    : <Rows2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            )
            if (dockDirection === 'vertical') {
              const rect = dockRects.get(p.id)
              if (!rect) return null
              return (
                <div
                  key={`dock-${p.id}`}
                  onMouseDown={(e) => handleDockDividerDrag(e, p.id, next.id, p.dockRatio)}
                  className="fixed z-[9998] group flex items-center justify-center cursor-row-resize"
                  style={{
                    right: 6,
                    top: rect.top + rect.height,
                    width: splitWidth ?? 420,
                    height: DOCK_DIVIDER,
                  }}
                  title="拖拽调整面板大小"
                >
                  <div className="w-8 h-px bg-border/60 group-hover:bg-primary/50 transition-colors" />
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                    {dividerPill}
                  </div>
                </div>
              )
            }
            const box = dockBoxes.get(p.id)
            if (!box) return null
            return (
              <div
                key={`dock-${p.id}`}
                onMouseDown={(e) => handleDockDividerDrag(e, p.id, next.id, p.dockRatio)}
                className="fixed z-[9998] group flex items-center justify-center cursor-col-resize"
                style={{
                  left: box.left + box.width,
                  top: 6,
                  width: DOCK_DIVIDER,
                  height: viewportHeight - 12,
                }}
                title="拖拽调整面板大小"
              >
                <div className="w-px h-8 bg-border/60 group-hover:bg-primary/50 transition-colors" />
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                  {dividerPill}
                </div>
              </div>
            )
          })}

          {/* Divider between the document area and the docked chat panels —
              a fixed strip in the gap between the two regions, styled like
              the dock dividers (8px grip + hairline + hover highlight).
              Dragging it resizes the chat width (splitWidth). Hover reveals a
              pill with the whole-sidebar collapse ("收起聊天侧栏") — the only
              entry point for collapsing ALL docked chats at once, kept off the
              chat panel headers so it can't be confused with the per-panel
              "收起此聊天". Hidden when either region is collapsed (there is no
              gap to drag in). */}
          {splitWidth != null && splitPanels.length > 0 && !chatCollapsed && (
            <div
              onMouseDown={handleChatWidthDrag}
              className="fixed z-[9998] group flex items-center justify-center cursor-col-resize"
              style={{
                left: viewportWidth - 6 - splitWidth - 8,
                top: 6,
                width: 8,
                bottom: 6,
              }}
              title="拖拽调整聊天宽度"
            >
              <div className="w-px h-8 rounded-full bg-border/60 group-hover:bg-primary/50 transition-colors" />
              {/* Whole-sidebar collapse — the pill overflows onto the document
                  area (plain React DOM), so it stays visible and clickable */}
              <div className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setChatCollapsed(true)}
                  className="flex items-center justify-center w-7 h-7 rounded-full bg-surface-card border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
                  title="收起聊天侧栏（收起全部停靠聊天）"
                >
                  <PanelRightClose className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Collapsed chat sidebar — edge tab on the right, one click expands
              all docked panels back into view. */}
          {chatCollapsed && splitPanels.length > 0 && (
            <button
              onClick={() => setChatCollapsed(false)}
              className="fixed z-[9999] right-0 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pr-2.5 pl-2 py-3.5 rounded-l-xl bg-surface-card border border-r-0 border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] hover:bg-surface-alt/60 hover:text-primary transition-colors"
              title="展开聊天侧栏"
            >
              <span
                className="text-[11px] text-text-secondary tracking-widest select-none"
                style={{ writingMode: 'vertical-rl' }}
              >
                聊天
              </span>
              <MessageSquare className="w-4 h-4 text-primary shrink-0" />
            </button>
          )}

          {/* Hidden split-view pane — a unified restore bubble in the
              bottom-left corner (same style as the AI chat restore bubbles):
              document icon + name + expand icon, one click brings the pane
              back. The bottom-left corner is never covered by a docked chat
              webview, so the bubble is always reachable. */}
          {(hiddenPane === 'a' || hiddenPane === 'b') && (
            <button
              onClick={() => showPane(hiddenPane)}
              className="fixed z-[9999] h-10 max-w-[220px] rounded-xl bg-surface-card text-primary border border-border/60 shadow-[0_4px_24px_rgba(0,0,0,0.08)] flex items-center gap-1.5 pl-2 pr-2 hover:bg-surface-alt/50 hover:scale-105 transition-all"
              style={{ left: 16, bottom: 16 }}
              title={`展开 ${hiddenPane === 'a' ? (paneA?.file.name ?? '文档 A') : (paneB?.file.name ?? '文档 B')}`}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="text-xs font-medium text-text truncate">
                {truncateFileName(hiddenPane === 'a' ? (paneA?.file.name ?? '文档 A') : (paneB?.file.name ?? '文档 B'))}
              </span>
              <PanelLeftOpen className="w-4 h-4 shrink-0" />
            </button>
          )}

          {/* Collapsed — restore bubbles (stacked, shifted clear of a docked
              split panel's native webview). Each bubble shows the AI service's
              icon so multiple collapsed chats are distinguishable. */}
          {collapsedPanels.map((p, i) => (
            <ChatRestoreBubble
              key={p.id}
              onClick={p.restore}
              index={i}
              right={dockedPillRight}
              service={findServiceByUrl(services, p.currentUrl)}
              title={p.currentTitle}
            />
          ))}

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

          {/* Selection toolbar for AI Q&A */}
          {activeFile && <SelectionToolbar onOpenChat={handleOpenChat} />}

          {/* Duplicate file confirmation */}
          {pendingDuplicate && (
            <DuplicateConfirm
              fileName={pendingDuplicate.name}
              onConfirm={handleDuplicateConfirm}
              onCancel={handleDuplicateCancel}
            />
          )}
        </Layout>
        )
      }}
    </ChatPanelContainer>
  )
}
