//! Linux native window metrics.
//!
//! Same as Windows: the webview content area starts below the window frame,
//! and `getBoundingClientRect()` agrees with the child-webview coordinate
//! space, so the titlebar inset is 0. Future Linux-specific layout quirks
//! (Wayland vs X11 insets, CSD header bars, ...) belong in this file only.

/// Top inset of the content area relative to the window frame (logical px).
pub fn content_layout_top(_window: &tauri::Window) -> Result<f64, String> {
    Ok(0.0)
}

/// Whether the app is currently the active application.
///
/// Not yet implemented on Linux — returns `true` so the floating chat window
/// keeps its current always-on-top behavior (no auto-hide when switching apps).
pub fn app_is_active() -> bool {
    true
}

/// Whether `window` is currently minimized. Fallback on Linux: returns `false`
/// (the app-active check covers app switches).
pub fn main_window_minimized(_window: &tauri::Window) -> bool {
    false
}

/// Show `window` without stealing focus. Fallback on Linux: plain `show()`
/// (may take focus; acceptable until a native implementation exists).
pub fn show_window_without_focus(window: &tauri::Window) {
    let _ = window.show();
}
