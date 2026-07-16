use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use crate::error::AppError;

pub struct ProcessingState {
    cancel: AtomicBool,
    busy: AtomicBool,
    /// Job id currently holding the slot; cancel only applies when it matches.
    active_job_id: Mutex<Option<String>>,
}

impl ProcessingState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cancel: AtomicBool::new(false),
            busy: AtomicBool::new(false),
            active_job_id: Mutex::new(None),
        })
    }

    /// Acquire the single-flight inference slot or reject if a job is active.
    pub fn try_acquire(&self, job_id: &str) -> Result<(), AppError> {
        if self
            .busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .is_err()
        {
            return Err(AppError::Inference("already processing".into()));
        }
        self.cancel.store(false, Ordering::SeqCst);
        *self
            .active_job_id
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = Some(job_id.to_string());
        Ok(())
    }

    pub fn release(&self) {
        self.busy.store(false, Ordering::SeqCst);
        *self
            .active_job_id
            .lock()
            .unwrap_or_else(|e| e.into_inner()) = None;
    }

    pub fn is_busy(&self) -> bool {
        self.busy.load(Ordering::SeqCst)
    }

    /// Request cancel only if `job_id` is still the active worker (ignores stale IPC).
    pub fn cancel_job(&self, job_id: &str) {
        let active = self
            .active_job_id
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if active.as_deref() == Some(job_id) {
            self.cancel.store(true, Ordering::SeqCst);
        }
    }

    /// Unscoped cancel — tests and internal use when the active job is known.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn check_cancel(&self) -> Result<(), AppError> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

/// Releases the inference slot when dropped.
pub struct ProcessingSlotGuard(pub Arc<ProcessingState>);

impl Drop for ProcessingSlotGuard {
    fn drop(&mut self) {
        self.0.release();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_sets_and_acquire_clears_token() {
        let state = ProcessingState::new();
        assert!(!state.cancel.load(Ordering::SeqCst));
        state.cancel();
        assert!(state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_err());
        state.try_acquire("job-a").unwrap();
        assert!(!state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_ok());
        state.release();
    }

    #[test]
    fn second_acquire_rejects_while_busy() {
        let state = ProcessingState::new();
        state.try_acquire("job-a").unwrap();
        assert!(state.is_busy());
        let err = state.try_acquire("job-b").unwrap_err();
        assert!(
            err.to_string().contains("already processing"),
            "got {err}"
        );
        state.release();
        assert!(!state.is_busy());
        state.try_acquire("job-b").unwrap();
        state.release();
    }

    #[test]
    fn slot_guard_releases_on_drop() {
        let state = ProcessingState::new();
        state.try_acquire("job-a").unwrap();
        {
            let _guard = ProcessingSlotGuard(Arc::clone(&state));
            assert!(state.is_busy());
        }
        assert!(!state.is_busy());
    }

    #[test]
    fn cancel_job_ignores_stale_id() {
        let state = ProcessingState::new();
        state.try_acquire("job-new").unwrap();
        state.cancel_job("job-old");
        assert!(state.check_cancel().is_ok());
        state.cancel_job("job-new");
        assert!(state.check_cancel().is_err());
        state.release();
    }
}
