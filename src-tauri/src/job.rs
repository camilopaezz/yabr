use std::time::Instant;

use crate::error::AppError;
use crate::events::{JobTimings, StageTiming};
use crate::processing::ProcessingState;

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProcessingJob {
    pub id: String,
    pub input_path: String,
    pub output_path: String,
    pub model_id: String,
}

pub trait JobSink {
    fn on_progress(&self, stage: &str, pct: f32) -> Result<(), AppError>;
    fn on_done(&self, output_path: &str, timings: &JobTimings) -> Result<(), AppError>;
    fn on_error(&self, message: &str);
}

pub struct JobDeps<'a> {
    pub sink: &'a dyn JobSink,
    pub execution_provider: &'a dyn Fn() -> Result<String, AppError>,
    pub model_is_ready: &'a dyn Fn(&crate::models::ModelEntry) -> Result<bool, AppError>,
    pub load_model_bytes: &'a dyn Fn(&crate::models::ModelEntry) -> Result<Vec<u8>, AppError>,
}

struct StageTimer {
    stage: &'static str,
    start: Instant,
}

impl StageTimer {
    fn start(stage: &'static str) -> Self {
        Self {
            stage,
            start: Instant::now(),
        }
    }

    fn finish(self) -> StageTiming {
        StageTiming {
            stage: self.stage.into(),
            seconds: self.start.elapsed().as_secs_f64(),
        }
    }
}

pub fn run(
    job: &ProcessingJob,
    state: &ProcessingState,
    deps: &JobDeps<'_>,
) -> Result<(), AppError> {
    let result = run_inner(job, state, deps);
    if let Err(ref err) = result {
        deps.sink.on_error(&err.to_string());
    }
    result
}

fn run_inner(
    job: &ProcessingJob,
    state: &ProcessingState,
    deps: &JobDeps<'_>,
) -> Result<(), AppError> {
    let job_start = Instant::now();
    let mut stages = Vec::new();

    state.check_cancel()?;

    let model = crate::models::find_model(&job.model_id)?;
    if !model.bundled && !(deps.model_is_ready)(model)? {
        return Err(AppError::Model(format!(
            "model '{}' is not downloaded",
            job.model_id
        )));
    }

    deps.sink.on_progress("decoding", 10.0)?;
    state.check_cancel()?;
    let timer = StageTimer::start("decoding");
    let image_bytes = std::fs::read(&job.input_path)?;
    let img = crate::image_io::decode(&image_bytes)?;
    let original_size = (img.width(), img.height());
    let rgb = img.to_rgb8();
    stages.push(timer.finish());

    deps.sink.on_progress("preprocessing", 20.0)?;
    state.check_cancel()?;
    let timer = StageTimer::start("preprocessing");
    let tensor = crate::pipeline::preprocess(model, &img)?;
    stages.push(timer.finish());

    deps.sink.on_progress("inferring", 50.0)?;
    state.check_cancel()?;
    let timer = StageTimer::start("inferring");
    let ep = (deps.execution_provider)()?;
    let output = crate::inference::with_session(
        &job.model_id,
        &ep,
        || (deps.load_model_bytes)(model),
        |session| crate::inference::run(session, &tensor),
    )?;
    stages.push(timer.finish());

    deps.sink.on_progress("postprocessing", 80.0)?;
    state.check_cancel()?;
    let timer = StageTimer::start("postprocessing");
    let alpha = crate::pipeline::postprocess(&job.model_id, original_size, &output)?;
    stages.push(timer.finish());

    deps.sink.on_progress("encoding", 95.0)?;
    state.check_cancel()?;
    let timer = StageTimer::start("encoding");
    let output_bytes = crate::image_io::encode_png_rgba(&rgb, &alpha)?;
    std::fs::write(&job.output_path, output_bytes)?;
    stages.push(timer.finish());

    let timings = JobTimings {
        stages,
        total_seconds: job_start.elapsed().as_secs_f64(),
    };
    deps.sink.on_done(&job.output_path, &timings)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    struct Recorder {
        progress: Mutex<Vec<(String, f32)>>,
        done: Mutex<Option<String>>,
        timings: Mutex<Option<JobTimings>>,
        errors: Mutex<Vec<String>>,
    }

    impl Recorder {
        fn new() -> Self {
            Self {
                progress: Mutex::new(Vec::new()),
                done: Mutex::new(None),
                timings: Mutex::new(None),
                errors: Mutex::new(Vec::new()),
            }
        }
    }

    impl JobSink for Recorder {
        fn on_progress(&self, stage: &str, pct: f32) -> Result<(), AppError> {
            self.progress
                .lock()
                .unwrap()
                .push((stage.to_string(), pct));
            Ok(())
        }

        fn on_done(&self, output_path: &str, timings: &JobTimings) -> Result<(), AppError> {
            *self.done.lock().unwrap() = Some(output_path.to_string());
            *self.timings.lock().unwrap() = Some(timings.clone());
            Ok(())
        }

        fn on_error(&self, message: &str) {
            self.errors.lock().unwrap().push(message.to_string());
        }
    }

    fn ready_true(_model: &crate::models::ModelEntry) -> Result<bool, AppError> {
        Ok(true)
    }

    fn ready_false(_model: &crate::models::ModelEntry) -> Result<bool, AppError> {
        Ok(false)
    }

    fn ep_cpu() -> Result<String, AppError> {
        Ok("cpu".to_string())
    }

    fn load_u2netp(_model: &crate::models::ModelEntry) -> Result<Vec<u8>, AppError> {
        Ok(crate::inference::U2NETP_MODEL_BYTES.to_vec())
    }

    #[test]
    fn cancel_before_work() {
        let state = ProcessingState::new();
        state.cancel();
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("out.png");
        let recorder = Recorder::new();
        let job = ProcessingJob {
            id: "job-cancel".into(),
            input_path: dir.path().join("missing.png").to_string_lossy().into(),
            output_path: output.to_string_lossy().into(),
            model_id: "u2netp".into(),
        };
        let deps = JobDeps {
            sink: &recorder,
            execution_provider: &ep_cpu,
            model_is_ready: &ready_true,
            load_model_bytes: &load_u2netp,
        };

        let err = run(&job, &state, &deps).unwrap_err();
        assert!(matches!(err, AppError::Cancelled));
        assert_eq!(recorder.errors.lock().unwrap().as_slice(), ["cancelled"]);
        assert!(recorder.done.lock().unwrap().is_none());
        assert!(!output.exists());
        assert!(recorder.progress.lock().unwrap().is_empty());
    }

    /// Sink that cancels the shared token on the first progress event (after run has started).
    struct CancelOnProgress {
        state: Arc<ProcessingState>,
        inner: Recorder,
    }

    impl JobSink for CancelOnProgress {
        fn on_progress(&self, stage: &str, pct: f32) -> Result<(), AppError> {
            self.inner.on_progress(stage, pct)?;
            self.state.cancel();
            Ok(())
        }

        fn on_done(&self, output_path: &str, timings: &JobTimings) -> Result<(), AppError> {
            self.inner.on_done(output_path, timings)
        }

        fn on_error(&self, message: &str) {
            self.inner.on_error(message);
        }
    }

    #[test]
    fn cancel_between_stages() {
        let state = ProcessingState::new();
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("in.png");
        let output = dir.path().join("out.png");
        let rgb = image::RgbImage::from_pixel(16, 16, image::Rgb([10, 20, 30]));
        rgb.save(&input).unwrap();

        let sink = CancelOnProgress {
            state: Arc::clone(&state),
            inner: Recorder::new(),
        };
        let job = ProcessingJob {
            id: "job-mid-cancel".into(),
            input_path: input.to_string_lossy().into(),
            output_path: output.to_string_lossy().into(),
            model_id: "u2netp".into(),
        };
        let deps = JobDeps {
            sink: &sink,
            execution_provider: &ep_cpu,
            model_is_ready: &ready_true,
            load_model_bytes: &load_u2netp,
        };

        let err = run(&job, &state, &deps).unwrap_err();
        assert!(matches!(err, AppError::Cancelled));
        assert_eq!(sink.inner.errors.lock().unwrap().as_slice(), ["cancelled"]);
        assert!(sink.inner.done.lock().unwrap().is_none());
        // First progress fired; cancel before completing the pipeline.
        assert!(!sink.inner.progress.lock().unwrap().is_empty());
        assert!(!output.exists());
    }

    #[test]
    fn missing_input_file() {
        let state = ProcessingState::new();
        let dir = tempfile::tempdir().unwrap();
        let output = dir.path().join("out.png");
        let missing = dir.path().join("no-such-input.png");
        let recorder = Recorder::new();
        let job = ProcessingJob {
            id: "job-missing".into(),
            input_path: missing.to_string_lossy().into(),
            output_path: output.to_string_lossy().into(),
            model_id: "u2netp".into(),
        };
        let deps = JobDeps {
            sink: &recorder,
            execution_provider: &ep_cpu,
            model_is_ready: &ready_true,
            load_model_bytes: &load_u2netp,
        };

        let err = run(&job, &state, &deps).unwrap_err();
        assert!(
            matches!(err, AppError::Io(_)),
            "expected Io error, got {:?}",
            err
        );
        let errors = recorder.errors.lock().unwrap();
        assert_eq!(errors.as_slice(), [err.to_string()]);
        assert!(recorder.done.lock().unwrap().is_none());
        assert!(!output.exists());
    }

    #[test]
    fn model_not_downloaded() {
        let state = ProcessingState::new();
        let dir = tempfile::tempdir().unwrap();
        let recorder = Recorder::new();
        let job = ProcessingJob {
            id: "job-model".into(),
            input_path: dir.path().join("in.png").to_string_lossy().into(),
            output_path: dir.path().join("out.png").to_string_lossy().into(),
            model_id: "isnet-general-use".into(),
        };
        let deps = JobDeps {
            sink: &recorder,
            execution_provider: &ep_cpu,
            model_is_ready: &ready_false,
            load_model_bytes: &load_u2netp,
        };

        let err = run(&job, &state, &deps).unwrap_err();
        match err {
            AppError::Model(msg) => {
                assert!(msg.contains("isnet-general-use"));
                assert!(msg.contains("not downloaded"));
            }
            other => panic!("expected Model error, got {:?}", other),
        }
        let errors = recorder.errors.lock().unwrap();
        assert_eq!(errors.len(), 1);
        assert!(errors[0].contains("not downloaded"));
        assert!(recorder.done.lock().unwrap().is_none());
    }

    #[test]
    fn happy_path_u2netp() {
        let state = ProcessingState::new();
        let dir = tempfile::tempdir().unwrap();
        let input = dir.path().join("in.png");
        let output = dir.path().join("out.png");

        let rgb = image::RgbImage::from_pixel(32, 32, image::Rgb([200, 100, 50]));
        rgb.save(&input).unwrap();

        let recorder = Recorder::new();
        let job = ProcessingJob {
            id: "job-happy".into(),
            input_path: input.to_string_lossy().into(),
            output_path: output.to_string_lossy().into(),
            model_id: "u2netp".into(),
        };
        let deps = JobDeps {
            sink: &recorder,
            execution_provider: &ep_cpu,
            model_is_ready: &ready_true,
            load_model_bytes: &load_u2netp,
        };

        run(&job, &state, &deps).expect("happy path should succeed");

        let stages: Vec<String> = recorder
            .progress
            .lock()
            .unwrap()
            .iter()
            .map(|(s, _)| s.clone())
            .collect();
        assert_eq!(
            stages,
            vec![
                "decoding",
                "preprocessing",
                "inferring",
                "postprocessing",
                "encoding",
            ]
        );
        assert_eq!(
            recorder.done.lock().unwrap().as_deref(),
            Some(output.to_string_lossy().as_ref())
        );
        let timings = recorder.timings.lock().unwrap().clone().unwrap();
        assert_eq!(
            timings
                .stages
                .iter()
                .map(|t| t.stage.as_str())
                .collect::<Vec<_>>(),
            vec![
                "decoding",
                "preprocessing",
                "inferring",
                "postprocessing",
                "encoding",
            ]
        );
        assert!(timings.stages.iter().all(|t| t.seconds >= 0.0));
        assert!(timings.total_seconds >= 0.0);
        assert!(recorder.errors.lock().unwrap().is_empty());
        assert!(output.exists());
        let out_bytes = std::fs::read(&output).unwrap();
        assert!(!out_bytes.is_empty());
        // PNG magic
        assert_eq!(&out_bytes[..8], b"\x89PNG\r\n\x1a\n");
        let decoded = crate::image_io::decode(&out_bytes).expect("output should decode");
        assert_eq!(decoded.width(), 32);
        assert_eq!(decoded.height(), 32);
        assert!(
            decoded.color().has_alpha(),
            "job output PNG must include an alpha channel"
        );
    }
}
