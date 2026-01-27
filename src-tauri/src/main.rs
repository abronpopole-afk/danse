#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::command;
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL};

#[derive(serde::Serialize)]
struct WindowInfo {
    hwnd: isize,
    title: String,
}

#[command]
fn list_windows() -> Vec<WindowInfo> {
    let mut windows: Vec<WindowInfo> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_window_callback), LPARAM(&mut windows as *mut Vec<WindowInfo> as isize));
    }
    windows
}

unsafe extern "system" fn enum_window_callback(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let windows = &mut *(lparam.0 as *mut Vec<WindowInfo>);
    if IsWindowVisible(hwnd).as_bool() {
        let mut text: [u16; 512] = [0; 512];
        let len = GetWindowTextW(hwnd, &mut text);
        if len > 0 {
            let title = String::from_utf16_lossy(&text[..len as usize]);
            if !title.trim().is_empty() {
                windows.push(WindowInfo {
                    hwnd: hwnd.0 as isize,
                    title,
                });
            }
        }
    }
    BOOL::from(true)
}

#[command]
fn capture_window(hwnd: isize) -> Result<String, String> {
    // Placeholder pour la capture d'écran native (GDI/DXGI)
    // Retourne une image en base64 pour le frontend
    Ok(format!("Capture logic for HWND {} initiated", hwnd))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_context!().invoke_handler(|invoke| {
            match invoke.message.command() {
                "list_windows" => {
                    let windows = list_windows();
                    invoke.resolver.respond_ok(windows);
                }
                "capture_window" => {
                    // Pour l'instant on simule, car la capture DXGI complète est trop longue pour un edit
                    invoke.resolver.respond_ok("Simulated capture".to_string());
                }
                _ => {
                    invoke.resolver.reject("Unknown command");
                }
            }
        }))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
