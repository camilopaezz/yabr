# SwiftMask — Background Removal Desktop App

A cross-platform, local-first, GPU-accelerated background removal application.
Open source (MIT), no telemetry, no cloud. All inference runs on the user's hardware.

> Status: **MVP implemented** (v0.1.0). Architectural decisions A1–A19 remain the
> product baseline. Implementation details live in the code — this doc is for
> *why*, not *what*. Revisit decisions by editing this file.

---

## 1. Architectural Decisions (locked)

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
| A18 | Output filename | **`<stem>-nobg-<modelId>.png` next to input (or chosen output dir) + overwrite prompt** | Predictable, disambiguates re-runs across modes, keeps inputs untouched. |
| A19 | Theme | **Follow system theme via `prefers-color-scheme`** | Modern expectation; minimal extra work for MVP. |

---

## 2. Non-obvious constraints

These are easy to get wrong if you only skim the code.

**Drag-drop is Tauri-native, not HTML5.** Tauri intercepts OS file drops; the HTML5 `drop` event does not fire for files in its webview (tauri#2768, #5555). `useTauriFileDrop` listens for `tauri://drag-drop` and gets **paths** so Rust can `std::fs` read — image bytes never cross IPC. React dropzone libs do not work out of the box.

**One Linux binary, not two.** Built with CUDA feature; on AMD the CUDA EP fails to load and ORT falls back to CPU. Keeps distribution simple; ROCm is post-MVP.

**Models: Rust is source of truth.** Registry + SHA-256 live in `models.rs`; `bun run gen:models` codegen's static metadata to `models.generated.ts`. Download state comes only from `list_models` at runtime. BRIA models are CC BY-NC 4.0 — document non-commercial use.

**Postprocess:** all current models emit a single-channel mask; min-max normalize to [0,255] (no second sigmoid — that produced near-uniform masks). Heavier models get a light Gaussian blur (radius 1.0) for edge feathering. Match rembg's session behavior where applicable.

**Domain ownership on the FE:** `currentImage.ts` owns drop acceptance, output path sync, process/overwrite (A18), event listeners, cancel/clear. Components stay thin over stores + domain calls.

---

## 3. Product flows (intent)

**First-run:** no `config.json` → detect + benchmark with bundled `u2netp` (≤5 s) → persist winning EP → main screen. Non-Turbo models download on first use (SHA-256 verify).

**Inference:** single job `{id, input_path, output_path, model_id}` at a time; progress via events; cancel via shared token. See `job.rs` / `commands.rs`.

---

## 4. Release & distribution (open work)

- **Targets (v1):** NSIS (Windows x64), AppImage (Linux x64). Installer ~30 MB + lazy models.
- **Signing:** Windows builds unsigned for now (SmartScreen expected). Updater key pair planned for A16; not wired yet.
- **CI:** Windows + Ubuntu builds; installers as artifacts (14-day retention). **Release workflow** exists (`.github/workflows/release.yml`); first public tag still pending.
- **Linux AppImage:** core ORT is **statically linked** via `ort` `download-binaries` — the classic dynamic `libonnxruntime.so` rpath footgun does **not** apply. Ubuntu CI AppImages validated outside CI (Arch, including CUDA). Remaining work is install docs + host NVIDIA deps for CUDA, not an AppImage rpath patch. Details: [`production-readiness.md`](production-readiness.md) §2.3.

---

## 5. Roadmap status

| Phase | Status | Notes |
|---|---|---|
| 0–7 Scaffold → output polish | ✅ | MVP surface complete |
| 8 E2E | 🟡 | Mocked Playwright on every PR to `main`; real Tauri WebDriver not wired. See `production-readiness.md` §2.2 |
| 9 Distribution | 🟡 | Release workflow + CHANGELOG + NC notice + user README/screenshots done; missing published tag, updater/signing |

**Out of scope for v1:** macOS/CoreML, ROCm, batch queue, mask threshold controls, background replacement, video, tiling >4096 px, manual mask editor.

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| DirectML slower than CPU on Vega-class iGPUs | First-run benchmark picks CPU if it wins; user can override. |
| `RMBG-2.0` / BiRefNet OOM on low-VRAM iGPUs | Catch OOM at session load, fall back to CPU, show a UI notice. |
| Linux AppImage fails for strangers | Static ORT linkage; AppImage bundles GTK/WebKit via linuxdeploy; CI AppImages validated on Arch incl. CUDA. Document NVIDIA host deps + WebKit workarounds. |
| HuggingFace download flakiness | Retry with backoff, resume via `Range`, verify SHA-256. |
| BRIA license drift | Pin exact model revisions by commit SHA; document CC-BY-NC in README and in-app. |
| ONNX opset 19 DeformConv not in stable ORT | RMBG/BiRefNet exports we use are opset ≤17; revisit if switching export style. |
