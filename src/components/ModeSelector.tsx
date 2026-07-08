import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "../stores/settingsStore";
import {
  invokeListModels,
  invokeDownloadModel,
  listenModelDownload,
  type ModelMeta,
  type ModelMode,
} from "../lib/tauri";

export function ModeSelector() {
  const mode = useSettingsStore((state) => state.mode);
  const setMode = useSettingsStore((state) => state.setMode);
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [downloading, setDownloading] = useState<ModelMeta | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const isCancelledRef = useRef(false);

  useEffect(() => {
    invokeListModels()
      .then(setModels)
      .catch((err: unknown) => console.error("failed to list models", err));
  }, []);

  useEffect(() => {
    if (!downloading) return;

    let unsubscribe: (() => void) | undefined;
    let cleanedUp = false;

    listenModelDownload((payload) => {
      if (payload.model_id === downloading.id) {
        setDownloadProgress(Math.max(0, Math.min(100, payload.pct)));
      }
    }).then((unsub) => {
      if (!cleanedUp) {
        unsubscribe = unsub;
      } else {
        unsub();
      }
    });

    invokeDownloadModel(downloading.id)
      .then(() => {
        if (!isCancelledRef.current) {
          setMode(downloading.id as ModelMode);
        }
        invokeListModels()
          .then(setModels)
          .catch((err: unknown) => console.error("failed to refresh models", err));
      })
      .catch((err: unknown) => {
        console.error("download failed", err);
      })
      .finally(() => {
        setDownloading(null);
        setDownloadProgress(0);
        isCancelledRef.current = false;
      });

    return () => {
      cleanedUp = true;
      unsubscribe?.();
    };
  }, [downloading, setMode]);

  const handleSelect = (model: ModelMeta) => {
    if (model.bundled || model.downloaded) {
      setMode(model.id as ModelMode);
      return;
    }
    isCancelledRef.current = false;
    setDownloadProgress(0);
    setDownloading(model);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setDownloading(null);
    setDownloadProgress(0);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <h3 style={{ margin: 0, fontSize: "1rem" }}>Quality mode</h3>
      {models.map((model) => {
        const available = model.bundled || model.downloaded;
        return (
          <label
            key={model.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: 8,
              borderRadius: 6,
              border: "1px solid rgba(128, 128, 128, 0.3)",
              opacity: available ? 1 : 0.7,
              cursor: "pointer",
            }}
            title={`${model.name} — ${model.input_size}px`}
          >
            <input
              type="radio"
              name="mode"
              value={model.id}
              checked={mode === model.id}
              onChange={() => handleSelect(model)}
            />
            <span style={{ flex: 1 }}>{model.name}</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>
              {available ? "Available" : "Download"}
            </span>
          </label>
        );
      })}

      {downloading && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            style={{
              width: 320,
              padding: 24,
              borderRadius: 12,
              background: "var(--bg, #fff)",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: "1rem" }}>
              Downloading {downloading.name}
            </h3>
            <div
              style={{
                width: "100%",
                height: 8,
                backgroundColor: "rgba(128, 128, 128, 0.2)",
                borderRadius: 4,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${downloadProgress}%`,
                  height: "100%",
                  backgroundColor: "#396cd8",
                  transition: "width 0.2s ease",
                }}
              />
            </div>
            <div
              style={{
                marginTop: 8,
                fontSize: "0.85rem",
                textAlign: "center",
              }}
            >
              {Math.round(downloadProgress)}%
            </div>
            <button
              type="button"
              onClick={handleCancel}
              style={{ marginTop: 16, width: "100%" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
