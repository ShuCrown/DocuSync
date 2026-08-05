/**
 * Tauri environment detection and utilities
 */

/** Check if running inside Tauri */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/** Check if running in browser (not Tauri) */
export function isBrowser(): boolean {
  return !isTauri()
}
