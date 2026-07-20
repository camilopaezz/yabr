use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};
use thiserror::Error;

/// Stable wire codes for FE classification (see docs/user-visible-errors-plan.md).
pub mod code {
    pub const CANCELLED: &str = "cancelled";
    pub const BUSY: &str = "busy";
    pub const DOWNLOAD_BUSY: &str = "download_busy";
    pub const NETWORK: &str = "network";
    pub const DISK_FULL: &str = "disk_full";
    pub const MODEL_CORRUPT: &str = "model_corrupt";
    pub const MODEL_NOT_READY: &str = "model_not_ready";
    pub const MODEL_UNKNOWN: &str = "model_unknown";
    pub const OOM: &str = "oom";
    pub const GPU: &str = "gpu";
    pub const IMAGE_UNREADABLE: &str = "image_unreadable";
    pub const OUTPUT_FAILED: &str = "output_failed";
    pub const CONFIG: &str = "config";
    pub const DIALOG: &str = "dialog";
    pub const INFERENCE_FAILED: &str = "inference_failed";
    pub const UNKNOWN: &str = "unknown";
}

/// Exact inner messages matched by [`error_code`]. Prefer these at construction sites.
pub const MSG_ALREADY_PROCESSING: &str = "already processing";
pub const MSG_DOWNLOAD_ALREADY_IN_PROGRESS: &str = "download already in progress";

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not implemented")]
    NotImplemented,
    #[error("cancelled")]
    Cancelled,
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

/// Technical detail for the wire `message` field (no variant prefix).
pub fn error_message(err: &AppError) -> String {
    match err {
        AppError::NotImplemented => "not implemented".into(),
        AppError::Cancelled => "cancelled".into(),
        AppError::Io(e) => e.to_string(),
        AppError::Serde(e) => e.to_string(),
        AppError::Inference(s)
        | AppError::Model(s)
        | AppError::Gpu(s)
        | AppError::Pipeline(s)
        | AppError::ImageIo(s)
        | AppError::Dialog(s)
        | AppError::Config(s) => s.clone(),
    }
}

/// Map an IO error into [`AppError::Model`], tagging disk-full with a stable message.
pub fn model_io_error(op: &str, e: std::io::Error) -> AppError {
    if is_storage_full(&e) {
        AppError::Model(format!("disk full during {op}: {e}"))
    } else {
        AppError::Model(format!("{op} failed: {e}"))
    }
}

/// Decode/open failures → wire code [`code::IMAGE_UNREADABLE`].
pub fn image_decode_error(detail: impl Into<String>) -> AppError {
    AppError::ImageIo(detail.into())
}

/// Encode failures → wire code [`code::OUTPUT_FAILED`] (message tagged `encode:`).
pub fn image_encode_error(detail: impl Into<String>) -> AppError {
    AppError::ImageIo(format!("encode: {}", detail.into()))
}

/// Output-path write failures → `disk_full` when full, else [`code::OUTPUT_FAILED`].
pub fn output_write_error(e: std::io::Error) -> AppError {
    if is_storage_full(&e) {
        AppError::Io(e)
    } else {
        AppError::ImageIo(format!("output write: {e}"))
    }
}

/// Config file IO → `disk_full` when full, else [`code::CONFIG`].
pub fn config_io_error(e: std::io::Error) -> AppError {
    if is_storage_full(&e) {
        AppError::Io(e)
    } else {
        AppError::Config(e.to_string())
    }
}

pub fn is_storage_full(err: &std::io::Error) -> bool {
    if matches!(err.kind(), std::io::ErrorKind::StorageFull) {
        return true;
    }
    // Prefer platform-correct errno when kind is Other (common on some targets).
    // Linux ENOSPC = 28; Windows ERROR_DISK_FULL = 112.
    // Do NOT OR both: Linux 112 is EHOSTDOWN, Windows 28 is ERROR_OUT_OF_PAPER.
    #[cfg(unix)]
    if err.raw_os_error() == Some(28) {
        return true;
    }
    #[cfg(windows)]
    if err.raw_os_error() == Some(112) {
        return true;
    }
    let msg = err.to_string().to_ascii_lowercase();
    msg.contains("no space left")
        || msg.contains("not enough space")
        || msg.contains("disk full")
}

/// Product catalog code for FE copy maps and control flow (`cancelled`, `busy`, …).
pub fn error_code(err: &AppError) -> &'static str {
    match err {
        AppError::Cancelled => code::CANCELLED,
        AppError::NotImplemented => code::UNKNOWN,
        AppError::Serde(_) => code::UNKNOWN,
        AppError::Gpu(_) => code::GPU,
        AppError::Config(_) => code::CONFIG,
        AppError::Dialog(_) => code::DIALOG,
        AppError::ImageIo(msg) => classify_image_io(msg),
        AppError::Pipeline(_) => code::INFERENCE_FAILED,
        AppError::Io(e) => {
            if is_storage_full(e) {
                code::DISK_FULL
            } else {
                code::UNKNOWN
            }
        }
        AppError::Inference(msg) => classify_inference(msg),
        AppError::Model(msg) => classify_model(msg),
    }
}

fn classify_image_io(msg: &str) -> &'static str {
    // Construction helpers tag encode/write so decode stays image_unreadable.
    let lower = msg.to_ascii_lowercase();
    if lower.starts_with("encode:") || lower.starts_with("output write:") {
        code::OUTPUT_FAILED
    } else {
        code::IMAGE_UNREADABLE
    }
}

fn classify_inference(msg: &str) -> &'static str {
    if msg == MSG_ALREADY_PROCESSING {
        return code::BUSY;
    }
    if looks_like_oom_message(msg) {
        return code::OOM;
    }
    code::INFERENCE_FAILED
}

/// Shared OOM needles for wire `oom` and GPU→CPU fallback (`is_likely_oom`).
pub fn looks_like_oom_message(msg: &str) -> bool {
    let lower = msg.to_ascii_lowercase();
    const NEEDLES: &[&str] = &[
        "8007000e",
        "e_outofmemory",
        "out of memory",
        "out_of_memory",
        "not enough memory",
        "insufficient memory",
        "dmlcommittedresourceallocator",
        "suficientes recursos de memoria",
        "recursos de memoria disponibles",
        "failed to allocate",
        "allocation failure",
        "cuda_error_out_of_memory",
        "memory allocation failed",
        "std::bad_alloc",
        "bad_alloc",
    ];
    NEEDLES.iter().any(|n| lower.contains(n))
}

fn classify_model(msg: &str) -> &'static str {
    if msg == MSG_DOWNLOAD_ALREADY_IN_PROGRESS {
        return code::DOWNLOAD_BUSY;
    }
    let lower = msg.to_ascii_lowercase();
    if lower.contains("sha-256 mismatch") {
        return code::MODEL_CORRUPT;
    }
    if lower.contains("is not downloaded") || lower.contains("not downloaded") {
        return code::MODEL_NOT_READY;
    }
    if lower.starts_with("unknown model:") || lower.contains("unknown model:") {
        return code::MODEL_UNKNOWN;
    }
    if lower.starts_with("disk full") || lower.contains("disk full during") {
        return code::DISK_FULL;
    }
    if lower.starts_with("request failed")
        || lower.starts_with("download returned status")
        || lower.starts_with("stream error")
    {
        return code::NETWORK;
    }
    // Write/create/flush/sync failures may still be full disk if kind was lost.
    if lower.contains("no space left") || lower.contains("not enough space") {
        return code::DISK_FULL;
    }
    code::UNKNOWN
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("AppError", 2)?;
        state.serialize_field("code", error_code(self))?;
        state.serialize_field("message", &error_message(self))?;
        state.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancelled_and_busy_codes() {
        assert_eq!(error_code(&AppError::Cancelled), code::CANCELLED);
        assert_eq!(
            error_code(&AppError::Inference(MSG_ALREADY_PROCESSING.into())),
            code::BUSY
        );
        assert_eq!(
            error_code(&AppError::Model(MSG_DOWNLOAD_ALREADY_IN_PROGRESS.into())),
            code::DOWNLOAD_BUSY
        );
    }

    #[test]
    fn model_and_inference_catalog() {
        assert_eq!(
            error_code(&AppError::Model("SHA-256 mismatch for x".into())),
            code::MODEL_CORRUPT
        );
        assert_eq!(
            error_code(&AppError::Model("model 'isnet' is not downloaded".into())),
            code::MODEL_NOT_READY
        );
        assert_eq!(
            error_code(&AppError::Model("unknown model: nope".into())),
            code::MODEL_UNKNOWN
        );
        assert_eq!(
            error_code(&AppError::Model("request failed: timeout".into())),
            code::NETWORK
        );
        assert_eq!(
            error_code(&AppError::Model(
                "download returned status 503 Service Unavailable".into()
            )),
            code::NETWORK
        );
        assert_eq!(
            error_code(&AppError::Model("disk full during write: ENOSPC".into())),
            code::DISK_FULL
        );
        assert_eq!(
            error_code(&AppError::Inference("CUDA out of memory".into())),
            code::OOM
        );
        assert_eq!(
            error_code(&AppError::Inference("model produced no outputs".into())),
            code::INFERENCE_FAILED
        );
        assert_eq!(
            error_code(&AppError::Pipeline("bad rank".into())),
            code::INFERENCE_FAILED
        );
        assert_eq!(
            error_code(&AppError::ImageIo("bad png".into())),
            code::IMAGE_UNREADABLE
        );
        assert_eq!(
            error_code(&image_encode_error("png write failed")),
            code::OUTPUT_FAILED
        );
        assert_eq!(
            error_code(&output_write_error(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "access denied"
            ))),
            code::OUTPUT_FAILED
        );
        assert_eq!(error_code(&AppError::Gpu("lspci failed".into())), code::GPU);
        assert_eq!(
            error_code(&AppError::Config("invalid ep".into())),
            code::CONFIG
        );
        assert_eq!(
            error_code(&config_io_error(std::io::Error::new(
                std::io::ErrorKind::PermissionDenied,
                "access denied"
            ))),
            code::CONFIG
        );
        assert_eq!(
            error_code(&AppError::Dialog("invalid path".into())),
            code::DIALOG
        );
    }

    #[test]
    fn io_disk_full_via_os_message() {
        let e = std::io::Error::new(std::io::ErrorKind::Other, "No space left on device");
        assert!(is_storage_full(&e));
        assert_eq!(error_code(&AppError::Io(e)), code::DISK_FULL);
    }

    #[test]
    fn storage_full_does_not_treat_wrong_platform_errno_as_disk() {
        // Linux EHOSTDOWN / Windows ERROR_OUT_OF_PAPER must not hard-match.
        #[cfg(unix)]
        {
            let e = std::io::Error::from_raw_os_error(112);
            assert!(!is_storage_full(&e), "Linux 112 is EHOSTDOWN, not ENOSPC");
        }
        #[cfg(windows)]
        {
            let e = std::io::Error::from_raw_os_error(28);
            assert!(
                !is_storage_full(&e),
                "Windows 28 is ERROR_OUT_OF_PAPER, not ERROR_DISK_FULL"
            );
        }
    }

    #[test]
    fn model_io_error_tags_disk_full() {
        let e = std::io::Error::new(std::io::ErrorKind::Other, "No space left on device");
        let err = model_io_error("write", e);
        assert_eq!(error_code(&err), code::DISK_FULL);
        assert!(error_message(&err).contains("disk full"));
    }

    #[test]
    fn serialize_is_code_message_object() {
        let err = AppError::Model("SHA-256 mismatch for x".into());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], code::MODEL_CORRUPT);
        assert_eq!(json["message"], "SHA-256 mismatch for x");
        assert!(json.get("code").is_some());
        assert!(json.get("message").is_some());
        assert_eq!(json.as_object().map(|o| o.len()), Some(2));
    }

    #[test]
    fn serialize_cancelled() {
        let json = serde_json::to_value(&AppError::Cancelled).unwrap();
        assert_eq!(json["code"], code::CANCELLED);
        assert_eq!(json["message"], "cancelled");
    }
}
