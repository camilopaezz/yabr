# Plan de PRs — deepening de arquitectura (yabr)

Documento de trabajo para retomar en otra sesión.  
Origen: revisión de arquitectura 2026-07-09 (`/tmp/architecture-review-20260709-194950.html`).  
Vocabulario: **módulo**, **interface**, **depth**, **seam**, **adapter**, **leverage**, **locality** (`codebase-design`).  
Dominio / decisiones: `docs/plan.md` (A1–A19). No hay `CONTEXT.md` todavía.

---

## Orden recomendado (stack)

```
PR1  Deepen job de remoción (Rust)          ← Strong, base  [GRILLING CERRADO]
  │
  ├─ PR1b  Export PNG+alpha ⊂ PR1 (acordado)
  │
PR2  Ciclo de vida CurrentImage (frontend)  ← Strong  [GRILLING CERRADO]
  │
PR3  Contrato IPC unificado                 ← Worth exploring; desbloquea e2e honestos
  │
PR4  Seam único del registry de modelos     ← Worth exploring  [IMPLEMENTADO]
  │
PR5  Política EP + Config                   ← Worth exploring; toca first-run y Settings
```

**Por qué este orden**

1. **PR1 primero**: el bug surface real es `processing::run_one`; el pipeline puro ya está bien testeado.
2. **PR2 después de PR1**: estabilizar errores/eventos del worker antes de concentrar la política en el FE.
3. **PR3 (IPC)**: normaliza casing/EP strings; reduce confianza falsa del e2e.
4. **PR4 (registry)**: independiente del job; evita drift SHA.
5. **PR5 (EP/Config)**: first-run, benchmark, LazyLock VRAM — al final del stack de policy.

---

## Estado actual relevante (baseline)

| Área | Hecho hoy | Gap |
|------|-----------|-----|
| Pipeline (`pipeline.rs`) | Unit tests preprocess/postprocess | OK |
| Image I/O | Round-trip PNG/JPEG/WebP/BMP | `apply_alpha` muerto; loop duplicado en `encode_png_rgba` |
| Job (`processing.rs`) | Solo test del `AtomicBool` cancel | `run_one` no testeable sin `AppHandle` |
| Commands | `spawn_blocking` + `catch_unwind` + emit error | Shell grueso mezclado con política de errores |
| Frontend process | `ImagePanel` + `progressStore` + `path` ×3 | overwrite A18 no cableado |
| Models | Rust SoT + `list_models` | `src/lib/models.ts` SHA placeholder |
| EP | `cpu`/`cuda`/`directml` en prod | e2e usa `CPUExecutionProvider` etc. |
| E2E | Playwright + aliases Vite, no desktop real | Mocks desalineados |

**Comandos de verificación**

```bash
bun test
bun run build
cd src-tauri && cargo test
cargo test --test smoke_inference
bun run test:e2e
```

---

## PR1 — Profundizar el job de remoción de fondo (Rust)

**Fuerza:** Strong · **Categoría de deps:** local-substitutable  
**Branch sugerida:** `arch/deepen-background-removal-job`  
**Grilling:** cerrado 2026-07-09 — listo para implementar.

### Objetivo

Convertir la orquestación “decode → preprocess → infer → postprocess → encode → write” en un **módulo deep** en `job.rs`, con **interface** pequeña y testeable **sin** `AppHandle`.  
`commands::remove_image_background` queda como **adapter** Tauri (spawn, panic catch, bridge de eventos vía sink).

### Acuerdos de grilling (fuente de verdad de diseño)

| Decisión | Acuerdo |
|----------|---------|
| Ports inyectados | **Progress** + **Config EP** + **resolución de modelo** (meta + bytes + ready). FS real con tempdir. Sin ports públicos de FS/Infer. |
| Layout archivos | **`job.rs`**: `ProcessingJob` + `run`. **`processing.rs`**: `ProcessingState` (cancel). Emits Tauri solo en adapter. |
| Notificaciones | Sink **rico**: `on_progress` / `on_done` / `on_error`. |
| Result + sink | `run` → `Result<(), AppError>`; éxito: `on_done` luego `Ok`; error dominio: `on_error` luego `Err`. Command **no** re-emite errores de dominio; solo panic/spawn. |
| Export alpha (PR1b) | **Dentro de PR1**: borrar `pipeline::apply_alpha`; un solo path `encode_png_rgba`. |
| Forma de deps | Struct **`JobDeps`** con callbacks/traits chicos (progress, EP, model entry/bytes/ready). |
| Happy path test | ONNX **real** (u2netp embebido + cpu), tempdir, stages + on_done + PNG alpha. Smoke IoU se mantiene. |

### Archivos tocados (previstos)

| Archivo | Cambio |
|---------|--------|
| `src-tauri/src/job.rs` | **Nuevo** — `ProcessingJob`, `JobDeps`, `run`, tests del job |
| `src-tauri/src/processing.rs` | Solo `ProcessingState` (+ re-exports si hace falta); quitar `run_one` y emits de dominio |
| `src-tauri/src/commands.rs` | Adapter: armar `JobDeps` Tauri, `catch_unwind`, panic → emit error |
| `src-tauri/src/pipeline.rs` | Borrar `apply_alpha` |
| `src-tauri/src/lib.rs` | `pub mod job` (o `mod job` + re-exports) |
| `src-tauri/src/image_io.rs` | Sin cambio funcional salvo renombre opcional documentado |

**No tocar en este PR:** frontend, download de models, `gpu` benchmark, e2e.

### Comportamiento que debe preservarse

1. Stages/pct: `decoding` 10 → `preprocessing` 20 → `inferring` 50 → `postprocessing` 80 → `encoding` 95 → done.
2. Cancel entre etapas → `AppError::Cancelled`; sink `on_error` con mensaje `"cancelled"` (mismo string que hoy el FE interpreta).
3. Modelo no bundled y no en cache → error model; `on_error`.
4. Éxito: PNG RGBA en `output_path` + `on_done`.
5. Panic en worker → adapter emite `"worker panic"` (fuera de `job::run`).
6. EP desde config en el momento del infer; bytes: bundled o cache.

### Forma del módulo (acordada)

```text
job::run(job, cancel: &ProcessingState, deps: &JobDeps) -> Result<(), AppError>
```

`JobDeps` (idea de shape; nombres exactos al implementar):

| Capacidad | Prod (command) | Test |
|-----------|----------------|------|
| Progress / done / error | `AppHandle::emit` | Recorder `Vec` / flags |
| `execution_provider()` | `config::load_config` | `"cpu"` fijo |
| model entry / ready / bytes | `models::*` + bundled bytes | registry real + temp/cache o bundled |

FS: `std::fs` real (tempdir en tests).  
Infer: `inference::with_session` real (sin port en interface pública).

### Tests a añadir (`job`)

1. **happy path** u2netp + cpu + tempdir: stages en orden, `on_done`, PNG con alpha, `Ok`.
2. **cancel antes de decode**
3. **cancel entre etapas**
4. **modelo no descargado**
5. **input inexistente**

### Auditoría de tests (replace-don't-layer)

| Test | Veredicto |
|------|-----------|
| `processing::cancel_sets_and_reset_clears_token` | Absorber si cancel se prueba vía `job::run`; opcional 1 test mínimo del token si `cancel_inference` sigue separado |
| `pipeline::*` | Conservar |
| `image_io::*` | Conservar |
| `apply_alpha` tests | N/A — no hay |
| `smoke_inference` | Conservar |
| FE overwrite/path/stores | No tocar en PR1 |

### Criterios de done

- [x] Núcleo del job sin `AppHandle`
- [x] `JobDeps` + sink rico + `Result` sin doble emit en command
- [x] `apply_alpha` eliminado
- [x] ≥ tests listados arriba verdes (`job::` 5 tests)
- [x] `cargo test --lib job::` + smoke verdes (CUDA GPU test preexistente falla sin libcublas en algunos envs)
- [x] FE sin cambios; eventos wire-compatibles

### Riesgos / no-hacer

- No hexagonalizar todo el crate (A10).
- No cambiar nombres de stages sin coordinar FE.
- No mover GPU/download aquí.

---

## PR2 — Módulo deep CurrentImage (frontend)

**Fuerza:** Strong · **Deps:** in-process (+ IPC/FS/dialog como adapters)  
**Branch sugerida:** `arch/deepen-current-image`  
**Grilling:** cerrado + implementado.

### Objetivo

Concentrar política de la imagen actual: accept drop, path, start process (**overwrite A18**), apply events, cancel/clear. Componentes = vistas.

### Acuerdos de grilling (fuente de verdad)

| Decisión | Acuerdo |
|----------|---------|
| Forma del módulo | **A** — funciones de dominio en `src/lib/currentImage.ts`; `imageStore` como estado; components solo llaman/suscriben. |
| Deps startProcess | **A** — struct: `exists`, `ask`, `removeBackground`, `getSettings`. Prod = plugin-fs + dialog + tauri + settingsStore. |
| progressStore | **A** — apply* + init listeners en currentImage; **borrar** `progressStore.ts`; migrar tests. |
| Drop / path | **A** — `acceptDrop` + `syncOutputPath` + `startProcess` recalcula path; `path.ts` helper. |
| Overwrite declined | **A** — no invoke; no `processing`; item queda ready/done sin error. Orden: settings → path → overwrite → processing → invoke. |
| Tests | **A** — `currentImage.test.ts` principal; migrar progressStore tests; mantener path/overwrite; imageStore smoke. |

### Archivos previstos

| Archivo | Cambio |
|---------|--------|
| `src/lib/currentImage.ts` | **Nuevo** — dominio |
| `src/lib/currentImage.test.ts` | **Nuevo** |
| `src/components/FileDropZone.tsx` | Solo UI + acceptDrop/sync |
| `src/components/ImagePanel.tsx` | Solo UI + startProcess/cancel/clear |
| `src/App.tsx` | init listeners desde currentImage |
| `src/stores/progressStore.ts` | **Borrar** |
| `src/stores/progressStore.test.ts` | **Borrar** (migrado) |
| `src/lib/path.ts`, `overwrite.ts` | Helpers; overwrite cableado vía startProcess |
| Prod adapter | exists (`@tauri-apps/plugin-fs`), ask (`@tauri-apps/plugin-dialog`) |

### Criterios de done

- [x] `deriveOutputPath` no en 3 call sites de components
- [x] overwrite en el camino real de process
- [x] Vitest currentImage; e2e smoke verde
- [x] Components sin lógica de negocio pesada
- [x] progressStore eliminado

---

## PR3 — Contrato IPC unificado

**Fuerza:** Worth exploring · **Branch:** `arch/ipc-contract`

### Objetivo

Un contract: eventos, job shape, EP strings. Adapters: prod Tauri + e2e mock.

### Archivos

- `events.rs`, `tauri.ts`, `e2e/mocks/tauri-core.ts`, fixtures e2e
- Preferir mapper en TS si se quiere diff Rust mínimo

### Criterios de done

- [ ] Mismos strings EP en e2e y prod
- [ ] Un sitio TS traduce eventos → estado

---

## PR4 — Seam del registry de modelos

**Fuerza:** Worth exploring · **Branch:** `arch/model-registry-seam`  
**Grilling:** cerrado — listo para implementar.

### Objetivo

Rust = única SoT de metadatos/SHA. FE: tipos generados + `list_models` en runtime. Sin `REGISTRY` a mano con SHA distintos.

### Acuerdos de grilling (PR4)

| Decisión | Acuerdo |
|----------|---------|
| Qué queda en el FE | Generar registry/tipos TS desde Rust (cero drift). |
| Mecánica de gen | Script/bin → archivo **commiteado**; prebuild/CI + check de frescura. Estáticos sí; `downloaded` no. |
| Consumo | Tipos + e2e/helpers desde generado; **UI runtime = list_models**. |
| Implementación | Bin Rust `gen_model_registry` en src-tauri; `bun run gen:models`. |
| Layout FE | **`models.generated.ts`** (solo gen) + **`models.ts`** thin re-export / `ModelMeta` + `downloaded`. |

### Criterios de done

- [x] Bin genera `src/lib/models.generated.ts` desde `models.rs` registry
- [x] No hay segundo registry a mano con SHA distintos / placeholders
- [x] E2e mocks usan generado (SHA reales)
- [x] ModeSelector sigue con `list_models` en runtime
- [x] `gen:models` + `gen:models:check` en CI
- [x] `bun run test` / `build` / typecheck e2e verdes

---

## PR5 — Política EP + Config

**Fuerza:** Worth exploring · **Branch:** `arch/ep-config-policy`

### Objetivo

Módulo EpPolicy: resolve, persist, invalidate, benchmark. First-run y Settings misma interface.  
`model_id` / `theme` en config: usar o borrar.

### Criterios de done

- [ ] First-run y re-benchmark comparten persist+winner
- [ ] Respeta A9; tests de policy sin UI

---

## Mapa de dependencias

```text
PR1 (job) ──────────────► PR2 (CurrentImage)
  │                            │
  │                            ▼
  │                       PR3 (IPC)
  │                            │
  └─────────────────────► PR5 (EpPolicy)
PR4 (registry) ── independiente
```

---

## Checklist para retomar en otra sesión

1. Leer este archivo + `docs/plan.md` A1–A19.
2. **PR1:** implementar según “Acuerdos de grilling”; no re-grillar salvo reopen explícito.
3. Baseline: `cargo test` + `bun test`.
4. Un PR del stack a la vez.
5. Al cerrar PR: marcar criterios de done.
6. Rechazo con razón de carga → ofrecer ADR en `docs/adr/`.

---

## Referencia de dominio (sin CONTEXT.md)

| Término | Significado en código |
|---------|----------------------|
| Model / mode | `u2netp`, `isnet-general-use`, `rmbg-1.4`, `rmbg-2.0` |
| EP | `cpu`, `directml`, `cuda` |
| Processing job | `{ id, inputPath, outputPath, modelId }` |
| Stages | decoding → preprocessing → inferring → postprocessing → encoding |
| Image status | ready → processing → done \| error \| cancelled |
| Output name | `<stem>-nobg-<modelId>.png` |

---

*Última actualización: 2026-07-09 · PR1+PR2 hechos · grilling PR4 cerrado · siguiente: implementar PR4.*
