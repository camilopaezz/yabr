pub mod commands;
mod config;
pub mod error;
mod events;
mod gpu;
pub mod image_io;
pub mod inference;
pub mod job;
pub mod models;
pub mod pipeline;
pub mod processing;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(crate::processing::ProcessingState::new())
        .invoke_handler(tauri::generate_handler![
            commands::detect_gpu,
            commands::run_benchmark,
            commands::set_ep,
            commands::list_models,
            commands::download_model,
            commands::remove_image_background,
            commands::cancel_inference,
            commands::pick_output_dir,
            commands::get_config,
            commands::set_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
