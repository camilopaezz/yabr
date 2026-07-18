# SwiftMask — production readiness

Assessment of what remains before SwiftMask is safe to ship to non-developers. Written 2026-07-12.

> Status: **Living document.** Update as items ship or priorities change.

---

## 1. Current state

SwiftMask is past “does it work?” and into “can strangers install it, trust it, and not get stuck?” The core loop is solid: local inference, model downloads, GPU benchmark, drag-and-drop, compare slider, overwrite handling, and CI that builds real installers.

The MVP scope from [`plan.md`](plan.md) (Phases 0–7) is largely complete. Version is still **0.1.0** — a working alpha, not a shippable 1.0.

**Already in place:**

- Tauri 2 frameless shell (`TitleBar`, left rail + preview pane), themes, settings modal
- Four quality modes with on-demand download + SHA-256 verification
- GPU auto-detection, first-run benchmark, manual EP override
- Single-image flow: open/drop → process → compare slider → export PNG (`{stem}-nobg-{modelId}.png`)
- Overwrite prompt wired via `currentImage` (decision A18)
- Rust job module (`job.rs`) with unit tests; inference smoke test (IoU ≥ 0.85)
- Model registry codegen (`gen:models` / `gen:models:check`) — Rust SoT, no SHA drift
- CI (`.github/workflows/ci.yml`): Biome lint, Vitest, `gen:models:check`, `cargo test`,
  release builds on `ubuntu-24.04` (AppImage) + `windows-latest` (NSIS); artifacts retained 14 days
- **Mocked** Playwright E2E on every push/PR to `main` (UI wiring smoke only — see §2.2)
- NC license modal gates first Balanced+ / Max Quality download; persistent ack in `localStorage`; **Non-commercial** badge on ready RMBG modes
- README with dev setup, scripts, and commercial-use guidance for model licenses

---

## 2. Priority gaps

### 2.1 Ship artifacts (highest impact)

CI builds installers but there is no **release workflow** — nothing publishes to GitHub Releases with notes and downloadable assets. Users cannot get the app without building it themselves.

Also missing (planned in [`plan.md`](plan.md) Phase 9, not yet in the repo):

| Item | Notes |
|------|-------|
| GitHub Releases workflow | Upload NSIS + AppImage with tagged version |
| `tauri-plugin-updater` | Planned in decision A16; not wired in `Cargo.toml` / `tauri.conf.json` |
| Signing keys | Updater requires a key pair; private key in CI secrets |
| `CHANGELOG` | No release notes file yet |
| User-facing install docs | Screenshots, “download here”, troubleshooting (CUDA, WebKit/GTK) |

Until installers are published, “production ready” is mostly theoretical.

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

### 2.3 Linux packaging hardening

[`plan.md`](plan.md) calls for an AppImage **rpath fix** (`src-tauri/.cargo/config.toml` with `link-arg=-Wl,-rpath,$ORIGIN`) so `libonnxruntime.so` resolves at runtime. That file is not in the repo yet.

CI may produce an AppImage that works in CI and fails on a clean machine. Verify on a fresh Ubuntu install before calling Linux done.

### 2.4 User-visible error handling

Many failures only reach `console.error` — model list failures, download failures, “show in folder” errors. Production users will not open DevTools.

**Needed:**

- Clear inline errors (not only `Error: …` in the rail footer)
- Actionable copy for common cases: missing GPU drivers, disk full, network down during download, corrupt model
- **GPU OOM fallback** — backend automatic GPU→CPU retry + `inference:fallback` event shipped; in-app user notice still pending (see §1.0)

**Plan (locked 2026-07-18):** [`user-visible-errors-plan.md`](user-visible-errors-plan.md) — structured `{ code, message }` wire, FE copy map, hybrid local/shared notice UI, three PRs (contract → core UX → full inventory).

### 2.5 License disclosure in the UI

**Done (0.9):** one-time NC license modal before the first Balanced+ / Max Quality download, with CC BY-NC 4.0 link and commercial-use guidance; **Non-commercial** badge on downloaded RMBG modes. Covered by Playwright E2E (`NC license modal gates first RMBG download`).

**Still missing for 1.0:** About / licenses panel (MIT app + per-model attributions).

### 2.6 Edge cases real users will hit

Not all blockers for 1.0, but expect support tickets without them:

| Gap | User impact |
|-----|-------------|
| No large-image handling (>4K) | OOM or very slow runs (tiling is post-MVP in plan) |
| Download cancel may be UI-only | Cancel button might not abort the backend transfer |
| `ort` is **2.0.0-rc.12** | Release-candidate dependency for a “stable” label |
| Windows unsigned | SmartScreen warnings — expected; document in install guide |
| No macOS | Intentionally deferred (no CoreML target yet) |
| CSP is `null` in `tauri.conf.json` | Low risk for a local app; tighten eventually |

### 2.7 Supportability

No local log file, no “copy diagnostics” action, no link to report issues. Settings shows app + ORT version (good), but bug reports should include a standard packet: app version, EP, GPU, last error, platform.

Zero telemetry matches the product promise; **local logs** give support without breaking privacy.

### 2.8 UX polish (lower priority)

- First-run is silent beyond the benchmark spinner — a short “drop an image → Process” hint helps
- Keyboard shortcuts (open file, process, cancel)
- About section with license links and model attributions

---

## 3. Suggested release tiers

### Public beta (0.9) — ~1–2 weeks focused work

1. GitHub Releases workflow
2. ~~Mocked UI E2E on every PR~~ ✅ (does **not** substitute for real desktop E2E)
3. AppImage smoke test on clean Linux
4. In-app error surfacing ~~+ NC license notice for RMBG modes~~ (NC notice ✅)
5. Screenshots + install troubleshooting in README

### 1.0

1. Signed auto-updater (`tauri-plugin-updater`)
2. GPU OOM → CPU fallback with user notice
3. **Real desktop E2E** — at least one happy path: drop fixture → process → output PNG exists on disk
4. Local diagnostic log + “report issue” link

### Post-1.0

Already in [`plan.md`](plan.md) §12: macOS/CoreML, batch queue, mask tuning, large-image tiling, video, manual editor.

---

## 4. Bottom line

The **product** is close. The **release infrastructure and failure modes** separate “works on my machine” from production.

**Three highest-leverage next steps:**

1. **Publish installers** (GitHub Releases)
2. **Make errors visible to users**
3. **Verify Linux artifacts** on a clean machine (AppImage rpath + smoke install)

Mocked E2E on PR is done and helps, but it does not belong in this list — it guards UI wiring, not shippability. Real desktop E2E is a **1.0** item.

---

## 5. Checklist

Use this as a trackable backlog; check items off as they ship.

### Distribution

- [x] GitHub Releases workflow (tag → NSIS + AppImage upload)
- [x] `CHANGELOG` / release notes per version
- [ ] `tauri-plugin-updater` + signing key in CI secrets
- [ ] User README: download links, screenshots, install troubleshooting
- [ ] AppImage rpath fix (`.cargo/config.toml`)

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

- [ ] User-visible errors for model list / download / process / reveal-in-folder (PR1 contract ✅; process/download/fallback UI ✅ PR2; list/settings/reveal/first-run PR3 — see [`user-visible-errors-plan.md`](user-visible-errors-plan.md))
- [x] GPU OOM detection → CPU fallback + notice (BE fallback + event ✅; sticky UI notice ✅ PR2)
- [x] Backend download cancel (if UI cancel is kept)
- [ ] Large-image guard or clear “may fail” messaging

### Legal / trust

- [x] In-app NC license notice before first RMBG download (modal + persistent ack; badge on ready RMBG modes)
- [ ] About / licenses panel (MIT app + per-model terms)

### Support

- [ ] Local log file (rotating, no network)
- [ ] “Copy diagnostics” in Settings
- [ ] Link to issue tracker / feedback

### Polish

- [ ] First-run hint or empty-state copy beyond benchmark
- [ ] Keyboard shortcuts
- [ ] Windows SmartScreen note in docs
