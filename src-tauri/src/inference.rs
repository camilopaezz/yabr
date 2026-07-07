use ndarray::Array4;

use crate::error::AppError;

pub struct Session;

pub fn load_session(_model_path: &std::path::Path) -> Result<Session, AppError> {
    todo!()
}

pub fn run(_session: &Session, _input: &Array4<f32>) -> Result<ndarray::ArrayD<f32>, AppError> {
    todo!()
}
