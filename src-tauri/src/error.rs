use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not implemented")]
    NotImplemented,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("inference error: {0}")]
    Inference(String),
    #[error("model error: {0}")]
    Model(String),
    #[error("gpu detection error: {0}")]
    Gpu(String),
    #[error("pipeline error: {0}")]
    Pipeline(String),
    #[error("image io error: {0}")]
    ImageIo(String),
    #[error("dialog error: {0}")]
    Dialog(String),
    #[error("config error: {0}")]
    Config(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}
