use std::collections::VecDeque;
use std::panic::AssertUnwindSafe;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Condvar, Mutex};

use tauri::{AppHandle, Emitter};

use crate::error::AppError;
use crate::events::{
    InferenceDonePayload, InferenceErrorPayload, InferenceProgressPayload, INFERENCE_DONE,
    INFERENCE_ERROR, INFERENCE_PROGRESS,
};

#[derive(Debug, Clone)]
pub struct BatchJob {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
}

pub struct BatchState {
    queue: Mutex<VecDeque<BatchJob>>,
    condvar: Condvar,
    cancel: AtomicBool,
}

impl BatchState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            queue: Mutex::new(VecDeque::new()),
            condvar: Condvar::new(),
            cancel: AtomicBool::new(false),
        })
    }

    pub fn enqueue(&self, job: BatchJob) {
        let mut queue = self.queue.lock().unwrap_or_else(|e| e.into_inner());
        queue.push_back(job);
        self.condvar.notify_one();
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        self.condvar.notify_one();
    }

    fn check_cancel(&self) -> Result<(), AppError> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

fn emit_progress(app: &AppHandle, id: String, stage: &str, pct: f32) -> Result<(), AppError> {
    app.emit(
        INFERENCE_PROGRESS,
        InferenceProgressPayload {
            id,
            stage: stage.to_string(),
            pct,
        },
    )
    .map_err(|e| AppError::Inference(e.to_string()))
}

fn emit_done(app: &AppHandle, id: String, output_path: String) -> Result<(), AppError> {
    app.emit(
        INFERENCE_DONE,
        InferenceDonePayload { id, output_path },
    )
    .map_err(|e| AppError::Inference(e.to_string()))
}

fn emit_error(app: &AppHandle, id: String, message: String) {
    let _ = app.emit(
        INFERENCE_ERROR,
        InferenceErrorPayload { id, message },
    );
}

fn run_one_job(app: &AppHandle, state: &BatchState, job: &BatchJob) -> Result<(), AppError> {
    state.check_cancel()?;

    let model = crate::models::find_model(&job.model_id)?;
    if !model.bundled {
        let cache_path = crate::models::model_cache_path(app, model)?;
        if !cache_path.exists() {
            return Err(AppError::Model(format!(
                "model '{}' is not downloaded",
                job.model_id
            )));
        }
    }

    emit_progress(app, job.id.clone(), "decoding", 10.0)?;
    state.check_cancel()?;
    let image_bytes = std::fs::read(&job.input_path)?;
    let img = crate::image_io::decode(&image_bytes)?;
    let original_size = (img.width(), img.height());
    let rgb = img.to_rgb8();

    emit_progress(app, job.id.clone(), "preprocessing", 20.0)?;
    state.check_cancel()?;
    let tensor = crate::pipeline::preprocess(model, &img)?;

    emit_progress(app, job.id.clone(), "inferring", 50.0)?;
    state.check_cancel()?;
    let model_bytes = if model.bundled {
        crate::inference::U2NETP_MODEL_BYTES.to_vec()
    } else {
        std::fs::read(crate::models::model_cache_path(app, model)?)?
    };
    let ep = crate::config::load_config(app)?.execution_provider();
    let output = crate::inference::with_session(&job.model_id, &ep, &model_bytes, |session| {
        crate::inference::run(session, &tensor)
    })?;

    emit_progress(app, job.id.clone(), "postprocessing", 80.0)?;
    state.check_cancel()?;
    let alpha = crate::pipeline::postprocess(&job.model_id, original_size, &output)?;

    emit_progress(app, job.id.clone(), "encoding", 95.0)?;
    state.check_cancel()?;
    let output_bytes = crate::image_io::encode_png_rgba(&rgb, &alpha)?;
    std::fs::write(&job.output_path, output_bytes)?;

    emit_done(app, job.id.clone(), job.output_path.clone())
}

pub fn start_worker(app: AppHandle, state: Arc<BatchState>) {
    std::thread::spawn(move || {
        let mut was_empty = true;
        loop {
            let job = {
                let mut queue = state.queue.lock().unwrap_or_else(|e| e.into_inner());
                while queue.is_empty() {
                    was_empty = true;
                    queue = state.condvar.wait(queue).unwrap_or_else(|e| e.into_inner());
                }
                if was_empty {
                    state.cancel.store(false, Ordering::SeqCst);
                    was_empty = false;
                }
                queue.pop_front().unwrap()
            };

            if state.cancel.load(Ordering::SeqCst) {
                emit_error(&app, job.id.clone(), "cancelled".to_string());
                let mut queue = state.queue.lock().unwrap_or_else(|e| e.into_inner());
                for remaining in queue.drain(..) {
                    emit_error(&app, remaining.id, "cancelled".to_string());
                }
                was_empty = true;
                continue;
            }

            let job_id = job.id.clone();
            let result = std::panic::catch_unwind(AssertUnwindSafe(|| run_one_job(&app, &state, &job)));

            match result {
                Ok(Ok(())) => {}
                Ok(Err(AppError::Cancelled)) => {
                    emit_error(&app, job_id, "cancelled".to_string());
                }
                Ok(Err(e)) => {
                    emit_error(&app, job_id, e.to_string());
                }
                Err(_) => {
                    emit_error(&app, job_id, "worker panic".to_string());
                }
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn enqueue_adds_jobs_and_cancel_sets_token() {
        let state = BatchState::new();
        let job1 = BatchJob {
            id: "a".into(),
            input_path: "/tmp/a.png".into(),
            output_path: "/tmp/a-nobg.png".into(),
            model_id: "u2netp".into(),
        };
        let job2 = BatchJob {
            id: "b".into(),
            input_path: "/tmp/b.png".into(),
            output_path: "/tmp/b-nobg.png".into(),
            model_id: "u2netp".into(),
        };

        state.enqueue(job1.clone());
        state.enqueue(job2.clone());

        {
            let queue = state.queue.lock().unwrap();
            assert_eq!(queue.len(), 2);
            assert_eq!(queue.front().unwrap().id, "a");
        }

        state.cancel();
        assert!(state.cancel.load(Ordering::SeqCst));

        {
            let queue = state.queue.lock().unwrap();
            assert_eq!(queue.len(), 2);
        }
    }

    #[test]
    fn fresh_batch_resets_cancel_token() {
        let state = BatchState::new();
        state.cancel.store(true, Ordering::SeqCst);

        state.enqueue(BatchJob {
            id: "a".into(),
            input_path: "/tmp/a.png".into(),
            output_path: "/tmp/a-nobg.png".into(),
            model_id: "u2netp".into(),
        });

        let mut queue = state.queue.lock().unwrap();
        while queue.is_empty() {
            queue = state.condvar.wait(queue).unwrap();
        }

        state.cancel.store(false, Ordering::SeqCst);
        assert!(!state.cancel.load(Ordering::SeqCst));
    }
}
