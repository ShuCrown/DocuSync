import { useState, useCallback, useMemo } from 'react'
import type { UploadedFile } from './useFileUpload'

export type SplitDirection = 'horizontal' | 'vertical'

export interface Tab {
  id: string
  file: UploadedFile
}

export interface LeafNode {
  kind: 'leaf'
  id: string
  tabs: Tab[]
  activeTabId: string | null
}

export interface SplitNodeT {
  kind: 'split'
  id: string
  direction: SplitDirection
  ratio: number // share of `first` child, 0.2..0.8
  first: SplitNode
  second: SplitNode
}

export type SplitNode = LeafNode | SplitNodeT

export interface EditorLayoutState {
  /** Root of the split tree. `null` = home page (no documents open). */
  root: SplitNode | null
  /** Which leaf receives new tabs and selection-toolbar focus. */
  activeLeafId: string | null
}

export interface EditorLayoutActions {
  /** Add a tab to a leaf (default: active leaf, or a new leaf if tree is empty). */
  openTab: (file: UploadedFile, leafId?: string | null) => string
  /** Close a tab by id; collapses its leaf if it becomes empty. */
  closeTab: (tabId: string) => void
  /** Close every tab in the same leaf except the given one. */
  closeOtherTabs: (tabId: string) => void
  /** Switch the visible tab inside a leaf. */
  setActiveTab: (tabId: string) => void
  /** Focus a leaf (becomes the target for new tabs / selection toolbar). */
  setActiveLeaf: (leafId: string) => void
  /** Wrap a leaf in a new split with an empty sibling leaf (shows picker UI). */
  splitLeaf: (leafId: string, direction: SplitDirection) => string
  /** Remove a leaf entirely; parent split collapses to the surviving sibling. */
  closeLeaf: (leafId: string) => void
  /** Swap the two children of a split node. */
  swapChildren: (splitId: string) => void
  /** Toggle a split node's direction (horizontal ↔ vertical). */
  toggleDirection: (splitId: string) => void
  /** Update a split node's ratio (clamped 0.2..0.8). */
  setRatio: (splitId: string, ratio: number) => void
  /** Replace a leaf's tab file (used by history re-pick in the same slot). */
  replaceTab: (tabId: string, file: UploadedFile) => void
  /** Tear down the whole tree — back to the home page. */
  closeAll: () => void
}

export type EditorLayout = EditorLayoutState & EditorLayoutActions

// --- Pure tree helpers -------------------------------------------------------

function uid(): string {
  // crypto.randomUUID is available in all modern browsers and Tauri webviews.
  return globalThis.crypto?.randomUUID?.() ?? `id-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

/** Locate a leaf by id anywhere in the tree. */
function findLeaf(node: SplitNode, leafId: string): LeafNode | null {
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  return findLeaf(node.first, leafId) ?? findLeaf(node.second, leafId)
}

/** Find the leaf that contains a given tab id. */
function findLeafByTab(node: SplitNode, tabId: string): LeafNode | null {
  if (node.kind === 'leaf') return node.tabs.some((t) => t.id === tabId) ? node : null
  return findLeafByTab(node.first, tabId) ?? findLeafByTab(node.second, tabId)
}

/** Any leaf in the tree (leftmost descent) — used as a fallback. */
function anyLeaf(node: SplitNode): LeafNode {
  return node.kind === 'leaf' ? node : anyLeaf(node.first)
}

/** Immutable leaf update by id. */
function updateLeaf(
  node: SplitNode,
  leafId: string,
  updater: (n: LeafNode) => LeafNode,
): SplitNode {
  if (node.kind === 'leaf') return node.id === leafId ? updater(node) : node
  return { ...node, first: updateLeaf(node.first, leafId, updater), second: updateLeaf(node.second, leafId, updater) }
}

/** Immutable split update by id. */
function updateSplit(
  node: SplitNode,
  splitId: string,
  updater: (n: SplitNodeT) => SplitNodeT,
): SplitNode {
  if (node.kind === 'leaf') return node
  if (node.id === splitId) return updater(node)
  return { ...node, first: updateSplit(node.first, splitId, updater), second: updateSplit(node.second, splitId, updater) }
}

/**
 * Replace a node by id. If the replacement is `null`, the parent split
 * collapses to its surviving child (and recursively upward).
 */
function replaceNode(
  root: SplitNode,
  targetId: string,
  replacement: SplitNode | null,
): SplitNode | null {
  if (root.id === targetId) return replacement
  if (root.kind === 'split') {
    const f = replaceNode(root.first, targetId, replacement)
    const s = replaceNode(root.second, targetId, replacement)
    if (f === null) return s
    if (s === null) return f
    return { ...root, first: f, second: s }
  }
  return root
}

// --- Hook --------------------------------------------------------------------

export function useEditorLayout(): EditorLayout {
  const [root, setRoot] = useState<SplitNode | null>(null)
  const [activeLeafId, setActiveLeafId] = useState<string | null>(null)

  const openTab = useCallback((file: UploadedFile, leafId?: string | null): string => {
    const tabId = uid()
    setRoot((prev) => {
      // No tree yet → spawn a single-leaf root.
      if (prev === null) {
        const leaf: LeafNode = { kind: 'leaf', id: uid(), tabs: [{ id: tabId, file }], activeTabId: tabId }
        setActiveLeafId(leaf.id)
        return leaf
      }
      // Resolve target leaf: explicit > active > any.
      const target =
        (leafId ? findLeaf(prev, leafId) : null) ??
        (activeLeafId ? findLeaf(prev, activeLeafId) : null) ??
        anyLeaf(prev)
      const next = updateLeaf(prev, target.id, (l) => ({
        ...l,
        tabs: [...l.tabs, { id: tabId, file }],
        activeTabId: tabId,
      }))
      setActiveLeafId(target.id)
      return next
    })
    return tabId
  }, [activeLeafId])

  const closeTab = useCallback((tabId: string) => {
    setRoot((prev) => {
      if (prev === null) return null
      const leaf = findLeafByTab(prev, tabId)
      if (leaf === null) return prev

      const idx = leaf.tabs.findIndex((t) => t.id === tabId)
      const remaining = leaf.tabs.filter((t) => t.id !== tabId)

      // Leaf still has tabs → just drop this one and pick a new active tab.
      if (remaining.length > 0) {
        const nextActive = leaf.activeTabId === tabId
          ? (remaining[Math.max(0, idx - 1)]?.id ?? remaining[0]!.id)
          : leaf.activeTabId
        return updateLeaf(prev, leaf.id, (l) => ({ ...l, tabs: remaining, activeTabId: nextActive }))
      }

      // Leaf becomes empty → collapse parent split (or whole tree goes home).
      const collapsed = replaceNode(prev, leaf.id, null)
      if (collapsed === null) {
        setActiveLeafId(null)
        return null
      }
      // Move active leaf to a surviving leaf if we just closed it.
      setActiveLeafId((cur) => (cur === leaf.id ? anyLeaf(collapsed).id : cur))
      return collapsed
    })
  }, [])

  const closeOtherTabs = useCallback((tabId: string) => {
    setRoot((prev) => {
      if (prev === null) return prev
      const leaf = findLeafByTab(prev, tabId)
      if (leaf === null || leaf.tabs.length <= 1) return prev
      return updateLeaf(prev, leaf.id, (l) => ({
        ...l,
        tabs: l.tabs.filter((t) => t.id === tabId),
        activeTabId: tabId,
      }))
    })
  }, [])

  const setActiveTab = useCallback((tabId: string) => {
    setRoot((prev) => {
      if (prev === null) return prev
      const leaf = findLeafByTab(prev, tabId)
      if (leaf === null) return prev
      setActiveLeafId(leaf.id)
      return updateLeaf(prev, leaf.id, (l) => ({ ...l, activeTabId: tabId }))
    })
  }, [])

  const setActiveLeaf = useCallback((leafId: string) => {
    setActiveLeafId(leafId)
  }, [])

  const splitLeaf = useCallback((leafId: string, direction: SplitDirection): string => {
    const newLeaf: LeafNode = { kind: 'leaf', id: uid(), tabs: [], activeTabId: null }
    setRoot((prev) => {
      if (prev === null) return prev
      // Wrap the target leaf in a new split: existing leaf stays `first`,
      // new empty leaf becomes `second` (matches VSCode "split right/down").
      const wrap = (node: SplitNode): SplitNode => {
        if (node.kind === 'leaf') {
          if (node.id === leafId) {
            const split: SplitNodeT = {
              kind: 'split',
              id: uid(),
              direction,
              ratio: 0.5,
              first: node,
              second: newLeaf,
            }
            return split
          }
          return node
        }
        return { ...node, first: wrap(node.first), second: wrap(node.second) }
      }
      return wrap(prev)
    })
    setActiveLeafId(newLeaf.id)
    return newLeaf.id
  }, [])

  const closeLeaf = useCallback((leafId: string) => {
    setRoot((prev) => {
      if (prev === null) return null
      const collapsed = replaceNode(prev, leafId, null)
      if (collapsed === null) {
        setActiveLeafId(null)
        return null
      }
      setActiveLeafId((cur) => (cur === leafId ? anyLeaf(collapsed).id : cur))
      return collapsed
    })
  }, [])

  const swapChildren = useCallback((splitId: string) => {
    setRoot((prev) => {
      if (prev === null || prev.kind === 'leaf') return prev
      return updateSplit(prev, splitId, (s) => ({ ...s, first: s.second, second: s.first }))
    })
  }, [])

  const toggleDirection = useCallback((splitId: string) => {
    setRoot((prev) => {
      if (prev === null || prev.kind === 'leaf') return prev
      return updateSplit(prev, splitId, (s) => ({
        ...s,
        direction: s.direction === 'horizontal' ? 'vertical' : 'horizontal',
      }))
    })
  }, [])

  const setRatio = useCallback((splitId: string, ratio: number) => {
    const clamped = Math.max(0.2, Math.min(0.8, ratio))
    setRoot((prev) => {
      if (prev === null || prev.kind === 'leaf') return prev
      return updateSplit(prev, splitId, (s) => ({ ...s, ratio: clamped }))
    })
  }, [])

  const replaceTab = useCallback((tabId: string, file: UploadedFile) => {
    setRoot((prev) => {
      if (prev === null) return prev
      const leaf = findLeafByTab(prev, tabId)
      if (leaf === null) return prev
      setActiveLeafId(leaf.id)
      return updateLeaf(prev, leaf.id, (l) => ({
        ...l,
        tabs: l.tabs.map((t) => (t.id === tabId ? { ...t, file } : t)),
        activeTabId: tabId,
      }))
    })
  }, [])

  const closeAll = useCallback(() => {
    setRoot(null)
    setActiveLeafId(null)
  }, [])

  return useMemo(
    () => ({
      root,
      activeLeafId,
      openTab,
      closeTab,
      closeOtherTabs,
      setActiveTab,
      setActiveLeaf,
      splitLeaf,
      closeLeaf,
      swapChildren,
      toggleDirection,
      setRatio,
      replaceTab,
      closeAll,
    }),
    [root, activeLeafId, openTab, closeTab, closeOtherTabs, setActiveTab, setActiveLeaf, splitLeaf, closeLeaf, swapChildren, toggleDirection, setRatio, replaceTab, closeAll],
  )
}

// --- Selectors (pure helpers for consumers) ----------------------------------

/** Resolve the file currently shown in the active leaf, if any. */
export function getActiveFile(root: SplitNode | null, activeLeafId: string | null): UploadedFile | null {
  if (root === null || activeLeafId === null) return null
  const leaf = findLeaf(root, activeLeafId)
  if (!leaf || leaf.activeTabId === null) return null
  return leaf.tabs.find((t) => t.id === leaf.activeTabId)?.file ?? null
}
