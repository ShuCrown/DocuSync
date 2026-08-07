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
