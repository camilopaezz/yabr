use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Config {
    pub execution_provider: Option<String>,
    pub model_id: Option<String>,
    pub output_dir: Option<String>,
    pub platform: Option<String>,
}
