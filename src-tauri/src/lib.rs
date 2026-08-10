// DocuSync Tauri entry point.
//
// The chat panel uses a child webview embedded inside the main window. Child
// webviews are not subject to iframe `frame-ancestors` CSP restrictions, so
// AI services like DeepSeek and Qianwen can load normally. The React frontend
// still owns the header, divider, and layout; it just tells Rust where to
// position and size the native webview.

use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl, WebviewWindow, Wry};

mod platform;

const AI_CHAT_WEBVIEW_LABEL: &str = "ai-chat";
/// Label of the standalone OS window used for floating chat mode. Distinct
/// from the in-main-window child webview so the two never collide.
const AI_CHAT_WINDOW_LABEL: &str = "ai-chat-window";

/// Minimum size of the floating chat window, in logical CSS px. Matches the
/// frontend FLOAT_MIN_* constants so native and web clamping agree.
const FLOAT_WINDOW_MIN_W: f64 = 280.0;
const FLOAT_WINDOW_MIN_H: f64 = 320.0;

/// Bounds for the AI chat child webview, in logical CSS pixels relative to the
/// main window client area. Also reused as the payload for
/// `ai-chat-window-bounds` events, where x/y are screen coordinates.
#[derive(serde::Deserialize, serde::Serialize, Clone, Copy, Debug)]
struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

/// Handle to the currently active AI chat child webview.
struct AiChatWebview(std::sync::Mutex<Option<Webview<Wry>>>);

/// Convert frontend CSS bounds to a Tauri child-webview position/size.
///
/// Frontend coordinates come from `getBoundingClientRect()` on the placeholder
/// element, so they are already relative to the main webview's content area
/// (top-left origin, y increasing downward).
///
/// Tauri stores a child webview's position as top-left coordinates relative to
/// the window's content area (see the autoresize path in tauri-runtime-wry,
/// which normalizes `position.y / window.inner_size().height`), and Wry's
/// `set_bounds` performs the Cocoa bottom-left flip itself based on the parent
/// view's `isFlipped`. That is exactly the coordinate space the frontend gives
/// us, so we must NOT add a frame offset or flip `y` here — doing so corrects
/// the coordinate a second time and pushes the webview off its placeholder,
/// over the chat header.
fn transform_bounds(bounds: Bounds) -> (LogicalPosition<f64>, LogicalSize<f64>) {
    // bounds.y already locates the placeholder below the chat header, so do
    // NOT add any y offset here - it double-counts and makes the child webview
    // overflow the panel's bottom edge (prior +24/+36 magic-offset bug,
    // guarded by tests below).
    (LogicalPosition::new(bounds.x, bounds.y), LogicalSize::new(bounds.width, bounds.height))
}

/// Semi-transparent paper-color overlay injected into the child webview.
///
/// The AI pages (DeepSeek etc.) load in a native child webview, which sits on
/// top of the React DOM — so a CSS overlay in React can never tint it. Instead
/// we inject the overlay *inside* the webview via
/// `WebviewBuilder::initialization_script`, where it participates in the
/// page's own compositing and `mix-blend-mode: multiply` works as expected.
#[derive(serde::Deserialize, Clone, Debug)]
struct PaperOverlay {
    /// CSS background value for the overlay (e.g. `rgba(245,244,237,0.16)`).
    background: String,
}

/// Build the idempotent script that stamps a fixed, full-area,
/// pointer-transparent multiply overlay onto the page. Re-running it replaces
/// the previous overlay, so it is safe to call again later (e.g. theme switch).
fn paper_overlay_script(overlay: &PaperOverlay) -> String {
    format!(
        r#"(function(){{
  function apply(){{
    var old = document.getElementById('docusync-paper-overlay');
    if (old) {{ old.remove(); }}
    var d = document.createElement('div');
    d.id = 'docusync-paper-overlay';
    d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;mix-blend-mode:multiply;background:{bg};';
    document.documentElement.appendChild(d);
  }}
  if (document.readyState === 'loading') {{
    document.addEventListener('DOMContentLoaded', apply);
  }} else {{
    apply();
  }}
}})();"#,
        bg = overlay.background
    )
}

#[tauri::command]
async fn create_ai_chat_webview(
    window: tauri::Window,
    state: State<'_, AiChatWebview>,
    url: String,
    bounds: Bounds,
    overlay: Option<PaperOverlay>,
) -> Result<(), String> {
    let url: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    let (position, size) = transform_bounds(bounds);

    let mut guard = state.0.lock().unwrap();
    if let Some(wv) = guard.clone() {
        wv.set_position(position).map_err(|e| e.to_string())?;
        wv.set_size(size).map_err(|e| e.to_string())?;
        wv.navigate(url).map_err(|e| e.to_string())?;
    } else {
        let mut builder =
            tauri::webview::WebviewBuilder::new(AI_CHAT_WEBVIEW_LABEL, WebviewUrl::External(url));
        if let Some(overlay) = overlay {
            builder = builder.initialization_script(paper_overlay_script(&overlay));
        }
        let wv = window
            .add_child(builder, position, size)
            .map_err(|e| e.to_string())?;
        *guard = Some(wv);
    }

    Ok(())
}

#[tauri::command]
async fn update_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = transform_bounds(bounds);
    if let Some(wv) = state.0.lock().unwrap().clone() {
        wv.set_position(position).map_err(|e| e.to_string())?;
        wv.set_size(size).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_ai_chat_webview(state: State<'_, AiChatWebview>) -> Result<(), String> {
    if let Some(wv) = state.0.lock().unwrap().take() {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Move the webview offscreen without destroying it — preserves page state.
/// Uses repositioning instead of hide() to avoid rendering issues on macOS.
#[tauri::command]
async fn hide_ai_chat_webview(state: State<'_, AiChatWebview>) -> Result<(), String> {
    if let Some(wv) = state.0.lock().unwrap().clone() {
        let off = LogicalPosition::new(-9999.0, -9999.0);
        let tiny = LogicalSize::new(1.0, 1.0);
        wv.set_position(off).map_err(|e| e.to_string())?;
        wv.set_size(tiny).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Move a previously offscreen webview back to its correct position/size.
#[tauri::command]
async fn show_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = transform_bounds(bounds);
    if let Some(wv) = state.0.lock().unwrap().clone() {
        wv.set_size(size).map_err(|e| e.to_string())?;
        wv.set_position(position).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// --- Standalone OS window for floating chat mode ---
//
// Floating mode detaches the AI chat from the main window entirely: a real
// OS-level `WebviewWindow` that can be moved anywhere on screen (including
// outside the main window and onto other monitors), resized via its native
// edges, and minimized/maximized independently. This is the only way to
// escape the main window's bounds — child webviews are always clipped by
// their parent window.
//
// Trade-off the user accepted: switching split ↔ floating recreates the
// webview, so the AI conversation state is lost on that transition (the
// split-mode child webview and the floating window are different native
// views and cannot share page state).

/// Handle to the standalone floating chat window.
struct AiChatWindow {
    win: std::sync::Mutex<Option<WebviewWindow<Wry>>>,
    /// Set to true before WE close the window (mode switch / app close) so the
    /// `Destroyed` handler knows not to emit `ai-chat-window-closed` — that
    /// event is reserved for the user clicking the native window close button,
    /// which the frontend maps to `panel.close()`. A programmatic close is
    /// already driven by the frontend and must not loop back into `close()`.
    internal_close: std::sync::atomic::AtomicBool,
}

/// Create (or reuse) the standalone floating chat window.
///
/// `bounds` are in logical CSS px with **screen** coordinates (not relative to
/// the main window). On first creation the window is built at `bounds`; on
/// subsequent calls (e.g. the user switched AI service while floating) the
/// existing window is shown, focused, and navigated to the new URL — its
/// position/size are left untouched so the user's arrangement is preserved.
#[tauri::command]
async fn create_ai_chat_window(
    app: tauri::AppHandle,
    state: State<'_, AiChatWindow>,
    url: String,
    bounds: Bounds,
    overlay: Option<PaperOverlay>,
) -> Result<(), String> {
    let url: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;

    let mut guard = state.win.lock().unwrap();
    if let Some(win) = guard.clone() {
        // Window already exists (AI service switched while floating): reuse it.
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
        win.navigate(url).map_err(|e| e.to_string())?;
        return Ok(());
    }

    // First creation — build a new OS window. Bounds are screen-space logical
    // px, which is exactly what WebviewWindowBuilder::position/inner_size take.
    let app_for_handler = app.clone();
    let mut builder = tauri::webview::WebviewWindowBuilder::new(
        &app,
        AI_CHAT_WINDOW_LABEL,
        WebviewUrl::External(url),
    )
    .title("AI Chat")
    .position(bounds.x, bounds.y)
    .inner_size(bounds.width, bounds.height)
    .min_inner_size(FLOAT_WINDOW_MIN_W, FLOAT_WINDOW_MIN_H)
    .resizable(true);

    if let Some(overlay) = &overlay {
        builder = builder.initialization_script(paper_overlay_script(overlay));
    }

    builder = builder.on_window_event(move |event| {
        handle_chat_window_event(&app_for_handler, event);
    });

    let win = builder.build().map_err(|e| e.to_string())?;
    *guard = Some(win);
    Ok(())
}

/// Close the standalone floating chat window. Sets `internal_close` so the
/// `Destroyed` handler suppresses the `ai-chat-window-closed` event (this is a
/// programmatic close driven by the frontend, not a user action).
#[tauri::command]
async fn close_ai_chat_window(state: State<'_, AiChatWindow>) -> Result<(), String> {
    state
        .internal_close
        .store(true, std::sync::atomic::Ordering::SeqCst);
    let win = state.win.lock().unwrap().take();
    if let Some(w) = win {
        w.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Window-event dispatcher for the standalone chat window.
///
/// - `Moved` / `Resized`: emit the new logical screen bounds so the frontend
///   can persist them for the next session. Physical→logical conversion uses
///   the window's own scale factor.
/// - `Destroyed`: clear the state handle. If the close was user-initiated
///   (not `internal_close`), emit `ai-chat-window-closed` so the frontend maps
///   it to `panel.close()`.
fn handle_chat_window_event(app: &tauri::AppHandle, event: &tauri::WindowEvent) {
    match event {
        tauri::WindowEvent::Moved(pos) => {
            if let Some(win) = app.get_webview_window(AI_CHAT_WINDOW_LABEL) {
                let sf = win.scale_factor();
                let size = win.inner_size();
                let _ = app.emit(
                    "ai-chat-window-bounds",
                    Bounds {
                        x: pos.x as f64 / sf,
                        y: pos.y as f64 / sf,
                        width: size.width as f64 / sf,
                        height: size.height as f64 / sf,
                    },
                );
            }
        }
        tauri::WindowEvent::Resized(size) => {
            if let Some(win) = app.get_webview_window(AI_CHAT_WINDOW_LABEL) {
                let sf = win.scale_factor();
                if let Ok(pos) = win.outer_position() {
                    let _ = app.emit(
                        "ai-chat-window-bounds",
                        Bounds {
                            x: pos.x as f64 / sf,
                            y: pos.y as f64 / sf,
                            width: size.width as f64 / sf,
                            height: size.height as f64 / sf,
                        },
                    );
                }
            }
        }
        tauri::WindowEvent::Destroyed => {
            let state = app.state::<AiChatWindow>();
            let internal = state
                .internal_close
                .swap(false, std::sync::atomic::Ordering::SeqCst);
            *state.win.lock().unwrap() = None;
            if !internal {
                let _ = app.emit("ai-chat-window-closed", ());
            }
        }
        _ => {}
    }
}

/// Window content-area insets reported by the host platform.
#[derive(serde::Serialize, Clone, Copy, Debug)]
struct WindowInsets {
    /// Distance from the top of the window frame to the top of the content
    /// area (the titlebar inset), in logical CSS px. 0 on Windows/Linux.
    top: f64,
}

/// Report the window's content-area inset (titlebar safe area on macOS).
///
/// The React layer adds `top` to `getBoundingClientRect().top` before sending
/// child-webview bounds, so the native webview lines up with its placeholder
/// on macOS — where `getBoundingClientRect()` is measured against the window
/// frame while child webviews are positioned relative to the content view.
///
/// The value comes from `NSWindow.contentLayoutRect` at runtime (see
/// `platform::macos`), so no hardcoded 28/30/32px offsets are needed and
/// nothing about `transform_bounds` changes.
#[tauri::command]
fn get_window_insets(window: tauri::Window) -> Result<WindowInsets, String> {
    Ok(WindowInsets {
        top: platform::content_layout_top(&window)?,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AiChatWebview(std::sync::Mutex::new(None)))
        .manage(AiChatWindow {
            win: std::sync::Mutex::new(None),
            internal_close: std::sync::atomic::AtomicBool::new(false),
        })
        .invoke_handler(tauri::generate_handler![
            create_ai_chat_webview,
            update_ai_chat_webview,
            close_ai_chat_webview,
            hide_ai_chat_webview,
            show_ai_chat_webview,
            create_ai_chat_window,
            close_ai_chat_window,
            get_window_insets,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression guard for the magic y-offset bug. `bounds.y` comes from
    /// `getBoundingClientRect()` on the placeholder that already sits below the
    /// chat header, so `transform_bounds` must mirror it verbatim. Any added y
    /// offset double-counts and makes the child webview overflow the panel's
    /// bottom edge (the +24/+36 values this guards against).
    #[test]
    fn position_mirrors_placeholder_without_y_offset() {
        let bounds = Bounds { x: 1200.0, y: 42.0, width: 420.0, height: 600.0 };
        let (pos, size) = transform_bounds(bounds);
        assert_eq!(pos.x, 1200.0);
        assert_eq!(pos.y, 42.0, "no y offset must be added (was +24/+36)");
        assert_eq!(size.width, 420.0);
        assert_eq!(size.height, 600.0);
    }
}
