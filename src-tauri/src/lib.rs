use std::sync::Mutex;
use serde::Serialize;
use tauri::{Emitter, Manager, State, WebviewUrl, LogicalPosition, LogicalSize, WebviewBuilder};

// --- Initialization script for the DocuSync webview: route window.open() to the AI chat sidebar ---
//     Only intercepts http/https URLs so that blob:, data:, file:, and other non-web URLs
//     (e.g. from document preview components) pass through to the original window.open.
const DOCUSYNC_INIT_SCRIPT: &str = r#"
(function() {
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string' && /^https?:\/\//i.test(url)) {
      window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke('open_ai_chat', {
        url: url,
        title: target || 'AI Chat',
        width: 400
      });
      return null;
    }
    return originalOpen.call(this, url, target, features);
  };
})();
"#;

// --- Initialization script for the ai-chat webview: render a slim header bar (the AI-side "tab bar")
//     Buttons dispatch actions back to Rust; the header pulls its state from Rust on build so it
//     survives navigation to different AI services. In popup mode the header doubles as a drag handle. ---
const AI_CHAT_INIT_SCRIPT: &str = r#"
(function(){
  if (window.__AIChatHeaderMounted) return;
  window.__AIChatHeaderMounted = true;

  var state = { mode: 'sidebar', title: '', x: 0, y: 0, w: 380, h: 560, mainW: 0, mainH: 0 };

  function invoke(cmd, args){
    try {
      var t = window.__TAURI_INTERNALS__;
      if (t && t.invoke) return t.invoke(cmd, args || {});
    } catch(e){ console.warn('[ai-chat header] invoke failed', e); }
    return Promise.reject(e || new Error('no tauri'));
  }

  var btnStyle = 'padding:2px 8px;border:0;border-radius:4px;background:rgba(255,255,255,0.12);color:#fff;font:inherit;cursor:pointer;';

  function build(){
    if (!document.body){ setTimeout(build, 50); return; }
    if (document.getElementById('__ai_chat_header')) return;
    var bar = document.createElement('div');
    bar.id = '__ai_chat_header';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:30px;z-index:2147483647;display:flex;align-items:center;gap:4px;padding:0 8px;background:rgba(20,20,20,0.85);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;font:12px/1 -apple-system,system-ui,sans-serif;user-select:none;';
    bar.innerHTML =
      '<span id="__ai_chat_title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9;">AI Chat</span>' +
      '<button data-act="sidebar" style="'+btnStyle+'">分屏</button>' +
      '<button data-act="popup" style="'+btnStyle+'">悬浮</button>' +
      '<button data-act="minimize" style="'+btnStyle+'">收起</button>' +
      '<button data-act="close" style="'+btnStyle+'">关闭</button>';
    document.body.appendChild(bar);

    bar.addEventListener('click', function(e){
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      invoke('ai_chat_header_action', { action: btn.getAttribute('data-act') });
    });

    // Drag handle (popup mode only)
    bar.addEventListener('mousedown', function(e){
      if (state.mode !== 'popup') return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      var startX = e.screenX, startY = e.screenY;
      var origX = state.x, origY = state.y;
      function move(ev){
        var nx = origX + (ev.screenX - startX);
        var ny = origY + (ev.screenY - startY);
        nx = Math.max(0, Math.min(state.mainW - state.w, nx));
        ny = Math.max(0, Math.min(state.mainH - state.h, ny));
        state.x = nx; state.y = ny;
        invoke('move_webview', { label: 'ai-chat', x: nx, y: ny });
      }
      function up(){
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        document.body.style.cursor = '';
        bar.style.cursor = state.mode === 'popup' ? 'move' : 'default';
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      document.body.style.cursor = 'move';
    });

    applyMode();
    applyTitle();

    // Pull current state from Rust (covers navigation to a new AI service)
    invoke('get_ai_chat_header_state').then(function(s){
      if (!s) return;
      state.mainW = s.mainW; state.mainH = s.mainH;
      state.x = s.x; state.y = s.y; state.w = s.w; state.h = s.h;
      window.__AIChatHeader.setTitle(s.title);
      window.__AIChatHeader.setMode(s.mode);
    }).catch(function(){});
  }

  function applyTitle(){
    var t = document.getElementById('__ai_chat_title');
    if (t) t.textContent = state.title || location.hostname;
  }
  function applyMode(){
    var bar = document.getElementById('__ai_chat_header');
    if (!bar) return;
    bar.style.cursor = state.mode === 'popup' ? 'move' : 'default';
    bar.querySelectorAll('button[data-act]').forEach(function(b){
      b.style.opacity = (b.getAttribute('data-act') === state.mode) ? '1' : '0.6';
    });
  }

  window.__AIChatHeader = {
    setTitle: function(s){ state.title = s || ''; applyTitle(); },
    setMode: function(m){ state.mode = m; applyMode(); },
    setGeometry: function(x,y,w,h){ state.x=x; state.y=y; state.w=w; state.h=h; },
    setBounds: function(mw,mh){ state.mainW=mw; state.mainH=mh; }
  };

  // Re-append if the host SPA removes our header
  var obs = new MutationObserver(function(){
    if (!document.getElementById('__ai_chat_header')) build();
  });
  if (document.body) obs.observe(document.body, { childList: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else { build(); }
})();
"#;

// --- Header state shared with the injected script (serialized camelCase to match the JS header) ---
#[derive(Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct HeaderState {
    mode: String,
    title: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    #[serde(default)]
    main_w: f64,
    #[serde(default)]
    main_h: f64,
    // Last loaded URL — used to decide whether to navigate (skip when reopening the same service
    // so in-chat state is preserved). Not serialized to the JS header.
    #[serde(skip)]
    url: String,
}

// --- Geometry helper: returns (width, height) of the main window in LOGICAL pixels.
//     `inner_size()` reports physical pixels, but every set_position/set_size call below
//     uses LogicalSize/LogicalPosition. On HiDPI/scaled displays physical == 2× logical,
//     so without this conversion the docusync webview is sized way too large and the
//     ai-chat webview lands off-screen (chat appears "not visible"). Divide by the
//     scale factor to keep the units consistent. ---
fn main_size(app: &tauri::AppHandle) -> Result<(f64, f64), String> {
    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let size = main_window.inner_size().map_err(|e| e.to_string())?;
    let scale = main_window.scale_factor().unwrap_or(1.0);
    Ok((size.width as f64 / scale, size.height as f64 / scale))
}

// Exposed to the frontend so the divider drag can compute full main width
// (the docusync webview's window.innerWidth is already shrunk when sidebar is open).
#[tauri::command]
fn get_main_size(app: tauri::AppHandle) -> Result<(f64, f64), String> {
    main_size(&app)
}

// Push the full header state to the ai-chat webview (best-effort).
fn push_header_state(ai_chat: &tauri::WebviewWindow, st: &HeaderState) {
    let js = format!(
        "(function(){{var h=window.__AIChatHeader;if(!h)return;h.setBounds({mw},{mh});h.setGeometry({x},{y},{w},{h});h.setTitle({title});h.setMode({mode});}})();",
        mw = st.main_w, mh = st.main_h,
        x = st.x, y = st.y, w = st.w, h = st.h,
        title = serde_json::to_string(&st.title).unwrap_or_else(|_| "\"\"".into()),
        mode = serde_json::to_string(&st.mode).unwrap_or_else(|_| "\"\"".into()),
    );
    let _ = ai_chat.eval(&js);
}

fn set_docusync_geometry(app: &tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(docusync) = app.get_webview_window("docusync") {
        docusync.set_position(tauri::Position::Logical(LogicalPosition { x, y })).map_err(|e| e.to_string())?;
        docusync.set_size(tauri::Size::Logical(LogicalSize { width: w, height: h })).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn set_ai_chat_geometry(app: &tauri::AppHandle, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        ai_chat.set_position(tauri::Position::Logical(LogicalPosition { x, y })).map_err(|e| e.to_string())?;
        ai_chat.set_size(tauri::Size::Logical(LogicalSize { width: w, height: h })).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Re-apply the split layout based on the current shared header state.
/// - sidebar: shrink docusync to (main_w - chat_w) and place ai-chat on the right.
/// - any other mode (closed / minimized / popup): give docusync the full main window.
///
/// Called on `set_sidebar_width` (divider drag) and on main-window resize so both panes
/// stay correctly proportioned and the document pane reclaims full width when chat closes.
fn relayout(app: &tauri::AppHandle, state: &Mutex<HeaderState>) -> Result<(), String> {
    let (main_w, main_h) = main_size(app)?;
    let st = state.lock().map_err(|e| e.to_string())?.clone();
    match st.mode.as_str() {
        "sidebar" => {
            let chat_w = st.w.max(300.0).min(600.0);
            let doc_w = (main_w - chat_w).max(200.0);
            set_docusync_geometry(app, 0.0, 0.0, doc_w, main_h)?;
            set_ai_chat_geometry(app, doc_w, 0.0, chat_w, main_h)?;
        }
        _ => {
            set_docusync_geometry(app, 0.0, 0.0, main_w, main_h)?;
        }
    }
    Ok(())
}

/// Get the existing ai-chat webview, or create a new one at the given position/size.
/// Recovers from the "a webview with label `ai-chat` already exists" error that occurs
/// when the webview was destroyed (e.g. by a bad navigation) but its label remains
/// stuck in Tauri's internal registry — `get_webview_window` returns `None` yet
/// `add_child` rejects the duplicate label.
fn get_or_create_ai_chat(
    app: &tauri::AppHandle,
    url: &url::Url,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<tauri::WebviewWindow, String> {
    // Fast path: webview already exists
    if let Some(existing) = app.get_webview_window("ai-chat") {
        return Ok(existing);
    }

    // Create new webview
    let main_window = app.get_window("main").ok_or("Main window not found")?;

    match main_window.add_child(
        WebviewBuilder::new("ai-chat", WebviewUrl::External(url.clone()))
            .initialization_script(AI_CHAT_INIT_SCRIPT),
        LogicalPosition::new(x, y),
        LogicalSize::new(w, h),
    ) {
        Ok(_) => app
            .get_webview_window("ai-chat")
            .ok_or_else(|| "Failed to get ai-chat webview after creation".to_string()),
        Err(ref e) if e.to_string().contains("already exists") => {
            // Label registered but webview inaccessible. Try to close the stale
            // entry via every available lookup, then recreate.
            if let Some(stale) = app.get_webview_window("ai-chat") {
                let _ = stale.close();
            }
            for (label, wv) in app.webview_windows() {
                if label == "ai-chat" {
                    let _ = wv.close();
                }
            }
            // Retry creation
            main_window
                .add_child(
                    WebviewBuilder::new("ai-chat", WebviewUrl::External(url.clone()))
                        .initialization_script(AI_CHAT_INIT_SCRIPT),
                    LogicalPosition::new(x, y),
                    LogicalSize::new(w, h),
                )
                .map_err(|e| e.to_string())?;
            app.get_webview_window("ai-chat")
                .ok_or_else(|| "Failed to get ai-chat webview after recreation".to_string())
        }
        Err(e) => Err(e.to_string()),
    }
}

// --- Sidebar mode: shrink docusync, place ai-chat on the right ---
#[tauri::command]
fn open_ai_chat(
    app: tauri::AppHandle,
    state: State<'_, Mutex<HeaderState>>,
    url: String,
    title: String,
    width: f64,
) -> Result<(), String> {
    let (main_w, main_h) = main_size(&app)?;
    let chat_w = width.max(300.0).min(600.0);
    let doc_w = (main_w - chat_w).max(200.0);

    set_docusync_geometry(&app, 0.0, 0.0, doc_w, main_h)?;

    let url_parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    // Navigate only when switching AI service, to preserve in-chat state on reopen.
    let prev_url = state.lock().map(|g| g.url.clone()).unwrap_or_default();
    let need_nav = prev_url != url;

    let ai_chat = get_or_create_ai_chat(&app, &url_parsed, doc_w, 0.0, chat_w, main_h)?;
    if need_nav {
        ai_chat.navigate(url_parsed.clone()).map_err(|e| e.to_string())?;
    }
    set_ai_chat_geometry(&app, doc_w, 0.0, chat_w, main_h)?;
    ai_chat.show().map_err(|e| e.to_string())?;

    // Update shared header state and push to the webview
    let st = HeaderState {
        mode: "sidebar".into(),
        title: title.clone(),
        x: doc_w, y: 0.0, w: chat_w, h: main_h,
        main_w, main_h,
        url: url.clone(),
    };
    if let Ok(mut guard) = state.lock() { *guard = st.clone(); }
    push_header_state(&ai_chat, &st);

    app.emit("ai-chat-opened", ()).map_err(|e| e.to_string())?;
    Ok(())
}

// --- Floating mode: docusync full-width, ai-chat floats as a panel ---
#[tauri::command]
fn open_ai_chat_popup(
    app: tauri::AppHandle,
    state: State<'_, Mutex<HeaderState>>,
    url: String,
    title: String,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let (main_w, main_h) = main_size(&app)?;

    // Restore docusync to full width
    set_docusync_geometry(&app, 0.0, 0.0, main_w, main_h)?;

    // Clamp popup within the main window
    let w = width.max(280.0).min(main_w);
    let h = height.max(360.0).min(main_h);
    let px = x.max(0.0).min((main_w - w).max(0.0));
    let py = y.max(0.0).min((main_h - h).max(0.0));

    let url_parsed: url::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;

    let prev_url = state.lock().map(|g| g.url.clone()).unwrap_or_default();
    let need_nav = prev_url != url;

    let ai_chat = get_or_create_ai_chat(&app, &url_parsed, px, py, w, h)?;
    if need_nav {
        ai_chat.navigate(url_parsed.clone()).map_err(|e| e.to_string())?;
    }
    set_ai_chat_geometry(&app, px, py, w, h)?;
    ai_chat.show().map_err(|e| e.to_string())?;

    let st = HeaderState {
        mode: "popup".into(),
        title: title.clone(),
        x: px, y: py, w, h,
        main_w, main_h,
        url: url.clone(),
    };
    if let Ok(mut guard) = state.lock() { *guard = st.clone(); }
    push_header_state(&ai_chat, &st);

    app.emit("ai-chat-mode-changed", "popup").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn close_ai_chat(app: tauri::AppHandle, state: State<'_, Mutex<HeaderState>>) -> Result<(), String> {
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        ai_chat.hide().map_err(|e| e.to_string())?;
    }
    let (main_w, main_h) = main_size(&app)?;
    set_docusync_geometry(&app, 0.0, 0.0, main_w, main_h)?;

    if let Ok(mut guard) = state.lock() { guard.mode = "closed".into(); }
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        push_header_state(&ai_chat, &HeaderState { mode: "closed".into(), ..Default::default() });
    }

    app.emit("ai-chat-closed", ()).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn minimize_ai_chat(app: tauri::AppHandle, state: State<'_, Mutex<HeaderState>>) -> Result<(), String> {
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        ai_chat.hide().map_err(|e| e.to_string())?;
    }
    let (main_w, main_h) = main_size(&app)?;
    set_docusync_geometry(&app, 0.0, 0.0, main_w, main_h)?;

    if let Ok(mut guard) = state.lock() { guard.mode = "minimized".into(); }

    app.emit("ai-chat-mode-changed", "minimized").map_err(|e| e.to_string())?;
    Ok(())
}

// Divider drag (sidebar mode): update the cached chat width and re-apply the split layout
// in one shot. Centralizing the geometry here keeps the shared HeaderState in sync so a
// subsequent main-window resize (relayout) uses the user's chosen width instead of a stale value.
#[tauri::command]
fn set_sidebar_width(
    app: tauri::AppHandle,
    state: State<'_, Mutex<HeaderState>>,
    width: f64,
) -> Result<(), String> {
    let chat_w = width.max(300.0).min(600.0);
    {
        let mut guard = state.lock().map_err(|e| e.to_string())?;
        guard.w = chat_w;
        guard.mode = "sidebar".into();
    }
    relayout(&app, state.inner())?;
    // Keep the injected ai-chat header's geometry/mode in sync.
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        let (main_w, main_h) = main_size(&app)?;
        let mut st = state.lock().map_err(|e| e.to_string())?.clone();
        st.main_w = main_w;
        st.main_h = main_h;
        st.x = (main_w - chat_w).max(200.0);
        st.y = 0.0;
        st.h = main_h;
        push_header_state(&ai_chat, &st);
    }
    Ok(())
}

// Header button click relay: the injected header invokes this; we emit an event the React hook listens to.
#[tauri::command]
fn ai_chat_header_action(app: tauri::AppHandle, action: String) -> Result<(), String> {
    app.emit("ai-chat-header-action", action).map_err(|e| e.to_string())?;
    Ok(())
}

// Pulled by the injected header on build (and after navigation) so it can render the correct mode/title.
#[tauri::command]
fn get_ai_chat_header_state(state: State<'_, Mutex<HeaderState>>) -> HeaderState {
    state.lock().map(|g| g.clone()).unwrap_or_default()
}

#[tauri::command]
fn resize_webview(app: tauri::AppHandle, label: String, width: f64, height: f64) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&label) {
        webview.set_size(tauri::Size::Logical(LogicalSize { width, height }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn move_webview(app: tauri::AppHandle, label: String, x: f64, y: f64) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&label) {
        webview.set_position(tauri::Position::Logical(LogicalPosition { x, y }))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(HeaderState::default()))
        .invoke_handler(tauri::generate_handler![
            resize_webview,
            move_webview,
            get_main_size,
            open_ai_chat,
            open_ai_chat_popup,
            close_ai_chat,
            minimize_ai_chat,
            set_sidebar_width,
            ai_chat_header_action,
            get_ai_chat_header_state,
        ])
        .setup(|app| {
            let main_window = app.get_window("main").unwrap();

            main_window.set_size(tauri::Size::Logical(LogicalSize {
                width: 1600.0,
                height: 900.0,
            }))?;

            // dev: load from the vite dev server (port 1420); release: load the bundled frontend
            let docusync_url = if cfg!(debug_assertions) {
                WebviewUrl::External("http://localhost:1420".parse().unwrap())
            } else {
                WebviewUrl::App("index.html".into())
            };

            let docusync_builder = WebviewBuilder::new("docusync", docusync_url)
                .initialization_script(DOCUSYNC_INIT_SCRIPT);

            main_window.add_child(
                docusync_builder,
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1600.0, 900.0),
            )?;

            // Adaptive layout: when the main window is resized, re-apply the split so the
            // document pane and chat pane stay correctly proportioned (sidebar mode) or the
            // document pane reclaims the full window (closed/minimized/popup). Resizing a
            // child webview does not re-trigger the main window's Resized event, so no loop.
            let app_handle = app.handle().clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::Resized(_) = event {
                    let state = app_handle.state::<Mutex<HeaderState>>();
                    let _ = relayout(&app_handle, state.inner());
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
