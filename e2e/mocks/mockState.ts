import { MODEL_REGISTRY, type ModelMeta } from "../../src/lib/models";

export type MockConfig = {
  config: {
    execution_provider: string | null;
    model_id: string | null;
    output_dir: string | null;
    platform: string | null;
  };
  gpuInfo: {
    vendor: string;
    vram_bytes: number | null;
    available_eps: string[];
  };
  benchmarkResult: {
    ep_latencies: { ep: string; seconds: number }[];
    winner_ep: string;
  };
  models: ModelMeta[];
};

export type MockState = {
  config: MockConfig;
  listeners: Record<string, Array<(event: { payload: unknown }) => void>>;
  calls: { cmd: string; args: unknown }[];
  fixtureBytes: Uint8Array;
};

/** Mock list_models payload: generated static registry + runtime downloaded flags. */
function defaultModels(): ModelMeta[] {
  return MODEL_REGISTRY.map((m) => ({
    ...m,
    downloaded: m.bundled,
  }));
}

function createDefaultConfig(): MockConfig {
  return {
    config: {
      execution_provider: "CPUExecutionProvider",
      model_id: "u2netp",
      output_dir: null,
      platform: "linux",
    },
    gpuInfo: {
      vendor: "NVIDIA",
      vram_bytes: 4_000_000_000,
      available_eps: ["CUDAExecutionProvider", "CPUExecutionProvider"],
    },
    benchmarkResult: {
      ep_latencies: [
        { ep: "CPUExecutionProvider", seconds: 0.5 },
        { ep: "CUDAExecutionProvider", seconds: 0.1 },
      ],
      winner_ep: "CPUExecutionProvider",
    },
    models: defaultModels(),
  };
}

export function getMockState(): MockState {
  if (typeof window === "undefined") {
    throw new Error("YABR mocks only run in a browser");
  }

  const w = window as unknown as { __YABR_MOCK__?: MockState };
  if (!w.__YABR_MOCK__) {
    w.__YABR_MOCK__ = {
      config: createDefaultConfig(),
      listeners: {},
      calls: [],
      fixtureBytes: new Uint8Array(),
    };
  }
  return w.__YABR_MOCK__;
}
