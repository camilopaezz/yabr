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
    <div className="mode-selector">
      <h3 className="app-rail-section-title">Quality mode</h3>
      {models.map((model) => {
        const available = model.bundled || model.downloaded;
        return (
          <label
            key={model.id}
            className="mode-option"
            title={`${model.name} — ${model.input_size}px`}
          >
            <input
              type="radio"
              name="mode"
              value={model.id}
              checked={mode === model.id}
              onChange={() => handleSelect(model)}
            />
            <span className="mode-option-name">{model.name}</span>
            <span className="mode-option-badge">
              {available ? "Available" : "Download"}
            </span>
          </label>
        );
      })}

      {downloading && (
        <div className="download-modal-backdrop">
          <div className="download-modal-card">
            <h3>Downloading {downloading.name}</h3>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <div className="download-modal-pct">
              {Math.round(downloadProgress)}%
            </div>
            <button type="button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
