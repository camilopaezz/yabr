/**
 * Frontend model types and helpers.
 * Static registry is generated from Rust (`src-tauri/src/models.rs`).
 * Runtime availability (`downloaded`) comes only from `list_models`.
 */
export type { ModelMode, ModelStaticMeta } from "./models.generated";
export { getModelById, MODEL_REGISTRY } from "./models.generated";

import type { ModelMode, ModelStaticMeta } from "./models.generated";

/** Preferred default quality mode when its weights are on disk. */
export const PREFERRED_DEFAULT_MODE: ModelMode = "isnet-general-use";

/** Always-bundled fallback when the preferred model is not ready. */
export const FALLBACK_DEFAULT_MODE: ModelMode = "u2netp";

/** Runtime model metadata returned by `list_models` (static fields + download state). */
export type ModelMeta = ModelStaticMeta & {
  downloaded: boolean;
};

export function isModelReady(
  model: Pick<ModelMeta, "bundled" | "downloaded">,
): boolean {
  return model.bundled || model.downloaded;
}

/**
 * Keep the current mode when ready; otherwise prefer Balanced if downloaded,
 * else fall back to bundled Turbo.
 */
export function resolveMode(
  current: ModelMode,
  models: readonly ModelMeta[],
  preferred: ModelMode = PREFERRED_DEFAULT_MODE,
  fallback: ModelMode = FALLBACK_DEFAULT_MODE,
): ModelMode {
  const currentMeta = models.find((m) => m.id === current);
  if (currentMeta && isModelReady(currentMeta)) {
    return current;
  }

  const preferredMeta = models.find((m) => m.id === preferred);
  if (preferredMeta && isModelReady(preferredMeta)) {
    return preferred;
  }

  const fallbackMeta = models.find((m) => m.id === fallback);
  if (fallbackMeta && isModelReady(fallbackMeta)) {
    return fallback;
  }

  const firstReady = models.find(isModelReady);
  return (firstReady?.id as ModelMode | undefined) ?? fallback;
}
