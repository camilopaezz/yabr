import { useEffect, useRef } from "react";
import { useTauriFileDrop } from "../lib/useTauriFileDrop";
import { batchStore } from "../stores/batchStore";
import { invokeRemoveImageBackground } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path));
}

function deriveOutputPath(inputPath: string): string {
  const lastSep = Math.max(inputPath.lastIndexOf("/"), inputPath.lastIndexOf("\\"));
  const dir = lastSep >= 0 ? inputPath.slice(0, lastSep) : ".";
  const file = lastSep >= 0 ? inputPath.slice(lastSep + 1) : inputPath;
  const dot = file.lastIndexOf(".");
  const stem = dot >= 0 ? file.slice(0, dot) : file;
  return `${dir}/${stem}-nobg.png`;
}

export function FileDropZone() {
  const { isDragging, paths } = useTauriFileDrop();
  const mode = useSettingsStore((state) => state.mode);
  const lastProcessedRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;

    const imagePaths = paths.filter(isImageFile);

    imagePaths.forEach((inputPath) => {
      const id = crypto.randomUUID();
      const outputPath = deriveOutputPath(inputPath);

      batchStore.getState().addItem({
        id,
        inputPath,
        outputPath,
        status: "queued",
        progress: 0,
        stage: null,
        error: null,
      });

      batchStore.getState().updateItem(id, { status: "processing" });

      invokeRemoveImageBackground({
        id,
        inputPath,
        outputPath,
        modelId: mode,
      }).catch((err: unknown) => {
        batchStore.getState().updateItem(id, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
  }, [paths, mode]);

  return (
    <div
      style={{
        border: `2px dashed ${isDragging ? "#396cd8" : "#ccc"}`,
        borderRadius: 12,
        padding: "48px 24px",
        textAlign: "center",
        backgroundColor: isDragging ? "rgba(57, 108, 216, 0.08)" : "transparent",
        transition: "all 0.2s ease",
      }}
    >
      <p style={{ margin: 0, fontSize: "1.1rem" }}>
        {isDragging ? "Drop images here" : "Drag & drop images here"}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", opacity: 0.7 }}>
        PNG, JPG, JPEG, WEBP, BMP
      </p>
    </div>
  );
}
