import { useEffect, useRef, useState } from "react";
import { useTauriFileDrop } from "../lib/useTauriFileDrop";
import { batchStore, useBatchStore } from "../stores/batchStore";
import { invokeRemoveImageBackground } from "../lib/tauri";
import { useSettingsStore } from "../stores/settingsStore";
import { deriveOutputPath } from "../lib/path";

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
  const queuedCount = useBatchStore((state) => state.items.filter((i) => i.status === "queued").length);
  const lastProcessedRef = useRef<string[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;

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
    }
  }, [paths, outputDir]);

  const handleProcessAll = async () => {
    if (isProcessing) return;
    console.log("[FileDropZone] process button clicked, isProcessing:", isProcessing);
    setIsProcessing(true);

    try {
      const items = batchStore.getState().items;
      console.log("[FileDropZone] all items:", items);
      const queued = items.filter((i) => i.status === "queued");
      console.log("[FileDropZone] queued items:", queued);

      for (const item of queued) {
        if (batchStore.getState().items.find((i) => i.id === item.id)?.status !== "queued") {
          console.log("[FileDropZone] skipping non-queued item:", item.id);
          continue;
        }

        console.log("[FileDropZone] processing item:", item.id, item.inputPath, "output:", item.outputPath, "model:", mode);

        console.log("[FileDropZone] invoking remove_image_background for:", item.id);
        await invokeRemoveImageBackground({
          id: item.id,
          inputPath: item.inputPath,
          outputPath: item.outputPath ?? "",
          modelId: mode,
        });
        console.log("[FileDropZone] invoke returned for:", item.id);
      }
    } catch (err) {
      console.error("[FileDropZone] process failed:", err);
    } finally {
      setIsProcessing(false);
    }
  };

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

      {queuedCount > 0 && (
        <button
          onClick={handleProcessAll}
          disabled={isProcessing}
          style={{ marginTop: 16 }}
        >
          Process {queuedCount} image{queuedCount !== 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}
