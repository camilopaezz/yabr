import { exists } from "@tauri-apps/plugin-fs";
import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef } from "react";
import { useTauriFileDrop } from "../lib/useTauriFileDrop";
import { batchStore } from "../stores/batchStore";
import { invokeRemoveImageBackground } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { deriveOutputPath } from "../lib/path";
import { shouldProceedWithOverwrite } from "../lib/overwrite";

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "bmp"]);

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot + 1).toLowerCase() : "";
}

function isImageFile(path: string): boolean {
  return IMAGE_EXTENSIONS.has(getExtension(path));
}

export function FileDropZone() {
  const { isDragging, paths } = useTauriFileDrop();
  const mode = useSettingsStore((state) => state.mode);
  const outputDir = useSettingsStore((state) => state.outputDir);
  const lastProcessedRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;

    const process = async () => {
      const imagePaths = paths.filter(isImageFile);

      for (const inputPath of imagePaths) {
        const id = crypto.randomUUID();
        const outputPath = deriveOutputPath(inputPath, outputDir);

        batchStore.getState().addItem({
          id,
          inputPath,
          outputPath,
          status: "queued",
          progress: 0,
          stage: null,
          error: null,
        });

        const shouldProceed = await shouldProceedWithOverwrite(outputPath, exists, ask);
        if (!shouldProceed) {
          batchStore.getState().updateItem(id, {
            status: "cancelled",
            stage: null,
          });
          continue;
        }

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
      }
    };

    process();
  }, [paths, mode, outputDir]);

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
