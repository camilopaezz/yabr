use ndarray::Array4;
use ort::session::Session;
use ort::value::TensorRef;

use crate::error::AppError;

pub static U2NETP_MODEL_BYTES: &[u8] = include_bytes!("../models/u2netp.onnx");

pub fn load_session_from_bytes(model_bytes: &[u8]) -> Result<Session, AppError> {
    Session::builder()
        .map_err(|e| AppError::Inference(e.to_string()))?
        .with_optimization_level(ort::session::builder::GraphOptimizationLevel::Level3)
        .map_err(|e| AppError::Inference(e.to_string()))?
        .commit_from_memory(model_bytes)
        .map_err(|e| AppError::Inference(e.to_string()))
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
    fn bundled_u2netp_loads() {
        let session = load_session_from_bytes(U2NETP_MODEL_BYTES).unwrap();
        assert_eq!(session.inputs().len(), 1);
    }
}
