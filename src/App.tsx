import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { listen } from '@tauri-apps/api/event'
import {
  Loader2,
  Columns2,
  Rows2,
  ArrowLeftRight,
  PanelRightClose,
  MessageSquare,
} from 'lucide-react'
import { Layout, APP_HEADER_HEIGHT } from './components/Layout'
import { FileUpload } from './components/FileUpload'
import { FileHistory } from './components/FileHistory'
import { AccountPanel } from './components/AccountPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { SelectionToolbar } from './components/SelectionToolbar'
import { SplitGroup, type SplitGroupActions } from './components/SplitGroup'
import { ZoomScroller } from './components/ZoomScroller'
import { DuplicateConfirm } from './components/DuplicateConfirm'
import { ShareDialog } from './components/ShareDialog'
import { ChatPanelContainer } from './components/ChatPanelContainer'
import { ChatPanel, ChatRestoreBubble } from './components/ChatPanel'
import { UpdateBanner } from './components/UpdateBanner'
import { useFileUpload } from './hooks/useFileUpload'
import { useFileHistory } from './hooks/useFileHistory'
import { useAccount } from './hooks/useAccount'
import { useEditorLayout, getActiveFile } from './hooks/useEditorLayout'
import { useAIServices, type AIService } from './hooks/useAIServices'
import { autoCheckForUpdate } from './hooks/useUpdater'
import { getFileCategory, isSupported } from './utils/fileType'
import { isTauri } from './utils/tauri'
import { getStorageMode } from './lib/storage-mode'
import { ZoomScaleContext } from './hooks/useZoom'
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
// Document-area zoom (browser-like scale of the document region only),
// persisted across sessions. Chat panels zoom independently via their own
// per-panel controls.
const LS_DOC_ZOOM = 'docusync.layout.docZoom'
// Global UI zoom — scales the whole interface (document + chat column) to fit
// the window. Controlled from the Settings panel. Region zoom layers (docZoom,
// per-panel chat zoom) stack on top of it.
const LS_UI_ZOOM = 'docusync.layout.uiZoom'

export const DOC_ZOOM_MIN = 0.4
export const DOC_ZOOM_MAX = 1.6
export const DOC_ZOOM_STEP = 0.1

const UI_ZOOM_MIN = 0.4
const UI_ZOOM_MAX = 1.6

function readCollapsed(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

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
  const { history, addHistory, removeHistory, clearHistory } = useFileHistory()
  const account = useAccount()
  const { services } = useAIServices()
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
  // Leaf currently running an upload/download via its TabBar + picker — drives
  // the spinner on the + button and disables picker interactions.
  const [busyLeafId, setBusyLeafId] = useState<string | null>(null)
  const [pickerError, setPickerError] = useState<string | null>(null)
  const localMode = getStorageMode() === 'local'
  // Any modal overlay open (settings / account / share / duplicate confirm).
  // While one is open the docked chat panels are hidden (kept mounted) so the
  // modal is never covered — the chat webviews are native views in Tauri that
  // draw over the React DOM regardless of z-index, so hiding is the only way.
  const anyModalOpen = settingsOpen || accountOpen || !!shareDoc || !!pendingDuplicate
  // Docked chat sidebar collapsed / expanded (edge tab on the right restores it).
  const [chatCollapsed, setChatCollapsed] = useState(() => readCollapsed(LS_CHAT_COLLAPSED))
  // Browser-like zoom of the DOCUMENT area only (the chat column has its own
  // per-panel zoom). Narrow screens can zoom out the document to fit the
  // docked chat alongside it.
  const [docZoom, setDocZoom] = useState<number>(readDocZoom)
  // Global UI zoom — whole-interface scale, controlled from the Settings
  // panel. The region zoom layers (docZoom, per-panel chat zoom) stack on top.
  const [uiZoom, setUiZoom] = useState<number>(readUiZoom)

  useEffect(() => {
    try { localStorage.setItem(LS_CHAT_COLLAPSED, chatCollapsed ? '1' : '0') } catch { /* ignore */ }
  }, [chatCollapsed])
  useEffect(() => {
    try { localStorage.setItem(LS_DOC_ZOOM, String(docZoom)) } catch { /* ignore */ }
  }, [docZoom])
  useEffect(() => {
    try { localStorage.setItem(LS_UI_ZOOM, String(uiZoom)) } catch { /* ignore */ }
  }, [uiZoom])

  // OS-level zoom shortcuts registered by Rust (global-shortcut plugin) — they
  // fire even while focus is inside the embedded chat webview, where normal
  // keydown events never reach this window. They drive the DOCUMENT-area zoom.
  // Tauri only.
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

  // Ctrl/Cmd + mouse wheel zooms the DOCUMENT area like a browser. Wheel events
  // are always delivered to the page (they are not reserved browser
  // accelerators), so this works in the browser AND in Tauri — including
  // trackpad pinch-to-zoom, which browsers report as ctrl+wheel events.
  // (Wheel events over the embedded chat webview/iframe are captured by the
  // chat page itself; chat zoom is adjusted via each panel's header control.)
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
  const viewportWidth = viewportSize.width / uiZoom
  const viewportHeight = viewportSize.height / uiZoom

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

  // Bridge useFileUpload's `uploadedFile` (set by home-page upload or history
  // restore) into the editor tree. The ref guard prevents double-opening when
  // `openTab`'s identity changes (it depends on activeLeafId).
  const lastOpenedRef = useRef<UploadedFile | null>(null)
  useEffect(() => {
    if (uploadedFile && uploadedFile !== lastOpenedRef.current) {
      lastOpenedRef.current = uploadedFile
      openTab(uploadedFile)
    }
  }, [uploadedFile, openTab])

  // Ref mirror of openTab so the TabBar picker callbacks stay stable (don't
  // re-create when activeLeafId changes). Without this, every leaf-focus
  // change would re-render the whole SplitGroup tree via prop identity change.
  const openTabRef = useRef(openTab)
  useEffect(() => { openTabRef.current = openTab }, [openTab])

  // The file currently shown in the active leaf — drives SelectionToolbar and
  // the Layout header's file name.
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
    } catch (err) {
      console.error('TabBar 上传失败:', err)
      URL.revokeObjectURL(url)
      setPickerError(err instanceof Error ? err.message : '上传失败')
    } finally {
      setBusyLeafId(null)
    }
  }, [addHistory])

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
    } catch (err) {
      console.error('TabBar 历史下载失败:', err)
      setPickerError(err instanceof Error ? err.message : '加载历史文件失败')
    } finally {
      setBusyLeafId(null)
    }
  }, [])

  const handleDuplicateConfirm = useCallback(async () => {
    const file = pendingDuplicate
    setPendingDuplicate(null)
    if (!file) return
    await proceedUpload(file)
  }, [pendingDuplicate, proceedUpload])

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
                onSelect={handleHistorySelect}
                onRemove={removeHistory}
                onClear={clearHistory}
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
    </>
  )

  return (
    <ZoomScaleContext.Provider value={uiZoom}>
      {/* Global zoom wrapper — the whole UI lays out in logical coordinates
          (100vw/uiZoom × 100vh/uiZoom) and is scaled to fill the real viewport,
          like browser page zoom. It becomes the containing block for all
          fixed-position elements, so they stay aligned after scaling. Region
          zoom layers (document area, per-panel chat) stack inside this
          wrapper — each transform multiplies with the global scale. */}
      <div
        className="overflow-hidden"
        style={{
          width: `${100 / uiZoom}vw`,
          height: `${100 / uiZoom}vh`,
          transform: `scale(${uiZoom})`,
          transformOrigin: 'top left',
        }}
      >
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
          (dockDirection === 'vertical' ? viewportHeight - APP_HEADER_HEIGHT : splitWidth ?? 420) - 12 - dividerTotal,
        )
        const dockRects = new Map<string, { top: number; height: number }>()
        const dockBoxes = new Map<string, { left: number; width: number }>()
        if (dockDirection === 'vertical') {
          let acc = APP_HEADER_HEIGHT + 6
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
          currentFileName={activeFile?.file.name ?? null}
          onBack={handleClear}
          email={account.email}
          onAccountOpen={localMode ? undefined : handleAccountOpen}
          onSettingsOpen={handleSettingsOpen}
          chatSplitWidth={splitWidth != null && !chatCollapsed ? splitWidth + 14 : undefined}
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
                hidden={isSplit && (chatCollapsed || anyModalOpen)}
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
                  top: APP_HEADER_HEIGHT + 6,
                  width: DOCK_DIVIDER,
                  height: viewportHeight - APP_HEADER_HEIGHT - 12,
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
                top: APP_HEADER_HEIGHT + 6,
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

          {/* Selection toolbar for AI Q&A — bound to the active leaf's active tab. */}
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
      </div>
    </ZoomScaleContext.Provider>
  )
}
