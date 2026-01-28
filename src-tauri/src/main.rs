#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOMOVE, HWND_TOP, GetClassNameW};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC, CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, BitBlt, SRCCOPY, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS};
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose};
use thiserror::Error;
use lazy_static::lazy_static;
use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;
use std::env;
use std::io::Write;

#[derive(Error, Debug, serde::Serialize)]
pub enum PokerError {
    #[error("Window not found: {0}")]
    WindowNotFound(String),
    #[error("Windows API error: {0}")]
    Win32Error(String),
    #[error("Invalid dimensions: {0}x{1}")]
    InvalidDimensions(i32, i32),
    #[error("Capture failed")]
    CaptureFailed,
    #[error("DXGI Error: {0}")]
    DxgiError(String),
    #[error("Feature not implemented in native mode yet")]
    NotImplemented,
}

impl From<anyhow::Error> for PokerError {
    fn from(err: anyhow::Error) -> Self {
        PokerError::Win32Error(err.to_string())
    }
}

type PokerResult<T> = std::result::Result<T, PokerError>;

#[derive(serde::Serialize, Clone, Debug)]
struct WindowInfo {
    hwnd: isize,
    title: String,
    class_name: String,
}

fn get_app_dir() -> PathBuf {
    let mut path = env::var("APPDATA").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("."));
    path.push("GTO Poker Bot");
    if !path.exists() {
        let _ = fs::create_dir_all(&path);
    }
    path
}

fn log_to_file(level: &str, message: &str) {
    let mut log_path = get_app_dir();
    log_path.push("logs");
    if !log_path.exists() {
        let _ = fs::create_dir_all(&log_path);
    }
    log_path.push("backend.log");

    if let Ok(mut file) = fs::OpenOptions::new().append(true).create(true).open(log_path) {
        let now = chrono::Local::now();
        let _ = writeln!(file, "[{}] [{}] {}", now.format("%Y-%m-%d %H:%M:%S"), level, message);
    }
}

// Windows Management
#[command]
fn list_windows() -> Vec<WindowInfo> {
    log_to_file("INFO", "Listing windows");
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
        let mut class_text: [u16; 512] = [0; 512];
        let class_len = GetClassNameW(hwnd, &mut class_text);
        if len > 0 {
            let title = String::from_utf16_lossy(&text[..len as usize]);
            let class_name = String::from_utf16_lossy(&class_text[..class_len as usize]);
            if !title.trim().is_empty() {
                windows.push(WindowInfo {
                    hwnd: hwnd.0 as isize,
                    title,
                    class_name,
                });
            }
        }
    }
    BOOL::from(true)
}

#[command]
fn find_poker_windows() -> Vec<WindowInfo> {
    let all = list_windows();
    all.into_iter()
        .filter(|w| {
            let t = w.title.to_lowercase();
            t.contains("ggclub") || t.contains("poker") || w.class_name.contains("Qt5Window")
        })
        .collect()
}

#[command]
fn capture_window(hwnd: isize) -> PokerResult<String> {
    capture_window_internal(hwnd)
}

fn capture_window_internal(hwnd_isize: isize) -> PokerResult<String> {
    unsafe {
        let hwnd = HWND(hwnd_isize as _);
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return Err(PokerError::Win32Error("Failed to get window rect".into()));
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 0 || height <= 0 {
            return Err(PokerError::InvalidDimensions(width, height));
        }
        let hdc_screen = GetDC(hwnd);
        if hdc_screen.is_invalid() {
            return Err(PokerError::Win32Error("Failed to get DC".into()));
        }
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        let old_obj = SelectObject(hdc_mem, hbitmap);
        let bit_blt_res = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 24,
                biCompression: 0,
                ..Default::default()
            },
            ..Default::default()
        };
        let buffer_size = (width * height * 3) as usize;
        let mut buffer: Vec<u8> = Vec::with_capacity(buffer_size);
        buffer.set_len(buffer_size);
        let _ = GetDIBits(hdc_screen, hbitmap, 0, height as u32, Some(buffer.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS);
        SelectObject(hdc_mem, old_obj);
        ReleaseDC(hwnd, hdc_screen);
        DeleteDC(hdc_mem);
        DeleteObject(hbitmap);
        if bit_blt_res.is_err() {
            return Err(PokerError::CaptureFailed);
        }
        let base64_image = general_purpose::STANDARD.encode(&buffer);
        Ok(format!("data:image/bmp;base64,{}", base64_image))
    }
}

#[command]
fn start_session() -> PokerResult<Value> {
    log_to_file("INFO", "Starting new session");
    Ok(json!({ "success": true, "session": { "id": "1", "status": "running" } }))
}

#[command]
fn stop_session() -> PokerResult<Value> {
    log_to_file("INFO", "Stopping session");
    Ok(json!({ "success": true, "stats": { "totalProfit": 0, "totalHandsPlayed": 0 } }))
}

#[command]
fn force_stop_session() -> PokerResult<Value> {
    log_to_file("WARN", "Force stopping session");
    Ok(json!({ "success": true, "forced": true }))
}

#[command]
fn get_current_session() -> PokerResult<Value> {
    Ok(json!({ "session": null, "stats": { "totalTables": 0, "activeTables": 0 } }))
}

#[command]
fn get_all_tables() -> PokerResult<Value> {
    Ok(json!({ "tables": [] }))
}

#[command]
fn get_humanizer_config() -> PokerResult<Value> {
    Ok(json!({ "enabled": true }))
}

#[command]
fn get_gto_config() -> PokerResult<Value> {
    Ok(json!({ "enabled": true }))
}

#[command]
fn get_platform_config() -> PokerResult<Value> {
    Ok(json!({ "platformName": "GGClub" }))
}

#[command]
fn get_recent_logs(_limit: u32) -> PokerResult<Value> {
    Ok(json!([]))
}

#[command]
fn get_global_stats() -> PokerResult<Value> {
    Ok(json!({ "totalHands": 0, "totalProfit": 0 }))
}

#[command]
fn get_player_profile() -> PokerResult<Value> {
    Ok(json!({ "personality": "TAG" }))
}

#[command]
fn main() {
    log_to_file("INFO", "Application starting");
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_windows, find_poker_windows, capture_window, start_session, stop_session, 
            force_stop_session, get_current_session, get_all_tables, get_humanizer_config, 
            get_gto_config, get_platform_config, get_recent_logs, get_global_stats, get_player_profile
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
