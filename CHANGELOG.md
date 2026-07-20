# Changelog

All notable changes to SwiftMask are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Version numbers must stay in sync across `package.json`, `src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` before tagging a release.

## [Unreleased]

### Added

- User-facing README: download/install steps, screenshots, keyboard shortcuts, troubleshooting
- Screenshots under `docs/screenshots/` for the main window, quality modes, and before/after results

## [0.1.0] - 2026-07-12

### Added

- Initial SwiftMask desktop app (Tauri 2 + React + local ONNX inference)
- Quality modes: Turbo (bundled), Balanced, Balanced+, Max Quality
- GPU benchmark, model downloads with SHA-256 verification, compare slider export

[Unreleased]: https://github.com/camilopaezz/SwiftMask/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/camilopaezz/SwiftMask/releases/tag/v0.1.0