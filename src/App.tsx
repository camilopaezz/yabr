import { useEffect, useRef, useState } from "react";
import { FileBlock } from "./components/FileBlock";
import { ModeSelector } from "./components/ModeSelector";
import { ImagePanel } from "./components/ImagePanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import { acceptDrop, initCurrentImageListeners, syncOutputPath } from "./lib/currentImage";
import { useTauriFileDrop } from "./lib/useTauriFileDrop";
import { useImageStore } from "./stores/imageStore";
import { settingsStore, useSettingsStore } from "./stores/settingsStore";
import { invokeDetectGpu, invokeGetConfig, invokeRunBenchmark } from "./lib/tauri";
import "./App.css";

function App() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const current = useImageStore((state) => state.current);
  const ep = useSettingsStore((state) => state.ep);
  const mode = useSettingsStore((state) => state.mode);
  const outputDir = useSettingsStore((state) => state.outputDir);
  const { isDragging, paths } = useTauriFileDrop();
  const lastProcessedRef = useRef<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    initCurrentImageListeners().then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

    const initialize = async () => {
      try {
        const config = await invokeGetConfig();
        settingsStore.setState({
          ep: config.execution_provider,
          outputDir: config.output_dir,
        });
        if (!config.execution_provider) {
          setFirstRun(true);
          const gpuInfo = await invokeDetectGpu();
          settingsStore.setState({ gpuInfo });
          const benchmark = await invokeRunBenchmark();
          settingsStore.setState({ benchmarkResult: benchmark });
          const updated = await invokeGetConfig();
          settingsStore.setState({ ep: updated.execution_provider });
        }
      } catch (err) {
        console.error("first-run initialization failed", err);
        settingsStore.setState({ ep: "cpu" });
      } finally {
        setFirstRun(false);
        setReady(true);
      }
    };

    initialize();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Window-level drop acceptance (highlight is preview-only via isDragging).
  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;
    acceptDrop(paths, { mode, outputDir });
  }, [paths, outputDir, mode]);

  useEffect(() => {
    syncOutputPath({ mode, outputDir });
  }, [mode, outputDir]);

  useEffect(() => {
    if (!settingsVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsVisible(false);
    };
    window.addEventListener("keydown", onKey);
    // Focus close control when the modal opens; restore Settings button on close.
    settingsCloseRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      settingsButtonRef.current?.focus();
    };
  }, [settingsVisible]);

  // Frameless window: always mount TitleBar so drag/close work during first-run
  // and cold-start. Blocker overlays content only (CSS leaves titlebar free).
  const canCompare =
    current?.status === "done" && Boolean(current.inputPath && current.outputPath);

  return (
    <div className="app-shell">
      <TitleBar
        ep={ep}
        settingsButtonRef={settingsButtonRef}
        onOpenSettings={() => setSettingsVisible(true)}
      />

      {/* U14: first-run acceleration detector only — not a generic cold-start splash. */}
      {firstRun && (
        <div className="fullscreen-blocker" role="status">
          Detecting best acceleration…
        </div>
      )}

      {!ready && !firstRun && (
        <div className="fullscreen-blocker" role="status" aria-busy="true" />
      )}

      {ready && (
        <>
          <aside className="app-rail">
            {/* Scrollable controls; footer stays pinned so Process/Cancel survive short tiles. */}
            <div className="app-rail-scroll">
              <div className="app-rail-section">
                <FileBlock />
              </div>

              <div className="app-rail-section">
                <ModeSelector />
              </div>
            </div>

            <div className="app-rail-footer">
              <ImagePanel />
            </div>
          </aside>

          <section className="app-preview" aria-label="Preview">
            <PreviewCanvas
              inputPath={current?.inputPath ?? null}
              outputPath={current?.outputPath ?? null}
              canCompare={canCompare}
              isDragging={isDragging}
            />
          </section>

          {settingsVisible && (
            <div
              className="modal-backdrop"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSettingsVisible(false);
              }}
            >
              <div
                className="modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
              >
                <div className="modal-header">
                  <h2 id="settings-title">Settings</h2>
                  <button
                    ref={settingsCloseRef}
                    type="button"
                    className="modal-close"
                    aria-label="Close settings"
                    onClick={() => setSettingsVisible(false)}
                  >
                    ✕
                  </button>
                </div>
                <SettingsPanel visible={settingsVisible} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
