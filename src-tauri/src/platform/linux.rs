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
