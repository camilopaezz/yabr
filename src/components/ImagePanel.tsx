import { useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useImageStore, type ImageItem } from "../stores/imageStore";
import { ProgressBar } from "./ProgressBar";
import {
  cancelProcess,
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

  const isProcessing = current?.status === "processing";
  const busy = Boolean(isProcessing || starting);
  const hasImage = Boolean(current);
  const isDone = current?.status === "done";
  const canShowInFolder = isDone && Boolean(current?.outputPath);

  const handleProcess = async () => {
    if (busy || !current) return;
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

  const handleShowInFolder = async () => {
    if (!current?.outputPath) return;
    try {
      await revealItemInDir(current.outputPath);
    } catch (err) {
      console.error("reveal in folder failed", err);
    }
  };

  // While processing, ProgressBar already shows stage + % — skip duplicate status line.
  const statusText = !current
    ? "No image selected"
    : isProcessing
      ? null
      : `${statusLabel(current)}${current.error ? `: ${current.error}` : ""}`;

  return (
    <div className="image-panel">
      {current && isProcessing && (
        <ProgressBar stage={current.stage} progress={current.progress} />
      )}

      {statusText !== null && (
        <div
          className={`image-panel-status${current?.status === "error" ? " is-error" : ""}`}
        >
          {statusText}
        </div>
      )}

      <div className="image-panel-actions">
        {canShowInFolder && !isProcessing && (
          <button type="button" onClick={() => void handleShowInFolder()}>
            Show in folder
          </button>
        )}

        {/* Always mount Process when idle so it stays visible (disabled if no image). */}
        {!isProcessing ? (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleProcess()}
            disabled={!hasImage || starting}
            aria-disabled={!hasImage || starting}
          >
            {starting ? "Starting…" : isDone ? "Re-run" : "Process"}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={handleCancel}>
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
