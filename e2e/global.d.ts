interface Window {
  __SWIFTMASK_MOCK__?: {
    config: {
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
        optimization: string;
      };
      benchmarkResult: {
        ep_latencies: { ep: string; seconds: number }[];
        winner_ep: string;
      };
      models: unknown[];
    };
    listeners: Record<string, Array<(event: { payload: unknown }) => void>>;
    calls: { cmd: string; args: unknown }[];
    fixtureBytes: Uint8Array;
  };
  __swiftmaskInjectDrop?: (paths: string[]) => void;
}
