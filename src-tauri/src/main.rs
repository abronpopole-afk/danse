#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window, Manager};
use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOSIZE, SWP_NOMOVE, HWND_TOP, GetClassNameW};
use windows::Win32::Foundation::{HWND, LPARAM, BOOL, RECT};
use windows::Win32::UI::WindowsAndMessaging::GetWindowRect;
use windows::Win32::Graphics::Gdi::{GetDC, ReleaseDC, CreateCompatibleDC, CreateCompatibleBitmap, SelectObject, BitBlt, SRCCOPY, DeleteDC, DeleteObject, GetDIBits, BITMAPINFO, BITMAPINFOHEADER, DIB_RGB_COLORS};
use windows::Win32::Graphics::Dxgi::{CreateDXGIFactory, IDXGIFactory, IDXGIAdapter, IDXGIOutput, IDXGIOutput1, DXGI_OUTPUT_DESC, IDXGIResource, DXGI_OUTDUPL_DESC, DXGI_OUTDUPL_FRAME_INFO, IDXGIOutputDuplication};
use windows::Win32::Graphics::Direct3D11::{D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, D3D11_SDK_VERSION, D3D11_CREATE_DEVICE_FLAG, ID3D11Texture2D, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING, D3D11_CPU_ACCESS_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ};
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN;
use std::sync::Mutex;
use base64::{Engine as _, engine::general_purpose};
use thiserror::Error;
use lazy_static::lazy_static;

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

struct DxgiState {
    device: ID3D11Device,
    context: ID3D11DeviceContext,
    dupl: Option<IDXGIOutputDuplication>,
}

lazy_static! {
    static ref DXGI_STATE: Mutex<Option<DxgiState>> = Mutex::new(None);
}

fn init_dxgi() -> PokerResult<()> {
    let mut state = DXGI_STATE.lock().unwrap();
    if state.is_some() {
        return Ok(());
    }

    unsafe {
        let mut device: Option<ID3D11Device> = None;
        let mut context: Option<ID3D11DeviceContext> = None;
        
        D3D11CreateDevice(
            None,
            D3D_DRIVER_TYPE_UNKNOWN,
            None,
            D3D11_CREATE_DEVICE_FLAG(0),
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        ).map_err(|e| PokerError::DxgiError(format!("D3D11 Device Creation Failed: {}", e)))?;

        let device = device.unwrap();
        let context = context.unwrap();

        let factory: IDXGIFactory = CreateDXGIFactory().map_err(|e| PokerError::DxgiError(format!("DXGI Factory Failed: {}", e)))?;
        let adapter = factory.EnumAdapters(0).map_err(|e| PokerError::DxgiError(format!("EnumAdapters Failed: {}", e)))?;
        let output = adapter.EnumOutputs(0).map_err(|e| PokerError::DxgiError(format!("EnumOutputs Failed: {}", e)))?;
        let output1: IDXGIOutput1 = output.cast().map_err(|e| PokerError::DxgiError(format!("Cast to Output1 Failed: {}", e)))?;
        
        let dupl = output1.DuplicateOutput(&device).map_err(|e| PokerError::DxgiError(format!("DuplicateOutput Failed: {}", e)))?;

        *state = Some(DxgiState {
            device,
            context,
            dupl: Some(dupl),
        });
    }
    Ok(())
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
        if !GetWindowRect(hwnd, &mut rect).as_bool() {
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

        if !bit_blt_res.as_bool() {
            return Err(PokerError::CaptureFailed);
        }

        let base64_image = general_purpose::STANDARD.encode(&buffer);
        Ok(format!("data:image/bmp;base64,{}", base64_image))
    }
}

#[command]
fn focus_window(hwnd: isize) -> PokerResult<()> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        if SetForegroundWindow(hwnd).as_bool() {
            Ok(())
        } else {
            Err(PokerError::Win32Error("Failed to focus window".into()))
        }
    }
}

#[command]
fn resize_window(hwnd: isize, width: i32, height: i32) -> PokerResult<()> {
    unsafe {
        let hwnd = HWND(hwnd as _);
        let res = SetWindowPos(hwnd, HWND_TOP, 0, 0, width, height, SWP_NOMOVE);
        if res.as_bool() {
            Ok(())
        } else {
            Err(PokerError::Win32Error("Failed to resize window".into()))
        }
    }
}

#[command]
async fn stream_window_frames(window: Window, hwnd: isize) -> PokerResult<()> {
    let _ = init_dxgi(); 

    std::thread::spawn(move || {
        let mut last_capture = std::time::Instant::now();
        loop {
            let elapsed = last_capture.elapsed();
            if elapsed < std::time::Duration::from_millis(33) {
                std::thread::sleep(std::time::Duration::from_millis(33) - elapsed);
            }
            
            last_capture = std::time::Instant::now();
            if let Ok(image_data) = capture_window_internal(hwnd) {
                if let Err(_) = window.emit("poker-frame", image_data) {
                    break;
                }
            } else {
                break;
            }
        }
    });
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_windows,
            find_poker_windows,
            capture_window,
            focus_window,
            resize_window,
            stream_window_frames
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
