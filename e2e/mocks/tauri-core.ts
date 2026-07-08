import { getMockState } from "./mockState";

export function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const state = getMockState();
  state.calls.push({ cmd, args: args ?? {} });

  switch (cmd) {
    case "get_config":
      return Promise.resolve(state.config.config as T);
    case "set_config":
      return Promise.resolve(undefined as T);
    case "detect_gpu":
      return Promise.resolve(state.config.gpuInfo as T);
    case "run_benchmark":
      return Promise.resolve(state.config.benchmarkResult as T);
    case "set_ep":
      return Promise.resolve(undefined as T);
    case "list_models":
      return Promise.resolve(state.config.models as T);
    case "download_model":
      return simulateDownload(args?.model_id as string) as Promise<T>;
    case "pick_output_dir":
      return Promise.resolve(state.config.config.output_dir as T);
    case "remove_image_background": {
      const inner = (args as Record<string, unknown>).args as { id: string; outputPath: string };
      return simulateInference(inner) as Promise<T>;
    }
    case "cancel_batch":
      return Promise.resolve(undefined as T);
    default:
      return Promise.reject(new Error(`Unhandled mock command: ${cmd}`));
  }
}

function simulateInference(args: { id: string; outputPath: string }): Promise<void> {
  const state = getMockState();
  const { id, outputPath } = args;

  return new Promise((resolve) => {
    const emit = (event: string, payload: unknown) => {
      (state.listeners[event] ?? []).forEach((handler) => handler({ payload }));
    };

    setTimeout(() => {
      emit("inference:progress", { id, stage: "preprocessing", pct: 0 });
    }, 50);

    setTimeout(() => {
      emit("inference:progress", { id, stage: "inferring", pct: 50 });
    }, 150);

    setTimeout(() => {
      emit("inference:progress", { id, stage: "encoding", pct: 100 });
      emit("inference:done", { id, output_path: outputPath });
      resolve();
    }, 250);
  });
}

function simulateDownload(modelId: string): Promise<void> {
  const state = getMockState();
  return new Promise((resolve) => {
    const emit = (event: string, payload: unknown) => {
      (state.listeners[event] ?? []).forEach((handler) => handler({ payload }));
    };

    setTimeout(() => emit("model:download", { model_id: modelId, pct: 50 }), 50);
    setTimeout(() => {
      emit("model:download", { model_id: modelId, pct: 100 });
      resolve();
    }, 100);
  });
}

export function listen<T>(
  eventName: string,
  handler: (event: { payload: T }) => void,
): Promise<() => void> {
  const state = getMockState();
  if (!state.listeners[eventName]) {
    state.listeners[eventName] = [];
  }
  const wrapped = (event: { payload: unknown }) => handler(event as { payload: T });
  state.listeners[eventName].push(wrapped);
  return Promise.resolve(() => {
    const idx = state.listeners[eventName].indexOf(wrapped);
    if (idx >= 0) {
      state.listeners[eventName].splice(idx, 1);
    }
  });
}

export function convertFileSrc(filePath: string, protocol?: string): string {
  return `file://${filePath}`;
}
