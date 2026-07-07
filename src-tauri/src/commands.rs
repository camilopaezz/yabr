use crate::config::Config;
use crate::error::AppError;
use crate::gpu::{BenchmarkResult, GpuInfo};
use crate::models::ModelMeta;

#[derive(Debug, Clone, serde::Deserialize)]
pub struct RemoveBackgroundArgs {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
}

#[tauri::command]
pub async fn detect_gpu() -> Result<GpuInfo, AppError> {
    crate::gpu::detect_gpu()
}

#[tauri::command]
pub async fn run_benchmark() -> Result<BenchmarkResult, AppError> {
    crate::gpu::run_benchmark()
}

#[tauri::command]
pub async fn set_ep(ep: String) -> Result<(), AppError> {
    let _ = ep;
    Ok(())
}

#[tauri::command]
pub async fn list_models() -> Result<Vec<ModelMeta>, AppError> {
    crate::models::list_models()
}

#[tauri::command]
pub async fn download_model(model_id: String) -> Result<(), AppError> {
    crate::models::download_model(&model_id)
}

#[tauri::command]
pub async fn remove_image_background(args: RemoveBackgroundArgs) -> Result<(), AppError> {
    let _ = args;
    Ok(())
}

#[tauri::command]
pub async fn cancel_batch() -> Result<(), AppError> {
    Ok(())
}

#[tauri::command]
pub async fn pick_output_dir() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
pub async fn get_config() -> Result<Config, AppError> {
    Ok(Config::default())
}

#[tauri::command]
pub async fn set_config(config: Config) -> Result<(), AppError> {
    let _ = config;
    Ok(())
}
