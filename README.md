# SwiftMask

A desktop app that removes image backgrounds **locally** using ONNX models. No cloud upload, no account, no telemetry.

Built with [Tauri 2](https://v2.tauri.app), React, and Rust ([ONNX Runtime](https://onnxruntime.ai) via `ort`).

![SwiftMask main window](docs/screenshots/01-main-window.png)

*Main window — quality modes on the left, drop target on the right. The **CUDA** chip shows the active execution provider (your machine may show CPU or DirectML instead).*

## Download

Prebuilt installers are published on **[GitHub Releases](https://github.com/camilopaezz/SwiftMask/releases)** when a version is tagged:

| Platform | Asset |
|----------|--------|
| **Linux x64** | `swiftmask-linux.AppImage` |
| **Windows x64** | `swiftmask-windows-setup.exe` |

> Until the first public release is tagged, you can also grab AppImage/NSIS **artifacts from CI** on recent green `main` workflow runs, or [build from source](#development).

### Linux (AppImage)

```bash
chmod +x swiftmask-linux.AppImage
./swiftmask-linux.AppImage
```

- No install step required. Models download into your app data directory on first use.
- **NVIDIA GPU (optional):** install proprietary drivers as usual. SwiftMask selects CUDA when the stack is available; otherwise it uses CPU.
- If the window is blank or glitchy on some WebKit/GTK setups, try:

  ```bash
  WEBKIT_DISABLE_COMPOSITING_MODE=1 ./swiftmask-linux.AppImage
  ```

- If your desktop cannot run AppImages (missing FUSE), extract and run the inner binary (e.g. `--appimage-extract`) or use a distro package when available.

### Windows (NSIS)

1. Download `swiftmask-windows-setup.exe` from the release.
2. Run the installer.
3. **SmartScreen** may warn on unsigned builds — choose *More info* → *Run anyway* if you trust the release source. Signing is planned for later releases.

### First launch

On first run the app **benchmarks** available execution providers (CPU, CUDA on Linux NVIDIA, DirectML on Windows) and picks the fastest for your hardware. You can override this anytime in **Settings**.

## Features

- **Local inference** — images never leave your machine
- **Multiple quality modes** — from a fast bundled model to larger downloadable ones
- **GPU acceleration** — CUDA on Linux (NVIDIA), DirectML on Windows; CPU fallback everywhere
- **First-run benchmark** — picks the fastest execution provider for your hardware
- **Drag and drop** — open images from the file picker or drop them on the preview pane
- **Before/after slider** — scrub between input and output after processing
- **Transparent PNG output** — writes `{name}-nobg-{model}.png` next to the source or to a chosen folder

Supported input formats: **PNG, JPG, WEBP, BMP**.

## Quality modes

| Mode | Model | Size | License |
|------|-------|------|---------|
| **Turbo** | u2netp | ~4.5 MB | Apache-2.0 (bundled; always available) |
| **Balanced** | isnet-general-use | ~178 MB | Apache-2.0 (download on first use; good default) |
| **Balanced+** | rmbg-1.4 | ~176 MB | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (download on first use) |
| **Max Quality** | rmbg-2.0 | ~173 MB | [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) (download on first use) |

![Quality mode list](docs/screenshots/02-quality-modes.png)

Downloads are verified with **SHA-256** before use and cached under the app data directory (`models/`).  
**Balanced+** and **Max Quality** show a **Non-commercial** badge and require a one-time license acknowledgment before the first download.

## How to use

1. **Open an image** — click **Select image**, or drop a file on the preview pane (`Ctrl+O` / `⌘O`).
2. **Pick a quality mode** — Turbo is always ready; other modes download on first use.
3. Click **Process** (`Ctrl+Enter` / `⌘Enter`). Cancel with **Escape** while a job is running.
4. Use the **comparison slider** to check the result. Output is saved as a transparent PNG.

![Before and after](docs/screenshots/03-before-after.jpg)

![Comparison slider style result](docs/screenshots/04-compare-slider.jpg)

Default output name: `{original-stem}-nobg-{modelId}.png` next to the input (or in the folder you set in Settings). If that file already exists, SwiftMask asks before overwriting.

### Settings

Open **Settings** (gear icon in the title bar):

- **Theme** — system / light / dark  
- **Execution provider** — CPU, CUDA (Linux NVIDIA), or DirectML (Windows); override the benchmark choice  
- **Output directory** — optional; default is next to the input file  
- **Re-run benchmark** — re-measure EPs on this machine  
- Runtime meta — GPU / VRAM / available EPs and app + ORT versions (useful for bug reports)

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+O` / `⌘O` | Open image |
| `Ctrl+Enter` / `⌘Enter` | Process |
| `Escape` | Cancel running job (or close modal when one is open) |

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Blank / black window (Linux)** | Launch with `WEBKIT_DISABLE_COMPOSITING_MODE=1`. Some Arch/CachyOS WebKit builds need this. |
| **AppImage won’t start** | `chmod +x` the file. Ensure FUSE is available, or extract with `./swiftmask-linux.AppImage --appimage-extract`. |
| **Slow processing** | Prefer **Turbo** or ensure GPU EP is selected in Settings. First run of a mode may still download weights. |
| **CUDA not used (Linux)** | Install proprietary NVIDIA drivers. The title-bar chip should read **CUDA** when active. Without drivers, CPU is used automatically. |
| **Windows SmartScreen** | Expected for unsigned builds — *More info* → *Run anyway* if you trust the release. |
| **Download fails** | Check network access to GitHub / Hugging Face. Incomplete files are re-downloaded and re-verified. |
| **Out of memory on large images** | Use a smaller mode (Turbo/Balanced) or a smaller source image. GPU OOM may automatically retry on CPU when the backend can detect it. |
| **Need a commercial workflow** | Use **Turbo** or **Balanced** (Apache-2.0 models). Do not use Balanced+ / Max Quality for commercial work unless you have a separate license from the model rights holder. |

## Feedback & issues

Report bugs and feature requests on **[GitHub Issues](https://github.com/camilopaezz/SwiftMask/issues)**. Include OS, app version (Settings), execution provider chip, and what you were doing when it failed.

---

## Development

### Prerequisites

- [Bun](https://bun.sh) — package manager (`bun.lock` is canonical; do not commit `package-lock.json`)
- [Rust](https://rustup.rs) 1.88+ (stable)
- Platform libraries for Tauri — see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

**Optional GPU support**

- **Linux + NVIDIA**: recent proprietary drivers; CUDA execution provider is selected automatically when detected
- **Windows**: DirectML via the system GPU stack (no separate CUDA install)

### Quick start

```bash
bun install
bun run tauri dev
```

This starts the Vite dev server and opens the desktop window. On first launch the app benchmarks available execution providers and may prompt you to download a preferred model.

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
docs/                 Product / readiness notes; screenshots for this README
```

The model registry is defined once in Rust (`src-tauri/src/models.rs`) and mirrored to TypeScript via `gen:models`. After changing model metadata, run `bun run gen:models` and commit both files.

### E2E notes

Playwright runs against the Vite dev server with `VITE_E2E=1`, which swaps Tauri APIs for mocks in `e2e/mocks/`. Do not point tests at a normal `bun run dev` session — the UI expects mock hooks and will not load correctly.

```bash
bunx playwright install --with-deps chromium
bun run test:e2e
```

On headless Linux CI, tests run under `xvfb-run`.

### IDE setup

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
