# SwiftMask — Background Removal Desktop App

A cross-platform, local-first, GPU-accelerated background removal application.
Open source (MIT), no telemetry, no cloud. All inference runs on the user's hardware.

> Status: Planning phase. All architectural decisions (A1–A19) are locked for the
> MVP. Decisions can be revisited by editing this document.

---

## 1. Architectural Decisions (locked)

Each row is a decision resolved during grilling. Rationale is one line.

| # | Decision | Choice | Rationale |
|---|---|---|---|
| A1 | Desktop shell | **Tauri 2.0 + Rust** | Small binary, native EP access via `ort`, multi-platform, low RAM. |
| A2 | Inference embedding | **In-process `ort` crate** | No IPC serialization overhead, single process, direct EP control. |
| A3 | GPU EP strategy | **DirectML (Win) + CUDA (Linux NVIDIA) + CPU fallback (Linux AMD) + CoreML (macOS, later)** | One Windows binary covers NVIDIA+AMD; Linux AMD falls back to CPU (ROCm packaging cost too high for MVP). |
| A4 | Model registry | **`u2netp`, `isnet-general-use`, `RMBG-1.4`, `RMBG-2.0`** | Covers Turbo / Balanced / Balanced+ / Max Quality. All have ONNX exports. BRIA allowed (non-commercial OSS). |
| A5 | Feature scope (MVP) | **Drag-drop + preview + export PNG transparent (single image at a time)** | Focused MVP; no batch queue, no post-processing, no video, no manual editor. |
| A6 | Frontend stack | **React + TypeScript + Vite** | Mature ecosystem, drag-drop/canvas libs, official Tauri template. |
| A7 | Release targets (v1) | **Windows x64 + Linux x64 (AppImage)** | Author's hardware (Ryzen 5 4600G). macOS deferred (no device to test). |
| A8 | Model delivery | **On-demand lazy download from HuggingFace + cache in appData** | Small installer (~30 MB); user only downloads modes they use. |
| A9 | GPU detection | **Auto-detect + silent benchmark + manual override** | iGPU (Vega 7) sometimes slower with DirectML than CPU — benchmark prevents bad defaults. |
| A10 | Rust layout | **Single crate in `src-tauri/`** | Sufficient for MVP; refactor to workspace only if it grows. |
| A11 | Frontend state + IPC | **Zustand + Tauri events for progress/cancel** | Lightweight state; events stream long inference (up to ~40 s on CPU). |
| A12 | Export options | **PNG with alpha (transparent) only** | Covers 90% of use; minimal postprocessing. |
| A13 | Testing | **Rust unit tests (image pipeline) + Vitest + inference smoke test + E2E (Playwright/WebDriver)** | Catch regressions in mask pipeline; verify full flow. |
| A14 | Name & license | **`SwiftMask` + MIT** | Permissive; compatible with all model licenses used. |
| A15 | Image pipeline | **`image` + `imageproc` crates** | Proven by reference projects; sufficient for MVP. |
| A16 | Updates & telemetry | **Tauri updater (signed) + zero telemetry** | Local-first privacy promise; logs local only. |
| A17 | Bundled benchmark model | **Embed `u2netp` via `include_bytes!`** | 4.7 MB negligible; offline first-run benchmark + offline Turbo. |
| A18 | Output filename | **`<stem>-nobg.png` next to input + overwrite prompt** | Predictable, keeps inputs untouched, matches user expectation. |
| A19 | Theme | **Follow system theme via `prefers-color-scheme`** | Modern expectation; minimal extra work for MVP. |

---

## 2. Tech Stack

Versions verified as of July 2026.

**Shell & backend (Rust)**
- Tauri `2.11.5` (latest stable 2.x line)
- Rust stable (edition 2021, MSRV `1.88` required by `ort`)
- `ort` `2.0.0-rc.12` — ONNX Runtime binding, wraps ONNX Runtime `1.24`; EPs via Cargo features (`directml`, `cuda`, `coreml`). Uses `download-binaries` feature to fetch the right prebuilt `onnxruntime` shared lib per platform at build time.
- `image` `0.25.10` — decode (JPG/PNG/WEBP/BMP)/resize/encode
- `imageproc` `0.27.0` — mask operations (if needed)
- `ndarray` `0.16` — tensor ops for preprocessing
- `reqwest` (rustls) — model downloads from HuggingFace CDN
- `tauri-plugin-updater` — signed auto-updates from GitHub Releases
- `tauri-plugin-fs`, `tauri-plugin-dialog` — native file pickers
- `thiserror`, `serde`, `serde_json` — errors and config

**Frontend**
- React `19.2.7` + TypeScript
- Vite `6` (via `create-tauri-app` template)
- Zustand `5` — state
- `@tauri-apps/api` `2.x` — `invoke`, `listen`
- File drag-drop: **Tauri native drag-drop events** (`tauri://drag-drop`, `tauri://drag-over`, `tauri://drag-leave`). A thin custom `useTauriFileDrop()` hook (~30 lines) wraps `listen()`. No JS library — Tauri intercepts OS file drops and the HTML5 `drop` event does not fire for files in its webview (issues tauri#2768, #5555), so React dropzone libraries (`react-dropzone`, `@input-kit/dropzone`, `react-upload-kit`, etc.) don't work out-of-the-box. Native events give us file **paths** directly, which Rust reads via `std::fs` — no image bytes cross the IPC boundary. Reference projects (`rust_rmbg`, `logo-studio`) use this pattern.
- Preview canvas: native `<canvas>` (no heavy image lib)

**Build / CI**
- `cargo-tauri` for builds
- GitHub Actions matrix: `windows-latest` (x64), `ubuntu-22.04` (x64)
- `cargo test` + `vitest` on every PR
- Playwright/WebDriver E2E on the desktop build (nightly)

---

## 3. Project Structure

Single-crate layout (decision A10):

```
SwiftMask/
├── .agents/
│   └── plan.md                 # this file
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/
│   ├── capabilities/
│   └── src/
│       ├── main.rs             # entry, tauri::Builder, plugin registration
│       ├── lib.rs              # re-exports
│       ├── commands.rs         # #[tauri::command] surface (see §8)
│       ├── inference.rs        # ort session mgmt, EP selection, run()
│       ├── models.rs           # model registry, metadata, download/cache
│       ├── gpu.rs              # GPU detection + first-run benchmark
│       ├── image_io.rs         # decode/resize/encode (wraps `image`)
│       ├── pipeline.rs         # preprocess + postprocess + apply alpha
│       ├── events.rs           # event name constants, payload types
│       ├── config.rs           # app config (chosen EP, model, paths) in appData
│       └── error.rs            # AppError, thiserror
├── src/                        # React frontend
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── FileDropZone.tsx     # uses useTauriFileDrop() hook
│   │   ├── ImagePanel.tsx
│   │   ├── PreviewCanvas.tsx
│   │   ├── ModeSelector.tsx
│   │   ├── ProgressBar.tsx
│   │   └── SettingsPanel.tsx
│   ├── stores/
│   │   ├── imageStore.ts       # Zustand: current image + status
│   │   ├── settingsStore.ts    # Zustand: mode, EP, output dir
│   │   └── progressStore.ts    # Zustand: live progress events
│   ├── lib/
│   │   ├── tauri.ts            # invoke/listen wrappers
│   │   ├── useTauriFileDrop.ts # hook wrapping listen('tauri://drag-drop')
│   │   └── models.ts           # mode→model metadata mirror of Rust registry
│   └── styles/
├── tests/
│   └── fixtures/               # sample images + expected masks (for IoU tests)
├── e2e/
│   └── playwright.spec.ts
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

---

## 4. Model Registry

Mirrored in `src-tauri/src/models.rs` (source of truth) and `src/lib/models.ts` (UI metadata).

| Mode (UI) | Model | File | Size | Input | License | Source |
|---|---|---|---|---|---|---|
| Turbo | `u2netp` | `u2netp.onnx` | ~4.7 MB | 320×320 | Apache-2.0 | `xuebinqin/U-2-Net` via rembg mirrors |
| Balanced | `isnet-general-use` | `isnet-general-use.onnx` | ~178 MB | 1024×1024 | Apache-2.0 | `xuebinqin/DIS` / rembg |
| Balanced+ | `RMBG-1.4` | `rmbg-1.4.onnx` | ~176 MB | 1024×1024 | CC BY-NC 4.0 | `briaai/RMBG-1.4` HF |
| Max Quality | `RMBG-2.0` | `rmbg-2.0.onnx` (fp16 if available) | ~173 MB | 1024×1024 | CC BY-NC 4.0 | `briaai/RMBG-2.0` HF |

**Download URLs** point at HuggingFace CDN. A SHA-256 checksum per model is stored in
`models.rs` and verified after download. Files live in `<appData>/SwiftMask/models/`.

**Preprocessing contract per model** (encoded in registry):
- `u2netp`: resize 320² (stretch to square), /255, normalize per-channel ImageNet mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225], NCHW float32.
- `isnet-general-use`: resize 1024², /255, normalize mean=0.5 std=1.0.
- `RMBG-1.4`: resize 1024², /255, normalize mean=0.5 std=1.0.
- `RMBG-2.0`: resize 1024², /255, normalize mean=[0.485,0.456,0.406] std=[0.229,0.224,0.225].

**Postprocessing is per-model** (all current models emit a single-channel logit-like mask that
must be stretched to the full [0, 255] range; no second sigmoid is applied):
- `u2netp`: take the **first** output (d0, shape [1,1,320,320]) → min-max normalize over the
  [H×W] logits → *255 → uint8 mask → resize to original HxW → stack with original RGB →
  encode PNG. (u2netp's graph already applies sigmoid internally, so min-max yields a full-range
  mask. Matches rembg's `U2netpSession.predict`.)
- `isnet-general-use`, `RMBG-1.4`, `RMBG-2.0`: take the single-channel output
  (shape [1,1,1024,1024]) → min-max normalize over [H×W] → *255 → uint8 mask → resize to
  original HxW → **light Gaussian blur** (radius 1.0) to feather hard edges → stack with
  original RGB → encode PNG. (The earlier sigmoid path was incorrect and produced near-uniform masks.)

---

## 5. Execution Provider Strategy

Per-platform EP fallback chain (decision A3):

| Platform | Build feature | EP fallback chain |
|---|---|---|
| Windows x64 | `--features ort/directml` | `[DmlExecutionProvider, CPUExecutionProvider]` |
| Linux x64 (NVIDIA) | `--features ort/cuda` | `[CUDAExecutionProvider, CPUExecutionProvider]` |
| Linux x64 (AMD/other) | (same binary) | `[CPUExecutionProvider]` (CUDA EP fails to load → CPU) |
| macOS (future) | `--features ort/coreml` | `[CoreMLExecutionProvider, CPUExecutionProvider]` |

**Two Linux binaries are NOT shipped.** A single Linux binary is built with the CUDA
feature; on AMD machines the CUDA EP simply won't initialize and ORT falls back to CPU.
This keeps distribution simple. A future ROCm build is a post-MVP option.

**GPU detection (`gpu.rs`, decision A9):**
1. Enumerate adapters: on Windows via DXGI (or `wgpu`), on Linux via `/dev/nvidia*` presence + `lspci`.
2. Record vendor ID (NVIDIA 0x10DE, AMD 0x1002, Intel 0x8086) and VRAM if available.
3. Run the silent benchmark: load `u2netp` (already downloaded for Turbo mode? — no, bundle
   a tiny 4.7 MB `u2netp` as the *only* bundled model, used solely for the benchmark) and
   time 1 inference on CPU and 1 on each available EP.
4. Persist the winner to `config.json`. Re-benchmark only on user request (Settings).

> Note: `u2netp` is small enough (4.7 MB) to **bundle in the installer** specifically so the
> first-run benchmark works without a network. It also doubles as the Turbo mode model,
> so users without internet still get a working app.

---

## 6. First-Run Flow

1. App starts → no `config.json` found → first-run mode.
2. Show a brief onboarding card: "Detecting best acceleration…"
3. `gpu.rs` runs detection + benchmark with bundled `u2netp` (≤5 s).
4. Write `config.json`: `{ ep: "DmlExecutionProvider", platform: "windows", ... }`.
5. Land on main screen. Models other than `u2netp` are NOT downloaded yet.
6. When the user picks Balanced / Balanced+ / Max Quality for the first time, show a
   download modal with progress, verify SHA-256, then proceed to inference.

---

## 7. Inference Pipeline (Rust)

For a single image:

```
bytes ──image_io::decode──▶ DynamicImage
        │
        ▼
   pipeline::preprocess(model_meta)
        │  resize to model.input, normalize, NCHW f32
        ▼
   ndarray::Array4<f32>
        │
        ▼
   inference::run(session, tensor, progress_tx)
        │  ort session.run(), emit progress events
        ▼
   raw logits (last output)
        │
        ▼
   pipeline::postprocess(original_size)
        │  min-max → resize → *255 → light Gaussian blur → u8
        ▼
   alpha: GrayImage
        │
        ▼
   image_io::encode_png_rgba(original_rgb, alpha)
        │
        ▼
   bytes (PNG) ──▶ written to output dir
```

**Single image** = one `{id, input_path, output_path}` processed inline via
`spawn_blocking` on `remove_image_background`. Progress is emitted as
`inference:progress` events. A `cancel` `AtomicBool` (`ProcessingState`) lets the
user abort the in-flight run via `cancel_inference`.

---

## 8. Tauri Command & Event Surface

**Commands** (`commands.rs`):

| Command | Args | Returns | Notes |
|---|---|---|---|
| `detect_gpu` | — | `GpuInfo` | vendor, vram, available EPs |
| `run_benchmark` | — | `BenchmarkResult` | per-EP latency with `u2netp` |
| `set_ep` | `ep: String` | `()` | override, persists to config |
| `list_models` | — | `Vec<ModelMeta>` | registry with download state |
| `download_model` | `model_id` | `()` | streams `model:download` events |
| `remove_image_background` | `{ id, input_path, output_path, model_id }` | `()` | emits `inference:progress` |
| `cancel_inference` | — | `()` | sets the in-flight cancel token |
| `pick_output_dir` | — | `Option<String>` | wraps dialog plugin |
| `get_config` / `set_config` | — | `Config` | persist settings |

**Events** (`events.rs`):

| Event | Payload | Direction |
|---|---|---|
| `inference:progress` | `{ id, stage, pct }` | Rust → UI |
| `inference:done` | `{ id, output_path }` | Rust → UI |
| `inference:error` | `{ id, message }` | Rust → UI |
| `model:download` | `{ model_id, pct }` | Rust → UI |

---

## 9. Frontend (React) Shape

**Stores (Zustand):**
- `imageStore`: `current: ImageItem | null` where `ImageItem = { id, inputPath, outputPath, status: 'queued'|'processing'|'done'|'error'|'cancelled', progress: number }`. Dropping a new image replaces `current`.
- `settingsStore`: `mode`, `outputDir`, `ep`, `theme`.
- `progressStore`: subscribes to Tauri events and patches `imageStore` when the payload `id` matches the current image.

**Key components:** `FileDropZone` (uses `useTauriFileDrop()` → sets the current image on drop), `ImagePanel`
(renders the current image with status/progress + Process/Cancel/Remove), `PreviewCanvas`
(toggles original/transparent on click), `ModeSelector` (Turbo/Balanced/Balanced+/Max),
`SettingsPanel` (EP override, output dir, re-run benchmark).

---

## 10. Testing Strategy

- **Rust unit tests** (`#[test]` in each module):
  - `pipeline.rs`: preprocessing tensor shapes & normalization values per model.
  - `image_io.rs`: round-trip decode/encode for JPG/PNG/WEBP.
  - `models.rs`: registry integrity, SHA-256 verification of a dummy download.
- **Inference smoke test** (`tests/smoke_inference.rs`): load `u2netp`, run on
  `tests/fixtures/sample.png`, assert output PNG has an alpha channel and that the
  mask IoU vs `tests/fixtures/sample_mask.png` ≥ 0.85.
- **Frontend**: Vitest on `imageStore` reducers and `progressStore` event handlers
  (mock `listen`).
- **E2E**: Playwright over the Tauri WebDriver target — drop a fixture image, wait for
  `inference:done`, assert output file exists in a temp dir. Nightly in CI.

---

## 11. Release & Distribution

- **Targets (v1):** `SwiftMask_x.y.z_x64-setup.exe` (NSIS), `SwiftMask_x.y.z_amd64.AppImage`.
- **Signing:** Tauri updater requires a signing key pair; the public key is embedded in
  `tauri.conf.json`, the private key is held in GitHub Actions secrets. Windows builds
  are unsigned (code signing cert is post-MVP) — SmartScreen warning expected.
- **Update channel:** GitHub Releases. `tauri-plugin-updater` checks on launch.
- **Installer size:** ~30 MB (Tauri runtime + React bundle + bundled `u2netp`).
  Other models are downloaded on demand.
- **CI matrix:** `windows-latest`, `ubuntu-22.04`. Linux build needs `libonnxruntime.so`
  rpath fix (`src-tauri/.cargo/config.toml` with `link-arg=-Wl,-rpath,$ORIGIN`) to avoid
  the known Tauri AppImage linking issue (tauri#4724).

---

## 12. Roadmap / Phases

**Phase 0 — Scaffold** (no inference yet)
- `create-tauri-app` with React+TS+Vite template.
- Single-crate Rust layout, modules stubbed.
- CI: build green on Windows + Linux.
- Deliverable: empty shell launches on both platforms.

**Phase 1 — Rust inference + smoke test**
- Bundle `u2netp` in the binary.
- `inference.rs` + `pipeline.rs` + `image_io.rs` with CPU only.
- Verified by the IoU≥0.85 smoke test on a fixture image.
- No UI, no Tauri command yet.
- Deliverable: working background removal on CPU with one model, test-covered.

**Phase 2 — Tauri surface**
- `remove_image_background` command (single image, no batch).
- `inference:progress` / `done` / `error` events.
- Driven from a one-button stub UI.
- Deliverable: end-to-end single-image removal callable from the frontend.

**Phase 3 — Minimal UI**
- `useTauriFileDrop` hook (isolates the unproven drag-drop-in-Tauri path).
- Progress bar, preview canvas, save.
- Deliverable: working background removal through the real UI on CPU.

**Phase 4 — EP integration**
- `ort` features `directml` (Win) / `cuda` (Linux).
- EP fallback chain (`[Dml|CUDA, CPU]`).
- `set_ep` command + config persistence.
- Deliverable: GPU acceleration on Windows (DirectML) and Linux NVIDIA (CUDA).

**Phase 5 — GPU detection + benchmark**
- `gpu.rs` detection (DXGI on Win, `/dev/nvidia*` + `lspci` on Linux).
- Silent benchmark with bundled `u2netp`, persist winner to config.
- Settings panel with EP override + re-benchmark.
- Deliverable: auto-picks the fastest EP; user can override.

**Phase 6 — Model registry + lazy downloads**
- `models.rs` full registry, `download_model` command with SHA-256 verify.
- Mode selector UI (Balanced / Balanced+ / Max Quality).
- On-demand download modal.
- Deliverable: all 4 models selectable, downloaded on first use.

**Phase 7 — Output polish**
- Output dir picker, overwrite prompts.
- Preview canvas before/after toggle.
- Deliverable: MVP UX complete.

**Phase 8 — E2E**
- Playwright/WebDriver suite over the Tauri desktop target.
- Drop a fixture image, wait for `inference:done`, assert output file exists.
- Gated to CI nightly.
- Deliverable: MVP complete, shippable.

**Phase 9 (post-MVP) — Distribution**
- Tauri updater wired to GitHub Releases.
- NSIS + AppImage artifacts in CI.
- README, screenshots, license notes (incl. BRIA CC-BY-NC non-commercial statement).

**Future / out of scope for v1:**
- macOS target (CoreML).
- ROCm Linux AMD build.
- Batch queue (multi-image sequential processing with cancel) — deferred; v1 processes one image at a time.
- Mask threshold / shrink / expand controls (light Gaussian edge feathering is applied by default).
- Solid color / gradient / image background replacement.
- Video background removal.
- Tiling for >4096 px images.
- Manual mask editor.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| DirectML slower than CPU on Vega-class iGPUs | First-run benchmark picks CPU if it wins; user can override. |
| `RMBG-2.0` / BiRefNet OOM on low-VRAM iGPUs | Catch OOM at session load, fall back to CPU, show a UI notice. |
| Linux `libonnxruntime.so` rpath break in AppImage | `.cargo/config.toml` rpath fix; verified in CI. |
| HuggingFace download flakiness | Retry with backoff, resume via `Range`, verify SHA-256. |
| BRIA license drift | Pin exact model revisions by commit SHA; document CC-BY-NC in README and in-app. |
| ONNX opset 19 DeformConv not in stable ORT | RMBG/BiRefNet ONNX exports we use are opset ≤17; revisit if we switch to dynamic-batch exports. |
