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
}

export function useSplitView(): SplitViewState & SplitViewActions {
  const [mode, setMode] = useState<SplitMode>('single')
  const [direction, setDirection] = useState<SplitDirection>('horizontal')
  const [activePane, setActivePane] = useState<ActivePane>('a')
  const [paneA, setPaneA] = useState<UploadedFile | null>(null)
  const [paneB, setPaneB] = useState<UploadedFile | null>(null)
  const [splitRatio, setSplitRatio] = useState(0.5)
  const [pickerOpen, setPickerOpen] = useState(false)

  const openPicker = useCallback(() => setPickerOpen(true), [])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  const enterSplit = useCallback((fileB: UploadedFile) => {
    setPaneB(fileB)
    setMode('split')
    setPickerOpen(false)
    setActivePane('a')
  }, [])

  // Enter split mode showing picker in pane B (no file selected yet)
  const enterSplitPicker = useCallback(() => {
    setPaneB(null)
    setMode('split')
    setPickerOpen(false)
    setActivePane('b')
  }, [])

  const exitSplit = useCallback(() => {
    setMode('single')
    setPaneB(null)
    setSplitRatio(0.5)
    setActivePane('a')
  }, [])

  const closePaneA = useCallback(() => {
    // Close A → B becomes main view
    setPaneA(paneB)
    setPaneB(null)
    setMode('single')
    setSplitRatio(0.5)
    setActivePane('a')
  }, [paneB])

  const closePaneB = useCallback(() => {
    // Close B → back to single with A
    setPaneB(null)
    setMode('single')
    setSplitRatio(0.5)
    setActivePane('a')
  }, [])

  const replacePaneB = useCallback((file: UploadedFile) => {
    setPaneB(file)
    setPickerOpen(false)
  }, [])

  const swapPanes = useCallback(() => {
    setPaneA(paneB)
    setPaneB(paneA)
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

  return {
    mode,
    direction,
    activePane,
    paneA,
    paneB,
    splitRatio,
    pickerOpen,
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
  }
}
