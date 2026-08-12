import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import {
  X,
  Plus,
  Columns2,
  Rows2,
  Share2,
  Upload,
  Clock,
  Loader2,
  Layers,
  SquareX,
  MoreHorizontal,
} from 'lucide-react'
import type { Tab, SplitDirection } from '../hooks/useEditorLayout'
import type { FileRecord } from '../hooks/useFileHistory'
import { getCategoryLabel } from '../utils/fileType'
import { FileTypeIcon } from '../utils/fileIcon'
import { formatTime } from '../utils/formatTime'
import { HistoryPickerModal } from './HistoryPickerModal'

/** Max history rows shown in the + popover; the rest open in the picker modal. */
const MAX_VISIBLE = 8

interface TabBarProps {
  /** Leaf id — used as a React key by the parent. */
  leafId: string
  tabs: Tab[]
  activeTabId: string | null
  isActiveLeaf: boolean
  /** Disable share button (e.g. local storage mode). */
  shareDisabled?: boolean
  history: FileRecord[]
  /** Every uploaded document (incl. records hidden from 最近查看) — the + popover
      and its picker list these, so removed files stay reopenable. */
  allDocuments?: FileRecord[]
  /** Permanent delete from the all-files picker (double-confirmed). */
  onDeleteDocument?: (id: string) => Promise<void> | void
  /** Whether a history download or upload is in flight (shows spinner). */
  pickerBusy?: boolean
  onSetActiveTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  /** Close every tab in this leaf except the given one (context menu). */
  onCloseOtherTabs: (tabId: string) => void
  onSplitLeaf: (direction: SplitDirection) => void
  onCloseLeaf: () => void
  onShare: (docId: string, fileName: string) => void
  /** Upload a brand-new file → caller turns it into a tab via openTab. */
  onPickFile: (file: File) => void
  /** Reopen a history record → caller downloads + turns it into a tab. */
  onPickHistory: (record: FileRecord) => void
}

/**
 * VSCode-style tab strip for a single leaf group:
 * - horizontal list of open tabs (file icon + name + close X)
 * - right-side actions: split-right, split-down, open-document (+), close-group
 *
 * The "+" action opens a small popover with an upload button and the history
 * list — picking either calls back to the parent, which adds a new tab to this
 * leaf via `openTab`.
 */
export function TabBar({
  tabs,
  activeTabId,
  isActiveLeaf,
  shareDisabled,
  history,
  allDocuments,
  onDeleteDocument,
  pickerBusy,
  onSetActiveTab,
  onCloseTab,
  onCloseOtherTabs,
  onSplitLeaf,
  onCloseLeaf,
  onShare,
  onPickFile,
  onPickHistory,
}: TabBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const plusBtnRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [plusRect, setPlusRect] = useState<{ top: number; right: number } | null>(null)
  // Full-list searchable picker opened from the + popover's "more" button.
  const [histModalOpen, setHistModalOpen] = useState(false)

  // Right-click context menu state: which tab + where the menu was opened.
  const [ctxMenu, setCtxMenu] = useState<{ tabId: string; x: number; y: number } | null>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)

  // Close picker on outside click / ESC.
  useEffect(() => {
    if (!pickerOpen) return
    const onDown = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        plusBtnRef.current && !plusBtnRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  // Context menu: close on outside left-click / ESC. Right-click (button 2)
  // is ignored here — the tab's own onContextMenu replaces the menu instead.
  useEffect(() => {
    if (!ctxMenu) return
    const onDown = (e: MouseEvent) => {
      if (e.button === 2) return
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ctxMenu])

  // Keep the menu inside the viewport after it is laid out.
  useLayoutEffect(() => {
    const el = ctxMenuRef.current
    if (!ctxMenu || !el) return
    const rect = el.getBoundingClientRect()
    const maxX = window.innerWidth - rect.width - 4
    const maxY = window.innerHeight - rect.height - 4
    if (rect.left > maxX || rect.top > maxY) {
      el.style.left = `${Math.max(4, maxX)}px`
      el.style.top = `${Math.max(4, maxY)}px`
    }
  }, [ctxMenu])

  const handleCtxAction = (action: () => void) => {
    action()
    setCtxMenu(null)
  }

  const openPicker = () => {
    const rect = plusBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setPlusRect({ top: rect.bottom + 6, right: window.innerWidth - rect.right })
    }
    setPickerOpen(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onPickFile(file)
      setPickerOpen(false)
    }
    e.target.value = ''
  }

  const handleHistory = (record: FileRecord) => {
    onPickHistory(record)
    setPickerOpen(false)
  }

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null
  const canShare = !shareDisabled && activeTab?.file.docId != null
  // The + popover lists ALL uploaded docs (incl. records hidden from 最近查看)
  // so removed files can still be reopened as a new tab.
  const listRecords = allDocuments && allDocuments.length > 0 ? allDocuments : history

  return (
    <div
      className={`flex items-stretch border-b transition-colors shrink-0 ${
        isActiveLeaf
          ? 'bg-surface-card border-border'
          : 'bg-surface-alt/50 border-border/40'
      }`}
    >
      {/* Tab strip (scrollable horizontally) */}
      <div className="flex items-stretch flex-1 min-w-0 overflow-x-auto">
        {tabs.length === 0 ? (
          <div className="flex items-center px-3 py-1.5 text-xs text-text-secondary italic">
            选择文档
          </div>
        ) : (
          tabs.map((tab) => {
            const isActive = tab.id === activeTabId
            return (
              <div
                key={tab.id}
                onClick={() => onSetActiveTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setCtxMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
                }}
                title={tab.file.file.name}
                className={`group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 border-r border-border/40 cursor-pointer max-w-[220px] min-w-[120px] transition-colors ${
                  isActive
                    ? 'bg-surface-card text-text'
                    : 'bg-surface-alt/40 text-text-secondary hover:bg-surface-alt/80'
                }`}
              >
                <FileTypeIcon category={tab.file.category} className="w-3 h-3 shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{tab.file.file.name}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  className="p-0.5 rounded text-text-secondary/60 hover:text-error hover:bg-error/10 transition-colors shrink-0"
                  title="关闭标签"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )
          })
        )}
      </div>

      {/* Right-side actions */}
      <div className="flex items-center gap-0.5 px-1.5 shrink-0">
        {/* Share the active tab's document */}
        {canShare && (
          <button
            onClick={() => onShare(activeTab!.file.docId!, activeTab!.file.file.name)}
            className="p-1 rounded text-text-secondary/70 hover:text-primary hover:bg-surface-alt transition-colors"
            title="分享当前文档"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
        )}
        {/* Split right (horizontal: side by side) */}
        <button
          onClick={() => onSplitLeaf('horizontal')}
          className="p-1 rounded text-text-secondary/70 hover:text-primary hover:bg-surface-alt transition-colors"
          title="向右分栏"
        >
          <Columns2 className="w-3.5 h-3.5" />
        </button>
        {/* Split down (vertical: stacked) */}
        <button
          onClick={() => onSplitLeaf('vertical')}
          className="p-1 rounded text-text-secondary/70 hover:text-primary hover:bg-surface-alt transition-colors"
          title="向下分栏"
        >
          <Rows2 className="w-3.5 h-3.5" />
        </button>
        {/* Open document — history + upload popover */}
        <button
          ref={plusBtnRef}
          onClick={openPicker}
          className="p-1 rounded text-text-secondary/70 hover:text-primary hover:bg-surface-alt transition-colors"
          title="打开文档"
        >
          {pickerBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        </button>
        {/* Close the whole leaf group */}
        <button
          onClick={onCloseLeaf}
          className="p-1 rounded text-text-secondary/70 hover:text-error hover:bg-error/10 transition-colors"
          title="关闭此分栏组"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hidden file input shared by the popover */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept=".pdf,.md,.markdown,.docx,.doc,.xlsx,.xls,.pptx,.ppt"
        onChange={handleFileChange}
      />

      {/* Popover anchored to the + button */}
      {pickerOpen && plusRect && (
        <div
          ref={pickerRef}
          className="fixed z-50 w-72 bg-surface-card border border-border rounded-lg shadow-[0_8px_24px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col"
          style={{
            top: plusRect.top,
            right: plusRect.right,
            transformOrigin: 'top right',
            animation: 'docusync-pop-in 140ms ease-out',
          }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-alt/40">
            <span className="text-xs font-medium text-text-secondary">打开文档</span>
            <button
              onClick={() => setPickerOpen(false)}
              className="p-0.5 rounded text-text-secondary/60 hover:text-text transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* History list — all uploaded docs (incl. hidden records), capped at
              MAX_VISIBLE; "更多" opens the searchable full-list modal, picking
              one adds a new tab via onPickHistory. */}
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-border">
            {listRecords.length === 0 ? (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-text-secondary">
                <Clock className="w-3.5 h-3.5" />
                暂无历史文档
              </div>
            ) : (
              <>
                {listRecords.slice(0, MAX_VISIBLE).map((record) => (
                  <button
                    key={record.id}
                    onClick={() => handleHistory(record)}
                    disabled={pickerBusy}
                    className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-surface-alt/50 transition-colors text-left disabled:opacity-50"
                  >
                    <FileTypeIcon category={record.category} className="w-3.5 h-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-text truncate">{record.name}</p>
                      <p className="text-[10px] text-text-secondary mt-0.5">
                        <span className="inline-block px-1 py-0.5 bg-surface-alt rounded text-[9px] mr-1">
                          {getCategoryLabel(record.category)}
                        </span>
                        {formatTime(record.timestamp)}
                      </p>
                    </div>
                  </button>
                ))}
                {listRecords.length > MAX_VISIBLE && (
                  <button
                    onClick={() => setHistModalOpen(true)}
                    disabled={pickerBusy}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                    更多
                  </button>
                )}
              </>
            )}
          </div>

          {/* Upload button */}
          <div className="border-t border-border">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={pickerBusy}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <Upload className="w-3.5 h-3.5" />
              上传新文件
            </button>
          </div>
        </div>
      )}

      {/* Right-click context menu on a tab */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          role="menu"
          className="fixed z-50 w-36 overflow-hidden bg-surface-card border border-border/80 rounded-lg shadow-[0_12px_32px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]"
          style={{
            top: ctxMenu.y,
            left: ctxMenu.x,
            transformOrigin: 'top left',
            animation: 'docusync-pop-in 120ms ease-out',
          }}
        >
          <div className="py-1">
            <button
              role="menuitem"
              onClick={() => handleCtxAction(() => onCloseTab(ctxMenu.tabId))}
              className="w-full flex items-center gap-2 px-2.5 py-[7px] text-[13px] text-text hover:bg-surface-alt transition-colors text-left group"
            >
              <X className="w-3.5 h-3.5 text-text-secondary shrink-0 group-hover:text-error" />
              关闭当前
            </button>
            <button
              role="menuitem"
              onClick={() => handleCtxAction(() => onCloseOtherTabs(ctxMenu.tabId))}
              disabled={tabs.length <= 1}
              className="w-full flex items-center gap-2 px-2.5 py-[7px] text-[13px] text-text hover:bg-surface-alt transition-colors text-left group disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-default"
            >
              <Layers className="w-3.5 h-3.5 text-text-secondary shrink-0 group-hover:text-primary" />
              关闭其他
            </button>

            <div className="my-1 h-px bg-border/50" />

            <button
              role="menuitem"
              onClick={() => handleCtxAction(onCloseLeaf)}
              className="w-full flex items-center gap-2 px-2.5 py-[7px] text-[13px] text-text hover:bg-error/10 hover:text-error transition-colors text-left group"
            >
              <SquareX className="w-3.5 h-3.5 text-text-secondary shrink-0 group-hover:text-error" />
              关闭所有
            </button>
          </div>
        </div>
      )}

      {/* Searchable full-history picker (from the + popover's "more" button).
          Picking a record downloads + opens a NEW TAB in this leaf. */}
      {histModalOpen && (
        <HistoryPickerModal
          records={listRecords}
          onSelect={handleHistory}
          onRemove={onDeleteDocument}
          onClose={() => setHistModalOpen(false)}
        />
      )}
    </div>
  )
}
