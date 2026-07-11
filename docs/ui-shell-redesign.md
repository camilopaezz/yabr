# yabr UI shell redesign

Frozen decisions from a layout grill (2026-07-09). Implementation target: restyle the existing single-image background-removal flow into a **left rail + big preview** shell. Product logic (inference, models, stores, overwrite rules) stays the same unless a small platform hook is required (file dialog, reveal in folder, window size).

> Status: **Frozen for implementation.** Change by editing this document.

---

## 1. Ambition

| Decision | Choice | Rationale |
|---|---|---|
| Scope level | **A — layout pattern only** | Left control rail + large preview; keep existing steps/logic; restyle. Not an Upscayl product/visual clone. |

Reference inspiration (Upscayl) is used only for **information architecture**: controls on the left, image owns the right.

---

## 2. Locked decisions

| # | Topic | Choice |
|---|---|---|
| U1 | Ambition | Layout pattern only (rail + preview) |
| U2 | Settings | Centered overlay modal; shell stays mounted; Esc / Close dismisses |
| U3 | Image intake | Drag-and-drop on preview + native file dialog from rail |
| U4 | Empty file block (rail) | “No image” + **Select image** button |
| U5 | Drop targeting | Accept drops **window-wide** (Tauri events); **highlight only the preview** |
| U6 | After process | Before/after **comparison slider** |
| U7 | Before result exists | Full **input only** until `status === done`; then enable slider |
| U8 | Process / Cancel / progress / status | All live in the **left rail** |
| U9 | Rail width | Fixed **~300px**; no resize; no collapse |
| U10 | Rail order (top → bottom) | File block → quality mode → progress/status → Process / Cancel |
| U11 | Theme | System light/dark via `prefers-color-scheme` |
| U12 | Window size | Default **~1100×720**; min **~900×560** |
| U13 | Model download | Keep **full-window modal** (current pattern) |
| U14 | First-run GPU/benchmark | **Full-window blocker** (“Detecting best acceleration…”) until init completes |
| U15 | Branding chrome | **Custom titlebar** (`decorations: false`) — single `yabr` + EP chip + Settings + window controls; no OS title bar |
| U16 | EP chip | Short friendly label (`CUDA` / `CPU` / `DirectML` / `CoreML` / `—`); **not clickable** |
| U17 | Post-success action | **Show in folder** (reveal output path) + existing Re-run |
| U18 | Styling approach | **CSS variables + plain CSS** (no Tailwind, no CSS modules for this pass) |

---

## 3. Explicit non-goals (this pass)

| # | Out of scope |
|---|---|
| N1 | Batch queue / multi-image |
| N2 | Collapsible or resizable rail |
| N3 | Upscayl visual clone (navy chrome, purple pills, glass, marketing thickness) |
| N4 | Manual theme picker / override |
| N5 | In-app mask editor / brush |
| N6 | New inference models, export formats, or backend pipeline changes |
| N7 | ~~Custom titlebar / frameless window~~ *(implemented: U15)* |

---

## 4. Layout contract

### 4.1 Shell

```
┌─────────────────────────────────────────────────────────────┐
│ yabr [EP]  ……drag……  ⚙  − □ ×                               │  custom titlebar
├──────────────┬──────────────────────────────────────────────┤
│ file / mode  │                  BIG PREVIEW                 │
│ process      │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

- Full viewport (no centered `max-width: 960` form column).
- **Custom titlebar** — OS decorations off; one `yabr` label; drag region; Settings + minimize / maximize / close.
- Preview never hosts Process / Cancel / progress (those stay in the rail).

### 4.2 Left rail (top → bottom)

1. **File block**
   - Empty: “No image” + **Select image** (native open dialog).
   - Loaded: filename (ellipsis) + **Change** (same dialog) + **Remove** (clear current).
2. **Quality mode** — existing model list / download trigger (restyled into rail).
3. **Progress / status** — stage, bar, error text when relevant.
4. **Primary actions**
   - Idle / ready / error / cancelled: **Process** (or **Re-run** when done).
   - Processing: **Cancel**.
   - Done: **Show in folder** (above or beside Re-run; reveal `outputPath`).

Process is disabled when there is no current image or when busy (same rules as today).

### 4.3 Preview pane

| App state | Preview content |
|---|---|
| Empty | Drop affordance copy + formats; drag highlight when `isDragging` |
| Ready | Full input image (no slider) |
| Processing | Full input image (no slider); progress remains in rail |
| Done | Interactive before/after **comparison slider**; checkerboard under alpha |
| Error / cancelled | Full input; message in rail |

### 4.4 Overlays

| Overlay | When | Behavior |
|---|---|---|
| First-run blocker | No saved EP; detect + benchmark running | Full window; no shell interaction |
| Settings modal | User opens Settings | Centered card + dim backdrop; shell mounted underneath |
| Model download modal | User selects undownloaded model | Full-window modal (unchanged pattern) |

---

## 5. Wireframes

### 5.1 First-run blocker

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│              Detecting best acceleration…                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Empty

```
┌─────────────────────────────────────────────────────────────┐
│  yabr              [ CUDA ]                  [ Settings ]   │
├──────────────┬──────────────────────────────────────────────┤
│ No image     │                                              │
│ [Select img] │     ┌──────────────────────────────────┐     │
│              │     │                                  │     │
│ Quality mode │     │   Drop an image here             │     │
│  ○ Turbo     │     │   PNG, JPG, WEBP, BMP            │     │
│  ● Balanced  │     │                                  │     │
│  ○ Max       │     └──────────────────────────────────┘     │
│              │         (drag highlight on preview only)     │
│              │                                              │
│ [ Process ]  │   Process disabled                           │
│   disabled   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 5.3 Ready (image loaded)

```
┌─────────────────────────────────────────────────────────────┐
│  yabr              [ CUDA ]                  [ Settings ]   │
├──────────────┬──────────────────────────────────────────────┤
│ photo.png  ✕ │                                              │
│ [Change]     │     ┌──────────────────────────────────┐     │
│              │     │                                  │     │
│ Quality mode │     │         full INPUT image         │     │
│  ● Balanced  │     │         (no slider yet)          │     │
│              │     │                                  │     │
│ Ready        │     └──────────────────────────────────┘     │
│              │                                              │
│ [ Process ]  │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 5.4 Processing

```
┌─────────────────────────────────────────────────────────────┐
│  yabr              [ CUDA ]                  [ Settings ]   │
├──────────────┬──────────────────────────────────────────────┤
│ photo.png    │                                              │
│              │     ┌──────────────────────────────────┐     │
│ Quality mode │     │         full INPUT image         │     │
│  ● Balanced  │     │                                  │     │
│              │     └──────────────────────────────────┘     │
│ ████░░ 62%   │                                              │
│ Processing…  │                                              │
│              │                                              │
│ [ Cancel ]   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 5.5 Done

```
┌─────────────────────────────────────────────────────────────┐
│  yabr              [ CUDA ]                  [ Settings ]   │
├──────────────┬──────────────────────────────────────────────┤
│ photo.png  ✕ │                                              │
│ [Change]     │     ┌────── before │ after ──────────┐       │
│              │     │              ║                 │       │
│ Quality mode │     │    input     ║  output (α ▦)   │       │
│  ● Balanced  │     │              ║                 │       │
│              │     └──────────────╨─────────────────┘       │
│ Done         │              ⇄ drag handle                   │
│ [Show folder]│                                              │
│              │                                              │
│ [ Re-run ]   │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

### 5.6 Settings modal

```
┌─────────────────────────────────────────────────────────────┐
│  yabr              [ CUDA ]                  [ Settings ]   │
├──────────────┬──────────────────────────────────────────────┤
│              │     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │
│   (shell)    │     ░  ┌─────────────────────────────┐  ░    │
│              │     ░  │ Settings              [✕]   │  ░    │
│              │     ░  │ Execution provider   […]    │  ░    │
│              │     ░  │ Output directory     […]    │  ░    │
│              │     ░  │ [ Re-run benchmark ]        │  ░    │
│              │     ░  │ GPU / latencies…            │  ░    │
│              │     ░  └─────────────────────────────┘  ░    │
│              │     ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░    │
└──────────────┴──────────────────────────────────────────────┘
```

---

## 6. Behavior details

### 6.1 Select image (dialog)

- Trigger: rail **Select image** / **Change**.
- Use Tauri dialog plugin to open a single image file.
- Filters: PNG, JPG, JPEG, WEBP, BMP (same set as drop acceptance).
- On success: same path as drop → `acceptDrop([path], settings)` (or equivalent single-path helper).
- While `isProcessBusy()`, do not replace the current image (same gate as drop).

### 6.2 Drag-and-drop

- Keep window-level Tauri listeners (`tauri://drag-over|leave|drop`).
- Visual drag state only on the preview pane.
- First valid image path wins; multi-file drops still single-image MVP.

### 6.3 Comparison slider

- Only when both `inputPath` and `outputPath` exist and status is `done` (or output file is available after success).
- Before that: show input full-bleed (with checkerboard only if needed; input usually opaque).
- Output side: checkerboard under transparency.
- Replace the current Original / No Background toggle + click-to-swap UX.

### 6.4 EP chip labels

Map ORT provider ids to short labels, e.g.:

| Provider id | Chip |
|---|---|
| `CUDAExecutionProvider` | `CUDA` |
| `CPUExecutionProvider` | `CPU` |
| `DmlExecutionProvider` | `DirectML` |
| `CoreMLExecutionProvider` | `CoreML` |
| null / unknown | `—` |

Source of truth: `settingsStore.ep` (and first-run until ready, when the blocker is up).

### 6.5 Show in folder

- Visible when `status === done` and `outputPath` is set.
- Reveal the output file in the OS file manager (e.g. `@tauri-apps/plugin-opener` / platform reveal API).
- Does not open the image in an external viewer (out of scope).

### 6.6 Theme

- CSS custom properties on `:root` and `@media (prefers-color-scheme: dark)`.
- No in-app theme toggle this pass (plan A19 still holds).

### 6.7 Window

Update `src-tauri/tauri.conf.json` (or equivalent) roughly:

- `width`: 1100
- `height`: 720
- `minWidth`: 900
- `minHeight`: 560

Exact numbers can be tuned slightly if OS chrome requires it; intent is “comfortable rail + preview on first launch.”

---

## 7. Styling

- Prefer **classes + CSS variables** over new inline style objects for layout/chrome.
- Existing components may keep minimal inline styles during migration; shell layout should live in CSS.
- Suggested tokens (names illustrative): `--bg`, `--bg-rail`, `--bg-preview`, `--fg`, `--fg-muted`, `--border`, `--accent`, `--danger`, `--radius`, `--rail-width`.

---

## 8. Suggested component map

| Piece | Responsibility | Notes |
|---|---|---|
| `App.tsx` | Shell composition, first-run blocker, settings open state | Drop centered form layout |
| Header | Title, EP chip, Settings | New small component or inline |
| Rail | File block, hosts ModeSelector + process UI | ~300px column |
| File block | Select / Change / Remove, path display | Dialog open here |
| `ModeSelector` | Models + download modal | Restyle into rail |
| `ImagePanel` | Progress, status, Process/Cancel/Re-run, Show in folder | Rail bottom |
| `PreviewCanvas` | Empty drop UI, input view, comparison slider | No process controls |
| `SettingsPanel` | Modal body content | `visible` → modal open |
| `FileDropZone` | Collapse into preview empty state + window drop hook | Or absorb into preview / App |
| `App.css` | Tokens, shell grid, modal, slider chrome | Primary styling surface |

Domain logic remains in:

- `src/lib/currentImage.ts`
- `src/stores/*`
- `src/lib/tauri.ts` / Rust commands

New thin hooks only as needed:

- Open image file dialog
- Reveal path in folder
- EP id → short label helper

---

## 9. Testing notes

- E2E currently asserts “Drag & drop an image here” and a **Process** button — update copy/selectors if labels change.
- Prefer role/name queries (`getByRole('button', { name: /process/i })`) so restyle is resilient.
- Add coverage later for Select image dialog only if mocked dialog is already available in the e2e harness; not a blocker for pure layout work if drop injection remains the path.

---

## 10. Implementation checklist (when building)

1. Window size in `tauri.conf.json`.
2. CSS variables + light/dark + full-viewport shell grid.
3. Header (title, EP chip, Settings).
4. Rail structure + file block (dialog + change/remove).
5. Move mode + process UI into rail; disable Process with no image.
6. Preview empty state + drag highlight; keep window drop acceptance.
7. Preview: input-only until done; comparison slider when done.
8. Settings as centered modal.
9. First-run full-window blocker.
10. Show in folder on success.
11. Restyle model download modal to match tokens (behavior unchanged).
12. Update e2e / unit tests as needed.

---

## 11. Related docs

- Product / architecture: [`plan.md`](./plan.md)
- PR plan: [`architecture-pr-plan.md`](./architecture-pr-plan.md)
