use serde::{Deserialize, Serialize};

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GpuInfo {
    pub vendor: String,
    pub vram_bytes: Option<u64>,
    pub available_eps: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BenchmarkResult {
    pub ep_latencies: Vec<EpLatency>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpLatency {
    pub ep: String,
    pub seconds: f64,
}

pub fn detect_gpu() -> Result<GpuInfo, AppError> {
    Ok(GpuInfo {
        vendor: "unknown".into(),
        vram_bytes: None,
        available_eps: vec!["CPUExecutionProvider".into()],
    })
}

pub fn run_benchmark() -> Result<BenchmarkResult, AppError> {
    Ok(BenchmarkResult {
        ep_latencies: vec![EpLatency {
            ep: "CPUExecutionProvider".into(),
            seconds: 0.0,
        }],
    })
}
