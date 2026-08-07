import { invoke } from '@tauri-apps/api/core'

export interface WindowInsets {
  /** Titlebar safe-area inset from the top of the window frame (CSS px). */
  top: number
}

let cached: WindowInsets | null = null

/**
 * Returns the window's content-area inset (titlebar height on macOS, 0 on
 * Windows/Linux). Resolved once per app lifetime and cached — the value only
 * changes with OS chrome, not with window geometry, so one native round-trip
 * is enough. Falls back to 0 (no compensation) if the command is unavailable.
 */
export async function getWindowInsets(): Promise<WindowInsets> {
  if (cached) return cached

  try {
    cached = await invoke<WindowInsets>('get_window_insets')
  } catch (err) {
    console.warn('[useWindowInsets] failed to read native insets:', err)
    cached = { top: 0 }
  }

  return cached
}
