import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";
import type {
  BenchmarkResult,
  GpuInfo,
  JobTimings,
  RuntimeInfo,
} from "../lib/tauri";
import type { ModelMode } from "../lib/models";

export type Theme = "system" | "light" | "dark";

export type SettingsState = {
  mode: ModelMode;
  outputDir: string | null;
  ep: string | null;
  theme: Theme;
  gpuInfo: GpuInfo | null;
  benchmarkResult: BenchmarkResult | null;
  runtimeInfo: RuntimeInfo | null;
  lastJobTimings: JobTimings | null;
};

export type SettingsActions = {
  setMode: (mode: ModelMode) => void;
  setOutputDir: (outputDir: string | null) => void;
  setEp: (ep: string | null) => void;
  setTheme: (theme: Theme) => void;
  setGpuInfo: (gpuInfo: GpuInfo | null) => void;
  setBenchmarkResult: (benchmarkResult: BenchmarkResult | null) => void;
  setRuntimeInfo: (runtimeInfo: RuntimeInfo | null) => void;
  setLastJobTimings: (lastJobTimings: JobTimings | null) => void;
};

export const settingsStore = createStore<SettingsState & SettingsActions>((set) => ({
  mode: "u2netp",
  outputDir: null,
  ep: null,
  theme: "system",
  gpuInfo: null,
  benchmarkResult: null,
  runtimeInfo: null,
  lastJobTimings: null,
  setMode: (mode) => set({ mode }),
  setOutputDir: (outputDir) => set({ outputDir }),
  setEp: (ep) => set({ ep }),
  setTheme: (theme) => set({ theme }),
  setGpuInfo: (gpuInfo) => set({ gpuInfo }),
  setBenchmarkResult: (benchmarkResult) => set({ benchmarkResult }),
  setRuntimeInfo: (runtimeInfo) => set({ runtimeInfo }),
  setLastJobTimings: (lastJobTimings) => set({ lastJobTimings }),
}));

export function useSettingsStore(): SettingsState & SettingsActions;
export function useSettingsStore<T>(
  selector: (state: SettingsState & SettingsActions) => T,
): T;
export function useSettingsStore<T>(
  selector?: (state: SettingsState & SettingsActions) => T,
): (SettingsState & SettingsActions) | T {
  return useStore(
    settingsStore,
    selector ?? ((state) => state as unknown as T),
  );
}
