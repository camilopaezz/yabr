/** Minimal mock of @tauri-apps/api/window for Playwright e2e. */

type Unlisten = () => void;

export function getCurrentWindow() {
  return {
    startDragging: async () => {},
    minimize: async () => {},
    toggleMaximize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    close: async () => {},
    isMaximized: async () => false,
    onResized:
      async (_handler: () => void): Promise<Unlisten> =>
      () => {},
  };
}
