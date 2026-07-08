use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::events::{
    InferenceDonePayload, InferenceErrorPayload, InferenceProgressPayload, INFERENCE_DONE,
    INFERENCE_ERROR, INFERENCE_PROGRESS,
};

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingJob {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
}

pub struct ProcessingState {
    cancel: AtomicBool,
}

impl ProcessingState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cancel: AtomicBool::new(false),
        })
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancel.store(false, Ordering::SeqCst);
    }

    pub fn check_cancel(&self) -> Result<(), AppError> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

fn emit_progress(app: &AppHandle, id: &str, stage: &str, pct: f32) -> Result<(), AppError> {
    app.emit(
        INFERENCE_PROGRESS,
        InferenceProgressPayload {
            id: id.to_string(),
            stage: stage.to_string(),
            pct,
        },
    )
    .map_err(|e| AppError::Inference(e.to_string()))
}

fn emit_done(app: &AppHandle, id: &str, output_path: &str) -> Result<(), AppError> {
    app.emit(
        INFERENCE_DONE,
        InferenceDonePayload {
            id: id.to_string(),
            output_path: output_path.to_string(),
        },
    )
    .map_err(|e| AppError::Inference(e.to_string()))
}

pub fn emit_error_event(app: &AppHandle, id: &str, message: &str) {
    let _ = app.emit(
        INFERENCE_ERROR,
        InferenceErrorPayload {
            id: id.to_string(),
            message: message.to_string(),
        },
    );
}

pub fn run_one(app: &AppHandle, state: &ProcessingState, job: &ProcessingJob) -> Result<(), AppError> {
    state.check_cancel()?;

    let model = crate::models::find_model(&job.model_id)?;
    if !model.bundled {
        let cache_path = crate::models::model_cache_path(app, model)?;
        if !cache_path.exists() {
            return Err(AppError::Model(format!(
                "model '{}' is not downloaded",
                job.model_id
            )));
        }
    }

    emit_progress(app, &job.id, "decoding", 10.0)?;
    state.check_cancel()?;
    let image_bytes = std::fs::read(&job.input_path)?;
    let img = crate::image_io::decode(&image_bytes)?;
    let original_size = (img.width(), img.height());
    let rgb = img.to_rgb8();

    emit_progress(app, &job.id, "preprocessing", 20.0)?;
    state.check_cancel()?;
    let tensor = crate::pipeline::preprocess(model, &img)?;

    emit_progress(app, &job.id, "inferring", 50.0)?;
    state.check_cancel()?;
    let ep = crate::config::load_config(app)?.execution_provider();
    let output = crate::inference::with_session(
        &job.model_id,
        &ep,
        || {
            if model.bundled {
                Ok(crate::inference::U2NETP_MODEL_BYTES.to_vec())
            } else {
                Ok(std::fs::read(crate::models::model_cache_path(app, model)?)?)
            }
        },
        |session| crate::inference::run(session, &tensor),
    )?;

    emit_progress(app, &job.id, "postprocessing", 80.0)?;
    state.check_cancel()?;
    let alpha = crate::pipeline::postprocess(&job.model_id, original_size, &output)?;

    emit_progress(app, &job.id, "encoding", 95.0)?;
    state.check_cancel()?;
    let output_bytes = crate::image_io::encode_png_rgba(&rgb, &alpha)?;
    std::fs::write(&job.output_path, output_bytes)?;

    emit_done(app, &job.id, &job.output_path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_sets_and_reset_clears_token() {
        let state = ProcessingState::new();
        assert!(!state.cancel.load(Ordering::SeqCst));
        state.cancel();
        assert!(state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_err());
        state.reset();
        assert!(!state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_ok());
    }
}
