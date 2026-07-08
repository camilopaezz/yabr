use std::path::PathBuf;
use std::sync::LazyLock;
use std::time::Duration;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::AsyncWriteExt;

use crate::error::AppError;
use crate::events::{ModelDownloadPayload, MODEL_DOWNLOAD};

// ======================================================================
// Checksum sources:
//   isnet-general-use : MD5 fc16ebd8b0c10d971d3513d564d01e29 (rembg), SHA-256 computed locally
//   rmbg-1.4          : SHA-256 from HuggingFace
//   rmbg-2.0          : SHA-256 from rembg source (bria_rmbg.py)
// ======================================================================

pub const PLACEHOLDER_SHA256: &str =
    "0000000000000000000000000000000000000000000000000000000000000000";

pub const U2NETP_SHA256: &str =
    "309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8";

pub const ISNET_GENERAL_USE_SHA256: &str =
    "60920e99c45464f2ba57bee2ad08c919a52bbf852739e96947fbb4358c0d964a";

pub const RMBG_1_4_SHA256: &str =
    "8cafcf770b06757c4eaced21b1a88e57fd2b66de01b8045f35f01535ba742e0f";

pub const RMBG_2_0_SHA256: &str =
    "5b486f08200f513f460da46dd701db5fbb47d79b4be4b708a19444bcd4e79958";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub file: String,
    pub size_bytes: u64,
    pub input_size: u32,
    pub mean: Vec<f32>,
    pub std: Vec<f32>,
    pub license: String,
    pub source: String,
    pub download_url: String,
    pub sha256: String,
    pub bundled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelMeta {
    pub id: String,
    pub name: String,
    pub file: String,
    pub size_bytes: u64,
    pub input_size: u32,
    pub mean: Vec<f32>,
    pub std: Vec<f32>,
    pub license: String,
    pub source: String,
    pub download_url: String,
    pub sha256: String,
    pub bundled: bool,
    pub downloaded: bool,
}

fn registry() -> &'static [ModelEntry] {
    static REGISTRY: LazyLock<Vec<ModelEntry>> = LazyLock::new(|| {
        vec![
            ModelEntry {
                id: "u2netp".into(),
                name: "Turbo".into(),
                file: "u2netp.onnx".into(),
                size_bytes: 4_574_861,
                input_size: 320,
                mean: vec![0.485, 0.456, 0.406],
                std: vec![0.229, 0.224, 0.225],
                license: "Apache-2.0".into(),
                source: "xuebinqin/U-2-Net via rembg".into(),
                download_url: "".into(),
                sha256: U2NETP_SHA256.into(),
                bundled: true,
            },
            ModelEntry {
                id: "isnet-general-use".into(),
                name: "Balanced".into(),
                file: "isnet-general-use.onnx".into(),
                size_bytes: 178_000_000,
                input_size: 1024,
                mean: vec![0.485, 0.456, 0.406],
                std: vec![0.229, 0.224, 0.225],
                license: "Apache-2.0".into(),
                source: "xuebinqin/DIS via rembg".into(),
                download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx".into(),
                sha256: ISNET_GENERAL_USE_SHA256.into(),
                bundled: false,
            },
            ModelEntry {
                id: "rmbg-1.4".into(),
                name: "Balanced+".into(),
                file: "rmbg-1.4.onnx".into(),
                size_bytes: 176_000_000,
                input_size: 1024,
                mean: vec![0.5, 0.5, 0.5],
                std: vec![1.0, 1.0, 1.0],
                license: "CC BY-NC 4.0".into(),
                source: "briaai/RMBG-1.4".into(),
                download_url: "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx".into(),
                sha256: RMBG_1_4_SHA256.into(),
                bundled: false,
            },
            ModelEntry {
                id: "rmbg-2.0".into(),
                name: "Max Quality".into(),
                file: "rmbg-2.0.onnx".into(),
                size_bytes: 173_000_000,
                input_size: 1024,
                mean: vec![0.485, 0.456, 0.406],
                std: vec![0.229, 0.224, 0.225],
                license: "CC BY-NC 4.0".into(),
                source: "briaai/RMBG-2.0 via rembg".into(),
                // Public mirror; official HuggingFace release is gated.
                download_url: "https://github.com/danielgatis/rembg/releases/download/v0.0.0/bria-rmbg-2.0.onnx".into(),
                sha256: RMBG_2_0_SHA256.into(),
                bundled: false,
            },
        ]
    });
    REGISTRY.as_slice()
}

pub fn find_model(model_id: &str) -> Result<&'static ModelEntry, AppError> {
    registry()
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| AppError::Model(format!("unknown model: {}", model_id)))
}

pub fn model_cache_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Model(e.to_string()))?;
    Ok(app_data.join("models"))
}

pub fn model_cache_path(app: &AppHandle, model: &ModelEntry) -> Result<PathBuf, AppError> {
    Ok(model_cache_dir(app)?.join(&model.file))
}

pub fn list_models(app: &AppHandle) -> Result<Vec<ModelMeta>, AppError> {
    let cache_dir = model_cache_dir(app)?;
    Ok(registry()
        .iter()
        .map(|m| {
            let downloaded = m.bundled || cache_dir.join(&m.file).exists();
            ModelMeta {
                id: m.id.clone(),
                name: m.name.clone(),
                file: m.file.clone(),
                size_bytes: m.size_bytes,
                input_size: m.input_size,
                mean: m.mean.clone(),
                std: m.std.clone(),
                license: m.license.clone(),
                source: m.source.clone(),
                download_url: m.download_url.clone(),
                sha256: m.sha256.clone(),
                bundled: m.bundled,
                downloaded,
            }
        })
        .collect())
}

pub async fn download_model(app: &AppHandle, model_id: &str) -> Result<(), AppError> {
    let model = find_model(model_id)?;
    if model.bundled {
        return Ok(());
    }
    let cache_dir = model_cache_dir(app)?;
    let file_path = cache_dir.join(&model.file);
    if file_path.exists() {
        app.emit(
            MODEL_DOWNLOAD,
            ModelDownloadPayload {
                model_id: model_id.to_string(),
                pct: 100.0,
            },
        )
        .map_err(|e| AppError::Model(e.to_string()))?;
        return Ok(());
    }
    std::fs::create_dir_all(&cache_dir)?;

    download_to_file(model, &file_path, |pct| {
        let _ = app.emit(
            MODEL_DOWNLOAD,
            ModelDownloadPayload {
                model_id: model_id.to_string(),
                pct,
            },
        );
    })
    .await
}

async fn download_to_file<F>(
    model: &ModelEntry,
    file_path: &PathBuf,
    mut on_progress: F,
) -> Result<(), AppError>
where
    F: FnMut(f32) + Send,
{
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .build()
        .map_err(|e| AppError::Model(e.to_string()))?;

    let mut last_err: Option<AppError> = None;
    for attempt in 0..3 {
        match try_download(&client, model, file_path, &mut on_progress).await {
            Ok(()) => {
                if is_placeholder_checksum(&model.sha256) {
                    log::warn!(
                        "Skipping SHA-256 verification for {}: placeholder checksum",
                        model.id
                    );
                    on_progress(100.0);
                    return Ok(());
                }
                let computed = sha256_file(file_path)?;
                if computed.eq_ignore_ascii_case(&model.sha256) {
                    on_progress(100.0);
                    return Ok(());
                }
                std::fs::remove_file(file_path)?;
                return Err(AppError::Model(format!(
                    "SHA-256 mismatch for {}",
                    model.id
                )));
            }
            Err(e) => {
                log::warn!("download attempt {} for {} failed: {}", attempt + 1, model.id, e);
                last_err = Some(e);
                if attempt < 2 {
                    tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
                }
            }
        }
    }
    Err(last_err.unwrap_or_else(|| AppError::Model(format!("download failed for {}", model.id))))
}

async fn try_download<F>(
    client: &reqwest::Client,
    model: &ModelEntry,
    file_path: &PathBuf,
    on_progress: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(f32) + Send,
{
    let response = client
        .get(&model.download_url)
        .send()
        .await
        .map_err(|e| AppError::Model(format!("request failed: {}", e)))?;

    if !response.status().is_success() {
        return Err(AppError::Model(format!(
            "download returned status {}",
            response.status()
        )));
    }

    let total = response.content_length().unwrap_or(0);
    let mut file = tokio::fs::File::create(file_path)
        .await
        .map_err(|e| AppError::Model(format!("create file failed: {}", e)))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Model(format!("stream error: {}", e)))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::Model(format!("write failed: {}", e)))?;
        downloaded += chunk.len() as u64;
        let pct = if total > 0 {
            (downloaded as f32 / total as f32) * 100.0
        } else {
            0.0
        };
        on_progress(pct);
    }

    file.flush()
        .await
        .map_err(|e| AppError::Model(format!("flush failed: {}", e)))?;
    Ok(())
}

fn is_placeholder_checksum(sha256: &str) -> bool {
    sha256.eq_ignore_ascii_case(PLACEHOLDER_SHA256)
}

pub fn sha256_file(path: &PathBuf) -> Result<String, AppError> {
    let mut file = std::fs::File::open(path)?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 8192];
    loop {
        let n = std::io::Read::read(&mut file, &mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compute_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        hex::encode(hasher.finalize())
    }

    async fn spawn_local_server(body: Vec<u8>) -> (tokio::task::AbortHandle, u16) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = tokio::spawn(async move {
            let (mut stream, _) = listener.accept().await.unwrap();
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
                body.len()
            );
            use tokio::io::AsyncWriteExt;
            stream.write_all(response.as_bytes()).await.unwrap();
            stream.write_all(&body).await.unwrap();
            stream.flush().await.unwrap();
            let _ = stream.shutdown().await;
        });
        (handle.abort_handle(), port)
    }

    #[test]
    fn registry_has_four_models() {
        assert_eq!(registry().len(), 4);
        assert!(registry().iter().any(|m| m.id == "u2netp"));
    }

    #[test]
    fn u2netp_metadata() {
        let m = find_model("u2netp").unwrap();
        assert_eq!(m.input_size, 320);
        assert_eq!(m.mean, vec![0.485, 0.456, 0.406]);
        assert_eq!(m.std, vec![0.229, 0.224, 0.225]);
        assert!(m.bundled);
        assert!(!is_placeholder_checksum(&m.sha256));
    }

    #[test]
    fn isnet_metadata() {
        let m = find_model("isnet-general-use").unwrap();
        assert_eq!(m.input_size, 1024);
        assert_eq!(m.mean, vec![0.485, 0.456, 0.406]);
        assert!(!is_placeholder_checksum(&m.sha256));
        assert!(!m.bundled);
    }

    #[test]
    fn rmbg_1_4_metadata() {
        let m = find_model("rmbg-1.4").unwrap();
        assert_eq!(m.input_size, 1024);
        assert_eq!(m.mean, vec![0.5, 0.5, 0.5]);
        assert_eq!(m.std, vec![1.0, 1.0, 1.0]);
        assert!(!is_placeholder_checksum(&m.sha256));
    }

    #[test]
    fn rmbg_2_0_metadata() {
        let m = find_model("rmbg-2.0").unwrap();
        assert_eq!(m.input_size, 1024);
        assert_eq!(m.mean, vec![0.485, 0.456, 0.406]);
        assert!(!is_placeholder_checksum(&m.sha256));
    }

    #[test]
    fn sha256_file_matches_expected() {
        let data = b"hello yabr";
        let expected = compute_sha256(data);
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("dummy.bin");
        std::fs::write(&path, data).unwrap();
        assert_eq!(sha256_file(&path).unwrap(), expected);
    }

    #[tokio::test]
    async fn download_to_file_fetches_and_verifies_sha256() {
        let data = b"hello yabr";
        let expected_hash = compute_sha256(data);
        let (handle, port) = spawn_local_server(data.to_vec()).await;
        let model = ModelEntry {
            id: "test".into(),
            name: "Test".into(),
            file: "test.bin".into(),
            size_bytes: data.len() as u64,
            input_size: 0,
            mean: vec![],
            std: vec![],
            license: "".into(),
            source: "".into(),
            download_url: format!("http://127.0.0.1:{}/test.bin", port),
            sha256: expected_hash.clone(),
            bundled: false,
        };
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.bin");
        let mut progress_values = vec![];
        download_to_file(&model, &path, |pct| progress_values.push(pct))
            .await
            .unwrap();
        assert!(path.exists());
        assert_eq!(sha256_file(&path).unwrap(), expected_hash);
        assert!(progress_values.iter().any(|&p| p > 0.0));
        handle.abort();
    }

    #[tokio::test]
    async fn download_to_file_skips_verification_for_placeholder() {
        let data = b"tiny";
        let (handle, port) = spawn_local_server(data.to_vec()).await;
        let model = ModelEntry {
            id: "test".into(),
            name: "Test".into(),
            file: "test.bin".into(),
            size_bytes: data.len() as u64,
            input_size: 0,
            mean: vec![],
            std: vec![],
            license: "".into(),
            source: "".into(),
            download_url: format!("http://127.0.0.1:{}/test.bin", port),
            sha256: PLACEHOLDER_SHA256.into(),
            bundled: false,
        };
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.bin");
        download_to_file(&model, &path, |_| {})
            .await
            .unwrap();
        assert!(path.exists());
        handle.abort();
    }

    #[tokio::test]
    async fn download_to_file_fails_on_sha_mismatch() {
        let data = b"hello yabr";
        let (handle, port) = spawn_local_server(data.to_vec()).await;
        let model = ModelEntry {
            id: "test".into(),
            name: "Test".into(),
            file: "test.bin".into(),
            size_bytes: data.len() as u64,
            input_size: 0,
            mean: vec![],
            std: vec![],
            license: "".into(),
            source: "".into(),
            download_url: format!("http://127.0.0.1:{}/test.bin", port),
            sha256: "0000000000000000000000000000000000000000000000000000000000000001".into(),
            bundled: false,
        };
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("test.bin");
        let result = download_to_file(&model, &path, |_| {}).await;
        assert!(result.is_err());
        assert!(!path.exists());
        handle.abort();
    }
}
