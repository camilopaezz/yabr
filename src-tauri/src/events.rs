use serde::{Deserialize, Serialize};

pub const INFERENCE_PROGRESS: &str = "inference:progress";
pub const INFERENCE_DONE: &str = "inference:done";
pub const INFERENCE_ERROR: &str = "inference:error";
pub const MODEL_DOWNLOAD: &str = "model:download";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceProgressPayload {
    pub id: String,
    pub stage: String,
    pub pct: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceDonePayload {
    pub id: String,
    pub output_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InferenceErrorPayload {
    pub id: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelDownloadPayload {
    pub model_id: String,
    pub pct: f32,
}
