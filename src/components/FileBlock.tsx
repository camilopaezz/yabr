import { open } from "@tauri-apps/plugin-dialog";
import {
  acceptDrop,
  clearCurrent,
  isProcessBusy,
} from "../lib/currentImage";
import { useImageStore } from "../stores/imageStore";
import { useSettingsStore } from "../stores/settingsStore";

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

async function pickImagePath(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "bmp"],
      },
    ],
  });
  if (selected == null) return null;
  return Array.isArray(selected) ? (selected[0] ?? null) : selected;
}

export function FileBlock() {
  const current = useImageStore((state) => state.current);
  const mode = useSettingsStore((state) => state.mode);
  const outputDir = useSettingsStore((state) => state.outputDir);
  // Prefer domain busy gate for actions; UI disable covers processing status.
  // processGate during overwrite is enforced inside acceptDrop/clearCurrent.
  const busy = current?.status === "processing" || isProcessBusy();

  const handleSelect = async () => {
    if (isProcessBusy()) return;
    try {
      const path = await pickImagePath();
      if (!path) return;
      if (isProcessBusy()) return;
      acceptDrop([path], { mode, outputDir });
    } catch (err) {
      console.error("open image dialog failed", err);
    }
  };

  const handleRemove = () => {
    clearCurrent();
  };

  if (!current) {
    return (
      <div className="file-block">
        <div className="file-block-empty">No image</div>
        <div className="file-block-actions">
          <button type="button" className="btn-primary" onClick={() => void handleSelect()}>
            Select image
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="file-block">
      <div className="file-block-name" title={current.inputPath}>
        {fileName(current.inputPath)}
      </div>
      <div className="file-block-actions">
        <button type="button" onClick={() => void handleSelect()} disabled={busy}>
          Change
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={handleRemove}
          disabled={busy}
        >
          Remove
        </button>
      </div>
    </div>
  );
}
