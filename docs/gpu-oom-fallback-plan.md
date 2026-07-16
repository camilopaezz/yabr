# Plan: GPU OOM → CPU fallback (slice B)

## Goal

When inference OOMs on a non-CPU execution provider, automatically retry the same job on CPU, emit a structured hook event for a later UI notice slice, and leave Settings EP unchanged.

## Locked product decisions

| Decision | Choice |
|----------|--------|
| Retry | Automatic (no dialog) |
| When | Load **and** run OOM via existing `is_likely_oom` |
| Config EP | Job-only — do **not** write config / call `set_ep` |
| Double fail | Final CPU error only (`on_error` as today) |
| Cancel | Cancel wins: no CPU retry if cancelled before retry; cancel during CPU → normal `"cancelled"` |
| Hook | New event `inference:fallback` with structured payload only (no FE banner this PR) |
| Progress | Stage `inferring-cpu` during CPU attempt |
| Timings | Two entries: `inferring` (GPU attempt wall) + `inferring-cpu` (CPU success wall); `total_seconds` full job |

## Out of scope

- FE notice banner / durable notice field / friendly copy
- Persisting EP to CPU
- Broadening OOM needles beyond current `is_likely_oom`
- Other §2.4 user-visible error polish

## Implementation

### 1. `src-tauri/src/events.rs`

- Add `INFERENCE_FALLBACK: &str = "inference:fallback"`.
- Add payload:

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")] // match other FE-facing payloads if they use camelCase;
// check existing: Inference* payloads use snake_case (output_path, total_seconds).
// Prefer **snake_case** consistent with InferenceDonePayload / InferenceErrorPayload.
pub struct InferenceFallbackPayload {
    pub id: String,
    pub reason: String,   // "oom"
    pub from_ep: String,
    pub to_ep: String,    // always "cpu"
}
```

Use **snake_case** to match `InferenceDonePayload` (`output_path`, `total_seconds`).

### 2. `src-tauri/src/job.rs` — `JobSink` + `run_inner`

Extend `JobSink`:

```rust
fn on_fallback(&self, reason: &str, from_ep: &str, to_ep: &str) -> Result<(), AppError>;
```

Default behavior in tests: record calls.

**Inference section rewrite** (keep decode/preprocess/postprocess/encode as today):

```text
ep = (deps.execution_provider)()?
state.check_cancel()?

timer_infer = StageTimer::start("inferring")
progress "inferring" 50%

result = with_session(model, ep, load, run)

if Ok(output):
    stages.push(timer_infer.finish())
    continue pipeline with output
else if Err(e) if is_likely_oom(&e) && !ep_is_cpu(ep):
    // timer for failed GPU attempt
    stages.push(timer_infer.finish())  // stage name "inferring"
    // sessions already dropped inside with_session on OOM; optional invalidate_all is belt-and-suspenders
    state.check_cancel()?
    deps.sink.on_fallback("oom", &ep, EP_CPU)?
    log::warn!(...)
    deps.sink.on_progress("inferring-cpu", 50.0)?  // or 55
    state.check_cancel()?
    timer_cpu = StageTimer::start("inferring-cpu")
    output = with_session(model, EP_CPU, load, run)?
    stages.push(timer_cpu.finish())
    continue pipeline
else:
    return Err(e)  // non-OOM, or already CPU OOM
```

Details:

- Reuse preprocess `tensor` for both attempts (do not re-decode/re-preprocess).
- `ep_is_cpu`: case-insensitive compare to `inference::EP_CPU`.
- If already on CPU and OOM: no fallback; return error (with_session already cleaned up).
- Non-OOM GPU errors: no fallback.
- `on_fallback` **before** starting CPU attempt, after cancel check.
- Cancel after OOM / before CPU: return `Cancelled` without emitting fallback (or emit only if about to start CPU — prefer **no emit if cancelled**).
- On CPU retry success: proceed postprocess as today.
- On CPU retry fail: `run` still calls `on_error` with final error only.

Update `Recorder` / `CancelOnProgress` test sinks with `on_fallback`.

**New unit tests** (prefer pure unit tests without needing real GPU):

1. **Fallback path via mockable deps** — hardest today because `with_session` is not injected. Options:
   - **Preferred if small:** inject optional inference runner in `JobDeps` for tests, e.g. `run_inference: &dyn Fn(model_id, ep, &tensor) -> Result<ArrayD, AppError>` that production wires to `with_session`+`run`. Then unit-test: first call OOM on directml, second call Ok on cpu → assert `on_fallback` once, progress includes `inferring-cpu`, done, timings have both stages.
   - **Alternative:** test helper module that only tests a extracted `fn resolve_inference_ep(...)` / retry helper. Prefer full job test if DI is clean.

2. **No fallback when EP is cpu** and OOM: `on_fallback` empty, error once.

3. **No fallback on non-OOM error** (e.g. "model produced no outputs").

4. **Cancel before CPU retry**: first inference returns OOM, cancel flag set before retry (or sink cancel on fallback) → Cancelled, no done.

Keep existing happy_path / cancel / missing file tests green; update Recorder impls.

### 3. `src-tauri/src/commands.rs`

- `AppJobSink::on_fallback` → emit `INFERENCE_FALLBACK` with `InferenceFallbackPayload`.
- Production `JobDeps` wires real `with_session` path (if DI added).

### 4. Frontend types only (minimal hook for later slice)

In `src/lib/tauri.ts`:

- `EVENT_FALLBACK = "inference:fallback"`
- `InferenceFallbackPayload` type matching BE snake_case fields
- `listenInferenceFallback(handler)` export

**Do not** wire into `currentImage` / image store / ImagePanel in this PR (notice UI is other slice). Types + listener helper are enough seam.

### 5. Docs (light)

- Check off or note in `docs/production-readiness.md` checklist item only if fully done — this slice is partial (no user notice). Prefer a short note: "BE fallback + event shipped; UI notice pending" rather than checking the full box.
- Do **not** expand scope into unrelated docs.

### 6. Verify

```bash
cd src-tauri && cargo test
# from repo root if needed:
bun test  # or package.json test script for TS that touches tauri types
```

## Files to touch

| File | Change |
|------|--------|
| `src-tauri/src/events.rs` | Constant + payload |
| `src-tauri/src/job.rs` | Sink method, retry logic, tests (+ optional DI) |
| `src-tauri/src/commands.rs` | Emit fallback |
| `src/lib/tauri.ts` | Types + listen helper |
| `docs/production-readiness.md` | Partial status note only |

## Non-goals / do not

- Change `set_ep` or config on fallback
- Change `is_likely_oom` needles unless tests need a known string already covered
- FE status banner
- Refactor unrelated modules
