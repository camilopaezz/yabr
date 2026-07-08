use std::collections::HashMap;
use std::sync::Mutex;

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

    Session::builder()
        .map_err(|e| AppError::Inference(e.to_string()))?
        .with_optimization_level(GraphOptimizationLevel::Level3)
        .map_err(|e| AppError::Inference(e.to_string()))?
        .with_execution_providers(providers)
        .map_err(|e| AppError::Inference(e.to_string()))?
        .commit_from_memory(model_bytes)
        .map_err(|e| AppError::Inference(e.to_string()))
}

pub fn invalidate_all_sessions() -> Result<(), AppError> {
    let mut guard = SESSION_CACHE
        .lock()
        .map_err(|e| AppError::Inference(e.to_string()))?;
    *guard = None;
    Ok(())
}

pub fn with_session<F, R>(model_id: &str, ep: &str, model_bytes: &[u8], f: F) -> Result<R, AppError>
where
    F: FnOnce(&mut Session) -> Result<R, AppError>,
{
    let mut guard = SESSION_CACHE
        .lock()
        .map_err(|e| AppError::Inference(e.to_string()))?;
    let cache = guard.get_or_insert_with(HashMap::new);
    let key = (model_id.to_string(), ep.to_string());
    if !cache.contains_key(&key) {
        let session = load_session_from_bytes(model_bytes, ep)?;
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
    #[cfg(target_os = "windows")]
    fn directml_ep_loads() {
        let session = load_session_from_bytes(U2NETP_MODEL_BYTES, EP_DIRECTML).unwrap();
        assert_eq!(session.inputs().len(), 1);
    }

    #[test]
    fn session_cache_keyed_by_model_and_ep() {
        let _ = invalidate_all_sessions();
        let r1 = with_session("u2netp", EP_CPU, U2NETP_MODEL_BYTES, |session| {
            Ok(session.inputs().len())
        });
        let r2 = with_session("u2netp", EP_CPU, U2NETP_MODEL_BYTES, |session| {
            Ok(session.inputs().len())
        });
        let r3 = with_session("isnet-stub", EP_CPU, U2NETP_MODEL_BYTES, |session| {
            Ok(session.inputs().len())
        });
        assert_eq!(r1.unwrap(), 1);
        assert_eq!(r2.unwrap(), 1);
        assert_eq!(r3.unwrap(), 1);
    }
}
