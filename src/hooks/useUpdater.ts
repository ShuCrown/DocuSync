import { useSyncExternalStore } from 'react'
import { check, type Update } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '../utils/tauri'

/**
 * Auto-update state for the Tauri desktop build.
 *
 * A module-level store (mirrors the pattern in `storage-mode.ts`) so that both
 * the startup banner (App.tsx) and the settings panel share one check. In the
 * browser this is inert: every action is guarded by `isTauri()` and the
 * updater plugins are only ever called inside the desktop shell.
 *
 * The live `Update` object (not serializable) is held in a module ref, outside
 * React state; only its scalar fields (version, notes) are exposed.
 */

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'installing'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** Version the running app was built as. */
  currentVersion: string | null
  /** Latest version reported by the manifest, when an update is available. */
  version: string | null
  /** Release notes for the available update. */
  notes: string | null
  error: string | null
  /** Download progress 0..1, or null when not downloading / total unknown. */
  progress: number | null
}

const initialState: UpdateState = {
  status: 'idle',
  currentVersion: null,
  version: null,
  notes: null,
  error: null,
  progress: null,
}

let state: UpdateState = initialState
const listeners = new Set<() => void>()
// Hold the live Update object outside React state (it carries the install API).
let pendingUpdate: Update | null = null
let autoChecked = false

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): UpdateState {
  return state
}

/** Subscribe to updater state from a React component. */
export function useUpdater(): UpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** Query the manifest endpoint for a newer release. No-op in the browser. */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return
  set({ status: 'checking', error: null })
  try {
    const [update, current] = await Promise.all([
      check(),
      getVersion().catch(() => null),
    ])
    if (update) {
      pendingUpdate = update
      set({
        status: 'available',
        currentVersion: current,
        version: update.version,
        notes: update.body ?? null,
        progress: null,
      })
    } else {
      pendingUpdate = null
      set({ status: 'up-to-date', currentVersion: current, version: null, notes: null, progress: null })
    }
  } catch (err) {
    set({ status: 'error', error: errMsg(err) })
  }
}

/** Download and install the pending update, then relaunch the app. */
export async function downloadAndInstallUpdate(): Promise<void> {
  const update = pendingUpdate
  if (!update) return
  set({ status: 'downloading', progress: null, error: null })
  try {
    let total = 0
    let downloaded = 0
    await update.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength ?? 0
        downloaded = 0
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength ?? 0
        if (total > 0) set({ progress: Math.min(1, downloaded / total) })
      }
    })
    // downloadAndInstall resolves after the bundle is written; relaunch to apply.
    set({ status: 'installing', progress: null })
    await relaunch()
  } catch (err) {
    set({ status: 'error', error: errMsg(err) })
  }
}

/** Silent check on startup - runs at most once per session. */
export async function autoCheckForUpdate(): Promise<void> {
  if (!isTauri() || autoChecked) return
  autoChecked = true
  await checkForUpdate()
}

/** Reset back to idle (e.g. after dismissing the banner). */
export function resetUpdateState(): void {
  pendingUpdate = null
  set({ ...initialState })
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
