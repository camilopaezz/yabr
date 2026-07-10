use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::AppError;

pub struct ProcessingState {
    cancel: AtomicBool,
}

impl ProcessingState {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            cancel: AtomicBool::new(false),
        })
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn reset(&self) {
        self.cancel.store(false, Ordering::SeqCst);
    }

    pub fn check_cancel(&self) -> Result<(), AppError> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::Cancelled)
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cancel_sets_and_reset_clears_token() {
        let state = ProcessingState::new();
        assert!(!state.cancel.load(Ordering::SeqCst));
        state.cancel();
        assert!(state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_err());
        state.reset();
        assert!(!state.cancel.load(Ordering::SeqCst));
        assert!(state.check_cancel().is_ok());
    }
}
