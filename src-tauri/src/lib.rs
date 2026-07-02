use tauri::{Emitter, Manager, WebviewUrl, LogicalPosition, LogicalSize, WebviewBuilder};

// Initialization script to intercept window.open() calls from DocuSync
const INIT_SCRIPT: &str = r#"
(function() {
  const originalOpen = window.open;
  window.open = function(url, target, features) {
    if (url && typeof url === 'string') {
      // Call Tauri command to open in sidebar
      window.__TAURI__.core.invoke('open_ai_chat', {
        url: url,
        title: target || 'AI Chat'
      });
      return null;
    }
    return originalOpen.call(this, url, target, features);
  };
})();
"#;

#[tauri::command]
fn open_ai_chat(app: tauri::AppHandle, url: String, _title: String) -> Result<(), String> {
    let main_window = app.get_window("main").ok_or("Main window not found")?;
    let main_size = main_window.inner_size().map_err(|e| e.to_string())?;
    let sidebar_width = 400.0;
    let main_width = main_size.width as f64 - sidebar_width;

    // Resize DocuSync webview to make room for sidebar
    if let Some(docusync) = app.get_webview_window("docusync") {
        docusync.set_size(tauri::Size::Logical(LogicalSize {
            width: main_width,
            height: main_size.height as f64,
        })).map_err(|e| e.to_string())?;
    }

    // Check if AI chat webview already exists
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        // Navigate to new URL and show
        let _ = ai_chat.navigate(url.parse().map_err(|e: url::ParseError| e.to_string())?);
        ai_chat.show().map_err(|e| e.to_string())?;
        ai_chat.set_size(tauri::Size::Logical(LogicalSize {
            width: sidebar_width,
            height: main_size.height as f64,
        })).map_err(|e| e.to_string())?;
        ai_chat.set_position(tauri::Position::Logical(LogicalPosition {
            x: main_width,
            y: 0.0,
        })).map_err(|e| e.to_string())?;
    } else {
        // Create new webview for AI chat
        let builder = WebviewBuilder::new(
            "ai-chat",
            WebviewUrl::External(url.parse().map_err(|e: url::ParseError| e.to_string())?),
        )
        .initialization_script(INIT_SCRIPT);

        let _ai_chat = main_window.add_child(
            builder,
            LogicalPosition::new(main_width, 0.0),
            LogicalSize::new(sidebar_width, main_size.height as f64),
        ).map_err(|e| e.to_string())?;
    }

    // Emit event to frontend
    app.emit("ai-chat-opened", ()).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn close_ai_chat(app: tauri::AppHandle) -> Result<(), String> {
    // Hide AI chat webview
    if let Some(ai_chat) = app.get_webview_window("ai-chat") {
        ai_chat.hide().map_err(|e| e.to_string())?;
    }

    // Resize DocuSync webview to full width
    if let Some(main_window) = app.get_window("main") {
        let main_size = main_window.inner_size().map_err(|e| e.to_string())?;
        if let Some(docusync) = app.get_webview_window("docusync") {
            docusync.set_size(tauri::Size::Logical(LogicalSize {
                width: main_size.width as f64,
                height: main_size.height as f64,
            })).map_err(|e| e.to_string())?;
        }
    }

    // Emit event to frontend
    app.emit("ai-chat-closed", ()).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn hide_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&label) {
        webview.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn show_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&label) {
        webview.show().map_err(|e| e.to_string())?;
    }
    Ok(())
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

#[tauri::command]
fn close_webview(app: tauri::AppHandle, label: String) -> Result<(), String> {
    if let Some(webview) = app.get_webview_window(&label) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn create_floating_window(
    app: tauri::AppHandle,
    label: String,
    url: String,
    title: String,
    width: f64,
    height: f64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    // Use WebviewWindowBuilder to create a new window with webview
    let _webview = tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        WebviewUrl::External(url.parse().unwrap()),
    )
    .title(&title)
    .inner_size(width, height)
    .position(x, y)
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            hide_webview,
            show_webview,
            resize_webview,
            move_webview,
            close_webview,
            create_floating_window,
            open_ai_chat,
            close_ai_chat,
        ])
        .setup(|app| {
            // Get the main window
            let main_window = app.get_window("main").unwrap();

            // Main window size: full width initially
            main_window.set_size(tauri::Size::Logical(LogicalSize {
                width: 1600.0,
                height: 900.0,
            }))?;

            // Create DocuSync webview with initialization script
            let docusync_builder = WebviewBuilder::new(
                "docusync",
                WebviewUrl::External("http://localhost:5173".parse().unwrap()),
            )
            .initialization_script(INIT_SCRIPT);

            let _left = main_window.add_child(
                docusync_builder,
                LogicalPosition::new(0.0, 0.0),
                LogicalSize::new(1600.0, 900.0),
            )?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
