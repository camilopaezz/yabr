import { imageStore, useImageStore, type ImageItem } from "../stores/imageStore";
import { useSettingsStore } from "../stores/settingsStore";
import { ProgressBar } from "./ProgressBar";
import { invokeCancelInference, invokeRemoveImageBackground } from "../lib/tauri";

function statusLabel(item: ImageItem): string {
  switch (item.status) {
    case "ready":
      return "Ready";
    case "processing":
      return item.stage ?? "Processing";
    case "done":
      return "Done";
    case "error":
      return "Error";
    case "cancelled":
      return "Cancelled";
    default:
      return item.status;
  }
}

export function ImagePanel() {
  const current = useImageStore((state) => state.current);
  const clear = useImageStore((state) => state.clear);
  const mode = useSettingsStore((state) => state.mode);

  if (!current) {
    return (
      <p style={{ textAlign: "center", opacity: 0.6 }}>
        No image yet. Drop one above to get started.
      </p>
    );
  }

  const isProcessing = current.status === "processing";

  const handleProcess = async () => {
    if (isProcessing) return;
    imageStore.getState().patch({ status: "processing", progress: 0, stage: "starting", error: null });
    try {
      await invokeRemoveImageBackground({
        id: current.id,
        inputPath: current.inputPath,
        outputPath: current.outputPath ?? "",
        modelId: mode,
      });
    } catch (err) {
      console.error("[ImagePanel] process failed:", err);
      if (imageStore.getState().current?.status === "processing") {
        imageStore.getState().patch({ status: "error", stage: null, error: "command failed" });
      }
    }
  };

  const handleCancel = () => {
    invokeCancelInference().catch(() => {});
  };

  return (
    <div
      style={{
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(128, 128, 128, 0.3)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            fontSize: "0.9rem",
          }}
          title={current.inputPath}
        >
          {current.inputPath.split(/[\\/]/).pop() ?? current.inputPath}
        </span>
        <button
          onClick={clear}
          disabled={isProcessing}
          style={{
            marginLeft: 8,
            padding: "2px 8px",
            fontSize: "0.75rem",
          }}
        >
          Remove
        </button>
      </div>

      {isProcessing && (
        <ProgressBar stage={current.stage} progress={current.progress} />
      )}

      <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: 4 }}>
        {statusLabel(current)}
        {current.error && `: ${current.error}`}
      </div>

      {!isProcessing && (
        <button
          onClick={handleProcess}
          style={{ marginTop: 8, width: "100%" }}
        >
          {current.status === "done" ? "Re-run" : "Process"}
        </button>
      )}

      {isProcessing && (
        <button onClick={handleCancel} style={{ marginTop: 8, width: "100%" }}>
          Cancel
        </button>
      )}
    </div>
  );
}
