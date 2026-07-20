# SwiftMask — production readiness

Assessment of what remains before SwiftMask is safe to ship to non-developers. Written 2026-07-12; last reviewed **2026-07-20**.

> Status: **Living document.** Update as items ship or priorities change.

---

## 1. Current state

SwiftMask is past “does it work?” and into “can strangers install it, trust it, and not get stuck?” The core loop is solid: local inference, model downloads, GPU benchmark, drag-and-drop, compare slider, overwrite handling, and CI that builds real installers.

The MVP scope from [`plan.md`](plan.md) (Phases 0–7) is largely complete. Version is still **0.1.0** — a working alpha, not a shippable 1.0. No version tags / GitHub Releases published yet (workflow is ready; strangers still build from source or grab CI artifacts).

**Already in place:**

- Tauri 2 frameless shell (`TitleBar`, left rail + preview pane), themes, settings modal
- Four quality modes with on-demand download + SHA-256 verification
- GPU auto-detection, first-run benchmark, manual EP override
- Single-image flow: open/drop → process → compare slider → export PNG (`{stem}-nobg-{modelId}.png`)
- Overwrite prompt wired via `currentImage` (decision A18)
- Rust job module (`job.rs`) with unit tests; inference smoke test (IoU ≥ 0.85)
- Model registry codegen (`gen:models` / `gen:models:check`) — Rust SoT, no SHA drift
- CI (`.github/workflows/ci.yml`): Biome lint, Vitest, `gen:models:check`, `cargo test`,
  release builds on `ubuntu-24.04` (AppImage + deb + rpm) + `windows-latest` (NSIS + MSI); artifacts retained 14 days
- **Release workflow** (`.github/workflows/release.yml`): tag `vX.Y.Z` → version sync → AppImage/deb/rpm + NSIS/MSI → GitHub Release + CHANGELOG body
- **Mocked** Playwright E2E on every push/PR to `main` (UI wiring smoke only — see §2.2)
- NC license modal gates first Balanced+ / Max Quality download; persistent ack in `localStorage`; **Non-commercial** badge on ready RMBG modes
- Backend download cancel (single-flight slot)
- GPU OOM → automatic CPU retry + `inference:fallback` event (UI notice still pending)
- Keyboard shortcuts for open / process / cancel
- README with **user install / download / troubleshooting**, screenshots, and commercial-use guidance for model licenses (plus dev section)
- **Linux AppImage validated outside CI** (Ubuntu-built CI artifacts on Arch, including CUDA) — see §2.3

---

## 2. Priority gaps

### 2.1 Ship artifacts (highest impact)

CI builds installers and **`.github/workflows/release.yml` is wired**, but there is still **no published tag / GitHub Release**. Users cannot get a stable download without building from source or hunting CI artifacts.

| Item | Status |
|------|--------|
| GitHub Releases workflow | ✅ `.github/workflows/release.yml` |
| `CHANGELOG` | ✅ Keep-a-Changelog skeleton (fix repo links if needed) |
| User-facing install docs | ✅ README: download table, AppImage/NSIS steps, screenshots, troubleshooting (CUDA, WebKit/GTK, SmartScreen) |
| `tauri-plugin-updater` | ❌ Planned in decision A16; not wired in `Cargo.toml` / `tauri.conf.json` |
| Signing keys | ❌ Updater requires a key pair; private key in CI secrets |

Until a version is **tagged and published**, “production ready” is still theoretical for non-developers.

### 2.2 E2E coverage (mocked vs real)

CI runs two different kinds of “end-to-end” verification. Only one is in place.

| Layer | What it proves | Status |
|-------|----------------|--------|
| **Rust smoke** (`cargo test`, `smoke_inference.rs`) | ONNX inference + mask IoU on CPU | ✅ every PR |
| **Mocked UI E2E** (`e2e/playwright.spec.ts`, `VITE_E2E=1`) | React wiring: drop → Process → events → “Done” + preview; NC license modal gates first RMBG download | ✅ every PR |
| **Real desktop E2E** (Tauri WebDriver) | Shipped binary: native drop → real `remove_image_background` → output file on disk | ❌ not wired |

**Mocked UI E2E (done)** — runs on every push/PR to `main` after lint (see [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)). Playwright drives Chromium against the Vite dev server; `@tauri-apps/*` is swapped for `e2e/mocks/`. No Rust process, no ONNX, no installer. Catches UI regressions in the happy path only.

**Real desktop E2E (still required for 1.0)** — [`e2e/tauri-webdriver.config.ts`](../e2e/tauri-webdriver.config.ts) is a stub. Until this exists, CI cannot prove that the AppImage/NSIS artifact actually removes a background.

Do **not** treat mocked E2E on PR as production-ready coverage. It is a **0.9 CI hygiene** item, not proof the shipped app works.

### 2.3 Linux packaging (AppImage)

**Status: base path validated — not a beta blocker.**

Older notes called for an AppImage **rpath fix** (`src-tauri/.cargo/config.toml` with `link-arg=-Wl,-rpath,$ORIGIN`) so a separate `libonnxruntime.so` would resolve at runtime (classic dynamic-ORT / tauri packaging footgun).

**That layout does not match the current build:**

- Linux uses `ort` with `download-binaries` → core ONNX Runtime is **statically linked** into `swiftmask` (`cargo:rustc-link-lib=static=onnxruntime`).
- The AppImage binary does **not** `NEEDED` `libonnxruntime.so`; `OrtGetApiBase` is defined in the binary.
- AppImage `RUNPATH=$ORIGIN/../lib` is for the **GTK/WebKit** stack linuxdeploy bundles, not for ORT.
- A separate `.cargo/config.toml` rpath for `libonnxruntime.so` is **not required** for the current linkage and should not be treated as open ship work.

**Manual validation (2026-07):** Ubuntu 24.04 **CI AppImage** artifacts run on **Arch**, including **CUDA** EP. That is stronger evidence than “works in the builder environment” and closes the “strangers can’t load the Linux binary” fear for the intended path.

**Remaining Linux notes (docs / edge cases, not emergency packaging):**

| Topic | Notes |
|-------|--------|
| CUDA host deps | CUDA EP still needs a normal NVIDIA userland on the host (drivers + CUDA libs). AppImage is not a full CUDA redistributable. Missing stack → CPU fallback (by design). |
| Install docs | `chmod +x`, FUSE / AppImage run issues, WebKit compositing (`WEBKIT_DISABLE_COMPOSITING_MODE` / `tauri:build:cachy`) |
| Optional automation | Formal clean-profile or post-build smoke in CI is still nice for 1.0; manual cross-distro runs already green |

### 2.4 User-visible error handling

Many failures only reach `console.error` — model list failures, download failures, “show in folder” errors. Production users will not open DevTools.

**Needed:**

- Clear inline errors (not only `Error: …` in the rail footer)
- Actionable copy for common cases: missing GPU drivers, disk full, network down during download, corrupt model
- **GPU OOM fallback** — backend automatic GPU→CPU retry + `inference:fallback` event shipped; in-app user notice still pending (see §1.0)

### 2.5 License disclosure in the UI

**Done (0.9):** one-time NC license modal before the first Balanced+ / Max Quality download, with CC BY-NC 4.0 link and commercial-use guidance; **Non-commercial** badge on downloaded RMBG modes. Covered by Playwright E2E (`NC license modal gates first RMBG download`).

**Still missing for 1.0:** About / licenses panel (MIT app + per-model attributions).

### 2.6 Edge cases real users will hit

Not all blockers for 1.0, but expect support tickets without them:

| Gap | User impact |
|-----|-------------|
| No large-image handling (>4K) | OOM or very slow runs (tiling is post-MVP in plan) |
| `ort` is **2.0.0-rc.12** | Release-candidate dependency for a “stable” label |
| Windows unsigned | SmartScreen warnings — expected; document in install guide |
| No macOS | Intentionally deferred (no CoreML target yet) |
| CSP is `null` in `tauri.conf.json` | Low risk for a local app; tighten eventually |

### 2.7 Supportability

No local log file, no “copy diagnostics” action, no link to report issues. Settings shows app + ORT version (good), but bug reports should include a standard packet: app version, EP, GPU, last error, platform.

Zero telemetry matches the product promise; **local logs** give support without breaking privacy.

### 2.8 UX polish (lower priority)

- First-run is silent beyond the benchmark spinner — a short “drop an image → Process” hint helps
- ~~Keyboard shortcuts (open file, process, cancel)~~ ✅
- About section with license links and model attributions

---

## 3. Suggested release tiers

### Public beta (0.9) — remaining focused work

1. ~~GitHub Releases workflow~~ ✅ (publish first real tag still pending)
2. ~~Mocked UI E2E on every PR~~ ✅ (does **not** substitute for real desktop E2E)
3. ~~AppImage base path outside CI~~ ✅ (Arch + CUDA on Ubuntu CI artifacts; rpath item obsolete — see §2.3)
4. In-app error surfacing ~~+ NC license notice for RMBG modes~~ (NC notice ✅; errors still open on `dev`)
5. ~~Screenshots + install troubleshooting in README~~ ✅
6. **Tag and publish** first public beta so strangers can download

### 1.0

1. Signed auto-updater (`tauri-plugin-updater`)
2. GPU OOM → CPU fallback with user notice (BE ✅; UI notice pending)
3. **Real desktop E2E** — at least one happy path: drop fixture → process → output PNG exists on disk
4. Local diagnostic log + “report issue” link
5. About / licenses panel

### Post-1.0

Already in [`plan.md`](plan.md): macOS/CoreML, batch queue, mask tuning, large-image tiling, video, manual editor.

---

## 4. Bottom line

The **product** is close. What still separates “works for us” from production for non-developers is mainly **publishing + failure UX + support docs**, not Linux packaging theory.

**Three highest-leverage next steps:**

1. **Publish installers** (tag a version; release workflow already exists)
2. **Make errors visible to users** (and GPU OOM notice)
3. ~~Install / troubleshooting docs~~ ✅ (README)

Linux AppImage loadability is **no longer** in that list — static ORT + manual CI-artifact validation (including CUDA on Arch) closed the old rpath fear. Mocked E2E guards UI wiring only; real desktop E2E remains a **1.0** item.

---

## 5. Checklist

Use this as a trackable backlog; check items off as they ship.

### Distribution

- [x] GitHub Releases workflow (tag → AppImage/deb/rpm + NSIS/MSI upload)
- [x] `CHANGELOG` / release notes per version
- [ ] First public tag / GitHub Release published
- [ ] `tauri-plugin-updater` + signing key in CI secrets
- [x] User README: download links, screenshots, install troubleshooting
- [x] Linux AppImage base path (static ORT; validated outside CI incl. CUDA) — see §2.3
- ~~[ ] AppImage rpath fix (`.cargo/config.toml`)~~ — **obsolete** with static `ort` linkage; do not re-open unless packaging switches back to dynamic `libonnxruntime.so`

### CI / testing

**Backend (proves inference works)**

- [x] `cargo test` + `smoke_inference` (IoU) on every PR
- [ ] CUDA GPU test skipped or gated when `libcublas` unavailable (local dev ergonomics)

**Frontend — mocked (proves UI wiring only; 0.9)**

- [x] Mocked Playwright E2E on every PR to `main` (`VITE_E2E=1`, no Tauri/Rust)
- Covers: boot → inject drop → Process → `remove_image_background` invoked → “Done” → preview image visible; NC license modal gates first RMBG download (Cancel / accept → download starts)
- Does **not** cover: real IPC, inference, overwrite dialog, full download flow, settings, first-run benchmark

**Frontend — real desktop (proves shipped app works; 1.0)**

- [ ] Tauri WebDriver E2E against built artifact (drop → process → **output file exists on disk**)
- [ ] Optional: nightly or post-build job on CI artifact (AppImage or unpacked binary)

### Reliability

- [x] User-visible errors for model list / download / process / reveal-in-folder (PR1–3 ✅ — see [`user-visible-errors-plan.md`](user-visible-errors-plan.md))
- [x] GPU OOM detection → CPU fallback + notice (BE fallback + event ✅; sticky UI notice ✅ PR2)
- [x] Backend download cancel (if UI cancel is kept)
- [ ] Large-image guard or clear “may fail” messaging

### Legal / trust

- [x] In-app NC license notice before first RMBG download (modal + persistent ack; badge on ready RMBG modes)
- [ ] About / licenses panel (MIT app + per-model terms)

### Support

- [ ] Local log file (rotating, no network)
- [ ] “Copy diagnostics” in Settings
- [x] Link to issue tracker / feedback (README)

### Polish

- [ ] First-run hint or empty-state copy beyond benchmark
- [x] Keyboard shortcuts
- [x] Windows SmartScreen note in docs
