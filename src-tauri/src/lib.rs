// DocuSync Tauri entry point.

use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Global zoom shortcuts (Cmd/Ctrl + = / -, Cmd/Ctrl + 0): registered at the
    // OS level so they fire even while the user's focus is inside an embedded
    // webview. The handler emits a `ui-zoom-shortcut` event the frontend
    // listens for. Only acted upon while this app has a focused window.
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
