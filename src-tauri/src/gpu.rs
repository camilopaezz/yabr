use std::time::Instant;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::error::AppError;

const NVIDIA_VENDOR_ID: u32 = 0x10DE;
const AMD_VENDOR_ID: u32 = 0x1002;
const INTEL_VENDOR_ID: u32 = 0x8086;

/// VRAM threshold used for ONNX graph optimization level (Level3 if ≥ this).
pub const VRAM_LEVEL3_THRESHOLD: u64 = 4 * 1024 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: String,
    pub vram_bytes: Option<u64>,
    pub available_eps: Vec<String>,
    /// Display label, e.g. "Level1 (<4 GiB)" — matches session graph opt level.
    pub optimization: String,
}

/// Graph optimization level from VRAM: 3 if ≥4 GiB, else 1 (including unknown).
pub fn opt_level_for_vram(vram: Option<u64>) -> u8 {
    match vram {
        Some(bytes) if bytes >= VRAM_LEVEL3_THRESHOLD => 3,
        _ => 1,
    }
}

pub fn optimization_label(vram: Option<u64>) -> String {
    match vram {
        Some(bytes) if bytes >= VRAM_LEVEL3_THRESHOLD => "Level3 (≥4 GiB)".into(),
        Some(_) => "Level1 (<4 GiB)".into(),
        None => "Level1 (VRAM unknown)".into(),
    }
}

fn gpu_info(vendor: String, vram_bytes: Option<u64>, available_eps: Vec<String>) -> GpuInfo {
    GpuInfo {
        vendor,
        vram_bytes,
        available_eps,
        optimization: optimization_label(vram_bytes),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub ep_latencies: Vec<EpLatency>,
    pub winner_ep: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpLatency {
    pub ep: String,
    pub seconds: f64,
}

pub fn detect_gpu() -> Result<GpuInfo, AppError> {
    #[cfg(target_os = "windows")]
    {
        detect_gpu_windows()
    }
    #[cfg(target_os = "linux")]
    {
        detect_gpu_linux()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        Ok(gpu_info("unknown".into(), None, vec![ep_cpu()]))
    }
}

#[cfg(target_os = "linux")]
fn detect_gpu_linux() -> Result<GpuInfo, AppError> {
    let nvidia_present = std::path::Path::new("/dev/nvidia0").exists()
        || std::path::Path::new("/dev/nvidiactl").exists();

    let mut info = run_lspci()
        .map(|output| parse_lspci(&output))
        .unwrap_or_else(|_| gpu_info("unknown".into(), None, vec![ep_cpu()]));

    if (nvidia_present || info.vendor == "NVIDIA") && !info.available_eps.contains(&ep_cuda()) {
        info.available_eps.insert(0, ep_cuda());
    }

    if nvidia_present || info.vendor == "NVIDIA" {
        if let Some(vram) = query_nvidia_vram() {
            info.vram_bytes = Some(vram);
            info.optimization = optimization_label(info.vram_bytes);
        }
    }

    Ok(info)
}

#[cfg(target_os = "linux")]
fn query_nvidia_vram() -> Option<u64> {
    let output = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=memory.total", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout);
    let mib: u64 = text.trim().lines().next()?.trim().parse().ok()?;
    Some(mib * 1024 * 1024)
}

#[cfg(target_os = "linux")]
fn run_lspci() -> Result<String, AppError> {
    let output = std::process::Command::new("lspci")
        .arg("-nn")
        .output()
        .map_err(|e| AppError::Gpu(format!("lspci not available: {}", e)))?;
    if !output.status.success() {
        return Err(AppError::Gpu("lspci failed".into()));
    }
    Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(target_os = "linux")]
fn parse_lspci(output: &str) -> GpuInfo {
    let mut vendor_id = None;
    let mut vendor = None;

    for line in output.lines() {
        let lower = line.to_lowercase();
        if lower.contains("vga compatible controller") || lower.contains("3d controller") {
            for segment in line.split('[').skip(1) {
                if let Some(end) = segment.find(']') {
                    let content = segment[..end].split_whitespace().next().unwrap_or("");
                    if let Some(colon) = content.find(':') {
                        let left = &content[..colon];
                        let right = &content[colon + 1..];
                        if is_hex_4(left) && is_hex_4(right) {
                            if let Ok(vid) = u32::from_str_radix(left, 16) {
                                vendor_id = Some(vid);
                                vendor = Some(vid_to_vendor(vid));
                                break;
                            }
                        }
                    }
                }
            }
            break;
        }
    }

    let available_eps = if vendor_id == Some(NVIDIA_VENDOR_ID) {
        vec![ep_cuda(), ep_cpu()]
    } else {
        vec![ep_cpu()]
    };

    gpu_info(
        vendor.unwrap_or_else(|| "unknown".to_string()),
        None,
        available_eps,
    )
}

#[cfg(target_os = "linux")]
fn is_hex_4(s: &str) -> bool {
    s.len() == 4 && s.chars().all(|c| c.is_ascii_hexdigit())
}

fn vid_to_vendor(vid: u32) -> String {
    match vid {
        NVIDIA_VENDOR_ID => "NVIDIA".into(),
        AMD_VENDOR_ID => "AMD".into(),
        INTEL_VENDOR_ID => "Intel".into(),
        _ => format!("0x{:04X}", vid),
    }
}

fn ep_cpu() -> String {
    "cpu".into()
}

fn ep_cuda() -> String {
    "cuda".into()
}

#[cfg(target_os = "windows")]
fn ep_directml() -> String {
    "directml".into()
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
#[derive(Debug, Clone, Copy)]
struct DxgiAdapterCandidate {
    vendor_id: u32,
    dedicated_vram: u64,
}

/// Prefer the hardware adapter with the most dedicated VRAM (skips software adapters upstream).
#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn select_primary_adapter(candidates: &[DxgiAdapterCandidate]) -> Option<DxgiAdapterCandidate> {
    candidates
        .iter()
        .copied()
        .max_by_key(|candidate| candidate.dedicated_vram)
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn vram_bytes_from_dedicated(dedicated: u64) -> Option<u64> {
    if dedicated > 0 {
        Some(dedicated)
    } else {
        None
    }
}

#[cfg(target_os = "windows")]
fn query_dxgi_adapters() -> Result<Vec<DxgiAdapterCandidate>, AppError> {
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory1, DXGI_ADAPTER_DESC1, DXGI_ADAPTER_FLAG_SOFTWARE, IDXGIFactory1,
    };

    unsafe {
        let factory: IDXGIFactory1 = CreateDXGIFactory1()
            .map_err(|e| AppError::Gpu(format!("CreateDXGIFactory1 failed: {e}")))?;

        let mut candidates = Vec::new();
        let mut index = 0u32;

        loop {
            let adapter = match factory.EnumAdapters1(index) {
                Ok(adapter) => adapter,
                Err(_) => break,
            };
            index += 1;

            let mut desc = DXGI_ADAPTER_DESC1::default();
            if let Err(e) = adapter.GetDesc1(&mut desc) {
                log::warn!("DXGI GetDesc1 failed for adapter {index}: {e}");
                continue;
            }

            if desc.Flags.contains(DXGI_ADAPTER_FLAG_SOFTWARE) {
                continue;
            }

            candidates.push(DxgiAdapterCandidate {
                vendor_id: desc.VendorId,
                dedicated_vram: desc.DedicatedVideoMemory as u64,
            });
        }

        Ok(candidates)
    }
}

#[cfg(target_os = "windows")]
fn detect_gpu_windows() -> Result<GpuInfo, AppError> {
    let candidates = query_dxgi_adapters()?;
    let (vendor, vram_bytes) = match select_primary_adapter(&candidates) {
        Some(best) => (
            vid_to_vendor(best.vendor_id),
            vram_bytes_from_dedicated(best.dedicated_vram),
        ),
        None => ("unknown".into(), None),
    };
    let available_eps = vec![ep_directml(), ep_cpu()];

    Ok(gpu_info(vendor, vram_bytes, available_eps))
}

pub fn run_benchmark(app: &AppHandle) -> Result<BenchmarkResult, AppError> {
    let gpu_info = detect_gpu()?;
    let available_eps = gpu_info.available_eps;

    let img = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
        64,
        64,
        image::Rgb([128, 128, 128]),
    ));
    let original_size = (64, 64);

    let u2netp = crate::models::find_model("u2netp")?;
    let tensor = crate::pipeline::preprocess(u2netp, &img)?;

    let mut ep_latencies = Vec::new();
    // If the requested EP runtime is not installed, ORT silently falls back to CPU.
    for ep in available_eps {
        let seconds = crate::inference::with_session(
            "u2netp",
            &ep,
            || Ok(crate::inference::U2NETP_MODEL_BYTES.to_vec()),
            |session| {
                let _warmup = crate::inference::run(session, &tensor)?;
                let _warmup_alpha = crate::pipeline::postprocess("u2netp", original_size, &_warmup)?;
                let start = Instant::now();
                let output = crate::inference::run(session, &tensor)?;
                let _alpha = crate::pipeline::postprocess("u2netp", original_size, &output)?;
                Ok(start.elapsed().as_secs_f64())
            },
        )?;
        ep_latencies.push(EpLatency {
            ep: ep.clone(),
            seconds,
        });
    }

    let winner = ep_latencies
        .iter()
        .min_by(|a, b| a.seconds.partial_cmp(&b.seconds).unwrap_or(std::cmp::Ordering::Equal))
        .map(|l| l.ep.clone())
        .unwrap_or_else(ep_cpu);

    persist_ep(app, &winner)?;

    Ok(BenchmarkResult {
        ep_latencies,
        winner_ep: winner,
    })
}

fn persist_ep(app: &AppHandle, ep: &str) -> Result<(), AppError> {
    let normalized = ep.to_lowercase();
    let mut config = crate::config::load_config(app)?;
    config.execution_provider = Some(normalized);
    config.platform = Some(std::env::consts::OS.to_string());
    crate::config::save_config(app, &config)?;
    crate::inference::invalidate_all_sessions()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "linux")]
    fn parse_lspci_amd_returns_cpu_only() {
        let output =
            "01:00.0 VGA compatible controller [0300]: Advanced Micro Devices, Inc. [AMD/ATI] [1002:1638] (rev c1)\n";
        let info = parse_lspci(output);
        assert_eq!(info.vendor, "AMD");
        assert_eq!(info.available_eps, vec!["cpu"]);
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn parse_lspci_nvidia_returns_cuda_and_cpu() {
        let output = "00:01.0 3D controller [0302]: NVIDIA Corporation [10de:1c20] (rev a1)\n";
        let info = parse_lspci(output);
        assert_eq!(info.vendor, "NVIDIA");
        assert_eq!(info.available_eps, vec!["cuda", "cpu"]);
    }

    #[test]
    fn select_primary_adapter_picks_highest_vram() {
        let candidates = [
            DxgiAdapterCandidate {
                vendor_id: INTEL_VENDOR_ID,
                dedicated_vram: 128 * 1024 * 1024,
            },
            DxgiAdapterCandidate {
                vendor_id: NVIDIA_VENDOR_ID,
                dedicated_vram: 8 * 1024 * 1024 * 1024,
            },
        ];
        let best = select_primary_adapter(&candidates).unwrap();
        assert_eq!(best.vendor_id, NVIDIA_VENDOR_ID);
        assert_eq!(best.dedicated_vram, 8 * 1024 * 1024 * 1024);
    }

    #[test]
    fn select_primary_adapter_returns_none_for_empty() {
        assert!(select_primary_adapter(&[]).is_none());
    }

    #[test]
    fn vram_bytes_from_dedicated_returns_none_for_zero() {
        assert_eq!(vram_bytes_from_dedicated(0), None);
        assert_eq!(
            vram_bytes_from_dedicated(8 * 1024 * 1024 * 1024),
            Some(8 * 1024 * 1024 * 1024)
        );
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn parse_lspci_missing_returns_unknown_cpu() {
        let info = parse_lspci("Ethernet controller [0200]: Realtek Semiconductor Co., Ltd.\n");
        assert_eq!(info.vendor, "unknown");
        assert_eq!(info.available_eps, vec!["cpu"]);
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn benchmark_runs_on_available_eps() {
        let info = detect_gpu().unwrap();
        let img = image::DynamicImage::ImageRgb8(image::RgbImage::from_pixel(
            64,
            64,
            image::Rgb([128, 128, 128]),
        ));
        let u2netp = crate::models::find_model("u2netp").unwrap();
        let tensor = crate::pipeline::preprocess(u2netp, &img).unwrap();

        for ep in &info.available_eps {
            let mut session =
                crate::inference::load_session_from_bytes(crate::inference::U2NETP_MODEL_BYTES, ep)
                    .unwrap();
            let _warmup = crate::inference::run(&mut session, &tensor).unwrap();
            let _warmup_alpha = crate::pipeline::postprocess("u2netp", (64, 64), &_warmup).unwrap();
            let start = Instant::now();
            let output = crate::inference::run(&mut session, &tensor).unwrap();
            let _alpha = crate::pipeline::postprocess("u2netp", (64, 64), &output).unwrap();
            println!("benchmark {}: {}s", ep, start.elapsed().as_secs_f64());
        }
    }
}
