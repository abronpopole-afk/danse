#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window, Manager};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, HWND_TOP};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC, CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, BitBlt, SRCCOPY, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS};
use std::sync::Mutex;

#[derive(serde::Serialize, Clone)]
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
    unsafe {
        let hwnd = HWND(hwnd as _);
        let mut rect = RECT::default();
        if !GetWindowRect(hwnd, &mut rect).as_bool() {
            return Err("Failed to get window rect".into());
        }

        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;

        let hdc_screen = GetDC(hwnd);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        SelectObject(hdc_mem, hbitmap);

        if !BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY).as_bool() {
            return Err("BitBlt failed".into());
        }

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down
                biPlanes: 1,
                biBitCount: 24,
                biCompression: 0, // BI_RGB
                ..Default::default()
            },
            ..Default::default()
        };

        let mut buffer: Vec<u8> = vec![0; (width * height * 3) as usize];
        GetDIBits(hdc_screen, hbitmap, 0, height as u32, Some(buffer.as_mut_ptr() as *mut _), &mut bmi, DIB_RGB_COLORS);

        ReleaseDC(hwnd, hdc_screen);
        DeleteDC(hdc_mem);
        DeleteObject(hbitmap);

        // Simple base64 for testing (requires base64 crate or manual)
        // For now we just return a success message
        Ok(format!("Captured {}x{} image", width, height))
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

#[command]
fn get_window_rect(hwnd: isize) -> Result<(i32, i32, i32, i32), String> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).as_bool() {
            Ok((rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top))
        } else {
            Err("Failed to get window rect".into())
        }
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_windows,
            capture_window,
            focus_window,
            resize_window,
            get_window_rect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
