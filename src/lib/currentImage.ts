import { ask } from "@tauri-apps/plugin-dialog";
import { type ImageItem, imageStore } from "../stores/imageStore";
import { settingsStore } from "../stores/settingsStore";
import { shouldProceedWithOverwrite } from "./overwrite";
import { deriveOutputPath } from "./path";
import {
  type InferenceDonePayload,
  type InferenceErrorPayload,
  type InferenceProgressPayload,
  invokeCancelInference,
  invokePathExists,
  invokeRemoveImageBackground,
  listenInferenceDone,
  listenInferenceError,
  listenInferenceProgress,
} from "./tauri";

export type ProcessSettings = { mode: string; outputDir: string | null };

export type StartProcessDeps = {
  exists: (path: string) => Promise<boolean>;
  ask: (message: string) => Promise<boolean>;
  removeBackground: (job: {
    id: string;
    inputPath: string;
    outputPath: string;
    modelId: string;
  }) => Promise<void>;
  getSettings: () => ProcessSettings;
};

export type CancelDeps = {
  cancelInference: () => Promise<void>;
};

export type StartProcessResult =
  | "started"
  | "skipped"
  | "no-image"
  | "already-processing"
  | "failed";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

/** True while overwrite confirm / start handoff is in flight (before status is processing). */
let processGate = false;

/** Test-only: clear gate left open by aborted/timed-out startProcess. */
export function resetProcessGateForTests(): void {
  processGate = false;
}

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path));
}

/** Domain busy: backend processing or overwrite/start handoff in flight. */
export function isProcessBusy(): boolean {
  return processGate || imageStore.getState().current?.status === "processing";
}

export function acceptDrop(
  paths: string[],
  settings: ProcessSettings,
): boolean {
  const imagePaths = paths.filter(isImageFile);
  if (imagePaths.length === 0) return false;
  if (isProcessBusy()) return false;

  const inputPath = imagePaths[0];
  const item: ImageItem = {
    id: crypto.randomUUID(),
    inputPath,
    outputPath: deriveOutputPath(inputPath, settings.outputDir, settings.mode),
    status: "ready",
    progress: 0,
    stage: null,
    error: null,
  };
  imageStore.getState().set(item);
  return true;
}

export function syncOutputPath(settings: ProcessSettings): void {
  const current = imageStore.getState().current;
  if (!current || isProcessBusy()) return;
  const outputPath = deriveOutputPath(
    current.inputPath,
    settings.outputDir,
    settings.mode,
  );
  if (outputPath === current.outputPath) return;

  // If mode/output dir change after a successful run, the derived path is not
  // the last result file — drop "done" so compare / Show in folder do not lie.
  if (current.status === "done") {
    imageStore.getState().patch({
      outputPath,
      status: "ready",
      progress: 0,
      stage: null,
      error: null,
    });
    return;
  }

  imageStore.getState().patch({ outputPath });
}

export async function startProcess(
  deps: StartProcessDeps,
): Promise<StartProcessResult> {
  const current = imageStore.getState().current;
  if (!current) return "no-image";
  if (isProcessBusy()) return "already-processing";

  processGate = true;
  const startedId = current.id;
  const inputPath = current.inputPath;

  try {
    const settings = deps.getSettings();
    const outputPath = deriveOutputPath(
      inputPath,
      settings.outputDir,
      settings.mode,
    );

    const proceed = await shouldProceedWithOverwrite(
      outputPath,
      deps.exists,
      deps.ask,
    );
    if (!proceed) return "skipped";

    // Re-validate after await: drop/clear/second start must not drive a stale job.
    const latest = imageStore.getState().current;
    if (!latest || latest.id !== startedId) return "skipped";
    if (latest.status === "processing") return "already-processing";

    const finalOutputPath = deriveOutputPath(
      latest.inputPath,
      settings.outputDir,
      settings.mode,
    );

    imageStore.getState().patch({
      status: "processing",
      progress: 0,
      stage: "starting",
      error: null,
      outputPath: finalOutputPath,
    });

    try {
      await deps.removeBackground({
        id: latest.id,
        inputPath: latest.inputPath,
        outputPath: finalOutputPath,
        modelId: settings.mode,
      });
      return "started";
    } catch {
      const still = imageStore.getState().current;
      if (still?.id === startedId && still.status === "processing") {
        imageStore.getState().patch({
          status: "error",
          stage: null,
          error: "command failed",
        });
      }
      return "failed";
    }
  } finally {
    processGate = false;
  }
}

export function cancelProcess(deps: CancelDeps): void {
  deps.cancelInference().catch(() => {});
}

/** Returns false if clear was rejected because a process is busy. */
export function clearCurrent(): boolean {
  if (isProcessBusy()) return false;
  imageStore.getState().clear();
  return true;
}

export function applyProgress(payload: {
  id: string;
  stage: string;
  pct: number;
}): void {
  const current = imageStore.getState().current;
  if (!current || current.id !== payload.id) return;
  // Do not resurrect done/error/ready via late progress events.
  if (current.status !== "processing") return;
  imageStore.getState().patch({
    status: "processing",
    progress: payload.pct,
    stage: payload.stage,
  });
}

export function applyDone(payload: InferenceDonePayload): void {
  const current = imageStore.getState().current;
  if (!current || current.id !== payload.id) return;
  imageStore.getState().patch({
    status: "done",
    progress: 100,
    stage: null,
    outputPath: payload.output_path,
  });
}

export function applyError(payload: { id: string; message: string }): void {
  const current = imageStore.getState().current;
  if (!current || current.id !== payload.id) return;
  const status = payload.message === "cancelled" ? "cancelled" : "error";
  imageStore.getState().patch({
    status,
    stage: null,
    error: status === "error" ? payload.message : null,
  });
}

export async function initCurrentImageListeners(): Promise<() => void> {
  const unsubscribeProgress = await listenInferenceProgress(
    (payload: InferenceProgressPayload) => {
      applyProgress(payload);
    },
  );

  const unsubscribeDone = await listenInferenceDone(
    (payload: InferenceDonePayload) => {
      applyDone(payload);
      // Always record last successful job timings for Settings debug meta.
      settingsStore.getState().setLastJobTimings(payload.timings);
    },
  );

  const unsubscribeError = await listenInferenceError(
    (payload: InferenceErrorPayload) => {
      applyError(payload);
    },
  );

  return () => {
    unsubscribeProgress();
    unsubscribeDone();
    unsubscribeError();
  };
}

/** Alias for App bootstrap; prefer initCurrentImageListeners. */
export const initEventListeners = initCurrentImageListeners;

export function prodStartProcessDeps(): StartProcessDeps {
  return {
    // Native command — not plugin-fs — so arbitrary user paths work on Windows.
    exists: (p) => invokePathExists(p),
    ask: (msg) => ask(msg),
    removeBackground: invokeRemoveImageBackground,
    getSettings: () => {
      const s = settingsStore.getState();
      return { mode: s.mode, outputDir: s.outputDir };
    },
  };
}

export function prodCancelDeps(): CancelDeps {
  return {
    cancelInference: invokeCancelInference,
  };
}
