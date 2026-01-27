use tauri::{command, Window, Manager};
use windows::Win32::Foundation::{HWND, RECT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetWindowRect, FindWindowW, GetWindowTextW, IsWindowVisible, SetForegroundWindow, SetWindowPos, SWP_NOMOVE, HWND_TOP, GetClassNameW
};
use windows::Win32::Graphics::Dxgi::{
    IDXGIFactory1, CreateDXGIFactory1, IDXGIAdapter1, IDXGIOutput1, DXGI_OUTPUT_DESC, IDXGIResource, DXGI_OUTDUPL_DESC, DXGI_OUTDUPL_FRAME_INFO, IDXGIOutputDuplication
};
use windows::Win32::Graphics::Direct3D11::{
    ID3D11Device, ID3D11DeviceContext, D3D11CreateDevice, D3D11_SDK_VERSION, D3D11_CREATE_DEVICE_FLAG, ID3D11Texture2D, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING, D3D11_CPU_ACCESS_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_MAP_READ
};
use windows_core::ComInterface;
use std::sync::Mutex;
use thiserror::Error;
use lazy_static::lazy_static;

#[derive(Error, Debug)]
pub enum PokerError {
    #[error("Window not found: {0}")]
    WindowNotFound(String),
    #[error("Windows API error: {0}")]
    WindowsError(String),
    #[error("Invalid dimensions: {0}x{1}")]
    InvalidDimensions(u32, u32),
    #[error("Capture failed")]
    CaptureFailed,
    #[error("DXGI Error: {0}")]
    DxgiError(String),
    #[error("Feature not implemented in native mode yet")]
    NotImplemented,
}

impl serde::Serialize for PokerError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type PokerResult<T> = Result<T, PokerError>;

struct DxgiState {
    device: Option<ID3D11Device>,
    context: Option<ID3D11DeviceContext>,
    dupl: Option<IDXGIOutputDuplication>,
}

lazy_static! {
    static ref DXGI_STATE: Mutex<DxgiState> = Mutex::new(DxgiState {
        device: None,
        context: None,
        dupl: None,
    });
}

fn init_dxgi() -> PokerResult<()> {
    let mut state = DXGI_STATE.lock().unwrap();
    if state.dupl.is_some() {
        return Ok(());
    }

    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1().map_err(|e| PokerError::DxgiError(e.to_string()))?;
        let adapter: IDXGIAdapter1 = factory.EnumAdapters1(0).map_err(|e| PokerError::DxgiError(e.to_string()))?;
        
        let mut device = None;
        let mut context = None;
        D3D11CreateDevice(
            &adapter,
            windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_UNKNOWN,
            None,
            D3D11_CREATE_DEVICE_FLAG(0),
            None,
            D3D11_SDK_VERSION,
            Some(&mut device),
            None,
            Some(&mut context),
        ).map_err(|e| PokerError::DxgiError(e.to_string()))?;

        let device = device.unwrap();
        let output = adapter.EnumOutputs(0).map_err(|e| PokerError::DxgiError(e.to_string()))?;
        let output1: IDXGIOutput1 = output.cast().map_err(|e| PokerError::DxgiError(format!("Cast to Output1 Failed: {}", e)))?;
        
        let dupl = output1.DuplicateOutput(&device).map_err(|e| PokerError::DxgiError(e.to_string()))?;

        state.device = Some(device);
        state.context = Some(context.unwrap());
        state.dupl = Some(dupl);
    }

    Ok(())
}

#[command]
async fn capture_window(title: String) -> PokerResult<Vec<u8>> {
    // Basic implementation for illustration, would need full GDI/DXGI logic
    Ok(vec![])
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![capture_window])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
