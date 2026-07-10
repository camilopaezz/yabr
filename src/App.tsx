import { useEffect, useState } from "react";
import { FileDropZone } from "./components/FileDropZone";
import { ModeSelector } from "./components/ModeSelector";
import { ImagePanel } from "./components/ImagePanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { initCurrentImageListeners } from "./lib/currentImage";
import { useImageStore } from "./stores/imageStore";
import { settingsStore } from "./stores/settingsStore";
import { invokeDetectGpu, invokeGetConfig, invokeRunBenchmark } from "./lib/tauri";
import "./App.css";

function App() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const [ready, setReady] = useState(false);
  const current = useImageStore((state) => state.current);

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

  return (
    <main
      style={{
        padding: 24,
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0 }}>yabr</h1>
        <button onClick={() => setSettingsVisible((prev) => !prev)}>
          {settingsVisible ? "Hide settings" : "Settings"}
        </button>
      </header>

      {firstRun && (
        <div
          style={{
            padding: 16,
            marginBottom: 24,
            borderRadius: 8,
            background: "rgba(128, 128, 128, 0.15)",
          }}
        >
          Detecting best acceleration…
        </div>
      )}

      {ready && !firstRun && (
        <>
          <SettingsPanel visible={settingsVisible} />

          <div style={{ marginBottom: 24 }}>
            <FileDropZone />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 24,
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <ModeSelector />
              <ImagePanel />
            </div>

            <div>
              <PreviewCanvas
                inputPath={current?.inputPath ?? null}
                outputPath={current?.outputPath ?? null}
              />
            </div>
          </div>
        </>
      )}
    </main>
  );
}

export default App;
