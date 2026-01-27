#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window, Manager};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, HWND_TOP, GetClassNameW};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC, CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, BitBlt, SRCCOPY, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS};
use anyhow::{Result, anyhow};
use std::sync::Mutex;

#[derive(serde::Serialize, Clone, Debug)]
struct WindowInfo {
    hwnd: isize,
    title: String,
    class_name: String,
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
            // Noms de fenêtres typiques pour GGClub ou plateformes similaires
            t.contains("ggclub") || t.contains("poker") || w.class_name.contains("Qt5Window")
        })
        .collect()
}

#[command]
fn capture_window(hwnd: isize) -> Result<String, String> {
    capture_window_internal(hwnd).map_err(|e| e.to_string())
}

fn capture_window_internal(hwnd: isize) -> Result<String> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        let mut rect = RECT::default();
        if !GetWindowRect(hwnd, &mut rect).as_bool() {
            return Err(anyhow!("Failed to get window rect"));
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        if width <= 0 || height <= 0 {
            return Err(anyhow!("Invalid window dimensions: {}x{}", width, height));
        }

        let hdc_screen = GetDC(hwnd);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        SelectObject(hdc_mem, hbitmap);

        if !BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY).as_bool() {
            ReleaseDC(hwnd, hdc_screen);
            DeleteDC(hdc_mem);
            DeleteObject(hbitmap);
            return Err(anyhow!("BitBlt failed"));
        }

        // Pour l'instant on se contente de confirmer la réussite
        // L'encodage base64 sera ajouté avec une crate dédiée si nécessaire
        
        ReleaseDC(hwnd, hdc_screen);
        DeleteDC(hdc_mem);
        DeleteObject(hbitmap);

        Ok(format!("Captured {}x{} image successfully", width, height))
    }
}

#[command]
fn focus_window(hwnd: isize) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        if SetForegroundWindow(hwnd).as_bool() {
            Ok(())
        } else {
            Err("Failed to focus window".into())
        }
    }
}

#[command]
fn resize_window(hwnd: isize, width: i32, height: i32) -> Result<(), String> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        let res = SetWindowPos(hwnd, HWND_TOP, 0, 0, width, height, SWP_NOMOVE);
        if res.as_bool() {
            Ok(())
        } else {
            Err("Failed to resize window".into())
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_windows,
            find_poker_windows,
            capture_window,
            focus_window,
            resize_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
