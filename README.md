# SwiftMask

A desktop app that removes image backgrounds locally using ONNX models. No cloud upload, no account.

Built with [Tauri 2](https://v2.tauri.app), React, and Rust ([ONNX Runtime](https://onnxruntime.ai) via `ort`).

## Features

- **Local inference** — images never leave your machine
- **Multiple quality modes** — from a fast bundled model to larger downloadable ones
- **GPU acceleration** — CUDA on Linux (NVIDIA), DirectML on Windows; CPU fallback everywhere
- **First-run benchmark** — picks the fastest execution provider for your hardware
- **Drag and drop** — open images from the file picker or drop them on the preview pane
- **Before/after slider** — scrub between input and output after processing
- **Transparent PNG output** — writes `{name}-nobg-{model}.png` next to the source or to a chosen folder

Supported input formats: PNG, JPG, WEBP, BMP.

## Quality modes

| Mode | Model | Size | License |
|------|-------|------|---------|
| **Turbo** | u2netp | ~4.5 MB | Apache-2.0 (bundled; always available) |
| **Balanced** | isnet-general-use | ~178 MB | Apache-2.0 (default when downloaded) |
| **Balanced+** | rmbg-1.4 | ~176 MB | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (download on first use) |
| **Max Quality** | rmbg-2.0 | ~173 MB | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (download on first use) |

Downloads are verified with SHA-256 before use. Cached under the app data directory (`models/`).

## Prerequisites

- [Bun](https://bun.sh) — package manager (`bun.lock` is canonical; do not commit `package-lock.json`)
- [Rust](https://rustup.rs) 1.88+ (stable)
- Platform libraries for Tauri — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

**Optional GPU support**

- **Linux + NVIDIA**: recent proprietary drivers; CUDA execution provider is selected automatically when detected
- **Windows**: DirectML via the system GPU stack (no separate CUDA install)

## Quick start

```bash
bun install
bun run tauri dev
```

This starts the Vite dev server and opens the desktop window. On first launch the app benchmarks available execution providers and may prompt you to download a preferred model.

## Usage

1. Drop an image onto the preview area, or use **Open** in the sidebar.
2. Pick a quality mode (download larger models from the mode list if needed).
3. Click **Process**.
4. Use the comparison slider to check the result. Output is saved as a PNG with transparency.

Open **Settings** (title bar) to change execution provider, output directory, or theme (light / dark / system).

## Development

### Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Vite dev server only (port 1420) |
| `bun run tauri dev` | Full desktop app in development |
| `bun run build` | Production frontend build |
| `bun run tauri build` | Release installer/bundle |
| `bun run tauri:build:cachy` | Release build with `WEBKIT_DISABLE_COMPOSITING_MODE=1` and `NO_STRIP=true` (workaround for some WebKit/GTK setups) |
| `bun run test` | Vitest unit tests |
| `bun run test:e2e` | Playwright E2E (mocked Tauri APIs; requires `VITE_E2E=1`, set automatically by Playwright config) |
| `bun run lint` | Biome check (lint + format) |
| `bun run format` | Biome format write |
| `bun run gen:models` | Regenerate `src/lib/models.generated.ts` from `src-tauri/src/models.rs` |
| `bun run gen:models:check` | Fail if the generated registry is stale (CI) |

### Rust

```bash
cd src-tauri
cargo test --locked    # unit tests + u2netp smoke inference (IoU against fixture mask)
```

### Project layout

```
src/                  React UI (components, stores, Tauri invoke wrappers)
src-tauri/src/        Rust backend (inference, models, GPU detect, image I/O)
src-tauri/models/     Bundled u2netp.onnx weights
e2e/                  Playwright tests with mocked @tauri-apps/* plugins
```

The model registry is defined once in Rust (`src-tauri/src/models.rs`) and mirrored to TypeScript via `gen:models`. After changing model metadata, run `bun run gen:models` and commit both files.

### E2E notes

Playwright runs against the Vite dev server with `VITE_E2E=1`, which swaps Tauri APIs for mocks in `e2e/mocks/`. Do not point tests at a normal `bun run dev` session — the UI expects mock hooks and will not load correctly.

```bash
bunx playwright install --with-deps chromium
bun run test:e2e
```

On headless Linux CI, tests run under `xvfb-run`.

## IDE setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## License

SwiftMask is open source under the [MIT License](LICENSE). That covers the application itself — UI, Tauri shell, inference pipeline, and tooling.

The ONNX **models are third-party works** with their own terms (see the table above and `src-tauri/src/models.rs`). SwiftMask downloads and runs them on your machine; it does not relicense them.

### Model licenses and commercial use

| Mode | Can end users use outputs commercially? |
|------|----------------------------------------|
| Turbo, Balanced | Generally yes, under [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0) (attribution and license notice as required by Apache) |
| Balanced+, Max Quality | **No** — [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) allows non-commercial use only |

The **non-commercial restriction applies to people who use the RMBG models** (Balanced+ and Max Quality), not to publishing SwiftMask as free software. If you process images for paid work, client deliverables, product photography, or other commercial purposes, use **Turbo** or **Balanced**, or obtain a separate commercial license from the model rights holder ([BRIA](https://bria.ai/) for RMBG-1.4 / RMBG-2.0).

This section is a plain-language summary, not legal advice.
