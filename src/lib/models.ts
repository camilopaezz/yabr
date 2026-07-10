/**
 * Frontend model types and helpers.
 * Static registry is generated from Rust (`src-tauri/src/models.rs`).
 * Runtime availability (`downloaded`) comes only from `list_models`.
 */
export type { ModelMode, ModelStaticMeta } from "./models.generated";
export { MODEL_REGISTRY, getModelById } from "./models.generated";

import type { ModelStaticMeta } from "./models.generated";

/** Runtime model metadata returned by `list_models` (static fields + download state). */
export type ModelMeta = ModelStaticMeta & {
  downloaded: boolean;
};
