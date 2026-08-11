import { useState, useCallback } from 'react'
import type { UploadedFile } from './useFileUpload'

export type SplitDirection = 'horizontal' | 'vertical'
export type SplitMode = 'single' | 'split'
export type ActivePane = 'a' | 'b'

export interface SplitViewState {
  mode: SplitMode
  direction: SplitDirection
  activePane: ActivePane
  paneA: UploadedFile | null
  paneB: UploadedFile | null
  splitRatio: number
  pickerOpen: boolean
  /** Pane temporarily hidden in split view (kept mounted, restored via an edge tab). */
  hiddenPane: ActivePane | null
}

export interface SplitViewActions {
  openPicker: () => void
  closePicker: () => void
  enterSplit: (fileB: UploadedFile) => void
  enterSplitPicker: () => void
  exitSplit: () => void
  closePaneA: () => void
  closePaneB: () => void
  replacePaneB: (file: UploadedFile) => void
  swapPanes: () => void
  setActivePane: (pane: ActivePane) => void
  toggleDirection: () => void
  setSplitRatio: (ratio: number) => void
  setPaneA: (file: UploadedFile | null) => void
  setPaneB: (file: UploadedFile | null) => void
  hidePane: (pane: ActivePane) => void
  showPane: (pane: ActivePane) => void
}

export function useSplitView(): SplitViewState & SplitViewActions {
  const [mode, setMode] = useState<SplitMode>('single')
  const [direction, setDirection] = useState<SplitDirection>('horizontal')
  const [activePane, setActivePane] = useState<ActivePane>('a')
  const [paneA, setPaneA] = useState<UploadedFile | null>(null)
  const [paneB, setPaneB] = useState<UploadedFile | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [hiddenPane, setHiddenPane] = useState<ActivePane | null>(null)

  const openPicker = useCallback(() => setPickerOpen(true), [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  const enterSplit = useCallback((fileB: UploadedFile) => {
    setPaneB(fileB)
    setMode('split')
    setPickerOpen(false)
    setActivePane('a')
    setHiddenPane(null)
  }, [])

  // Enter split mode showing picker in pane B (no file selected yet)
  const enterSplitPicker = useCallback(() => {
    setPaneB(null)
    setMode('split')
    setPickerOpen(false)
    setActivePane('b')
    setHiddenPane(null)
  }, [])

  const exitSplit = useCallback(() => {
    setMode('single')
    setPaneB(null)
    setSplitRatio(0.5)
    setActivePane('a')
    setHiddenPane(null)
  }, [])

  const closePaneA = useCallback(() => {
    // Close A → B becomes main view
    setPaneA(paneB)
    setPaneB(null)
    setMode('single')
    setSplitRatio(0.5)
    setActivePane('a')
    setHiddenPane(null)
  }, [paneB])

  const closePaneB = useCallback(() => {
    // Close B → back to single with A
    setPaneB(null)
    setMode('single')
    setSplitRatio(0.5)
    setActivePane('a')
    setHiddenPane(null)
  }, [])

  const replacePaneB = useCallback((file: UploadedFile) => {
    setPaneB(file)
    setPickerOpen(false)
  }, [])

  const swapPanes = useCallback(() => {
    setPaneA(paneB)
    setPaneB(paneA)
    // A hidden pane follows its document through the swap.
    setHiddenPane((h) => (h === 'a' ? 'b' : h === 'b' ? 'a' : null))
  }, [paneA, paneB])

  const toggleDirection = useCallback(() => {
    setDirection((d) => (d === 'horizontal' ? 'vertical' : 'horizontal'))
  }, [])

  const handleSetActivePane = useCallback((pane: ActivePane) => {
    setActivePane(pane)
  }, [])

  const handleSetSplitRatio = useCallback((ratio: number) => {
    setSplitRatio(Math.max(0.2, Math.min(0.8, ratio)))
  }, [])

  // Hide one pane in split view — the other fills the area, the hidden pane
  // stays mounted (display:none) so its viewer state survives. Focus moves to
  // the visible pane so selection/chat stays usable.
  const hidePane = useCallback((pane: ActivePane) => {
    setHiddenPane(pane)
    setActivePane(pane === 'a' ? 'b' : 'a')
  }, [])

  const showPane = useCallback((pane: ActivePane) => {
    setHiddenPane((h) => (h === pane ? null : h))
  }, [])

  return {
    mode,
    direction,
    activePane,
    paneA,
    paneB,
    splitRatio,
    pickerOpen,
    hiddenPane,
    openPicker,
    closePicker,
    enterSplit,
    enterSplitPicker,
    exitSplit,
    closePaneA,
    closePaneB,
    replacePaneB,
    swapPanes,
    setActivePane: handleSetActivePane,
    toggleDirection,
    setSplitRatio: handleSetSplitRatio,
    setPaneA,
    setPaneB,
    hidePane,
    showPane,
  }
}
