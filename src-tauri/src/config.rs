use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::error::AppError;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    pub execution_provider: Option<String>,
    pub model_id: Option<String>,
    pub output_dir: Option<String>,
    pub platform: Option<String>,
}

impl Config {
    pub fn execution_provider(&self) -> String {
        self.execution_provider
            .clone()
            .unwrap_or_else(|| "cpu".to_string())
    }
}

pub fn config_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Config(e.to_string()))?;
    Ok(app_data.join("config.json"))
}

pub fn load_config(app: &AppHandle) -> Result<Config, AppError> {
    let path = config_path(app)?;
    if !path.exists() {
        return Ok(Config::default());
    }
    let bytes = std::fs::read(&path)?;
    let config = serde_json::from_slice(&bytes)?;
    Ok(config)
}

pub fn save_config(app: &AppHandle, config: &Config) -> Result<(), AppError> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(config)?;
    std::fs::write(&path, bytes)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_defaults_to_cpu() {
        let config = Config::default();
        assert_eq!(config.execution_provider(), "cpu");
    }

    #[test]
    fn config_serde_round_trip() {
        let config = Config {
            execution_provider: Some("cuda".to_string()),
            model_id: Some("u2netp".to_string()),
            output_dir: Some("/tmp".to_string()),
            platform: Some("linux".to_string()),
        };
        let json = serde_json::to_string(&config).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.execution_provider(), "cuda");
        assert_eq!(parsed.model_id, Some("u2netp".to_string()));
    }
}
