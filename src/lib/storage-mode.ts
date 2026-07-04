// Storage mode state for the DocuSync app.
//
// The app can run in two storage modes:
//   - 'local'  : files + metadata live on this machine (Tauri only)
//   - 'remote' : files + metadata live on the Cloudflare backend (any env)
//
// In a browser, only 'remote' is available — the local impl requires the
// Tauri fs/sql plugins which only exist inside the desktop shell. In Tauri
// the default is 'local', but the user can switch to 'remote' at any time
// from the settings panel.
//
// Mode is persisted to localStorage so it survives reloads. Switching the
// mode reloads the page (handled by the settings panel) to flush in-memory
// caches and re-fetch history from the new data source.

import { isTauri } from '../utils/tauri'
import { appDataDir, join } from '@tauri-apps/api/path'
import { open } from '@tauri-apps/plugin-shell'
import { exists, mkdir } from '@tauri-apps/plugin-fs'

export type StorageMode = 'local' | 'remote'

const STORAGE_KEY = 'docusync_storage_mode'
const REMOTE_BASE_KEY = 'docusync_remote_api_base'
const DEFAULT_REMOTE_BASE = 'https://docusync.pages.dev/api'

type Listener = () => void
const listeners = new Set<Listener>()

function notify() {
  listeners.forEach((l) => l())
}

function getDefaultMode(): StorageMode {
  // Browser can never run local — no fs/sql plugins available.
  return isTauri() ? 'local' : 'remote'
}

/** Current effective storage mode (validated against the environment). */
export function getStorageMode(): StorageMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'local' || stored === 'remote') {
    // A stored 'local' is invalid in a browser — fall back to remote.
    if (stored === 'local' && !isTauri()) return 'remote'
    return stored
  }
  return getDefaultMode()
}

/** Persist a new mode. Caller is responsible for reloading after switch. */
export function setStorageMode(mode: StorageMode): void {
  if (mode === 'local' && !isTauri()) {
    throw new Error('本地模式仅在桌面应用中可用')
  }
  localStorage.setItem(STORAGE_KEY, mode)
  notify()
}

/** Convenience flag for api.ts dispatch. */
export function isLocalMode(): boolean {
  return getStorageMode() === 'local'
}

/** Whether the local mode option is available in this environment. */
export function canUseLocalMode(): boolean {
  return isTauri()
}

// ---------------------------------------------------------------------------
// Remote API base (used by both the remote path in api.ts and the local
// summarize path in api-local.ts when calling the deployed Worker)
// ---------------------------------------------------------------------------

export function getRemoteApiBase(): string {
  return localStorage.getItem(REMOTE_BASE_KEY) || DEFAULT_REMOTE_BASE
}

export function setRemoteApiBase(base: string): void {
  const trimmed = base.trim()
  if (trimmed) {
    localStorage.setItem(REMOTE_BASE_KEY, trimmed)
  } else {
    localStorage.removeItem(REMOTE_BASE_KEY)
  }
  notify()
}

export function resetRemoteApiBase(): void {
  localStorage.removeItem(REMOTE_BASE_KEY)
  notify()
}

// ---------------------------------------------------------------------------
// Subscribe — for components that need to re-render when the mode changes
// (the settings panel reads this; everything else just reloads the page).
// ---------------------------------------------------------------------------

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// ---------------------------------------------------------------------------
// Local storage path helpers (Tauri only)
// ---------------------------------------------------------------------------

/** Root directory where local files and the SQLite database live. */
export async function getLocalStorageRoot(): Promise<string> {
  return join(await appDataDir(), 'docusync')
}

/** Ensure the local storage root exists and open it in the system file manager. */
export async function openLocalStorageFolder(): Promise<void> {
  const root = await getLocalStorageRoot()
  if (!(await exists(root))) {
    await mkdir(root, { recursive: true })
  }
  await open(root)
}
