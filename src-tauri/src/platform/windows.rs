//! Windows native window metrics.
//!
//! On Windows the webview content area already starts below the window frame,
//! and `getBoundingClientRect()` coordinates agree with the child-webview
//! coordinate space used by `add_child`, so the titlebar inset is 0. Future
//! Windows-specific layout quirks (DPI awareness, `DWMWA_EXTENDED_FRAME`
//! effects, custom frame drag regions, ...) belong in this file only.

/// Top inset of the content area relative to the window frame (logical px).
pub fn content_layout_top(_window: &tauri::Window) -> Result<f64, String> {
    Ok(0.0)
}

/// Whether the app is currently the active application.
///
/// Not yet implemented on Windows — returns `true` so the floating chat window
/// keeps its current always-on-top behavior (no auto-hide when switching apps).
pub fn app_is_active() -> bool {
    true
}

/// Whether `window` is currently minimized. Fallback on Windows: minimize
/// deactivates the app, which `app_is_active()` already reflects, so this
/// stays `false` and the app-active check covers it.
pub fn main_window_minimized(_window: &tauri::Window) -> bool {
    false
}

/// Show `window` without stealing focus. Fallback on Windows: plain `show()`
/// (may take focus; acceptable until a native implementation exists).
pub fn show_window_without_focus(window: &tauri::Window) {
    let _ = window.show();
}
