import { useCallback, useRef, useEffect } from 'react'
import { ArrowLeftRight, Columns2, Rows2 } from 'lucide-react'
import type { SplitDirection } from '../hooks/useSplitView'

interface SplitPaneProps {
  direction: SplitDirection
  splitRatio: number
  onSplitRatioChange: (ratio: number) => void
  onSwap?: () => void
  onDirectionChange?: () => void
  paneA: React.ReactNode
  paneB: React.ReactNode
}

export function SplitPane({
  direction,
  splitRatio,
  onSplitRatioChange,
  onSwap,
  onDirectionChange,
  paneA,
  paneB,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag if clicking on action buttons
    if ((e.target as HTMLElement).closest('[data-divider-action]')) return
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
    document.body.style.userSelect = 'none'
  }, [direction])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let ratio: number
      if (direction === 'horizontal') {
        ratio = (e.clientX - rect.left) / rect.width
      } else {
        ratio = (e.clientY - rect.top) / rect.height
      }
      onSplitRatioChange(Math.max(0.2, Math.min(0.8, ratio)))
    }

    const handleMouseUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [direction, onSplitRatioChange])

  const isHorizontal = direction === 'horizontal'

  return (
    <div
      ref={containerRef}
      className={`flex w-full h-full ${isHorizontal ? 'flex-row' : 'flex-col'}`}
    >
      {/* Pane A */}
      <div
        className="overflow-auto"
        style={{
          [isHorizontal ? 'width' : 'height']: `${splitRatio * 100}%`,
        }}
      >
        {paneA}
      </div>

      {/* Divider with action buttons */}
      <div
        onMouseDown={handleMouseDown}
        className={`
          shrink-0 bg-border relative group
          ${isHorizontal ? 'w-3 cursor-col-resize' : 'h-3 cursor-row-resize'}
        `}
      >
        {/* Center action pill — visible on hover */}
        <div
          data-divider-action
          className={`
            absolute z-10 flex items-center bg-surface-card border border-border
            shadow-[0_2px_8px_rgba(0,0,0,0.12)] rounded-full
            opacity-0 group-hover:opacity-100 transition-opacity duration-150
            ${isHorizontal
              ? 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-col py-1 px-0.5 gap-0.5'
              : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex-row px-1 py-0.5 gap-0.5'
            }
          `}
        >
          {/* Swap button */}
          <button
            data-divider-action
            onClick={onSwap}
            className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title="交换左右"
          >
            <ArrowLeftRight className="w-3 h-3" />
          </button>

          {/* Direction toggle */}
          <button
            data-divider-action
            onClick={onDirectionChange}
            className="p-1 rounded-full text-text-secondary hover:text-primary hover:bg-surface-alt transition-colors"
            title={isHorizontal ? '切换为上下布局' : '切换为左右布局'}
          >
            {isHorizontal ? (
              <Rows2 className="w-3 h-3" />
            ) : (
              <Columns2 className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>

      {/* Pane B */}
      <div
        className="overflow-auto flex-1"
        style={{
          [isHorizontal ? 'width' : 'height']: `${(1 - splitRatio) * 100}%`,
        }}
      >
        {paneB}
      </div>
    </div>
  )
}
