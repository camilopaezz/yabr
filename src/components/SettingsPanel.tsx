import { useEffect, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  invokeDetectGpu,
  invokeGetConfig,
  invokePickOutputDir,
  invokeRunBenchmark,
  invokeSetEp,
} from "../lib/tauri";

export type SettingsPanelProps = {
  visible: boolean;
};

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
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        border: "1px solid rgba(128, 128, 128, 0.3)",
      }}
    >
      <h3 style={{ margin: "0 0 12px" }}>Settings</h3>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4 }}>Execution provider</label>
        <select value={ep ?? ""} onChange={(e) => handleEpChange(e.target.value)}>
          <option value="" disabled>
            Choose EP
          </option>
          {gpuInfo?.available_eps.map((epOption) => (
            <option key={epOption} value={epOption}>
              {epOption}
            </option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", marginBottom: 4 }}>Output directory</label>
        <button
          onClick={handlePickOutputDir}
          style={{
            width: "100%",
            textAlign: "left",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={outputDir ?? "Same as input (default)"}
        >
          {outputDir ?? "Choose output directory"}
        </button>
        {!outputDir && (
          <div style={{ fontSize: "0.8rem", opacity: 0.6, marginTop: 4 }}>
            Same as input (default)
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={handleBenchmark} disabled={loading}>
          {loading ? "Benchmarking…" : "Re-run benchmark"}
        </button>
      </div>

      {gpuInfo && (
        <div style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          <div>GPU: {gpuInfo.vendor}</div>
          <div>VRAM: {gpuInfo.vram_bytes ? `${gpuInfo.vram_bytes} bytes` : "Unknown"}</div>
        </div>
      )}

      {benchmarkResult && (
        <div style={{ fontSize: "0.9rem", opacity: 0.8, marginTop: 8 }}>
          <div>Winner: {benchmarkResult.winner_ep}</div>
          {benchmarkResult.ep_latencies.map((latency) => (
            <div key={latency.ep}>
              {latency.ep}: {latency.seconds.toFixed(3)}s
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
