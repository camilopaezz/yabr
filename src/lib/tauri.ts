import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";

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

export function invokeRemoveImageBackground(args: RemoveBackgroundArgs): Promise<void> {
  return tauriInvoke("remove_image_background", args);
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
