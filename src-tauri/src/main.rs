#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use tauri::{command, Window, Manager};
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
use sqlx::postgres::PgPoolOptions;
use sqlx::{Pool, Postgres};
use dotenvy::dotenv;

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
    #[error("Database error: {0}")]
    DatabaseError(String),
}

impl From<sqlx::Error> for PokerError {
    fn from(err: sqlx::Error) -> Self {
        PokerError::DatabaseError(err.to_string())
    }
}

impl From<anyhow::Error> for PokerError {
    fn from(err: anyhow::Error) -> Self {
        PokerError::Win32Error(err.to_string())
    }
}

type PokerResult<T> = std::result::Result<T, PokerError>;

struct AppState {
    db: Mutex<Option<Pool<Postgres>>>,
}

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

async fn init_db() -> Result<Pool<Postgres>, sqlx::Error> {
    dotenv().ok();
    let database_url = env::var("DATABASE_URL").unwrap_or_else(|_| "postgresql://poker_bot:d3aXbYN7wVyOHm6f@localhost:5432/poker_bot".to_string());
    
    log_to_file("INFO", &format!("Connecting to database: {}", database_url));
    
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS bot_sessions (
            id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
            status TEXT NOT NULL,
            started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            stopped_at TIMESTAMP WITH TIME ZONE,
            total_profit FLOAT DEFAULT 0,
            hands_played INTEGER DEFAULT 0
        )"
    ).execute(&pool).await?;

    sqlx::query(
        "CREATE TABLE IF NOT EXISTS poker_tables (
            id varchar(255) PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id varchar(255) REFERENCES bot_sessions(id),
            table_identifier TEXT,
            table_name TEXT,
            stakes TEXT,
            status TEXT,
            profit FLOAT DEFAULT 0,
            hands_played INTEGER DEFAULT 0
        )"
    ).execute(&pool).await?;

    log_to_file("INFO", "Database tables verified/created");
    Ok(pool)
}

#[command]
async fn list_windows() -> Vec<WindowInfo> {
    log_to_file("DEBUG", "Command: list_windows started");
    let mut windows: Vec<WindowInfo> = Vec::new();
    unsafe {
        let _ = EnumWindows(Some(enum_window_callback), LPARAM(&mut windows as *mut Vec<WindowInfo> as isize));
    }
    log_to_file("DEBUG", &format!("Command: list_windows found {} windows", windows.len()));
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
async fn find_poker_windows() -> Vec<WindowInfo> {
    log_to_file("DEBUG", "Command: find_poker_windows started");
    let all = list_windows().await;
    let filtered: Vec<_> = all.into_iter()
        .filter(|w| {
            let t = w.title.to_lowercase();
            t.contains("ggclub") || t.contains("poker") || w.class_name.contains("Qt5Window")
        })
        .collect();
    log_to_file("DEBUG", &format!("Command: find_poker_windows filtered to {} potential poker windows", filtered.len()));
    filtered
}

#[command]
async fn start_session(state: tauri::State<'_, AppState>) -> PokerResult<Value> {
    log_to_file("INFO", "Command: start_session requested");
    let pool = {
        let pool_guard = state.db.lock().unwrap();
        pool_guard.clone()
    };
    
    if let Some(pool) = pool {
        match sqlx::query_as::<_, (String,)>("INSERT INTO bot_sessions (status) VALUES ('running') RETURNING id")
            .fetch_one(&pool)
            .await {
                Ok(row) => {
                    log_to_file("INFO", &format!("Session started successfully with ID: {}", row.0));
                    Ok(json!({ "success": true, "session": { "id": row.0, "status": "running" } }))
                },
                Err(e) => {
                    log_to_file("ERROR", &format!("Failed to insert session into DB: {}", e));
                    Err(PokerError::DatabaseError(e.to_string()))
                }
            }
    } else {
        log_to_file("ERROR", "Start session failed: Database not connected");
        Err(PokerError::DatabaseError("Database not connected".into()))
    }
}

#[command] async fn stop_session() -> PokerResult<Value> { 
    log_to_file("INFO", "Command: stop_session requested");
    Ok(json!({"success": true})) 
}
#[command] async fn force_stop_session() -> PokerResult<Value> { 
    log_to_file("WARN", "Command: force_stop_session requested");
    Ok(json!({"success": true})) 
}
#[command] async fn cleanup_stale_sessions() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: cleanup_stale_sessions requested");
    Ok(json!({"success": true})) 
}
#[command] async fn get_current_session() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_current_session requested");
    Ok(json!({"session": null, "stats": {"totalTables": 0, "activeTables": 0}})) 
}
#[command] async fn get_all_tables() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_all_tables requested");
    Ok(json!({"tables": []})) 
}
#[command] async fn get_humanizer_config() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_humanizer_config requested");
    Ok(json!({"enabled": true})) 
}
#[command] async fn get_gto_config() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_gto_config requested");
    Ok(json!({"enabled": true})) 
}
#[command] async fn get_platform_config() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_platform_config requested");
    Ok(json!({"platformName": "GGClub"})) 
}
#[command] async fn get_recent_logs(_limit: u32) -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_recent_logs requested");
    Ok(json!([])) 
}
#[command] async fn get_global_stats() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_global_stats requested");
    Ok(json!({"totalHands": 0, "totalProfit": 0})) 
}
#[command] async fn get_player_profile() -> PokerResult<Value> { 
    log_to_file("DEBUG", "Command: get_player_profile requested");
    Ok(json!({"personality": "TAG"})) 
}
#[command] async fn capture_window(hwnd: isize) -> PokerResult<String> { 
    log_to_file("DEBUG", &format!("Command: capture_window requested for HWND: {}", hwnd));
    capture_window_internal(hwnd) 
}

fn capture_window_internal(hwnd: isize) -> PokerResult<String> {
    unsafe {
        let hwnd_val = HWND(hwnd as _);
        let mut rect = RECT::default();
        if let Err(e) = GetWindowRect(hwnd_val, &mut rect) {
             log_to_file("ERROR", &format!("GetWindowRect failed for HWND {}: {}", hwnd, e));
        }
        
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        
        if width <= 0 || height <= 0 {
            log_to_file("ERROR", &format!("Invalid window dimensions for HWND {}: {}x{}", hwnd, width, height));
            return Err(PokerError::InvalidDimensions(width, height));
        }

        let hdc_screen = GetDC(hwnd_val);
        let hdc_mem = CreateCompatibleDC(hdc_screen);
        let hbitmap = CreateCompatibleBitmap(hdc_screen, width, height);
        
        let old_obj = SelectObject(hdc_mem, hbitmap);
        let _ = BitBlt(hdc_mem, 0, 0, width, height, hdc_screen, 0, 0, SRCCOPY);
        SelectObject(hdc_mem, old_obj);

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

        let data_size = (width * 3 + 3) & !3;
        let mut buffer = vec![0u8; (data_size * height) as usize];
        
        let lines = GetDIBits(
            hdc_screen,
            hbitmap,
            0,
            height as u32,
            Some(buffer.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        DeleteObject(hbitmap);
        DeleteDC(hdc_mem);
        ReleaseDC(hwnd_val, hdc_screen);

        if lines == 0 {
            log_to_file("ERROR", &format!("GetDIBits failed to capture any lines for HWND {}", hwnd));
            return Err(PokerError::CaptureFailed);
        }

        Ok(general_purpose::STANDARD.encode(&buffer))
    }
}

#[command]
async fn log_from_frontend(level: String, message: String) {
    log_to_file(&level, &format!("[FRONTEND] {}", message));
}

fn main() {
    log_to_file("INFO", "Application starting");
    
    tauri::Builder::default()
        .manage(AppState { db: Mutex::new(None) })
        .setup(|app| {
            let handle = app.handle();
            tauri::async_runtime::spawn(async move {
                match init_db().await {
                    Ok(pool) => {
                        let state = handle.state::<AppState>();
                        *state.db.lock().unwrap() = Some(pool);
                        log_to_file("INFO", "Database initialization successful");
                    }
                    Err(e) => {
                        log_to_file("ERROR", &format!("Database initialization failed: {}", e));
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_windows, find_poker_windows, start_session, get_current_session,
            stop_session, force_stop_session, cleanup_stale_sessions, get_all_tables,
            get_humanizer_config, get_gto_config, get_platform_config, get_recent_logs,
            get_global_stats, get_player_profile, capture_window, log_from_frontend
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
