// DocuSync Tauri entry point.
//
// The chat panel uses a child webview embedded inside the main window. Child
// webviews are not subject to iframe `frame-ancestors` CSP restrictions, so
// AI services like DeepSeek and Qianwen can load normally. The React frontend
// still owns the header, divider, and layout; it just tells Rust where to
// position and size the native webview.

use std::collections::HashMap;

use tauri::{Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl, WebviewWindow, Wry};

mod platform;

/// Label prefix of the standalone OS windows used for floating chat mode
/// (`ai-chat-window-{panelId}`). Distinct from the in-main-window child
/// webviews (`ai-chat-{panelId}`) so the two never collide. Each floating
/// chat panel owns its own OS window, allowing multiple AI services to be
/// compared side by side as real windows.
const AI_CHAT_WINDOW_LABEL_PREFIX: &str = "ai-chat-window-";

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

/// Bounds event payload — carries the window label so the frontend routes it
/// to the right chat panel.
#[derive(serde::Serialize, Clone, Debug)]
struct LabeledBounds {
    label: String,
    #[serde(flatten)]
    bounds: Bounds,
}

/// Generic labeled payload (e.g. `ai-chat-window-closed`).
#[derive(serde::Serialize, Clone, Debug)]
struct LabeledPayload {
    label: String,
}

/// Minimize-state payload — carries the window label plus whether that
/// floating chat window is currently minimized (miniaturized), so the main
/// window's control pill can reflect the real window state.
#[derive(serde::Serialize, Clone, Debug)]
struct MinimizedPayload {
    label: String,
    minimized: bool,
}

/// Handles to the AI chat child webviews, keyed by label (`ai-chat-a` for the
/// main column, `ai-chat-b` for the comparison column).
struct AiChatWebview(std::sync::Mutex<HashMap<String, Webview<Wry>>>);

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

/// Build the auto-fill script that pastes a prompt into the AI page's input
/// box and attempts to submit it.
///
/// The AI pages live in a native child webview the app controls, so unlike a
/// cross-origin iframe we CAN inject script into them. The script:
///   1. Polls for an input element (pages load asynchronously) — tries a
///      `<textarea>` first, then a `[contenteditable]`.
///   2. Sets the value using the React-compatible native-setter trick (simply
///      assigning `.value` does not update React's internal state).
///   3. After filling, waits briefly and tries to submit — clicking a button
///      whose label/aria matches common send keywords, otherwise simulating
///      Enter on the textarea.
///
/// Best-effort: each AI service has a different DOM, so success is not
/// guaranteed. When auto-fill or auto-submit fails the user still has the text
/// on the clipboard (copied by the frontend) and can paste + send manually.
fn autofill_script(prompt: &str) -> String {
    let json = serde_json::to_string(prompt).unwrap_or_else(|_| "\"\"".to_string());
    format!(
        r#"(function(){{
  var PROMPT = {json};
  if (!PROMPT) return;
  function tryFill(){{
    var ta = document.querySelector('textarea');
    if (ta && !ta.disabled) {{
      var proto = window.HTMLTextAreaElement.prototype;
      var desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) {{ desc.set.call(ta, PROMPT); }}
      else {{ ta.value = PROMPT; }}
      ta.dispatchEvent(new Event('input', {{ bubbles: true }}));
      ta.dispatchEvent(new Event('change', {{ bubbles: true }}));
      ta.focus();
      return true;
    }}
    var ce = document.querySelector('[contenteditable="true"]');
    if (ce) {{
      ce.focus();
      try {{ document.execCommand('selectAll', false, null); }} catch (e) {{}}
      try {{ document.execCommand('insertText', false, PROMPT); }} catch (e) {{}}
      if (!(ce.textContent || '').trim()) {{
        ce.textContent = PROMPT;
        ce.dispatchEvent(new InputEvent('input', {{ bubbles: true, inputType: 'insertText', data: PROMPT }}));
      }}
      return true;
    }}
    return false;
  }}
  function trySend(){{
    var btns = document.querySelectorAll('button:not([disabled]), [role="button"]:not([disabled]), [type="submit"]:not([disabled])');
    var keywords = ['send', '发送', 'submit', '提交', 'search', '搜索', 'ask', '提问'];
    for (var i = 0; i < btns.length; i++) {{
      var b = btns[i];
      var aria = (b.getAttribute('aria-label') || '').toLowerCase();
      var text = (b.textContent || '').trim().toLowerCase();
      for (var k = 0; k < keywords.length; k++) {{
        if (aria.indexOf(keywords[k]) >= 0 || text.indexOf(keywords[k]) >= 0) {{
          b.click();
          return true;
        }}
      }}
    }}
    var ta = document.querySelector('textarea');
    if (ta) {{
      var evOpts = {{ key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }};
      ta.dispatchEvent(new KeyboardEvent('keydown', evOpts));
      ta.dispatchEvent(new KeyboardEvent('keypress', evOpts));
      ta.dispatchEvent(new KeyboardEvent('keyup', evOpts));
      return true;
    }}
    return false;
  }}
  var attempts = 0;
  var filled = false;
  var interval = setInterval(function(){{
    if (!filled && tryFill()) {{
      filled = true;
      setTimeout(function(){{ trySend(); clearInterval(interval); }}, 500);
      return;
    }}
    if (filled || attempts++ > 80) {{ clearInterval(interval); }}
  }}, 250);
}})();
"#,
        json = json
    )
}

#[tauri::command]
async fn create_ai_chat_webview(
    window: tauri::Window,
    state: State<'_, AiChatWebview>,
    label: String,
    url: String,
    bounds: Bounds,
    overlay: Option<PaperOverlay>,
    scale: f64,
    /// Selected text to auto-fill into the chat input box (and attempt to
    /// submit). When `Some`, an initialization script is injected that polls
    /// for the page's input element and fills it. Best-effort: the text is
    /// ALSO copied to the clipboard by the frontend as a fallback.
    prompt: Option<String>,
) -> Result<(), String> {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let url: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;
    let (position, size) = transform_bounds(bounds);

    let mut guard = state.0.lock().unwrap();
    if let Some(wv) = guard.get(&label).cloned() {
        wv.set_position(position).map_err(|e| e.to_string())?;
        wv.set_size(size).map_err(|e| e.to_string())?;
        wv.navigate(url).map_err(|e| e.to_string())?;
        wv.set_zoom(scale).map_err(|e| e.to_string())?;
        // Webview reused (URL changed) — re-run the auto-fill script against
        // the freshly navigated page so the prompt lands in the input box.
        if let Some(p) = &prompt {
            let _ = wv.eval(&autofill_script(p));
        }
    } else {
        let mut builder = tauri::webview::WebviewBuilder::new(label.clone(), WebviewUrl::External(url));
        if let Some(overlay) = overlay {
            builder = builder.initialization_script(paper_overlay_script(&overlay));
        }
        if let Some(p) = &prompt {
            builder = builder.initialization_script(autofill_script(p));
        }
        let wv = window
            .add_child(builder, position, size)
            .map_err(|e| e.to_string())?;
        // Match the frontend UI zoom so the chat page scales with the rest of
        // the interface (the webview element itself is already sized at the
        // scaled rect; its own zoom makes the page lay out at the logical size
        // and render at the matching scale).
        wv.set_zoom(scale).map_err(|e| e.to_string())?;
        guard.insert(label, wv);
    }

    Ok(())
}

/// Re-run the auto-fill script in an ALREADY-EXISTING child webview — used when
/// the user selects new text and re-opens the same AI service ("全部打开"
/// clicked again). The webview is NOT recreated (that would lose the current
/// conversation), so the prompt is injected via `eval` instead.
#[tauri::command]
async fn fill_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    label: String,
    prompt: String,
) -> Result<(), String> {
    if let Some(wv) = state.0.lock().unwrap().get(&label).cloned() {
        wv.eval(&autofill_script(&prompt)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Apply ONE panel's zoom to its chat child webview (each chat scales
/// independently). Called whenever a panel's zoom changes; webviews created
/// later receive the scale at creation.
#[tauri::command]
async fn set_ai_chat_webview_zoom(
    state: State<'_, AiChatWebview>,
    label: String,
    scale: f64,
) -> Result<(), String> {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    if let Some(wv) = state.0.lock().unwrap().get(&label).cloned() {
        wv.set_zoom(scale).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn update_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    label: String,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = transform_bounds(bounds);
    if let Some(wv) = state.0.lock().unwrap().get(&label).cloned() {
        wv.set_position(position).map_err(|e| e.to_string())?;
        wv.set_size(size).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn close_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    label: String,
) -> Result<(), String> {
    if let Some(wv) = state.0.lock().unwrap().remove(&label) {
        wv.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Move the webview offscreen without destroying it — preserves page state.
/// Uses repositioning instead of hide() to avoid rendering issues on macOS.
#[tauri::command]
async fn hide_ai_chat_webview(
    state: State<'_, AiChatWebview>,
    label: String,
) -> Result<(), String> {
    if let Some(wv) = state.0.lock().unwrap().get(&label).cloned() {
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
    label: String,
    bounds: Bounds,
) -> Result<(), String> {
    let (position, size) = transform_bounds(bounds);
    if let Some(wv) = state.0.lock().unwrap().get(&label).cloned() {
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

/// One floating chat window plus its per-window flags.
struct AiChatWindowEntry {
    win: WebviewWindow<Wry>,
    /// Set to true before WE close the window (mode switch / app close) so the
    /// `Destroyed` handler knows not to emit `ai-chat-window-closed` — that
    /// event is reserved for the user clicking the native window close button,
    /// which the frontend maps to `panel.close()`. A programmatic close is
    /// already driven by the frontend and must not loop back into `close()`.
    internal_close: std::sync::atomic::AtomicBool,
    /// True while this floating window is hidden because the app lost focus or
    /// the main window was minimized. Tracks the last hide/show decision so the
    /// event handler only acts on state changes instead of re-`show()`ing (and
    /// re-stealing focus) on every focus event.
    floating_hidden: std::sync::atomic::AtomicBool,
    /// Whether the user has collapsed (hidden) this floating window, or it was
    /// system-minimized. Set directly by `hide_ai_chat_window`, cleared by
    /// `show_ai_chat_window`, and updated by `sync_chat_window_minimized`.
    /// `update_floating_visibility` skips collapsed windows so app
    /// focus/minimize toggles never auto-show a window the user hid.
    minimized: std::sync::atomic::AtomicBool,
}

/// Handles to the standalone floating chat windows, keyed by window label
/// (`ai-chat-window-{panelId}`).
struct AiChatWindow(std::sync::Mutex<HashMap<String, AiChatWindowEntry>>);

/// Create (or reuse) the standalone floating chat window for one panel.
///
/// `label` is the per-panel window label (`ai-chat-window-{panelId}`); every
/// floating panel gets its own OS window. `bounds` are in logical CSS px with
/// **screen** coordinates (not relative to the main window). On first creation
/// the window is built at `bounds`; on subsequent calls (e.g. the user switched
/// AI service while floating) the existing window is shown, focused, and
/// navigated to the new URL — its position/size are left untouched so the
/// user's arrangement is preserved.
#[tauri::command]
async fn create_ai_chat_window(
    app: tauri::AppHandle,
    state: State<'_, AiChatWindow>,
    label: String,
    url: String,
    bounds: Bounds,
    overlay: Option<PaperOverlay>,
    scale: f64,
    /// Selected text to auto-fill into the chat input box (same semantics as
    /// `create_ai_chat_webview`'s `prompt`).
    prompt: Option<String>,
) -> Result<(), String> {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    let url: url::Url = url.parse().map_err(|e| format!("invalid url: {e}"))?;

    let mut guard = state.0.lock().unwrap();
    if let Some(entry) = guard.get(&label) {
        // Window already exists (AI service switched while floating): reuse it.
        // Clearing the minimized flag makes auto hide/show apply again — the
        // window is about to be shown, so a collapsed state is stale.
        entry
            .minimized
            .store(false, std::sync::atomic::Ordering::SeqCst);
        entry.win.show().map_err(|e| e.to_string())?;
        entry.win.set_focus().map_err(|e| e.to_string())?;
        entry.win.navigate(url).map_err(|e| e.to_string())?;
        entry.win.set_zoom(scale).map_err(|e| e.to_string())?;
        if let Some(p) = &prompt {
            let _ = entry.win.eval(&autofill_script(p));
        }
        return Ok(());
    }

    // First creation — build a new OS window. Bounds are screen-space logical
    // px, which is exactly what WebviewWindowBuilder::position/inner_size take.
    // Window events are observed app-wide in `run()` via `on_window_event`
    // (Tauri v2 has no per-builder event hook), filtered by the window label.
    let mut builder = tauri::webview::WebviewWindowBuilder::new(
        &app,
        label.clone(),
        WebviewUrl::External(url),
    )
    .title("AI Chat")
    .position(bounds.x, bounds.y)
    .inner_size(bounds.width, bounds.height)
    .min_inner_size(FLOAT_WINDOW_MIN_W, FLOAT_WINDOW_MIN_H)
    .resizable(true)
    .always_on_top(true);

    if let Some(overlay) = &overlay {
        builder = builder.initialization_script(paper_overlay_script(overlay));
    }
    if let Some(p) = &prompt {
        builder = builder.initialization_script(autofill_script(p));
    }

    let win = builder.build().map_err(|e| e.to_string())?;
    // Per-panel zoom: the floating window's webview gets its own scale so the
    // chat page matches this panel's zoom control.
    win.set_zoom(scale).map_err(|e| e.to_string())?;
    guard.insert(
        label,
        AiChatWindowEntry {
            win,
            internal_close: std::sync::atomic::AtomicBool::new(false),
            floating_hidden: std::sync::atomic::AtomicBool::new(false),
            minimized: std::sync::atomic::AtomicBool::new(false),
        },
    );
    Ok(())
}

/// Re-run the auto-fill script in an ALREADY-EXISTING standalone floating chat
/// window — the floating-mode counterpart of `fill_ai_chat_webview`.
#[tauri::command]
async fn fill_ai_chat_window(
    state: State<'_, AiChatWindow>,
    label: String,
    prompt: String,
) -> Result<(), String> {
    if let Some(entry) = state.0.lock().unwrap().get(&label) {
        entry.win.eval(&autofill_script(&prompt)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Close the standalone floating chat window of one panel. Sets `internal_close`
/// so the `Destroyed` handler suppresses the `ai-chat-window-closed` event (this
/// is a programmatic close driven by the frontend, not a user action).
#[tauri::command]
async fn close_ai_chat_window(
    state: State<'_, AiChatWindow>,
    label: String,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    if let Some(entry) = guard.get(&label) {
        entry
            .internal_close
            .store(true, std::sync::atomic::Ordering::SeqCst);
        entry.win.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Apply ONE panel's zoom to its standalone floating chat window (per-panel
/// independent scaling for floating mode).
#[tauri::command]
async fn set_ai_chat_window_zoom(
    state: State<'_, AiChatWindow>,
    label: String,
    scale: f64,
) -> Result<(), String> {
    let scale = if scale.is_finite() && scale > 0.0 { scale } else { 1.0 };
    if let Some(entry) = state.0.lock().unwrap().get(&label) {
        entry.win.set_zoom(scale).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hide (not minimize) the standalone floating chat window of one panel — the
/// "收起" action from the main-window control pill. Hiding removes the window
/// from the screen AND the Dock/taskbar, leaving only the bottom-right restore
/// bubble in the main window; minimizing would keep a Dock entry around, which
/// is not the intended "收起" behavior.
///
/// The flag is set directly here (no event round-trip) so
/// `update_floating_visibility` never auto-shows a user-collapsed window, and
/// the frontend flips its UI state in the command callback — no reliance on
/// system events.
#[tauri::command]
async fn hide_ai_chat_window(
    state: State<'_, AiChatWindow>,
    label: String,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    if let Some(entry) = guard.get(&label) {
        entry
            .minimized
            .store(true, std::sync::atomic::Ordering::SeqCst);
        entry.win.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Show a hidden (or system-minimized) standalone floating chat window — the
/// "恢复" action from the main-window restore bubble. Un-minimizes if needed,
/// then shows and focuses the window (the user explicitly asked for it, so
/// taking focus is expected). Clears the minimized flag so focus-loss based
/// auto-hide/show applies again.
#[tauri::command]
async fn show_ai_chat_window(
    state: State<'_, AiChatWindow>,
    label: String,
) -> Result<(), String> {
    let guard = state.0.lock().unwrap();
    if let Some(entry) = guard.get(&label) {
        if entry.win.is_minimized().unwrap_or(false) {
            entry.win.unminimize().map_err(|e| e.to_string())?;
        }
        entry
            .minimized
            .store(false, std::sync::atomic::Ordering::SeqCst);
        entry.win.show().map_err(|e| e.to_string())?;
        entry.win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Edge-triggered minimize-state sync for one floating chat window: compare
/// the window's actual minimized state against the last reported one. Called
/// from `Resized` and `Focused` window events — both fire on macOS when the
/// user miniaturizes a window.
///
/// Only the "now minimized" transition is broadcast: the pill disappears and a
/// restore bubble appears, exactly like a user-initiated "收起". The "restored"
/// side is deliberately NOT broadcast — `hide()` (user "收起") triggers a
/// focus-loss event that would otherwise report `is_minimized() == false` and
/// spuriously flip the UI back. Restores are driven by the frontend's
/// `show_ai_chat_window` command callback instead.
fn sync_chat_window_minimized(
    app: &tauri::AppHandle,
    label: &str,
    win: &tauri::WebviewWindow<Wry>,
) {
    let Ok(minimized) = win.is_minimized() else {
        return;
    };
    let state = app.state::<AiChatWindow>();
    let guard = state.0.lock().unwrap();
    let Some(entry) = guard.get(label) else {
        return;
    };
    let prev = entry
        .minimized
        .swap(minimized, std::sync::atomic::Ordering::SeqCst);
    if !minimized || prev == minimized {
        return;
    }
    drop(guard);
    let _ = app.emit(
        "ai-chat-window-minimized",
        MinimizedPayload {
            label: label.to_string(),
            minimized: true,
        },
    );
}

/// Window-event dispatcher for a standalone chat window (`label`).
///
/// - `Moved` / `Resized`: emit the new logical screen bounds so the frontend
///   can persist them for the next session. Physical→logical conversion uses
///   the window's own scale factor. The payload carries the window label so
///   the frontend routes it to the right panel.
/// - `Destroyed`: clear the state handle. If the close was user-initiated
///   (not `internal_close`), emit `ai-chat-window-closed` (with the label) so
///   the frontend maps it to `panel.close()`.
fn handle_chat_window_event(
    app: &tauri::AppHandle,
    label: &str,
    event: &tauri::WindowEvent,
) {
    match event {
        tauri::WindowEvent::Moved(pos) => {
            if let Some(win) = app.get_webview_window(label) {
                // scale_factor()/inner_size() are fallible in Tauri v2; skip the
                // bounds report if either fails (nothing useful to convert).
                if let (Ok(sf), Ok(size)) = (win.scale_factor(), win.inner_size()) {
                    let _ = app.emit(
                        "ai-chat-window-bounds",
                        LabeledBounds {
                            label: label.to_string(),
                            bounds: Bounds {
                                x: pos.x as f64 / sf,
                                y: pos.y as f64 / sf,
                                width: size.width as f64 / sf,
                                height: size.height as f64 / sf,
                            },
                        },
                    );
                }
            }
        }
        tauri::WindowEvent::Resized(size) => {
            if let Some(win) = app.get_webview_window(label) {
                // Miniaturize/restore also surfaces as a resize on macOS —
                // keep the pill's minimize state in sync from here too.
                sync_chat_window_minimized(app, label, &win);
                if let (Ok(sf), Ok(pos)) = (win.scale_factor(), win.outer_position()) {
                    let _ = app.emit(
                        "ai-chat-window-bounds",
                        LabeledBounds {
                            label: label.to_string(),
                            bounds: Bounds {
                                x: pos.x as f64 / sf,
                                y: pos.y as f64 / sf,
                                width: size.width as f64 / sf,
                                height: size.height as f64 / sf,
                            },
                        },
                    );
                }
            }
        }
        tauri::WindowEvent::Destroyed => {
            let state = app.state::<AiChatWindow>();
            let entry = state.0.lock().unwrap().remove(label);
            let internal = entry
                .map(|e| e.internal_close.swap(false, std::sync::atomic::Ordering::SeqCst))
                .unwrap_or(false);
            if !internal {
                let _ = app.emit("ai-chat-window-closed", LabeledPayload {
                    label: label.to_string(),
                });
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

/// Hide/show every always-on-top floating chat window based on the app's
/// foreground state.
///
/// - **Hide** when the app is no longer the active application (the user
///   switched to another app) or the main document window is minimized.
/// - **Show** when the app becomes active again and the main window is
///   restored, using `orderFront` (no key steal) so returning via the document
///   window keeps the document interactive.
///
/// Windows the user collapsed ("收起", `minimized == true`) are SKIPPED
/// entirely: the user explicitly hid them and expects them to stay hidden
/// until they click the restore bubble — auto-showing them on app focus would
/// fight the user's intent.
///
/// Edge-triggered via each entry's `floating_hidden`, so redundant calls never
/// run. `orderFront` (not `show()`, which is `makeKeyAndOrderFront` on macOS)
/// prevents stealing key focus from the document window — the cause of the
/// earlier flicker and of clicks on the document behind not registering.
fn update_floating_visibility(app: &tauri::AppHandle) {
    let Some(main) = app.get_window("main") else {
        return;
    };
    let should_hide = !platform::app_is_active() || platform::main_window_minimized(&main);
    let state = app.state::<AiChatWindow>();
    let guard = state.0.lock().unwrap();
    for (label, entry) in guard.iter() {
        // User collapsed ("收起") or system-minimized this window — leave it
        // exactly as the user left it; never auto-hide or auto-show it.
        if entry.minimized.load(std::sync::atomic::Ordering::SeqCst) {
            continue;
        }
        let prev = entry
            .floating_hidden
            .swap(should_hide, std::sync::atomic::Ordering::SeqCst);
        if should_hide {
            if !prev {
                let _ = entry.win.hide();
            }
        } else if prev {
            if let Some(w) = app.get_window(label) {
                platform::show_window_without_focus(&w);
            }
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Global zoom shortcuts (Cmd/Ctrl + = / -, Cmd/Ctrl + 0): registered at the
    // OS level so they fire even while the user's focus is inside an embedded
    // chat webview (which swallows normal keydown events). The handler emits a
    // `ui-zoom-shortcut` event the frontend listens for. Only acted upon while
    // this app has a focused window.
    let zoom_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([
            "commandorcontrol+=",
            "commandorcontrol+shift+=",
            "commandorcontrol+numadd",
            "commandorcontrol+-",
            "commandorcontrol+numsubtract",
            "commandorcontrol+0",
        ])
        .expect("static zoom shortcut accelerators must parse")
        .with_handler(|app, shortcut, event| {
            use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
            if event.state != ShortcutState::Pressed {
                return;
            }
            let m = |mods: Modifiers, code: Code| shortcut.matches(mods, code);
            let zoom_in = m(Modifiers::CONTROL, Code::Equal)
                || m(Modifiers::SUPER, Code::Equal)
                || m(Modifiers::CONTROL | Modifiers::SHIFT, Code::Equal)
                || m(Modifiers::SUPER | Modifiers::SHIFT, Code::Equal)
                || m(Modifiers::CONTROL, Code::NumpadAdd)
                || m(Modifiers::SUPER, Code::NumpadAdd);
            let zoom_out = m(Modifiers::CONTROL, Code::Minus)
                || m(Modifiers::SUPER, Code::Minus)
                || m(Modifiers::CONTROL, Code::NumpadSubtract)
                || m(Modifiers::SUPER, Code::NumpadSubtract);
            let reset = m(Modifiers::CONTROL, Code::Digit0) || m(Modifiers::SUPER, Code::Digit0);
            let action = if zoom_in {
                Some("in")
            } else if zoom_out {
                Some("out")
            } else if reset {
                Some("reset")
            } else {
                None
            };
            if let Some(action) = action {
                // Never hijack the combo while the user is in another app.
                if app.get_focused_window().is_some() {
                    let _ = app.emit("ui-zoom-shortcut", action);
                }
            }
        })
        .build();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(zoom_shortcut_plugin)
        .manage(AiChatWebview(std::sync::Mutex::new(HashMap::new())))
        .manage(AiChatWindow(std::sync::Mutex::new(HashMap::new())))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Focused(_) = event {
                // A floating window losing focus usually means it was
                // miniaturized — sync its minimize state so the main-window
                // pill reflects the real window state.
                let label = window.label().to_string();
                if label.starts_with(AI_CHAT_WINDOW_LABEL_PREFIX) {
                    if let Some(win) = window.app_handle().get_webview_window(&label) {
                        sync_chat_window_minimized(window.app_handle(), &label, &win);
                    }
                }
                // App focus changed (any window gained or lost focus): hide the
                // always-on-top floating windows when the app deactivates or the
                // main window minimizes; show them when the app is active again.
                update_floating_visibility(window.app_handle());
                return;
            }
            let label = window.label().to_string();
            if label.starts_with(AI_CHAT_WINDOW_LABEL_PREFIX) {
                handle_chat_window_event(window.app_handle(), &label, event);
            }
        })
        .invoke_handler(tauri::generate_handler![
            create_ai_chat_webview,
            update_ai_chat_webview,
            close_ai_chat_webview,
            hide_ai_chat_webview,
            show_ai_chat_webview,
            set_ai_chat_webview_zoom,
            fill_ai_chat_webview,
            create_ai_chat_window,
            close_ai_chat_window,
            hide_ai_chat_window,
            show_ai_chat_window,
            set_ai_chat_window_zoom,
            fill_ai_chat_window,
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
