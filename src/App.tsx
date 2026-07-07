import { useEffect, useState } from "react";
import { FileDropZone } from "./components/FileDropZone";
import { ModeSelector } from "./components/ModeSelector";
import { BatchList } from "./components/BatchList";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { initEventListeners } from "./stores/progressStore";
import { useBatchStore } from "./stores/batchStore";
import "./App.css";

function App() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const items = useBatchStore((state) => state.items);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    initEventListeners().then((unsub) => {
      unsubscribe = unsub;
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  const selectedItem = items.find((item) => item.id === selectedId) ?? items[items.length - 1];

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
          <BatchList selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div>
          <PreviewCanvas
            inputPath={selectedItem?.inputPath ?? null}
            outputPath={selectedItem?.outputPath ?? null}
          />
        </div>
      </div>
    </main>
  );
}

export default App;
