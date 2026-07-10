import { useEffect, useRef } from "react";
import { useTauriFileDrop } from "../lib/useTauriFileDrop";
import { acceptDrop, syncOutputPath } from "../lib/currentImage";
import { useSettingsStore } from "../stores/settingsStore";

export function FileDropZone() {
  const { isDragging, paths } = useTauriFileDrop();
  const mode = useSettingsStore((state) => state.mode);
  const outputDir = useSettingsStore((state) => state.outputDir);
  const lastProcessedRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;

    acceptDrop(paths, { mode, outputDir });
  }, [paths, outputDir, mode]);

  useEffect(() => {
    syncOutputPath({ mode, outputDir });
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
