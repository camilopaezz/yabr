use std::thread;

use tauri::{AppHandle, Emitter};

use crate::config::Config;
use crate::error::AppError;
use crate::events::{
    InferenceDonePayload, InferenceErrorPayload, InferenceProgressPayload, INFERENCE_DONE,
    INFERENCE_ERROR, INFERENCE_PROGRESS,
};
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
    app: AppHandle,
    args: RemoveBackgroundArgs,
) -> Result<(), AppError> {
    let id = args.id;
    let input_path = args.input_path;
    let output_path = args.output_path;
    let model_id = args.model_id;
    let app_for_run = app.clone();
    let ep = crate::config::load_config(&app)?.execution_provider();

    thread::spawn(move || {
        if let Err(err) = run_inference(
            app_for_run,
            id.clone(),
            input_path,
            output_path.clone(),
            model_id,
            &ep,
        ) {
            let _ = app.emit(
                INFERENCE_ERROR,
                InferenceErrorPayload {
                    id,
                    message: err.to_string(),
                },
            );
        }
    });

    Ok(())
}

fn run_inference(
    app: AppHandle,
    id: String,
    input_path: String,
    output_path: String,
    model_id: String,
    ep: &str,
) -> Result<(), AppError> {
    let emit_progress = |stage: &str, pct: f32| -> Result<(), AppError> {
        app.emit(
            INFERENCE_PROGRESS,
            InferenceProgressPayload {
                id: id.clone(),
                stage: stage.to_string(),
                pct,
            },
        )
        .map_err(|e| AppError::Inference(e.to_string()))
    };

    let model = crate::models::find_model(&model_id)?;
    if !model.bundled {
        let cache_path = crate::models::model_cache_path(&app, model)?;
        if !cache_path.exists() {
            return Err(AppError::Model(format!(
                "model '{}' is not downloaded",
                model_id
            )));
        }
    }

    emit_progress("decoding", 10.0)?;
    let image_bytes = std::fs::read(&input_path)?;
    let img = crate::image_io::decode(&image_bytes)?;
    let original_size = (img.width(), img.height());
    let rgb = img.to_rgb8();

    emit_progress("preprocessing", 20.0)?;
    let tensor = crate::pipeline::preprocess(model, &img)?;

    emit_progress("inferring", 50.0)?;
    let model_bytes = if model.bundled {
        crate::inference::U2NETP_MODEL_BYTES.to_vec()
    } else {
        std::fs::read(crate::models::model_cache_path(&app, model)?)?
    };
    let output = crate::inference::with_session(&model_id, ep, &model_bytes, |session| {
        crate::inference::run(session, &tensor)
    })?;

    emit_progress("postprocessing", 80.0)?;
    let alpha = crate::pipeline::postprocess(&model_id, original_size, &output)?;

    emit_progress("encoding", 95.0)?;
    let output_bytes = crate::image_io::encode_png_rgba(&rgb, &alpha)?;
    std::fs::write(&output_path, output_bytes)?;

    app.emit(
        INFERENCE_DONE,
        InferenceDonePayload {
            id: id.clone(),
            output_path,
        },
    )
    .map_err(|e| AppError::Inference(e.to_string()))?;

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
pub async fn get_config(app: AppHandle) -> Result<Config, AppError> {
    crate::config::load_config(&app)
}

#[tauri::command]
pub async fn set_config(app: AppHandle, config: Config) -> Result<(), AppError> {
    crate::config::save_config(&app, &config)
}
