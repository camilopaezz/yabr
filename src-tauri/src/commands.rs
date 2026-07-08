use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::batch::{BatchJob, BatchState};
use crate::config::Config;
use crate::error::AppError;
use crate::gpu::{BenchmarkResult, GpuInfo};
use crate::models::ModelMeta;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoveBackgroundArgs {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
}

#[tauri::command]
pub async fn detect_gpu() -> Result<GpuInfo, AppError> {
    tauri::async_runtime::spawn_blocking(crate::gpu::detect_gpu)
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?
}

#[tauri::command]
pub async fn run_benchmark(app: AppHandle) -> Result<BenchmarkResult, AppError> {
    let app = app.clone();
    tauri::async_runtime::spawn_blocking(move || crate::gpu::run_benchmark(&app))
        .await
        .map_err(|e| AppError::Inference(e.to_string()))?
}

#[tauri::command]
pub async fn set_ep(app: AppHandle, ep: String) -> Result<(), AppError> {
    let normalized = ep.to_lowercase();
    if !matches!(
        normalized.as_str(),
        crate::inference::EP_CPU | crate::inference::EP_DIRECTML | crate::inference::EP_CUDA
    ) {
        return Err(AppError::Config(format!(
            "unknown execution provider: {}",
            ep
        )));
    }
    let mut config = crate::config::load_config(&app)?;
    config.execution_provider = Some(normalized);
    crate::config::save_config(&app, &config)?;
    crate::inference::invalidate_all_sessions()?;
    Ok(())
}

#[tauri::command]
pub async fn list_models(app: AppHandle) -> Result<Vec<ModelMeta>, AppError> {
    crate::models::list_models(&app)
}

#[tauri::command]
pub async fn download_model(app: AppHandle, model_id: String) -> Result<(), AppError> {
    crate::models::download_model(&app, &model_id).await
}

#[tauri::command]
pub async fn remove_image_background(
    state: State<'_, Arc<BatchState>>,
    args: RemoveBackgroundArgs,
) -> Result<(), AppError> {
    state.enqueue(BatchJob {
        id: args.id,
        input_path: args.input_path,
        output_path: args.output_path,
        model_id: args.model_id,
    });
    Ok(())
}

#[tauri::command]
pub async fn cancel_batch(state: State<'_, Arc<BatchState>>) -> Result<(), AppError> {
    state.cancel();
    Ok(())
}

#[tauri::command]
pub async fn pick_output_dir() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[tauri::command]
pub async fn get_config(app: AppHandle) -> Result<Config, AppError> {
    crate::config::load_config(&app)
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: Config) -> Result<(), AppError> {
    crate::config::save_config(&app, &config)
}
