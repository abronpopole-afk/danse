#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, HWND_TOP};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;

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
