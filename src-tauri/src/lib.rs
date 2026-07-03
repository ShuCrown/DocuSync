// DocuSync Tauri entry point.
//
// The chat panel uses a child webview embedded inside the main window. Child
// webviews are not subject to iframe `frame-ancestors` CSP restrictions, so
// AI services like DeepSeek and Qianwen can load normally. The React frontend
// still owns the header, divider, and layout; it just tells Rust where to
// position and size the native webview.

use tauri::{LogicalPosition, LogicalSize, State, Webview, WebviewUrl, Wry};

const AI_CHAT_WEBVIEW_LABEL: &str = "ai-chat";

/// Bounds for the AI chat child webview, in logical CSS pixels relative to the
/// main window client area.
#[derive(serde::Deserialize, Clone, Copy, Debug)]
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
fn to_logical(
    window: &tauri::Window,
    bounds: Bounds,
) -> Result<(LogicalPosition<f64>, LogicalSize<f64>), String> {
    let sf = window.scale_factor().map_err(|e| e.to_string())?;

    let position = LogicalPosition::new(bounds.x, bounds.y+24.0);
    let size = LogicalSize::new(bounds.width, bounds.height);

    eprintln!("[ai-chat-webview] bounds={bounds:?} sf={sf} position={position:?} size={size:?}");

    Ok((position, size))
}

#[tauri::command]
async fn create_ai_chat_webview(
    window: tauri::Window,
    state: State<'_, AiChatWebview>,
    url: String,
    bounds: Bounds,
) -> Result<(), String> {
    let url: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    let (position, size) = to_logical(&window, bounds)?;

    let mut guard = state.0.lock().unwrap();
    if let Some(wv) = guard.clone() {
        wv.set_position(position).map_err(|e| e.to_string())?;
        wv.set_size(size).map_err(|e| e.to_string())?;
        wv.navigate(url).map_err(|e| e.to_string())?;
    } else {
        let builder =
            tauri::webview::WebviewBuilder::new(AI_CHAT_WEBVIEW_LABEL, WebviewUrl::External(url));
        let wv = window
            .add_child(builder, position, size)
            .map_err(|e| e.to_string())?;
        *guard = Some(wv);
    }

    Ok(())
}

#[tauri::command]
async fn update_ai_chat_webview(
    window: tauri::Window,
    state: State<'_, AiChatWebview>,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = to_logical(&window, bounds)?;
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
    window: tauri::Window,
    state: State<'_, AiChatWebview>,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = to_logical(&window, bounds)?;
    if let Some(wv) = state.0.lock().unwrap().clone() {
        wv.set_size(size).map_err(|e| e.to_string())?;
        wv.set_position(position).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .manage(AiChatWebview(std::sync::Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            create_ai_chat_webview,
            update_ai_chat_webview,
            close_ai_chat_webview,
            hide_ai_chat_webview,
            show_ai_chat_webview,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
