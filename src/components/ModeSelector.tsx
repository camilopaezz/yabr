import { useEffect, useRef, useState } from "react";
import { isDownloadCancelled } from "../lib/downloadCancel";
import {
  FALLBACK_DEFAULT_MODE,
  isModelReady,
  type ModelMeta,
  type ModelMode,
  resolveMode,
} from "../lib/models";
import {
  NC_LICENSE_MODAL_COPY,
  needsNcLicenseAck,
  setNcLicenseAck,
  shouldShowNcBadge,
} from "../lib/ncLicense";
import {
  invokeCancelDownload,
  invokeDownloadModel,
  invokeListModels,
  listenModelDownload,
} from "../lib/tauri";
import { useAnimatedPresence } from "../lib/useAnimatedPresence";
import { settingsStore, useSettingsStore } from "../stores/settingsStore";
import { uiStore } from "../stores/uiStore";

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
  const [cancelling, setCancelling] = useState(false);
  const cancellingRef = useRef(false);
  const [ncAckModel, setNcAckModel] = useState<ModelMeta | null>(null);
  /** Bumped only when a new download starts; invalidates stale in-flight work. */
  const downloadSessionRef = useRef(0);
  const downloadPresence = useAnimatedPresence(Boolean(downloading));
  const ncAckPresence = useAnimatedPresence(Boolean(ncAckModel));

  useEffect(() => {
    uiStore
      .getState()
      .setModalBlocksShortcuts(
        ncAckPresence.rendered || downloadPresence.rendered,
      );
    return () => uiStore.getState().setModalBlocksShortcuts(false);
  }, [ncAckPresence.rendered, downloadPresence.rendered]);

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
    const session = downloadSessionRef.current;
    const isCurrentSession = () => downloadSessionRef.current === session;

    // Subscribe first, then start the transfer. Starting both in parallel can
    // miss early progress/verify events (worse on slower Windows WebView2 IPC).
    void (async () => {
      try {
        const unsub = await listenModelDownload((payload) => {
          if (payload.model_id !== modelId) return;
          if (!isCurrentSession()) return;
          if (cancellingRef.current) return;
          setDownloadProgress(Math.max(0, Math.min(100, payload.pct)));
          setDownloadStage(payload.stage === "verify" ? "verify" : "download");
        });
        if (cleanedUp || !isCurrentSession()) {
          unsub();
          return;
        }
        unsubscribe = unsub;

        await invokeDownloadModel(modelId);
        if (!isCurrentSession()) return;

        // Close the modal as soon as the backend finishes — do not wait on
        // list_models (that left "Verifying" up while the badge already updated).
        setDownloading(null);

        setMode(modelMode);
        // Optimistic ready flag so the Download chip flips even if list is slow.
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, downloaded: true } : m)),
        );
        try {
          const list = await invokeListModels();
          // Session still current means user did not cancel/re-start mid-refresh.
          if (isCurrentSession()) {
            applyModels(list);
          }
        } catch (err: unknown) {
          console.error("failed to refresh models", err);
        }
      } catch (err: unknown) {
        if (!isDownloadCancelled(err)) {
          console.error("download failed", err);
        }
        if (isCurrentSession() && !cancellingRef.current) {
          setDownloading(null);
        }
      }
    })();

    return () => {
      cleanedUp = true;
      unsubscribe?.();
    };
  }, [downloading, setMode]);

  const beginDownload = (model: ModelMeta) => {
    downloadSessionRef.current += 1;
    cancellingRef.current = false;
    setCancelling(false);
    setDownloadProgress(0);
    setDownloadStage("download");
    setDownloading(model);
  };

  const startDownload = (model: ModelMeta) => {
    if (downloading || isModelReady(model)) return;
    if (needsNcLicenseAck(model)) {
      setNcAckModel(model);
      return;
    }
    beginDownload(model);
  };

  const handleNcAckAccept = () => {
    if (!ncAckModel) return;
    setNcLicenseAck();
    const model = ncAckModel;
    setNcAckModel(null);
    beginDownload(model);
  };

  const handleNcAckCancel = () => {
    setNcAckModel(null);
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
    if (cancellingRef.current) return;
    cancellingRef.current = true;
    setCancelling(true);
    // Capture session so a newer beginDownload does not get cleared / reconciled
    // by this cancel's finally (list_models can outlive a re-start).
    const session = downloadSessionRef.current;
    void (async () => {
      try {
        await invokeCancelDownload();
      } catch (err: unknown) {
        console.error("failed to cancel download", err);
      } finally {
        if (downloadSessionRef.current !== session) {
          return;
        }
        cancellingRef.current = false;
        setCancelling(false);
        setDownloading(null);
        try {
          const list = await invokeListModels();
          if (downloadSessionRef.current === session) {
            applyModels(list);
          }
        } catch (listErr: unknown) {
          console.error("failed to refresh models", listErr);
        }
      }
    })();
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
              <span className="mode-option-badges">
                {shouldShowNcBadge(model) ? (
                  <span className="mode-option-badge mode-option-nc">
                    Non-commercial
                  </span>
                ) : null}
                <span className="mode-option-badge mode-option-model">
                  {model.id}
                </span>
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

      {ncAckPresence.rendered && ncAckModel && (
        <div
          className={`nc-license-modal-backdrop${ncAckPresence.open ? " is-open" : ""}`}
        >
          <div
            className={`nc-license-modal-card${ncAckPresence.open ? " is-open" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="nc-license-modal-title"
          >
            <h3 id="nc-license-modal-title">{NC_LICENSE_MODAL_COPY.title}</h3>
            <p className="nc-license-modal-summary">
              {NC_LICENSE_MODAL_COPY.summary}
            </p>
            <p className="nc-license-modal-hint">
              {NC_LICENSE_MODAL_COPY.commercialHint}
            </p>
            <p className="nc-license-modal-license">
              <a
                href={NC_LICENSE_MODAL_COPY.licenseUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                {NC_LICENSE_MODAL_COPY.licenseLabel}
              </a>
            </p>
            <div className="nc-license-modal-actions">
              <button type="button" onClick={handleNcAckCancel}>
                {NC_LICENSE_MODAL_COPY.cancelLabel}
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleNcAckAccept}
              >
                {NC_LICENSE_MODAL_COPY.acceptLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {downloadPresence.rendered && displayModel && (
        <div
          className={`download-modal-backdrop${downloadPresence.open ? " is-open" : ""}`}
        >
          <div
            className={`download-modal-card${downloadPresence.open ? " is-open" : ""}`}
          >
            <h3>
              {cancelling
                ? `Cancelling ${displayModel.name}…`
                : downloadStage === "verify"
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
              {cancelling
                ? "Cancelling…"
                : downloadStage === "verify"
                  ? "Verifying…"
                  : `${Math.round(downloadProgress)}%`}
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
