import { useEffect, useRef, useState } from "react";
import {
  FALLBACK_DEFAULT_MODE,
  isModelReady,
  type ModelMeta,
  type ModelMode,
  resolveMode,
} from "../lib/models";
import {
  invokeDownloadModel,
  invokeListModels,
  listenModelDownload,
} from "../lib/tauri";
import { useAnimatedPresence } from "../lib/useAnimatedPresence";
import { settingsStore, useSettingsStore } from "../stores/settingsStore";

export function ModeSelector() {
  const mode = useSettingsStore((state) => state.mode);
  const setMode = useSettingsStore((state) => state.setMode);
  const [models, setModels] = useState<ModelMeta[]>([]);
  const [downloading, setDownloading] = useState<ModelMeta | null>(null);
  const [displayModel, setDisplayModel] = useState<ModelMeta | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState<"download" | "verify">(
    "download",
  );
  const isCancelledRef = useRef(false);
  const downloadPresence = useAnimatedPresence(Boolean(downloading));

  useEffect(() => {
    if (downloading) {
      setDisplayModel(downloading);
    }
  }, [downloading]);

  useEffect(() => {
    if (!downloadPresence.rendered) {
      setDisplayModel(null);
      // Reset progress only after exit animation so the modal does not flash
      // back to an empty "Downloading 0%" state on completion.
      setDownloadProgress(0);
      setDownloadStage("download");
    }
  }, [downloadPresence.rendered]);

  const applyModels = (list: ModelMeta[]) => {
    setModels(list);
    const current = settingsStore.getState().mode;
    const next = resolveMode(current, list);
    if (next !== current) {
      setMode(next);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only reconcile
  useEffect(() => {
    invokeListModels()
      .then(applyModels)
      .catch((err: unknown) => {
        console.error("failed to list models", err);
        // Catalog unavailable: force bundled Turbo so Process cannot target a
        // preferred-but-unverified model.
        setMode(FALLBACK_DEFAULT_MODE);
      });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: download session keyed by model
  useEffect(() => {
    if (!downloading) return;

    let unsubscribe: (() => void) | undefined;
    let cleanedUp = false;
    const modelId = downloading.id;
    const modelMode = downloading.id as ModelMode;

    // Subscribe first, then start the transfer. Starting both in parallel can
    // miss early progress/verify events (worse on slower Windows WebView2 IPC).
    void (async () => {
      try {
        const unsub = await listenModelDownload((payload) => {
          if (payload.model_id !== modelId) return;
          setDownloadProgress(Math.max(0, Math.min(100, payload.pct)));
          setDownloadStage(payload.stage === "verify" ? "verify" : "download");
        });
        if (cleanedUp) {
          unsub();
          return;
        }
        unsubscribe = unsub;

        await invokeDownloadModel(modelId);
        if (!cleanedUp && !isCancelledRef.current) {
          setMode(modelMode);
        }
        try {
          const list = await invokeListModels();
          if (!cleanedUp) {
            applyModels(list);
          }
        } catch (err: unknown) {
          console.error("failed to refresh models", err);
        }
      } catch (err: unknown) {
        console.error("download failed", err);
      } finally {
        // Only clear if this session is still active. A cancelled/re-started
        // download must not wipe the newer session's UI (Windows double-start).
        if (!cleanedUp) {
          setDownloading(null);
          isCancelledRef.current = false;
        }
      }
    })();

    return () => {
      cleanedUp = true;
      unsubscribe?.();
    };
  }, [downloading, setMode]);

  const startDownload = (model: ModelMeta) => {
    if (downloading || isModelReady(model)) return;
    isCancelledRef.current = false;
    setDownloadProgress(0);
    setDownloadStage("download");
    setDownloading(model);
  };

  const handleSelect = (model: ModelMeta) => {
    if (downloading) return;
    if (isModelReady(model)) {
      setMode(model.id as ModelMode);
      return;
    }
    startDownload(model);
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    setDownloading(null);
    setDownloadProgress(0);
    setDownloadStage("download");
  };

  return (
    <div className="mode-selector">
      <h3 className="app-rail-section-title">Quality mode</h3>
      {models.map((model) => {
        const available = isModelReady(model);
        return (
          <label
            key={model.id}
            className={`mode-option${mode === model.id ? " is-selected" : ""}`}
            title={`${model.name} (${model.id}) — ${model.input_size}px`}
          >
            <input
              type="radio"
              name="mode"
              value={model.id}
              checked={mode === model.id}
              onChange={() => handleSelect(model)}
            />
            <span className="mode-option-name">{model.name}</span>
            {available ? (
              <span className="mode-option-badge mode-option-model">
                {model.id}
              </span>
            ) : (
              <button
                type="button"
                className="mode-option-badge mode-option-download"
                disabled={Boolean(downloading)}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startDownload(model);
                }}
              >
                Download
              </button>
            )}
          </label>
        );
      })}

      {downloadPresence.rendered && displayModel && (
        <div
          className={`download-modal-backdrop${downloadPresence.open ? " is-open" : ""}`}
        >
          <div
            className={`download-modal-card${downloadPresence.open ? " is-open" : ""}`}
          >
            <h3>
              {downloadStage === "verify"
                ? `Verifying ${displayModel.name}`
                : `Downloading ${displayModel.name}`}
            </h3>
            <div className="progress-bar-track">
              <div
                className="progress-bar-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <div className="download-modal-pct">
              {downloadStage === "verify"
                ? "Verifying…"
                : `${Math.round(downloadProgress)}%`}
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
