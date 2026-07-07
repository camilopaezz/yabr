use serde::{Deserialize, Serialize};

use crate::error::AppError;

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
    pub downloaded: bool,
}

pub fn list_models() -> Result<Vec<ModelMeta>, AppError> {
    Ok(vec![
        ModelMeta {
            id: "u2netp".into(),
            name: "U^2-Netp".into(),
            file: "u2netp.onnx".into(),
            size_bytes: 4_574_861,
            input_size: 320,
            mean: vec![0.485, 0.456, 0.406],
            std: vec![0.229, 0.224, 0.225],
            license: "Apache-2.0".into(),
            source: "xuebinqin/U-2-Net".into(),
            downloaded: false,
        },
        ModelMeta {
            id: "isnet-general-use".into(),
            name: "ISNet-General-Use".into(),
            file: "isnet-general-use.onnx".into(),
            size_bytes: 178_000_000,
            input_size: 1024,
            mean: vec![0.485, 0.456, 0.406],
            std: vec![0.229, 0.224, 0.225],
            license: "Apache-2.0".into(),
            source: "xuebinqin/DIS".into(),
            downloaded: false,
        },
        ModelMeta {
            id: "rmbg-1.4".into(),
            name: "RMBG-1.4".into(),
            file: "rmbg-1.4.onnx".into(),
            size_bytes: 176_000_000,
            input_size: 1024,
            mean: vec![0.5, 0.5, 0.5],
            std: vec![1.0, 1.0, 1.0],
            license: "CC BY-NC 4.0".into(),
            source: "briaai/RMBG-1.4".into(),
            downloaded: false,
        },
        ModelMeta {
            id: "rmbg-2.0".into(),
            name: "RMBG-2.0".into(),
            file: "rmbg-2.0.onnx".into(),
            size_bytes: 173_000_000,
            input_size: 1024,
            mean: vec![0.485, 0.456, 0.406],
            std: vec![0.229, 0.224, 0.225],
            license: "CC BY-NC 4.0".into(),
            source: "briaai/RMBG-2.0".into(),
            downloaded: false,
        },
    ])
}

pub fn download_model(_model_id: &str) -> Result<(), AppError> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_four_models() {
        let models = list_models().unwrap();
        assert_eq!(models.len(), 4);
        assert!(models.iter().any(|m| m.id == "u2netp"));
    }

    #[test]
    fn u2netp_metadata() {
        let models = list_models().unwrap();
        let u2netp = models.iter().find(|m| m.id == "u2netp").unwrap();
        assert_eq!(u2netp.input_size, 320);
        assert_eq!(u2netp.mean, vec![0.485, 0.456, 0.406]);
        assert_eq!(u2netp.std, vec![0.229, 0.224, 0.225]);
    }
}
