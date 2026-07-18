# Plan: §2.4 User-visible error handling

> Locked 2026-07-18 after product grill. Do not reopen in implementation PRs without an explicit product decision.
> Related: [`production-readiness.md`](production-readiness.md) §2.4, [`gpu-oom-fallback-plan.md`](gpu-oom-fallback-plan.md) (BE fallback shipped; FE notice is PR2 here).

## Goal

Strangers never need DevTools. Failures and successful GPU→CPU fallback are visible, classified by **stable codes**, with **FE-owned** actionable copy.

## Locked decisions

| # | Topic | Choice |
|---|--------|--------|
| Scope | Full inventory + structured errors | **D** |
| Wire | Invoke + events | `{ code, message }` hard cut (no dual string wire) |
| UI | Surfaces | Hybrid: local process/download; shared notice elsewhere + fallback |
| Codes | Catalog | Product-facing ~12–14 (see below) |
| Copy | Owner | FE map `code → { title, body? }`; `message` technical; unmapped → sanitized message |
| Fallback UI | Notice | Sticky until dismiss; severity `warning`; process stays `done` |
| Notice lifecycle | Slot | Single; newest replaces; manual X only; no Escape dismiss v1 |
| Notice placement | Chrome | Banner under TitleBar; `role="alert"` / `role="status"`; no focus steal |
| Process UI | Footer | Mapped title line; Process/Re-run is retry |
| Download UI | Local | Error + Retry; state in ModeSelector |
| ImageItem | Error field | `error: { code, message } \| null` (replace string) |
| Notice state | Store | Extend `uiStore` |
| First-run | Policy | Soft degrade (CPU / Turbo) **+** warning notice |
| Classification | BE | Hybrid central `error_code(&AppError)`; classify IO/reqwest **before** string wrap; best-effort honesty |
| Channels | Process | Job fail → `inference:error` only (today); invoke `Err` preflight/join; structure both |
| Plugin errors | FE | `parseAppError` normalizes AppError + plugins + junk |
| Delivery | PRs | **3 PRs** (contract → core UX → full inventory) |
| Tests | Bar | Unit always; mocked Playwright for PR2 visible paths |

## Out of scope

- §2.7 local log / copy diagnostics (keep technical `message` for later)
- Changing Settings EP on OOM fallback (job-only; already BE policy)
- Dual wire formats / long-lived string Serialize
- Toast stacks, modal error dialogs
- Broadening `is_likely_oom` needles
- Window min/max/close error UI
- Real desktop E2E (§2.2)
- Settings deep-link from fallback notice

## Error code catalog

| code | Typical origin | UI |
|------|----------------|-----|
| `cancelled` | cancel paths | No error chrome |
| `busy` | already processing | Local / control flow |
| `download_busy` | download already in progress | Local / control flow |
| `network` | reqwest connect/timeout/HTTP fail | Mapped copy |
| `disk_full` | `ErrorKind::StorageFull` / OS full-disk on write | Mapped copy |
| `model_corrupt` | SHA-256 mismatch | Mapped copy + re-download |
| `model_not_ready` | process without cache | Mapped copy |
| `model_unknown` | bad model id | Mapped copy |
| `oom` | final OOM (e.g. CPU retry fail) | Mapped copy |
| `gpu` | `AppError::Gpu` / clear EP setup | Mapped copy |
| `image_unreadable` | decode/open image | Mapped copy |
| `output_failed` | encode/write output | Mapped copy |
| `config` | config read/write | Mapped copy |
| `dialog` | file/dialog/plugin picker | Mapped copy |
| `inference_failed` | non-OOM inference/pipeline catch-all | Mapped copy |
| `unknown` | unclassified | Generic + sanitized message |

**Not an error code:** `inference:fallback` event → sticky **warning** notice (info product tone, warning severity).

### Severity defaults

| Kind | Severity |
|------|----------|
| Most failures shown in shared notice | `error` |
| GPU fallback notice | `warning` |
| First-run soft-degrade notice | `warning` |
| `cancelled` | never a notice |

## Wire formats

### Invoke error (Tauri command `Err`)

```json
{ "code": "network", "message": "request failed: ..." }
```

### `inference:error`

```json
{ "id": "<run-id>", "code": "oom", "message": "cpu retry failed: ..." }
```

### `inference:fallback` (unchanged product shape)

```json
{ "id": "<run-id>", "reason": "oom", "from_ep": "directml", "to_ep": "cpu" }
```

## FE modules (target)

| Module | Role |
|--------|------|
| `src/lib/parseAppError.ts` (name flexible) | Only choke point: unknown → `{ code, message }` |
| `src/lib/errorCopy.ts` | `code → { title, body? }` + `formatError` |
| `src/lib/downloadCancel.ts` | Cancel via `code === "cancelled"` |
| `src/stores/uiStore.ts` | `notice` + `showNotice` / `dismissNotice` |
| `src/components/AppNotice.tsx` (name flexible) | Banner under TitleBar |
| `src/stores/imageStore.ts` | `error: { code, message } \| null` |
| `src/lib/currentImage.ts` | Structured applyError; fallback listener → notice (PR2) |

## Inventory → PR map

| Site | PR |
|------|----|
| BE `AppError` serialize + `error_code` + event payload | 1 |
| FE `parseAppError`; all catch sites compile-safe | 1 |
| Process job error event → structured `ImageItem.error` | 1 (shape) / 2 (copy) |
| Process invoke preflight (busy / failed start) | 1–2 |
| GPU fallback notice | 2 |
| Download fail + Retry | 2 |
| `errorCopy` + process footer + download chrome | 2 |
| Mocked Playwright: process error, download retry, fallback notice | 2 |
| List models (mount + refresh) | 3 |
| First-run GPU/benchmark + list models notices | 3 |
| Settings set EP / output dir / benchmark | 3 |
| Reveal in folder | 3 |
| Open image dialog | 3 |
| Download cancel invoke fail (warning if UX would lie) | 3 |

## PR acceptance

### PR1 — Contract

- [x] `AppError` serializes `{ code, message }` only
- [x] `error_code` covers catalog defaults + known sites (SHA, cancel, busy, OOM via existing helper, IO full disk when kind available, reqwest→network at download site)
- [x] `InferenceErrorPayload` includes `code`; panic path emits structured payload too
- [x] `JobSink::on_error` structured (not bare string only)
- [x] FE `parseAppError` + cancel/busy via code; E2E mocks updated; existing tests green
- [x] Process may still show technical message; silent sites may still console — OK

### PR2 — Core UX

- [x] `errorCopy.ts` for process/download/fallback/oom-related codes
- [x] Image footer uses friendly title (not raw `Error: …` only)
- [x] Download error state + Retry
- [x] `uiStore` notice + banner; fallback sticky warning
- [x] Mocked Playwright covers friendly process error, download retry, fallback notice

### PR3 — Full inventory

- [ ] All inventory rows 1–14 from grill have a user-visible path
- [ ] First-run soft-degrade + notice
- [ ] Remaining copy entries
- [ ] No new wire fields

## Implementation notes (for agents)

1. **Hard cut:** update BE Serialize and every FE catch in the same PR1 merge train; use a single parser so components never inspect raw Tauri shapes.
2. **Do not** reintroduce `error: "command failed"` string — use parsed code/message.
3. **Preserve** cancel semantics: optimistic cancel, discarded run ids, download session tokens.
4. **Fallback** is not `status: "error"`.
5. Prefer classifying from `io::Error` / reqwest types **before** `AppError::Model(format!(...))`.
6. Prefer static message constants for strings matched in `error_code`.
7. Workflows / cheaper models: implement **one PR at a time** against this doc; do not invent codes or wire fields.

## Copy sketches (non-final; polish in PR2)

| code | title sketch |
|------|----------------|
| `network` | Network error |
| `disk_full` | Not enough disk space |
| `model_corrupt` | Model file is damaged |
| `model_not_ready` | Model not downloaded |
| `oom` | Out of memory |
| `gpu` | GPU problem |
| `image_unreadable` | Couldn’t read that image |
| `output_failed` | Couldn’t save the result |
| `inference_failed` | Processing failed |
| `unknown` | Something went wrong |
| *(fallback notice)* | Finished on CPU — GPU ran out of memory; Settings EP unchanged |
| *(first-run degrade)* | Couldn’t finish GPU setup — using CPU |
