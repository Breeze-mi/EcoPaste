mod core;

use core::{prevent_default, setup};
use std::path::PathBuf;
use tauri::{generate_context, Builder, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_eco_window::{show_main_window, MAIN_WINDOW_LABEL, PREFERENCE_WINDOW_LABEL};
use tauri_plugin_log::{Target, TargetKind};

fn get_log_dir() -> PathBuf {
    // 尝试从配置文件读取自定义日志路径
    // 配置文件位于 appDataDir/.store.json (生产环境) 或 .store.dev.json (开发环境)
    if let Some(app_data_dir) = dirs::data_dir() {
        // 尝试生产环境配置
        let config_path = app_data_dir.join(".store.json");

        if let Some(log_dir) = read_log_dir_from_config(&config_path) {
            return log_dir;
        }

        // 尝试开发环境配置
        let dev_config_path = app_data_dir.join(".store.dev.json");

        if let Some(log_dir) = read_log_dir_from_config(&dev_config_path) {
            return log_dir;
        }
    }

    // 默认使用应用日志目录（打包后为安装目录下的 logs 文件夹）
    std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|p| p.join("logs")))
        .unwrap_or_else(|| PathBuf::from("logs"))
}

fn read_log_dir_from_config(config_path: &PathBuf) -> Option<PathBuf> {
    if let Ok(content) = std::fs::read_to_string(config_path) {
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
            if let Some(save_log_dir) = json
                .get("globalStore")
                .and_then(|g| g.get("env"))
                .and_then(|e| e.get("saveLogDir"))
                .and_then(|s| s.as_str())
            {
                let log_path = PathBuf::from(save_log_dir);
                // 确保目录存在
                let _ = std::fs::create_dir_all(&log_path);
                return Some(log_path);
            }
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = Builder::default()
        .setup(|app| {
            let app_handle = app.handle();

            let main_window = app
                .get_webview_window(MAIN_WINDOW_LABEL)
                .ok_or_else(|| format!("Failed to get main window"))?;

            let preference_window = app
                .get_webview_window(PREFERENCE_WINDOW_LABEL)
                .ok_or_else(|| format!("Failed to get preference window"))?;

            setup::default(&app_handle, main_window.clone(), preference_window.clone());

            Ok(())
        })
        // 确保在 windows 和 linux 上只有一个 app 实例在运行：https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/single-instance
        .plugin(tauri_plugin_single_instance::init(
            |app_handle, _argv, _cwd| {
                show_main_window(app_handle);
            },
        ))
        // app 自启动：https://github.com/tauri-apps/tauri-plugin-autostart/tree/v2
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--auto-launch"]),
        ))
        // 数据库：https://github.com/tauri-apps/tauri-plugin-sql/tree/v2
        .plugin(tauri_plugin_sql::Builder::default().build())
        // 日志插件：https://github.com/tauri-apps/tauri-plugin-log/tree/v2
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::Folder {
                        path: get_log_dir(),
                        file_name: None,
                    }),
                    Target::new(TargetKind::Webview),
                ])
                .build(),
        )
        // 快捷键插件: https://github.com/tauri-apps/tauri-plugin-global-shortcut
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // 操作系统相关信息插件：https://github.com/tauri-apps/tauri-plugin-os
        .plugin(tauri_plugin_os::init())
        // 系统级别对话框插件：https://github.com/tauri-apps/tauri-plugin-dialog
        .plugin(tauri_plugin_dialog::init())
        // 访问文件系统插件：https://github.com/tauri-apps/tauri-plugin-fs
        .plugin(tauri_plugin_fs::init())
        // 更新插件：https://github.com/tauri-apps/tauri-plugin-updater
        // 注意：自动更新已禁用，但保留手动检查更新功能
        .plugin(tauri_plugin_updater::Builder::new().build())
        // 进程相关插件：https://github.com/tauri-apps/tauri-plugin-process
        .plugin(tauri_plugin_process::init())
        // 检查和请求 macos 系统权限：https://github.com/ayangweb/tauri-plugin-macos-permissions
        .plugin(tauri_plugin_macos_permissions::init())
        // 拓展了对文件和目录的操作：https://github.com/ayangweb/tauri-plugin-fs-pro
        .plugin(tauri_plugin_fs_pro::init())
        // 获取系统获取系统的区域设置：https://github.com/ayangweb/tauri-plugin-locale
        .plugin(tauri_plugin_locale::init())
        // 打开文件或者链接：https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/opener
        .plugin(tauri_plugin_opener::init())
        // 禁用 webview 的默认行为：https://github.com/ferreira-tb/tauri-plugin-prevent-default
        .plugin(prevent_default::init())
        // 剪贴板插件：https://github.com/ayangweb/tauri-plugin-clipboard-x
        .plugin(tauri_plugin_clipboard_x::init())
        // 自定义的窗口管理插件
        .plugin(tauri_plugin_eco_window::init())
        // 自定义粘贴的插件
        .plugin(tauri_plugin_eco_paste::init())
        // 自定义判断是否自动启动的插件
        .plugin(tauri_plugin_eco_autostart::init())
        .on_window_event(|window, event| match event {
            // 让 app 保持在后台运行：https://tauri.app/v1/guides/features/system-tray/#preventing-the-app-from-closing
            WindowEvent::CloseRequested { api, .. } => {
                let _ = window.hide();

                api.prevent_close();
            }
            _ => {}
        })
        .build(generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| match event {
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen {
            has_visible_windows,
            ..
        } => {
            if has_visible_windows {
                return;
            }

            tauri_plugin_eco_window::show_preference_window(app_handle);
        }
        _ => {
            let _ = app_handle;
        }
    });
}
