import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type { ModelMeta, ModelMode } from "./models";

export type { ModelMeta, ModelMode };

export type RemoveBackgroundArgs = {
  id: string;
  inputPath: string;
  outputPath: string;
  modelId: string;
};

export type InferenceProgressPayload = {
  id: string;
  stage: string;
  pct: number;
};

export type InferenceDonePayload = {
  id: string;
  output_path: string;
};

export type InferenceErrorPayload = {
  id: string;
  message: string;
};

export const EVENT_PROGRESS = "inference:progress";
export const EVENT_DONE = "inference:done";
export const EVENT_ERROR = "inference:error";
export const EVENT_MODEL_DOWNLOAD = "model:download";

export type GpuInfo = {
  vendor: string;
  vram_bytes: number | null;
  available_eps: string[];
};

export type EpLatency = {
  ep: string;
  seconds: number;
};

export type BenchmarkResult = {
  ep_latencies: EpLatency[];
  winner_ep: string;
};

export type Config = {
  execution_provider: string | null;
  model_id: string | null;
  output_dir: string | null;
  platform: string | null;
};

export type ModelDownloadPayload = {
  model_id: string;
  pct: number;
};

export function invokeListModels(): Promise<ModelMeta[]> {
  return tauriInvoke("list_models");
}

export function invokeDownloadModel(model_id: string): Promise<void> {
  return tauriInvoke("download_model", { model_id });
}

export function listenModelDownload(
  handler: (payload: ModelDownloadPayload) => void,
): Promise<() => void> {
  return tauriListen<ModelDownloadPayload>(EVENT_MODEL_DOWNLOAD, (event) =>
    handler(event.payload),
  );
}

export function invokeDetectGpu(): Promise<GpuInfo> {
  return tauriInvoke("detect_gpu");
}

export function invokeRunBenchmark(): Promise<BenchmarkResult> {
  return tauriInvoke("run_benchmark");
}

export function invokeSetEp(ep: string): Promise<void> {
  return tauriInvoke("set_ep", { ep });
}

export function invokeGetConfig(): Promise<Config> {
  return tauriInvoke("get_config");
}

export function invokeSetConfig(config: Config): Promise<void> {
  return tauriInvoke("set_config", { config });
}

export function invokeRemoveImageBackground(args: RemoveBackgroundArgs): Promise<void> {
  return tauriInvoke("remove_image_background", args);
}

export function invokePickOutputDir(): Promise<string | null> {
  return tauriInvoke("pick_output_dir");
}

export function invokeCancelBatch(): Promise<void> {
  return tauriInvoke("cancel_batch");
}

export function listenInferenceProgress(
  handler: (payload: InferenceProgressPayload) => void,
): Promise<() => void> {
  return tauriListen<InferenceProgressPayload>(EVENT_PROGRESS, (event) => handler(event.payload));
}

export function listenInferenceDone(
  handler: (payload: InferenceDonePayload) => void,
): Promise<() => void> {
  return tauriListen<InferenceDonePayload>(EVENT_DONE, (event) => handler(event.payload));
}

export function listenInferenceError(
  handler: (payload: InferenceErrorPayload) => void,
): Promise<() => void> {
  return tauriListen<InferenceErrorPayload>(EVENT_ERROR, (event) => handler(event.payload));
}
