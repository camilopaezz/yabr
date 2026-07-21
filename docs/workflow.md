# Git workflow

How we branch, integrate, and release SwiftMask.

## Branches

| Branch | Role |
|--------|------|
| `main` | Production. Tagged releases only. Full CI on PRs targeting `main` (not on ordinary pushes). |
| `dev` | Integration. Feature PRs merge here. **No CI** — you validate locally. |
| `feature/*` | Short-lived work branches. Cut from `dev`, PR back to `dev`. |

`origin/HEAD` points at `main`. Treat `dev` as the daily integration line.

## Day-to-day (feature → dev)

1. Branch from `dev`:
   ```bash
   git checkout dev && git pull
   git checkout -b feature/my-change
   ```
2. Implement, run checks locally:
   ```bash
   bun run lint && bun run test && bun run build
   # optional: bun run test:e2e
   ```
3. Push and open a **PR into `dev`**.
4. **CI does not run** on PRs to `dev` — review and smoke-test manually.
5. Merge to `dev` when satisfied.

Repeat until `dev` has enough for a release.

## Release (dev → main)

1. On `dev`, prepare a release PR into `main`:
   - Bump version in **all three** files: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`
   - MSI/WiX only accepts a numeric ProductVersion (`major.minor.patch[.build]`). SemVer pre-releases like `0.9.0-beta.1` fail unless `bundle.windows.wix.version` is set to something numeric (e.g. `0.9.0.1`). For stable releases you can drop the override.
   - Move `[Unreleased]` items in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` section
2. Open **PR `dev` → `main`**. **Full CI runs** (lint, unit tests, `gen:models:check`, Rust tests, Tauri bundles on Linux + Windows, mocked Playwright E2E).
3. Merge when green and reviewed. Merging does not re-run CI — the PR run is the gate.
4. Tag on `main` (version must match the bump):
   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```
5. **Release workflow** (`.github/workflows/release.yml`) builds installers and publishes a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) with assets:
   - Linux: AppImage, `.deb`, `.rpm`
   - Windows: NSIS setup `.exe`, `.msi`

To re-run a failed publish without retagging, use **Actions → Release → Run workflow** with the existing tag.

## CI summary

| Event | Workflow | What runs |
|-------|----------|-----------|
| PR → `dev` | — | Nothing (manual QA) |
| Push to `dev` | — | Nothing |
| PR → `main` | `ci.yml` | Lint, unit tests, `gen:models:check`, `cargo test`, Tauri build (Linux + Windows), mocked Playwright E2E |
| Push to `main` | — | Nothing (CI already ran on the PR) |
| Push semver tag `vX.Y.Z` (optional `-prerelease`) on `main` | `release.yml` | Version check, full test + build, GitHub Release upload |
| Manual dispatch with existing tag | `release.yml` | Re-publish a failed release without retagging |

## First-time setup

If `dev` is not on the remote yet:

```bash
git checkout dev
git push -u origin dev
```

Set GitHub default comparison branch for PRs to `dev` if you want (Settings → General → Default branch stays `main`).

## Example: NC license feature

```bash
# already on feature/nc-license-modal
git push -u origin feature/nc-license-modal
# open PR: feature/nc-license-modal → dev (no CI)
# manual check → merge

# later, release batch:
# open PR: dev → main with version 0.2.0 + CHANGELOG
# merge → tag v0.2.0 → release workflow publishes installers
```