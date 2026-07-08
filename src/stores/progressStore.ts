import {
  listenInferenceDone,
  listenInferenceError,
  listenInferenceProgress,
  type InferenceDonePayload,
  type InferenceErrorPayload,
  type InferenceProgressPayload,
} from "../lib/tauri";
import { imageStore } from "./imageStore";

export async function initEventListeners(): Promise<() => void> {
  const unsubscribeProgress = await listenInferenceProgress(
    (payload: InferenceProgressPayload) => {
      const current = imageStore.getState().current;
      if (!current || current.id !== payload.id) return;
      imageStore.getState().patch({
        status: "processing",
        progress: payload.pct,
        stage: payload.stage,
      });
    },
  );

  const unsubscribeDone = await listenInferenceDone((payload: InferenceDonePayload) => {
    const current = imageStore.getState().current;
    if (!current || current.id !== payload.id) return;
    imageStore.getState().patch({
      status: "done",
      progress: 100,
      stage: null,
      outputPath: payload.output_path,
    });
  });

  const unsubscribeError = await listenInferenceError((payload: InferenceErrorPayload) => {
    const current = imageStore.getState().current;
    if (!current || current.id !== payload.id) return;
    const status = payload.message === "cancelled" ? "cancelled" : "error";
    imageStore.getState().patch({
      status,
      stage: null,
      error: status === "error" ? payload.message : null,
    });
  });

  return () => {
    unsubscribeProgress();
    unsubscribeDone();
    unsubscribeError();
  };
}
