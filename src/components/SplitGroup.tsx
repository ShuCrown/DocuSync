import { memo, useCallback, useEffect, useRef } from 'react'
import { ArrowLeftRight, Columns2, Rows2 } from 'lucide-react'
import type {
  SplitNode,
  LeafNode,
  Tab,
  SplitDirection,
} from '../hooks/useEditorLayout'
import type { FileRecord } from '../hooks/useFileHistory'
import { useScrollPosition } from '../hooks/useScrollPosition'
import { ZoomScroller } from './ZoomScroller'
import { DocumentViewer } from './DocumentViewer'
import { TabBar } from './TabBar'
import { FileUpload } from './FileUpload'
import { FileHistory } from './FileHistory'

/**
 * Actions bundle. The consumer (App) memoizes this once so the recursive
 * SplitGroup tree receives stable props and only the path from root to a
 * mutated node re-renders (immutable tree + React.memo).
 */
export interface SplitGroupActions {
  setActiveTab: (tabId: string) => void
  closeTab: (tabId: string) => void
  setActiveLeaf: (leafId: string) => void
  splitLeaf: (leafId: string, direction: SplitDirection) => void
  closeLeaf: (leafId: string) => void
  swapChildren: (splitId: string) => void
  toggleDirection: (splitId: string) => void
  setRatio: (splitId: string, ratio: number) => void
}

interface SplitGroupProps {
  node: SplitNode
  activeLeafId: string | null
  docZoom: number
  shareDisabled: boolean
  history: FileRecord[]
  /** Leaf currently running an upload/download via its + picker (shows spinner). */
  busyLeafId: string | null
  actions: SplitGroupActions
  onShare: (docId: string, fileName: string) => void
  /** Upload a brand-new file into a specific leaf. */
  onPickFileInLeaf: (leafId: string, file: File) => void
  /** Reopen a history record into a specific leaf. */
  onPickHistoryInLeaf: (leafId: string, record: FileRecord) => void
}

// ---------------------------------------------------------------------------
// TabContent — one tab's viewer, kept mounted even when inactive (display:none)
// so PDF/Office parse state and scroll position survive tab switches.
// ---------------------------------------------------------------------------

const TabContent = memo(function TabContent({
  tab,
  docZoom,
  visible,
}: {
  tab: Tab
  docZoom: number
  visible: boolean
}) {
  // Keyed by document identity so the scroll cache follows the document
  // across leaf moves / tree restructuring.
  const scrollRef = useScrollPosition(tab.file.docId ?? tab.file.file.name)

  return (
    <div
      className="h-full flex flex-col"
      style={{ display: visible ? 'flex' : 'none' }}
    >
      <ZoomScroller ref={scrollRef} docZoom={docZoom}>
        <DocumentViewer uploaded={tab.file} onTextExtracted={() => {}} />
      </ZoomScroller>
    </div>
  )
}, (prev, next) =>
  prev.tab === next.tab &&
  prev.docZoom === next.docZoom &&
  prev.visible === next.visible,
)

// ---------------------------------------------------------------------------
// LeafView — TabBar + content area (all tabs mounted, active visible).
// ---------------------------------------------------------------------------

const LeafView = memo(function LeafView({
  leaf,
  isActiveLeaf,
  docZoom,
  shareDisabled,
  history,
  busy,
  actions,
  onShare,
  onPickFileInLeaf,
  onPickHistoryInLeaf,
}: {
  leaf: LeafNode
  isActiveLeaf: boolean
  docZoom: number
  shareDisabled: boolean
  history: FileRecord[]
  busy: boolean
  actions: SplitGroupActions
  onShare: (docId: string, fileName: string) => void
  onPickFileInLeaf: (leafId: string, file: File) => void
  onPickHistoryInLeaf: (leafId: string, record: FileRecord) => void
}) {
  const handleFocus = useCallback(() => {
    if (!isActiveLeaf) actions.setActiveLeaf(leaf.id)
  }, [actions, isActiveLeaf, leaf.id])

  const handlePickFile = useCallback(
    (file: File) => onPickFileInLeaf(leaf.id, file),
    [leaf.id, onPickFileInLeaf],
  )
  const handlePickHistory = useCallback(
    (record: FileRecord) => onPickHistoryInLeaf(leaf.id, record),
    [leaf.id, onPickHistoryInLeaf],
  )

  return (
    <div className="h-full flex flex-col" onMouseDown={handleFocus}>
      <TabBar
        leafId={leaf.id}
        tabs={leaf.tabs}
        activeTabId={leaf.activeTabId}
        isActiveLeaf={isActiveLeaf}
        shareDisabled={shareDisabled}
        history={history}
        pickerBusy={busy}
        onSetActiveTab={actions.setActiveTab}
        onCloseTab={actions.closeTab}
        onSplitLeaf={(dir) => actions.splitLeaf(leaf.id, dir)}
        onCloseLeaf={() => actions.closeLeaf(leaf.id)}
        onShare={onShare}
        onPickFile={handlePickFile}
        onPickHistory={handlePickHistory}
      />
      <div className="flex-1 min-h-0 flex flex-col">
        {leaf.tabs.length === 0 ? (
          // Empty leaf — inline picker (compact upload + history list).
          <div className="flex-1 overflow-auto flex items-start justify-center px-4 py-6">
            <div className="w-full max-w-xl">
              <FileUpload onFile={handlePickFile} currentFile={null} uploading={busy} error={null} compact />
              <FileHistory
                history={history}
                onSelect={handlePickHistory}
                onRemove={() => {}}
                onClear={() => {}}
              />
            </div>
          </div>
        ) : (
          // Render ALL tabs; inactive ones are display:none so their viewer
          // state survives tab switches.
          leaf.tabs.map((tab) => (
            <TabContent
              key={tab.id}
              tab={tab}
              docZoom={docZoom}
              visible={tab.id === leaf.activeTabId}
            />
          ))
        )}
      </div>
    </div>
  )
}, (prev, next) =>
  prev.leaf === next.leaf &&
  prev.isActiveLeaf === next.isActiveLeaf &&
  prev.docZoom === next.docZoom &&
  prev.shareDisabled === next.shareDisabled &&
  prev.history === next.history &&
  prev.busy === next.busy &&
  prev.actions === next.actions &&
  prev.onShare === next.onShare &&
  prev.onPickFileInLeaf === next.onPickFileInLeaf &&
  prev.onPickHistoryInLeaf === next.onPickHistoryInLeaf,
)

// ---------------------------------------------------------------------------
// Divider — drag to resize, hover pill for swap + direction toggle.
// ---------------------------------------------------------------------------

function Divider({
  direction,
  onDrag,
  onSwap,
  onToggleDirection,
}: {
  direction: SplitDirection
  onDrag: (deltaRatio: number) => void
  onSwap: () => void
  onToggleDirection: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-divider-action]')) return
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      // Measure the PANE container (the divider's parent flex box), NOT the
      // divider's own 2px track. The divider is `w-2`/`h-2`, so its own rect
      // is only 2px across — computing against it makes the ratio snap to the
      // 0.2/0.8 clamps on any tiny movement and the panes jump back and forth
      // (visible flicker while dragging).
      const container = containerRef.current.parentElement
      if (!container) return
      const rect = container.getBoundingClientRect()
      const total = direction === 'horizontal' ? rect.width : rect.height
      if (total <= 0) return
      const pos = direction === 'horizontal' ? e.clientX - rect.left : e.clientY - rect.top
      onDrag(Math.max(0.2, Math.min(0.8, pos / total)))
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [direction, onDrag])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      className={`shrink-0 relative group bg-[#e6e5e0] ${
        isHorizontal ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'
      }`}
    >
      {/* Hairline grip */}
      <div
        className={`absolute bg-border/60 group-hover:bg-primary/50 transition-colors rounded-full ${
          isHorizontal
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-8'
            : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-px'
        }`}
      />
      {/* Hover action pill */}
      <div
        data-divider-action
        className={`absolute z-10 flex items-center bg-surface-card border border-border shadow-[0_2px_8px_rgba(0,0,0,0.12)] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-150 ${
          isHorizontal
            ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col py-1 px-0.5 gap-0.5'
            : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-row px-1 py-0.5 gap-0.5'
        }`}
      >
        <button
          data-divider-action
          onClick={onSwap}
          className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
          title="交换两侧"
        >
          <ArrowLeftRight className="w-3 h-3" />
        </button>
        <button
          data-divider-action
          onClick={onToggleDirection}
          className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
          title={isHorizontal ? '切换为上下布局' : '切换为左右布局'}
        >
          {isHorizontal ? <Rows2 className="w-3 h-3" /> : <Columns2 className="w-3 h-3" />}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SplitGroup — recursive. leaf → LeafView; split → two children + Divider.
// Memoized so unchanged subtrees skip re-render during divider drags.
// ---------------------------------------------------------------------------

export const SplitGroup = memo(function SplitGroup(props: SplitGroupProps) {
  const { node, actions } = props

  if (node.kind === 'leaf') {
    return (
      <LeafView
        leaf={node}
        isActiveLeaf={props.activeLeafId === node.id}
        docZoom={props.docZoom}
        shareDisabled={props.shareDisabled}
        history={props.history}
        busy={props.busyLeafId === node.id}
        actions={actions}
        onShare={props.onShare}
        onPickFileInLeaf={props.onPickFileInLeaf}
        onPickHistoryInLeaf={props.onPickHistoryInLeaf}
      />
    )
  }

  // Split node — render two children with a divider between.
  const isHorizontal = node.direction === 'horizontal'

  return (
    <div className={`flex w-full h-full ${isHorizontal ? 'flex-row' : 'flex-col'}`}>
      <div
        className="overflow-hidden"
        style={{ [isHorizontal ? 'width' : 'height']: `${node.ratio * 100}%` }}
      >
        <SplitGroup {...props} node={node.first} />
      </div>
      <Divider
        direction={node.direction}
        onDrag={(ratio) => actions.setRatio(node.id, ratio)}
        onSwap={() => actions.swapChildren(node.id)}
        onToggleDirection={() => actions.toggleDirection(node.id)}
      />
      <div
        className="overflow-hidden flex-1"
        style={{ [isHorizontal ? 'width' : 'height']: `${(1 - node.ratio) * 100}%` }}
      >
        <SplitGroup {...props} node={node.second} />
      </div>
    </div>
  )
}, (prev, next) =>
  prev.node === next.node &&
  prev.activeLeafId === next.activeLeafId &&
  prev.docZoom === next.docZoom &&
  prev.shareDisabled === next.shareDisabled &&
  prev.history === next.history &&
  prev.busyLeafId === next.busyLeafId &&
  prev.actions === next.actions &&
  prev.onShare === next.onShare &&
  prev.onPickFileInLeaf === next.onPickFileInLeaf &&
  prev.onPickHistoryInLeaf === next.onPickHistoryInLeaf,
)
