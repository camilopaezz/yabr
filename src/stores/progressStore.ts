import {
  listenInferenceDone,
  listenInferenceError,
  listenInferenceProgress,
  type InferenceDonePayload,
  type InferenceErrorPayload,
  type InferenceProgressPayload,
} from "../lib/tauri";
import { batchStore } from "./batchStore";

export async function initEventListeners(): Promise<() => void> {
  const unsubscribeProgress = await listenInferenceProgress(
    (payload: InferenceProgressPayload) => {
      batchStore.getState().updateItem(payload.id, {
        status: "processing",
        progress: payload.pct,
        stage: payload.stage,
      });
    },
  );

  const unsubscribeDone = await listenInferenceDone((payload: InferenceDonePayload) => {
    batchStore.getState().updateItem(payload.id, {
      status: "done",
      progress: 100,
      stage: null,
      outputPath: payload.output_path,
    });
  });

  const unsubscribeError = await listenInferenceError((payload: InferenceErrorPayload) => {
    const status = payload.message === "cancelled" ? "cancelled" : "error";
    batchStore.getState().updateItem(payload.id, {
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
