import { useEffect, useRef } from "react";
import { useTauriFileDrop } from "../lib/useTauriFileDrop";
import { imageStore } from "../stores/imageStore";
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
  const lastProcessedRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;

    const imagePaths = paths.filter(isImageFile);
    if (imagePaths.length === 0) return;
    if (imageStore.getState().current?.status === "processing") return;

    const inputPath = imagePaths[0];
    const id = crypto.randomUUID();
    const outputPath = deriveOutputPath(inputPath, outputDir, mode);

    imageStore.getState().set({
      id,
      inputPath,
      outputPath,
      status: "ready",
      progress: 0,
      stage: null,
      error: null,
    });
  }, [paths, outputDir, mode]);

  useEffect(() => {
    const current = imageStore.getState().current;
    if (!current || current.status === "processing") return;
    const outputPath = deriveOutputPath(current.inputPath, outputDir, mode);
    if (outputPath !== current.outputPath) {
      imageStore.getState().patch({ outputPath });
    }
  }, [mode, outputDir]);

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
        {isDragging ? "Drop image here" : "Drag & drop an image here"}
      </p>
      <p style={{ margin: "8px 0 0", fontSize: "0.85rem", opacity: 0.7 }}>
        PNG, JPG, JPEG, WEBP, BMP
      </p>
    </div>
  );
}
