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

  // Inline SVG icons for the header controls.
  var icons = {
    sidebar: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>',
    popup: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>',
    minimize: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    close: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
  };

  var btnBase = 'display:inline-flex;align-items:center;gap:4px;padding:4px 8px;border:0;border-radius:6px;background:transparent;color:#fff;font:12px/1 -apple-system,system-ui,sans-serif;cursor:pointer;transition:background .15s;';

  function build(){
    if (!document.body){ setTimeout(build, 50); return; }
    if (document.getElementById('__ai_chat_header')) return;
    var bar = document.createElement('div');
    bar.id = '__ai_chat_header';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:34px;z-index:2147483647;display:flex;align-items:center;gap:6px;padding:0 10px;background:rgba(28,28,30,0.92);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font:13px/1 -apple-system,system-ui,sans-serif;user-select:none;';
    bar.innerHTML =
      '<span id="__ai_chat_title" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9;padding-right:8px;">AI Chat</span>' +
      '<button data-act="sidebar" style="'+btnBase+'" title="分屏">'+icons.sidebar+'<span>分屏</span></button>' +
      '<button data-act="popup" style="'+btnBase+'" title="悬浮窗口">'+icons.popup+'<span>悬浮</span></button>' +
      '<button data-act="minimize" style="'+btnBase+'" title="收起">'+icons.minimize+'<span>收起</span></button>' +
      '<button data-act="close" style="'+btnBase+'" title="关闭">'+icons.close+'<span>关闭</span></button>';
    document.body.appendChild(bar);

    bar.addEventListener('click', function(e){
      var btn = e.target.closest('button[data-act]');
      if (!btn) return;
      invoke('ai_chat_header_action', { action: btn.getAttribute('data-act') });
    });

    bar.addEventListener('mouseover', function(e){
      var btn = e.target.closest('button[data-act]');
      if (btn) btn.style.background = 'rgba(255,255,255,0.15)';
    });
    bar.addEventListener('mouseout', function(e){
      var btn = e.target.closest('button[data-act]');
      if (btn) applyButtonState(btn);
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
  function applyButtonState(btn){
    var active = btn.getAttribute('data-act') === state.mode;
    btn.style.background = active ? 'rgba(255,255,255,0.22)' : 'transparent';
    btn.style.opacity = active ? '1' : '0.75';
  }
  function applyMode(){
    var bar = document.getElementById('__ai_chat_header');
    if (!bar) return;
    bar.style.cursor = state.mode === 'popup' ? 'move' : 'default';
    bar.querySelectorAll('button[data-act]').forEach(applyButtonState);
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

// --- Geometry helper: returns (width, height) of the main window ---
fn main_size(app: &tauri::AppHandle) -> Result<(f64, f64), String> {
    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let size = main_window.inner_size().map_err(|e| e.to_string())?;
    Ok((size.width as f64, size.height as f64))
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

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
