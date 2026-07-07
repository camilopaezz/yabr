import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

type ProgressPayload = {
  id: string;
  stage: string;
  pct: number;
};

type DonePayload = {
  id: string;
  output_path: string;
};

type ErrorPayload = {
  id: string;
  message: string;
};

function App() {
  const [runId, setRunId] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [outputPath, setOutputPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    const setup = async () => {
      const progressUnsub = await listen<ProgressPayload>(
        "inference:progress",
        (event) => {
          if (cancelled) return;
          if (event.payload.id === runId) {
            setStage(event.payload.stage);
            setPct(event.payload.pct);
          }
        },
      );
      const doneUnsub = await listen<DonePayload>("inference:done", (event) => {
        if (cancelled) return;
        if (event.payload.id === runId) {
          setOutputPath(event.payload.output_path);
          setBusy(false);
        }
      });
      const errorUnsub = await listen<ErrorPayload>(
        "inference:error",
        (event) => {
          if (cancelled) return;
          if (event.payload.id === runId) {
            setError(event.payload.message);
            setBusy(false);
          }
        },
      );
      unsubs.push(progressUnsub, doneUnsub, errorUnsub);
    };

    setup();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [runId]);

  const handleClick = async () => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "bmp"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;

    const id = crypto.randomUUID();
    const path = selected;
    const lastSep = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
    const dir = lastSep >= 0 ? path.slice(0, lastSep) : ".";
    const file = lastSep >= 0 ? path.slice(lastSep + 1) : path;
    const dot = file.lastIndexOf(".");
    const stem = dot >= 0 ? file.slice(0, dot) : file;
    const outputPath = `${dir}/${stem}-nobg.png`;

    setRunId(id);
    setStage(null);
    setPct(null);
    setOutputPath(null);
    setError(null);
    setBusy(true);

    try {
      await invoke("remove_image_background", {
        id,
        inputPath: path,
        outputPath,
        modelId: "u2netp",
      });
    } catch (err) {
      setError(String(err));
      setBusy(false);
    }
  };

  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>yabr</h1>
      <button onClick={handleClick} disabled={busy}>
        {busy ? "Processing…" : "Pick image & remove background"}
      </button>
      {stage !== null && pct !== null && (
        <p>
          {stage}: {pct}%
        </p>
      )}
      {outputPath && <p>Done: {outputPath}</p>}
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
    </main>
  );
}

export default App;
