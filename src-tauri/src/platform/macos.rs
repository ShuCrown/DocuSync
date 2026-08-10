//! macOS native window metrics.
//!
//! We ask AppKit directly for `NSWindow.contentLayoutRect` — the region of
//! the window *not* covered by the titlebar/toolbar. On macOS,
//! `getBoundingClientRect()` in the webview is measured against the **window
//! frame**, while child webviews added via `add_child` are positioned relative
//! to the **content view**. The difference is exactly
//!
//! ```text
//! top = frame.height - contentLayoutRect.origin.y - contentLayoutRect.height
//! ```
//!
//! which varies per macOS version (≈28pt Ventura, ≈30pt Sonoma, ≈32pt
//! Sequoia) and changes under Retina, fullscreen, hidden-titlebar or overlay
//! titlebar setups. Querying it at runtime removes every hardcoded offset and
//! the whole "magic +24/+36" class of bugs. Changes to stage-manager / notch /
//! toolbar / traffic-light handling belong in this file only.

use objc2::{class, msg_send};
use objc2::runtime::AnyObject;
use objc2_foundation::NSRect;
use std::sync::mpsc;

/// Top inset of the content area relative to the window frame, in logical
/// points (1:1 with CSS px — Tauri child-webview bounds are logical units).
///
/// Returns 0 when the window has no titlebar inset (e.g. borderless).
pub fn content_layout_top(window: &tauri::Window) -> Result<f64, String> {
    // `NSWindow` methods must run on the main thread; a `#[tauri::command]`
    // may be dispatched on any thread, so hop to the main thread and back.
    let ns_window = window
        .ns_window()
        .map_err(|e| format!("failed to obtain NSWindow handle: {e}"))? as usize;

    let (tx, rx) = mpsc::channel();
    window
        .run_on_main_thread(move || {
            let obj = ns_window as *mut AnyObject;
            // Safety: `obj` is the app's live NSWindow; we only read two
            // layout getters and transfer no ownership.
            let top = unsafe {
                let frame: NSRect = msg_send![obj, frame];
                let content: NSRect = msg_send![obj, contentLayoutRect];
                frame.size.height - content.origin.y - content.size.height
            };
            let _ = tx.send(top.max(0.0));
        })
        .map_err(|e| format!("failed to schedule main-thread query: {e}"))?;

    rx.recv().map_err(|e| format!("main-thread query failed: {e}"))
}

/// Whether the DocuSync app is currently the active application.
///
/// Mirrors `[NSApplication isActive]`. Must be called on the main thread —
/// window-event handlers already are. When the user switches to another app,
/// this flips to false and the floating chat window hides.
pub fn app_is_active() -> bool {
    unsafe {
        let app: *mut AnyObject = msg_send![class!(NSApplication), sharedApplication];
        let active: bool = msg_send![app, isActive];
        active
    }
}

/// Whether `window` is currently minimized (miniaturized) to the Dock.
///
/// Must be read on the main thread; window-event handlers already are.
pub fn main_window_minimized(window: &tauri::Window) -> bool {
    let Ok(ns_window) = window.ns_window() else { return false };
    let ns_window = ns_window as *mut AnyObject;
    unsafe {
        let is_mini: bool = msg_send![ns_window, isMiniaturized];
        is_mini
    }
}

/// Show `window` without making it key.
///
/// tao's `show()` maps to `makeKeyAndOrderFront`, which would steal keyboard
/// focus from the document window the user just clicked to return to the app.
/// `orderFront:` displays the window at the front of its level without keying
/// it, so the document stays interactive.
pub fn show_window_without_focus(window: &tauri::Window) {
    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as *mut AnyObject;
    unsafe {
        let _: () = msg_send![ns_window, orderFront: std::ptr::null_mut::<AnyObject>()];
    }
}
