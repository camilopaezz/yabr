import { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  invokeDetectGpu,
  invokeGetConfig,
  invokePickOutputDir,
  invokeRunBenchmark,
  invokeSetEp,
} from "../lib/tauri";
import { epLabel } from "../lib/epLabel";

export type SettingsPanelProps = {
  visible: boolean;
};

function formatVram(bytes: number): string {
  const gib = bytes / (1024 ** 3);
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / (1024 ** 2);
  return `${mib.toFixed(0)} MiB`;
}

export function SettingsPanel({ visible }: SettingsPanelProps) {
  const {
    ep,
    outputDir,
    gpuInfo,
    benchmarkResult,
    setEp: setEpInStore,
    setOutputDir,
    setGpuInfo,
    setBenchmarkResult,
  } = useSettingsStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    invokeDetectGpu()
      .then((info) => setGpuInfo(info))
      .catch(() => {});
  }, [visible, setGpuInfo]);

  const handleEpChange = async (value: string) => {
    try {
      await invokeSetEp(value);
      setEpInStore(value);
    } catch (err) {
      console.error("set_ep failed", err);
    }
  };

  const handlePickOutputDir = async () => {
    try {
      const picked = await invokePickOutputDir();
      if (picked) {
        setOutputDir(picked);
      }
    } catch (err) {
      console.error("pick_output_dir failed", err);
    }
  };

  const handleBenchmark = async () => {
    setLoading(true);
    try {
      const result = await invokeRunBenchmark();
      setBenchmarkResult(result);
      const config = await invokeGetConfig();
      setEpInStore(config.execution_provider);
    } catch (err) {
      console.error("benchmark failed", err);
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="settings-panel">
      <div className="settings-field">
        <label htmlFor="settings-ep">Execution provider</label>
        <select
          id="settings-ep"
          className="settings-select"
          value={ep ?? ""}
          onChange={(e) => void handleEpChange(e.target.value)}
        >
          <option value="" disabled>
            Choose EP
          </option>
          {gpuInfo?.available_eps.map((epOption) => (
            <option key={epOption} value={epOption}>
              {epLabel(epOption)}
            </option>
          ))}
        </select>
      </div>

      <div className="settings-field">
        <label>Output directory</label>
        <button
          type="button"
          onClick={() => void handlePickOutputDir()}
          title={outputDir ?? "Same as input (default)"}
          style={{
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {outputDir ?? "Choose output directory"}
        </button>
        {!outputDir && (
          <div className="settings-hint">Same as input (default)</div>
        )}
      </div>

      <div className="settings-field">
        <button type="button" onClick={() => void handleBenchmark()} disabled={loading}>
          {loading ? "Benchmarking…" : "Re-run benchmark"}
        </button>
      </div>

      {gpuInfo && (
        <div className="settings-meta">
          <div>GPU: {gpuInfo.vendor}</div>
          <div>
            VRAM:{" "}
            {gpuInfo.vram_bytes != null
              ? formatVram(gpuInfo.vram_bytes)
              : "Unknown"}
          </div>
        </div>
      )}

      {benchmarkResult && (
        <div className="settings-meta">
          <div>Winner: {epLabel(benchmarkResult.winner_ep)}</div>
          {benchmarkResult.ep_latencies.map((latency) => (
            <div key={latency.ep}>
              {epLabel(latency.ep)}: {latency.seconds.toFixed(3)}s
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
