import { useEffect, useState } from "react";
import { epLabel } from "../lib/epLabel";
import { showAppErrorNotice } from "../lib/showAppErrorNotice";
import {
  invokeDetectGpu,
  invokeGetConfig,
  invokeGetRuntimeInfo,
  invokePickOutputDir,
  invokeRunBenchmark,
  invokeSetEp,
} from "../lib/tauri";
import { isTheme } from "../lib/theme";
import { useSettingsStore } from "../stores/settingsStore";

export type SettingsPanelProps = {
  visible: boolean;
};

function formatVram(bytes: number): string {
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GiB`;
  const mib = bytes / 1024 ** 2;
  return `${mib.toFixed(0)} MiB`;
}

function formatSeconds(seconds: number): string {
  if (seconds < 0.001) return "<1ms";
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(3)}s`;
}

export function SettingsPanel({ visible }: SettingsPanelProps) {
  const {
    ep,
    outputDir,
    theme,
    gpuInfo,
    runtimeInfo,
    lastJobTimings,
    setEp: setEpInStore,
    setOutputDir,
    setTheme,
    setGpuInfo,
    setRuntimeInfo,
  } = useSettingsStore();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    invokeDetectGpu()
      .then((info) => setGpuInfo(info))
      .catch((err: unknown) => {
        console.error("detect_gpu failed", err);
        showAppErrorNotice(err);
      });
    invokeGetRuntimeInfo()
      .then((info) => setRuntimeInfo(info))
      .catch((err: unknown) => {
        console.error("get_runtime_info failed", err);
        showAppErrorNotice(err);
      });
  }, [visible, setGpuInfo, setRuntimeInfo]);

  const handleEpChange = async (value: string) => {
    try {
      await invokeSetEp(value);
      setEpInStore(value);
    } catch (err) {
      console.error("set_ep failed", err);
      showAppErrorNotice(err);
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
      showAppErrorNotice(err);
    }
  };

  const handleBenchmark = async () => {
    setLoading(true);
    try {
      await invokeRunBenchmark();
      const config = await invokeGetConfig();
      setEpInStore(config.execution_provider);
    } catch (err) {
      console.error("benchmark failed", err);
      showAppErrorNotice(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="settings-panel" aria-hidden={!visible} inert={!visible}>
      <div className="settings-field">
        <label htmlFor="settings-theme">Theme</label>
        <select
          id="settings-theme"
          className="settings-select"
          value={theme}
          onChange={(e) => {
            const value = e.target.value;
            if (isTheme(value)) setTheme(value);
          }}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
        <div className="settings-hint">Override the system appearance</div>
      </div>

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
        <label htmlFor="settings-output-dir">Output directory</label>
        <button
          id="settings-output-dir"
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
        <button
          type="button"
          onClick={() => void handleBenchmark()}
          disabled={loading}
        >
          {loading ? "Benchmarking…" : "Re-run benchmark"}
        </button>
      </div>

      {(gpuInfo || runtimeInfo) && (
        <div className="settings-meta">
          {gpuInfo && (
            <>
              <div>GPU: {gpuInfo.vendor}</div>
              <div>
                VRAM:{" "}
                {gpuInfo.vram_bytes != null
                  ? formatVram(gpuInfo.vram_bytes)
                  : "Unknown"}
              </div>
              <div>
                EPs:{" "}
                {gpuInfo.available_eps
                  .map((epOption) => epLabel(epOption))
                  .join(", ")}
              </div>
              <div>Opt: {gpuInfo.optimization}</div>
            </>
          )}
          {runtimeInfo && (
            <div>
              App: {runtimeInfo.app_version} · ORT: {runtimeInfo.ort_version}
            </div>
          )}
        </div>
      )}

      {lastJobTimings && lastJobTimings.stages.length > 0 && (
        <div className="settings-meta">
          <div>Last job</div>
          {lastJobTimings.stages.map((timing) => (
            <div key={timing.stage}>
              {timing.stage}: {formatSeconds(timing.seconds)}
            </div>
          ))}
          <div>total: {formatSeconds(lastJobTimings.total_seconds)}</div>
        </div>
      )}
    </div>
  );
}
