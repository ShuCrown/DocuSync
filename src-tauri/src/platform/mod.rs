//! Platform-specific native window metrics.
//!
//! Every platform exposes the same [`content_layout_top`] surface: the
//! distance, in logical points (1:1 with CSS px), between the top of the
//! window frame and the top of the window's *content area* — i.e. the
//! titlebar inset. The React layer adds this value to
//! `getBoundingClientRect().top` before sending child-webview bounds to Rust,
//! so the native webview lines up with its placeholder on every OS without
//! any hardcoded 28/30/32px magic numbers in shared or frontend code.
//!
//! Platform-specific quirks (DPI, Traffic Lights, Notch, Stage Manager,
//! titlebar overlays, future native capabilities such as auto-update or
//! tray) belong in the matching platform file — never in `lib.rs` or React.

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "linux")]
mod linux;

#[cfg(target_os = "macos")]
pub use macos::content_layout_top;
#[cfg(target_os = "windows")]
pub use windows::content_layout_top;
#[cfg(target_os = "linux")]
pub use linux::content_layout_top;

#[cfg(target_os = "macos")]
pub use macos::app_is_active;
#[cfg(target_os = "windows")]
pub use windows::app_is_active;
#[cfg(target_os = "linux")]
pub use linux::app_is_active;

#[cfg(target_os = "macos")]
pub use macos::main_window_minimized;
#[cfg(target_os = "windows")]
pub use windows::main_window_minimized;
#[cfg(target_os = "linux")]
pub use linux::main_window_minimized;

#[cfg(target_os = "macos")]
pub use macos::show_window_without_focus;
#[cfg(target_os = "windows")]
pub use windows::show_window_without_focus;
#[cfg(target_os = "linux")]
pub use linux::show_window_without_focus;
