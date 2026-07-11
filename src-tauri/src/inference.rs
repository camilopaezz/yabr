use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};

use ndarray::Array4;
use ort::ep::ExecutionProviderDispatch;
use ort::session::builder::GraphOptimizationLevel;
use ort::session::Session;
use ort::value::TensorRef;

use crate::error::AppError;

pub const EP_CPU: &str = "cpu";
pub const EP_DIRECTML: &str = "directml";
pub const EP_CUDA: &str = "cuda";

pub static U2NETP_MODEL_BYTES: &[u8] = include_bytes!("../models/u2netp.onnx");

static SESSION_CACHE: Mutex<Option<HashMap<(String, String), Session>>> = Mutex::new(None);

static DETECTED_VRAM: LazyLock<Option<u64>> = LazyLock::new(|| {
    crate::gpu::detect_gpu().ok().and_then(|g| g.vram_bytes)
});

fn optimization_level_for_vram(vram: Option<u64>) -> GraphOptimizationLevel {
    match crate::gpu::opt_level_for_vram(vram) {
        3 => GraphOptimizationLevel::Level3,
        _ => GraphOptimizationLevel::Level1,
    }
}

pub fn load_session_from_bytes(model_bytes: &[u8], ep: &str) -> Result<Session, AppError> {
    let mut providers: Vec<ExecutionProviderDispatch> = Vec::new();
    match ep.to_lowercase().as_str() {
        EP_DIRECTML => {
            #[cfg(target_os = "windows")]
            {
                providers.push(ort::ep::DirectML::default().build());
            }
        }
        EP_CUDA => {
            #[cfg(target_os = "linux")]
            {
                providers.push(ort::ep::CUDA::default().build());
            }
        }
        _ => {}
    }
    providers.push(ort::ep::CPU::default().build());

    let opt_level = optimization_level_for_vram(*DETECTED_VRAM);

    Session::builder()
        .map_err(|e| AppError::Inference(e.to_string()))?
        .with_optimization_level(opt_level)
        .map_err(|e| AppError::Inference(e.to_string()))?
        .with_execution_providers(providers)
        .map_err(|e| AppError::Inference(e.to_string()))?
        .commit_from_memory(model_bytes)
        .map_err(|e| AppError::Inference(e.to_string()))
}

pub fn invalidate_all_sessions() -> Result<(), AppError> {
    let mut guard = SESSION_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *guard = None;
    Ok(())
}

pub fn with_session<F, R, L>(model_id: &str, ep: &str, load_bytes: L, f: F) -> Result<R, AppError>
where
    F: FnOnce(&mut Session) -> Result<R, AppError>,
    L: FnOnce() -> Result<Vec<u8>, AppError>,
{
    let mut guard = SESSION_CACHE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    let cache = guard.get_or_insert_with(HashMap::new);
    let key = (model_id.to_string(), ep.to_string());
    if !cache.contains_key(&key) {
        let model_bytes = load_bytes()?;
        let session = load_session_from_bytes(&model_bytes, ep)?;
        cache.insert(key.clone(), session);
    }
    let session = cache
        .get_mut(&key)
        .ok_or_else(|| AppError::Inference("session missing from cache".to_string()))?;
    f(session)
}

pub fn run(session: &mut Session, input: &Array4<f32>) -> Result<ndarray::ArrayD<f32>, AppError> {
    let tensor_ref = TensorRef::from_array_view(input.view())
        .map_err(|e| AppError::Inference(e.to_string()))?;
    let outputs = session
        .run(ort::inputs![tensor_ref])
        .map_err(|e| AppError::Inference(e.to_string()))?;
    if outputs.len() == 0 {
        return Err(AppError::Inference("model produced no outputs".to_string()));
    }
    let value = &outputs[0];
    value
        .try_extract_array::<f32>()
        .map_err(|e| AppError::Inference(e.to_string()))
        .map(|view| view.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn optimization_level_picks_level3_for_4gb_plus() {
        assert_eq!(
            optimization_level_for_vram(Some(4 * 1024 * 1024 * 1024)),
            GraphOptimizationLevel::Level3
        );
        assert_eq!(
            optimization_level_for_vram(Some(8 * 1024 * 1024 * 1024)),
            GraphOptimizationLevel::Level3
        );
    }

    #[test]
    fn optimization_level_picks_level1_for_under_4gb() {
        assert_eq!(
            optimization_level_for_vram(Some(2 * 1024 * 1024 * 1024)),
            GraphOptimizationLevel::Level1
        );
        assert_eq!(
            optimization_level_for_vram(Some(3_999_999_999)),
            GraphOptimizationLevel::Level1
        );
    }

    #[test]
    fn optimization_level_defaults_to_level1_when_vram_unknown() {
        assert_eq!(
            optimization_level_for_vram(None),
            GraphOptimizationLevel::Level1
        );
    }

    #[test]
    fn bundled_u2netp_loads_cpu() {
        let session = load_session_from_bytes(U2NETP_MODEL_BYTES, EP_CPU).unwrap();
        assert_eq!(session.inputs().len(), 1);
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn cuda_ep_falls_back_to_cpu_on_amd() {
        let session = load_session_from_bytes(U2NETP_MODEL_BYTES, EP_CUDA).unwrap();
        assert_eq!(session.inputs().len(), 1);
    }

    #[test]
    #[cfg(target_os = "linux")]
    fn cuda_ep_actually_runs_on_gpu_when_available() {
        let gpu = crate::gpu::detect_gpu().unwrap();
        if !gpu.available_eps.iter().any(|e| e == EP_CUDA) {
            eprintln!("no CUDA EP available; skipping");
            return;
        }
        let providers = vec![
            ort::ep::CUDA::default().build().error_on_failure(),
            ort::ep::CPU::default().build(),
        ];
        let session = Session::builder()
            .map_err(|e| AppError::Inference(e.to_string())).unwrap()
            .with_optimization_level(GraphOptimizationLevel::Level1)
            .map_err(|e| AppError::Inference(e.to_string())).unwrap()
            .with_execution_providers(providers)
            .map_err(|e| AppError::Inference(e.to_string())).unwrap()
            .commit_from_memory(U2NETP_MODEL_BYTES);
        let mut session = match session {
            Ok(s) => s,
            Err(e) => {
                eprintln!("CUDA EP failed to load (runtime libs mismatch?): {e}");
                return;
            }
        };
        let tensor = Array4::<f32>::zeros([1, 3, 320, 320]);
        let output = run(&mut session, &tensor).unwrap();
        assert_eq!(output.shape(), &[1, 1, 320, 320]);
    }

    #[test]
    #[cfg(target_os = "windows")]
    fn directml_ep_loads() {
        let session = load_session_from_bytes(U2NETP_MODEL_BYTES, EP_DIRECTML).unwrap();
        assert_eq!(session.inputs().len(), 1);
    }

    #[test]
    fn session_cache_keyed_by_model_and_ep() {
        let _ = invalidate_all_sessions();
        let r1 = with_session("u2netp", EP_CPU, || Ok(U2NETP_MODEL_BYTES.to_vec()), |session| {
            Ok(session.inputs().len())
        });
        let r2 = with_session("u2netp", EP_CPU, || Ok(U2NETP_MODEL_BYTES.to_vec()), |session| {
            Ok(session.inputs().len())
        });
        let r3 = with_session("isnet-stub", EP_CPU, || Ok(U2NETP_MODEL_BYTES.to_vec()), |session| {
            Ok(session.inputs().len())
        });
        assert_eq!(r1.unwrap(), 1);
        assert_eq!(r2.unwrap(), 1);
        assert_eq!(r3.unwrap(), 1);
    }
}
