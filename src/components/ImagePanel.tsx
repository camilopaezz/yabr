import { useState } from "react";
import { useImageStore, type ImageItem } from "../stores/imageStore";
import { ProgressBar } from "./ProgressBar";
import {
  cancelProcess,
  clearCurrent,
  prodCancelDeps,
  prodStartProcessDeps,
  startProcess,
} from "../lib/currentImage";

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
  const [starting, setStarting] = useState(false);

  if (!current) {
    return (
      <p style={{ textAlign: "center", opacity: 0.6 }}>
        No image yet. Drop one above to get started.
      </p>
    );
  }

  const isProcessing = current.status === "processing";
  const busy = isProcessing || starting;

  const handleProcess = async () => {
    if (busy) return;
    setStarting(true);
    try {
      await startProcess(prodStartProcessDeps());
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = () => {
    cancelProcess(prodCancelDeps());
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
          onClick={() => clearCurrent()}
          disabled={busy}
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

      {!busy && (
        <button
          onClick={() => void handleProcess()}
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
