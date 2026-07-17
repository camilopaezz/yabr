import { getMockState } from "./mockState";

/** In-flight inference promise — cancel waits on this (mirrors wait_until_idle). */
let activeInference: Promise<void> | null = null;

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
    case "set_ep": {
      const ep = args?.ep;
      if (typeof ep === "string") {
        state.config.config.execution_provider = ep.toLowerCase();
      }
      return Promise.resolve(undefined as T);
    }
    case "list_models":
      return Promise.resolve(state.config.models as T);
    case "download_model":
      return simulateDownload(args?.model_id as string) as Promise<T>;
    case "cancel_download":
      return Promise.resolve(undefined as T);
    case "pick_output_dir":
      return Promise.resolve(state.config.config.output_dir as T);
    case "remove_image_background": {
      const inner = (args as Record<string, unknown>).args as {
        id: string;
        outputPath: string;
      };
      return simulateInference(inner) as Promise<T>;
    }
    case "cancel_inference":
      // Match production: resolve only after the in-flight worker finishes.
      return (activeInference ?? Promise.resolve()) as Promise<T>;
    case "path_exists":
      return Promise.resolve(false as T);
    case "get_runtime_info":
      return Promise.resolve({
        app_version: "0.1.0",
        ort_version: "1.24",
      } as T);
    default:
      return Promise.reject(new Error(`Unhandled mock command: ${cmd}`));
  }
}

function simulateInference(args: {
  id: string;
  outputPath: string;
}): Promise<void> {
  const state = getMockState();
  const { id, outputPath } = args;

  const promise = new Promise<void>((resolve) => {
    const emit = (event: string, payload: unknown) => {
      for (const handler of state.listeners[event] ?? []) {
        handler({ payload });
      }
    };

    setTimeout(() => {
      emit("inference:progress", { id, stage: "preprocessing", pct: 0 });
    }, 50);

    setTimeout(() => {
      emit("inference:progress", { id, stage: "inferring", pct: 50 });
    }, 150);

    setTimeout(() => {
      emit("inference:progress", { id, stage: "encoding", pct: 100 });
      emit("inference:done", {
        id,
        output_path: outputPath,
        timings: {
          stages: [
            { stage: "decoding", seconds: 0.01 },
            { stage: "preprocessing", seconds: 0.02 },
            { stage: "inferring", seconds: 0.15 },
            { stage: "postprocessing", seconds: 0.03 },
            { stage: "encoding", seconds: 0.02 },
          ],
          total_seconds: 0.23,
        },
      });
      resolve();
    }, 250);
  }).finally(() => {
    if (activeInference === promise) {
      activeInference = null;
    }
  });

  activeInference = promise;
  return promise;
}

function simulateDownload(modelId: string): Promise<void> {
  const state = getMockState();
  return new Promise((resolve) => {
    const emit = (event: string, payload: unknown) => {
      for (const handler of state.listeners[event] ?? []) {
        handler({ payload });
      }
    };

    setTimeout(
      () =>
        emit("model:download", {
          model_id: modelId,
          pct: 50,
          stage: "download",
        }),
      50,
    );
    setTimeout(() => {
      emit("model:download", {
        model_id: modelId,
        pct: 100,
        stage: "verify",
      });
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
  const wrapped = (event: { payload: unknown }) =>
    handler(event as { payload: T });
  state.listeners[eventName].push(wrapped);
  return Promise.resolve(() => {
    const idx = state.listeners[eventName].indexOf(wrapped);
    if (idx >= 0) {
      state.listeners[eventName].splice(idx, 1);
    }
  });
}

const blobUrlCache = new Map<string, string>();

export function convertFileSrc(filePath: string, _protocol?: string): string {
  const state = getMockState();
  if (
    state.fixtureBytes.length > 0 &&
    /\.(png|jpe?g|webp|bmp)$/i.test(filePath)
  ) {
    let cached = blobUrlCache.get(filePath);
    if (!cached) {
      const blob = new Blob([state.fixtureBytes], { type: "image/png" });
      cached = URL.createObjectURL(blob);
      blobUrlCache.set(filePath, cached);
    }
    return cached;
  }
  return `file://${filePath}`;
}
