use std::path::{Path, PathBuf};
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
                mean: vec![0.5, 0.5, 0.5],
                std: vec![1.0, 1.0, 1.0],
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

/// Static model registry (no download state). Used by inference and codegen.
pub fn static_registry() -> &'static [ModelEntry] {
    registry()
}

pub fn find_model(model_id: &str) -> Result<&'static ModelEntry, AppError> {
    static_registry()
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

/// True when `path` is a non-empty regular file.
/// Empty leftovers from failed/killed Windows downloads are not treated as ready.
pub fn is_nonempty_file(path: &Path) -> bool {
    std::fs::metadata(path)
        .map(|meta| meta.is_file() && meta.len() > 0)
        .unwrap_or(false)
}

/// Whether a model can be used for inference (bundled, or non-empty on-disk cache).
pub fn model_is_cached(app: &AppHandle, model: &ModelEntry) -> Result<bool, AppError> {
    if model.bundled {
        return Ok(true);
    }
    Ok(is_nonempty_file(&model_cache_path(app, model)?))
}

pub fn list_models(app: &AppHandle) -> Result<Vec<ModelMeta>, AppError> {
    let cache_dir = model_cache_dir(app)?;
    Ok(static_registry()
        .iter()
        .map(|m| {
            // Empty files (failed/killed Windows downloads) must not count as ready.
            let downloaded = m.bundled || is_nonempty_file(&cache_dir.join(&m.file));
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

fn partial_path_for(file_path: &Path) -> PathBuf {
    let name = file_path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "model.bin".into());
    file_path.with_file_name(format!("{name}.partial"))
}

/// Emit progress only when the stage changes, pct crosses a whole percent,
/// progress resets (retry), or download completes. Avoids flooding the webview
/// IPC (especially WebView2 on Windows) with tens of thousands of events.
fn should_emit_progress(last_stage: &str, last_pct: f32, stage: &str, pct: f32) -> bool {
    if stage != last_stage {
        return true;
    }
    // New attempt restarts at a lower pct — must not stay frozen at the old value.
    if pct < last_pct {
        return true;
    }
    if pct >= 100.0 && last_pct < 100.0 {
        return true;
    }
    pct.floor() > last_pct.floor()
}

/// Move a verified partial into the final cache path.
/// Retries briefly: on Windows, AV/indexer can hold the destination after a prior write.
async fn finalize_model_file(partial_path: &Path, file_path: &Path) -> Result<(), AppError> {
    const ATTEMPTS: u32 = 5;
    let mut last_err: Option<std::io::Error> = None;
    for attempt in 0..ATTEMPTS {
        if file_path.exists() {
            if let Err(e) = std::fs::remove_file(file_path) {
                last_err = Some(e);
                tokio::time::sleep(Duration::from_millis(50 * u64::from(attempt + 1))).await;
                continue;
            }
        }
        match std::fs::rename(partial_path, file_path) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last_err = Some(e);
                tokio::time::sleep(Duration::from_millis(50 * u64::from(attempt + 1))).await;
            }
        }
    }
    Err(AppError::Model(format!(
        "finalize download failed: {}",
        last_err
            .map(|e| e.to_string())
            .unwrap_or_else(|| "unknown".into())
    )))
}

pub async fn download_model(app: &AppHandle, model_id: &str) -> Result<(), AppError> {
    let model = find_model(model_id)?;
    if model.bundled {
        return Ok(());
    }
    let cache_dir = model_cache_dir(app)?;
    let file_path = cache_dir.join(&model.file);
    std::fs::create_dir_all(&cache_dir)?;

    let mut last_stage = String::new();
    let mut last_pct = -1.0f32;
    let mut on_progress = |stage: &str, pct: f32| {
        let pct = pct.clamp(0.0, 100.0);
        if !should_emit_progress(&last_stage, last_pct, stage, pct) {
            return;
        }
        last_stage = stage.to_string();
        last_pct = pct;
        let _ = app.emit(
            MODEL_DOWNLOAD,
            ModelDownloadPayload {
                model_id: model_id.to_string(),
                pct,
                stage: stage.into(),
            },
        );
    };

    // Intact cache hit: verify, then skip re-download. Corrupt/partial finals
    // are removed so we never treat an empty Windows write as ready.
    if file_path.exists() {
        match verify_model_file(model, &file_path, &mut on_progress).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                log::warn!(
                    "cached model {} failed verification, re-downloading: {}",
                    model.id,
                    e
                );
                let _ = std::fs::remove_file(&file_path);
            }
        }
    }

    download_to_file(model, &file_path, on_progress).await
}

async fn download_to_file<F>(
    model: &ModelEntry,
    file_path: &Path,
    mut on_progress: F,
) -> Result<(), AppError>
where
    F: FnMut(&str, f32) + Send,
{
    let client = reqwest::Client::builder()
        .use_rustls_tls()
        .user_agent(concat!("SwiftMask/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(60 * 30))
        .build()
        .map_err(|e| AppError::Model(e.to_string()))?;

    let partial_path = partial_path_for(file_path);
    let mut last_err: Option<AppError> = None;
    for attempt in 0..3 {
        // Reuse a verified partial left by a prior finalize failure (Windows AV
        // lock) instead of discarding SHA-passed bytes and re-downloading.
        if is_nonempty_file(&partial_path) {
            match verify_model_file(model, &partial_path, &mut on_progress).await {
                Ok(()) => match finalize_model_file(&partial_path, file_path).await {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        log::warn!(
                            "download attempt {} for {} finalize failed: {}",
                            attempt + 1,
                            model.id,
                            e
                        );
                        last_err = Some(e);
                        if attempt < 2 {
                            tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
                            continue;
                        }
                        let _ = std::fs::remove_file(&partial_path);
                        break;
                    }
                },
                Err(_) => {
                    let _ = std::fs::remove_file(&partial_path);
                }
            }
        }

        match try_download(&client, model, &partial_path, &mut on_progress).await {
            Ok(()) => match verify_model_file(model, &partial_path, &mut on_progress).await {
                Ok(()) => match finalize_model_file(&partial_path, file_path).await {
                    Ok(()) => return Ok(()),
                    Err(e) => {
                        // Keep partial so the next attempt can finalize without
                        // re-fetching (handled at loop top).
                        log::warn!(
                            "download attempt {} for {} finalize failed: {}",
                            attempt + 1,
                            model.id,
                            e
                        );
                        last_err = Some(e);
                    }
                },
                Err(e) => {
                    let _ = std::fs::remove_file(&partial_path);
                    log::warn!(
                        "download attempt {} for {} failed verification: {}",
                        attempt + 1,
                        model.id,
                        e
                    );
                    last_err = Some(e);
                }
            },
            Err(e) => {
                let _ = std::fs::remove_file(&partial_path);
                log::warn!(
                    "download attempt {} for {} failed: {}",
                    attempt + 1,
                    model.id,
                    e
                );
                last_err = Some(e);
            }
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_secs(2u64.pow(attempt))).await;
        }
    }
    Err(last_err.unwrap_or_else(|| AppError::Model(format!("download failed for {}", model.id))))
}

async fn verify_model_file<F>(
    model: &ModelEntry,
    file_path: &PathBuf,
    on_progress: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(&str, f32) + Send,
{
    if is_placeholder_checksum(&model.sha256) {
        log::warn!(
            "Skipping SHA-256 verification for {}: placeholder checksum",
            model.id
        );
        on_progress("download", 100.0);
        return Ok(());
    }

    // Reject empty/truncated files early (common after a killed Windows download).
    let meta = std::fs::metadata(file_path)
        .map_err(|e| AppError::Model(format!("stat failed: {}", e)))?;
    if meta.len() == 0 {
        return Err(AppError::Model(format!(
            "downloaded file is empty for {}",
            model.id
        )));
    }

    // Stage switch only — keep pct at 100 so the bar does not flash empty
    // while hashing (can take a second on large models / Windows AV).
    on_progress("verify", 100.0);
    let path = file_path.clone();
    let computed = tokio::task::spawn_blocking(move || sha256_file(&path))
        .await
        .map_err(|e| AppError::Model(format!("verify task failed: {}", e)))??;
    if computed.eq_ignore_ascii_case(&model.sha256) {
        on_progress("verify", 100.0);
        return Ok(());
    }
    Err(AppError::Model(format!(
        "SHA-256 mismatch for {}",
        model.id
    )))
}

async fn try_download<F>(
    client: &reqwest::Client,
    model: &ModelEntry,
    file_path: &PathBuf,
    on_progress: &mut F,
) -> Result<(), AppError>
where
    F: FnMut(&str, f32) + Send,
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

    // Prefer HTTP Content-Length; fall back to registry size so progress is not
    // stuck at 0% when CDNs omit length (chunked / some Windows TLS paths).
    let total = response
        .content_length()
        .filter(|&n| n > 0)
        .unwrap_or(model.size_bytes)
        .max(1);
    let mut file = tokio::fs::File::create(file_path)
        .await
        .map_err(|e| AppError::Model(format!("create file failed: {}", e)))?;
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    // Initial tick so the UI leaves the empty 0% state as soon as streaming starts.
    on_progress("download", 0.0);

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| AppError::Model(format!("stream error: {}", e)))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| AppError::Model(format!("write failed: {}", e)))?;
        downloaded += chunk.len() as u64;
        // Cap at 99% until the stream ends so verify is a distinct stage.
        let pct = ((downloaded as f32 / total as f32) * 100.0).min(99.0);
        on_progress("download", pct);
    }

    if downloaded == 0 {
        return Err(AppError::Model(format!(
            "download returned empty body for {}",
            model.id
        )));
    }

    file.flush()
        .await
        .map_err(|e| AppError::Model(format!("flush failed: {}", e)))?;
    // Ensure data is durable and the handle is fully closed before verify/rename
    // (Windows can otherwise race antivirus or share-mode opens).
    file.sync_all()
        .await
        .map_err(|e| AppError::Model(format!("sync failed: {}", e)))?;
    drop(file);

    on_progress("download", 100.0);
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

    /// Tiny HTTP fixture for download tests.
    ///
    /// Reads the full request headers before writing a response (required for
    /// reliable behavior with hyper/reqwest on Windows) and serves multiple
    /// connections so production download retries still hit a live peer.
    async fn spawn_local_server(body: Vec<u8>) -> (tokio::task::AbortHandle, u16) {
        use tokio::io::AsyncWriteExt;

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = tokio::spawn(async move {
            // Match download_to_file's retry budget (3 attempts).
            for _ in 0..3 {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                if read_http_headers(&mut stream).await.is_err() {
                    continue;
                }
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n",
                    body.len()
                );
                if stream.write_all(response.as_bytes()).await.is_err() {
                    continue;
                }
                if stream.write_all(&body).await.is_err() {
                    continue;
                }
                let _ = stream.flush().await;
                let _ = stream.shutdown().await;
            }
        });
        (handle.abort_handle(), port)
    }

    async fn read_http_headers(stream: &mut tokio::net::TcpStream) -> std::io::Result<()> {
        use tokio::io::AsyncReadExt;

        let mut buf = [0u8; 512];
        let mut request = Vec::new();
        loop {
            let n = stream.read(&mut buf).await?;
            if n == 0 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::UnexpectedEof,
                    "client closed before headers finished",
                ));
            }
            request.extend_from_slice(&buf[..n]);
            if request.windows(4).any(|w| w == b"\r\n\r\n") {
                return Ok(());
            }
            // Guard against a non-HTTP client filling memory.
            if request.len() > 64 * 1024 {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "request headers too large",
                ));
            }
        }
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
        assert_eq!(m.mean, vec![0.5, 0.5, 0.5]);
        assert_eq!(m.std, vec![1.0, 1.0, 1.0]);
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
        let data = b"hello swiftmask";
        let expected = compute_sha256(data);
        let temp = tempfile::tempdir().unwrap();
        let path = temp.path().join("dummy.bin");
        std::fs::write(&path, data).unwrap();
        assert_eq!(sha256_file(&path).unwrap(), expected);
    }

    #[test]
    fn should_emit_progress_on_stage_change_and_percent_steps() {
        assert!(should_emit_progress("download", -1.0, "download", 0.0));
        assert!(!should_emit_progress("download", 0.0, "download", 0.4));
        assert!(should_emit_progress("download", 0.0, "download", 1.0));
        assert!(should_emit_progress("download", 99.0, "download", 100.0));
        assert!(should_emit_progress("download", 100.0, "verify", 0.0));
        // Retry restarts progress — must emit so the bar does not freeze mid-retry.
        assert!(should_emit_progress("download", 80.0, "download", 0.0));
        assert!(should_emit_progress("download", 80.0, "download", 40.0));
    }

    #[test]
    fn is_nonempty_file_rejects_empty_and_missing() {
        let temp = tempfile::tempdir().unwrap();
        let missing = temp.path().join("missing.bin");
        assert!(!is_nonempty_file(&missing));
        let empty = temp.path().join("empty.bin");
        std::fs::write(&empty, b"").unwrap();
        assert!(!is_nonempty_file(&empty));
        let ok = temp.path().join("ok.bin");
        std::fs::write(&ok, b"x").unwrap();
        assert!(is_nonempty_file(&ok));
    }

    #[test]
    fn partial_path_appends_suffix() {
        let path = PathBuf::from("/tmp/rmbg-1.4.onnx");
        assert_eq!(
            partial_path_for(&path),
            PathBuf::from("/tmp/rmbg-1.4.onnx.partial")
        );
    }

    #[tokio::test]
    async fn download_to_file_fetches_and_verifies_sha256() {
        let data = b"hello swiftmask";
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
        let mut stages = vec![];
        download_to_file(&model, &path, |stage, pct| {
            stages.push(stage.to_string());
            progress_values.push(pct);
        })
        .await
        .unwrap();
        assert!(path.exists());
        assert!(!partial_path_for(&path).exists());
        assert_eq!(sha256_file(&path).unwrap(), expected_hash);
        assert!(progress_values.iter().any(|&p| p > 0.0));
        assert!(stages.iter().any(|s| s == "download"));
        assert!(stages.iter().any(|s| s == "verify"));
        handle.abort();
    }

    #[tokio::test]
    async fn download_to_file_uses_size_bytes_when_content_length_missing() {
        // Server omits Content-Length (chunked-style); progress must still advance
        // via model.size_bytes so the UI does not stay at an empty 0% bar.
        use tokio::io::AsyncWriteExt;

        let data = b"hello swiftmask without content-length";
        let expected_hash = compute_sha256(data);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = tokio::spawn(async move {
            for _ in 0..3 {
                let Ok((mut stream, _)) = listener.accept().await else {
                    break;
                };
                if read_http_headers(&mut stream).await.is_err() {
                    continue;
                }
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n"
                );
                if stream.write_all(response.as_bytes()).await.is_err() {
                    continue;
                }
                if stream.write_all(data).await.is_err() {
                    continue;
                }
                let _ = stream.flush().await;
                let _ = stream.shutdown().await;
            }
        });
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
        let mut stages = vec![];
        download_to_file(&model, &path, |stage, pct| {
            stages.push(stage.to_string());
            progress_values.push(pct);
        })
        .await
        .unwrap();
        assert!(path.exists());
        assert_eq!(sha256_file(&path).unwrap(), expected_hash);
        assert!(
            progress_values.iter().any(|&p| p > 0.0 && p < 100.0),
            "expected mid-download progress using size_bytes fallback, got {progress_values:?}"
        );
        assert!(stages.iter().any(|s| s == "verify"));
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
        download_to_file(&model, &path, |_, _| {})
            .await
            .unwrap();
        assert!(path.exists());
        handle.abort();
    }

    #[tokio::test]
    async fn download_to_file_fails_on_sha_mismatch() {
        let data = b"hello swiftmask";
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
        let err = download_to_file(&model, &path, |_, _| {})
            .await
            .expect_err("download should fail on SHA mismatch");
        assert!(
            err.to_string().contains("SHA-256 mismatch"),
            "expected SHA-256 mismatch, got: {err}"
        );
        assert!(!path.exists());
        assert!(!partial_path_for(&path).exists());
        handle.abort();
    }
}
