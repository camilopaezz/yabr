import { useEffect, useRef, useState } from "react";
import appLogoSvg from "./assets/app-logo.svg?raw";
import { AppNotice } from "./components/AppNotice";
import { FileBlock } from "./components/FileBlock";
import { ImagePanel } from "./components/ImagePanel";
import { InlineSvg } from "./components/InlineSvg";
import { ModeSelector } from "./components/ModeSelector";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { SettingsPanel } from "./components/SettingsPanel";
import { TitleBar } from "./components/TitleBar";
import {
  acceptDrop,
  initCurrentImageListeners,
  syncOutputPath,
} from "./lib/currentImage";
import {
  formatFirstRunGpuDegradeNotice,
  formatModelsUnavailableNotice,
  formatUpdateAvailableNotice,
} from "./lib/errorCopy";
import { FALLBACK_DEFAULT_MODE, PREFERRED_DEFAULT_MODE } from "./lib/models";
import { showAppErrorNotice, showAppNotice } from "./lib/showAppErrorNotice";
import {
  invokeDetectGpu,
  invokeGetConfig,
  invokeListModels,
  invokeRunBenchmark,
} from "./lib/tauri";
import { applyTheme, persistTheme } from "./lib/theme";
import { checkForUpdate, STARTUP_UPDATE_CHECK_DELAY_MS } from "./lib/updater";
import { useAnimatedPresence } from "./lib/useAnimatedPresence";
import { useKeyboardShortcuts } from "./lib/useKeyboardShortcuts";
import { useTauriFileDrop } from "./lib/useTauriFileDrop";
import {
  onWindowDragDoubleClick,
  onWindowDragMouseDown,
} from "./lib/windowControls";
import { useImageStore } from "./stores/imageStore";
import { settingsStore, useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import "./App.css";

function App() {
  const [settingsVisible, setSettingsVisible] = useState(false);
  const settingsPresence = useAnimatedPresence(settingsVisible);
  const [ready, setReady] = useState(false);
  const [firstRun, setFirstRun] = useState(false);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const settingsCloseRef = useRef<HTMLButtonElement>(null);
  const current = useImageStore((state) => state.current);
  const ep = useSettingsStore((state) => state.ep);
  const mode = useSettingsStore((state) => state.mode);
  const outputDir = useSettingsStore((state) => state.outputDir);
  const theme = useSettingsStore((state) => state.theme);
  const modalBlocksShortcuts = useUiStore(
    (state) => state.modalBlocksShortcuts,
  );
  const notice = useUiStore((state) => state.notice);
  const { isDragging, paths } = useTauriFileDrop();
  const lastProcessedRef = useRef<string[] | null>(null);
  const themeSyncedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    initCurrentImageListeners().then((unsub) => {
      if (cancelled) {
        unsub();
      } else {
        unsubscribe = unsub;
      }
    });

    const initialize = async () => {
      try {
        const config = await invokeGetConfig();
        if (cancelled) return;
        settingsStore.setState({
          ep: config.execution_provider,
          outputDir: config.output_dir,
        });
        if (!config.execution_provider) {
          setFirstRun(true);
          const gpuInfo = await invokeDetectGpu();
          if (cancelled) return;
          settingsStore.setState({ gpuInfo });
          await invokeRunBenchmark();
          if (cancelled) return;
          const updated = await invokeGetConfig();
          if (cancelled) return;
          settingsStore.setState({ ep: updated.execution_provider });
          // EP work is done; drop the acceleration copy before mode reconcile.
          if (!cancelled) setFirstRun(false);
        }
      } catch (err) {
        console.error("first-run initialization failed", err);
        if (!cancelled) {
          settingsStore.setState({ ep: "cpu" });
          setFirstRun(false);
          showAppErrorNotice(err, {
            severity: "warning",
            copy: formatFirstRunGpuDegradeNotice(),
            code: "first_run_gpu",
          });
        }
      }

      // Single list_models for cold start: catalog + mode for ModeSelector / Process.
      // Uses the generic !ready blocker (not the first-run acceleration message).
      try {
        const models = await invokeListModels();
        if (!cancelled) {
          // Seed preferred mode before catalog reconcile so resolveMode can
          // pick Balanced when ready, else Turbo.
          settingsStore.setState({ mode: PREFERRED_DEFAULT_MODE });
          settingsStore.getState().applyModels(models);
        }
      } catch (err) {
        console.error("failed to list models during init", err);
        if (!cancelled) {
          settingsStore.setState({ mode: FALLBACK_DEFAULT_MODE, models: [] });
          showAppErrorNotice(err, {
            severity: "warning",
            copy: formatModelsUnavailableNotice(),
            code: "first_run_models",
          });
        }
      }

      if (!cancelled) {
        setReady(true);
      }
    };

    initialize();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  // Window-level drop acceptance (highlight is preview-only via isDragging).
  useEffect(() => {
    if (!paths || paths.length === 0) return;
    if (lastProcessedRef.current === paths) return;
    lastProcessedRef.current = paths;
    acceptDrop(paths, { mode, outputDir });
  }, [paths, outputDir, mode]);

  useEffect(() => {
    syncOutputPath({ mode, outputDir });
  }, [mode, outputDir]);

  // Keep the DOM + localStorage in sync with the theme store. `main.tsx`
  // applies and reads the initial value pre-paint; skip the first run here.
  useEffect(() => {
    applyTheme(theme);
    if (!themeSyncedRef.current) {
      themeSyncedRef.current = true;
      return;
    }
    persistTheme(theme);
  }, [theme]);

  // Silent signed-updater check after cold start (stable channel only).
  // Failures stay in the console — no error banner on startup.
  useEffect(() => {
    if (!ready) return;

    let cancelled = false;
    let heldUpdate: { close: () => Promise<void> } | null = null;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const result = await checkForUpdate();
          if (cancelled) {
            if (result.status === "available") {
              await result.update.close().catch(() => undefined);
            }
            return;
          }
          if (result.status !== "available") return;
          heldUpdate = result.update;
          showAppNotice(
            formatUpdateAvailableNotice(result.info.version),
            "info",
            "update_available",
          );
          // Notice is dismiss-only; Settings owns install. Close the resource
          // so a later Settings check opens a fresh one.
          await result.update.close().catch(() => undefined);
          heldUpdate = null;
        } catch (err) {
          if (!cancelled) {
            console.error("startup update check failed", err);
          }
        }
      })();
    }, STARTUP_UPDATE_CHECK_DELAY_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void heldUpdate?.close().catch(() => undefined);
    };
  }, [ready]);

  const settingsWasOpenRef = useRef(settingsPresence.open);

  useKeyboardShortcuts({
    ready,
    firstRun,
    // Block until exit animation unmounts, not only while `open` is true.
    settingsOpen: settingsPresence.rendered,
    modalBlocksShortcuts,
  });

  useEffect(() => {
    const wasOpen = settingsWasOpenRef.current;
    settingsWasOpenRef.current = settingsPresence.open;

    if (!settingsPresence.open) {
      if (wasOpen) {
        settingsButtonRef.current?.focus();
      }
      return;
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsVisible(false);
    };
    window.addEventListener("keydown", onKey);
    settingsCloseRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [settingsPresence.open]);

  // Frameless window: always mount TitleBar so drag/close work during first-run
  // and cold-start. Blocker overlays content only (CSS leaves titlebar free).
  const canCompare =
    current?.status === "done" &&
    Boolean(current.inputPath && current.outputPath);

  return (
    <div className={`app-shell${notice ? " has-notice" : ""}`}>
      <TitleBar
        ep={ep}
        settingsButtonRef={settingsButtonRef}
        onOpenSettings={() => setSettingsVisible(true)}
      />

      <AppNotice />

      {/* U14: first-run acceleration detector only — not a generic cold-start splash. */}
      {firstRun && (
        <div className="fullscreen-blocker" role="status">
          Detecting best acceleration…
        </div>
      )}

      {!ready && !firstRun && (
        <div
          className="fullscreen-blocker"
          role="status"
          aria-busy="true"
          aria-label="Loading models"
        >
          Loading models…
        </div>
      )}

      {!ready && (
        <aside
          className="app-rail app-rail--placeholder"
          aria-hidden
          data-tauri-drag-region
          onMouseDown={onWindowDragMouseDown}
          onDoubleClick={onWindowDragDoubleClick}
        />
      )}

      {ready && (
        <>
          <aside className="app-rail">
            <div
              className="app-rail-brand"
              data-tauri-drag-region
              onMouseDown={onWindowDragMouseDown}
              onDoubleClick={onWindowDragDoubleClick}
            >
              <InlineSvg svg={appLogoSvg} role="img" aria-label="SwiftMask" />
            </div>

            {/* Scrollable controls; footer stays pinned so Process/Cancel survive short tiles. */}
            <div className="app-rail-scroll">
              <div className="app-rail-section">
                <FileBlock />
              </div>

              <div className="app-rail-section">
                <ModeSelector />
              </div>
            </div>

            <div className="app-rail-footer">
              <ImagePanel />
            </div>
          </aside>

          <section className="app-preview" aria-label="Preview">
            <PreviewCanvas
              inputPath={current?.inputPath ?? null}
              outputPath={current?.outputPath ?? null}
              canCompare={canCompare}
              isDragging={isDragging}
            />
          </section>

          {settingsPresence.rendered && (
            <div
              className={`modal-backdrop${settingsPresence.open ? " is-open" : ""}`}
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget) setSettingsVisible(false);
              }}
            >
              <div
                className={`modal-card${settingsPresence.open ? " is-open" : ""}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="settings-title"
              >
                <div className="modal-header">
                  <h2 id="settings-title">Settings</h2>
                  <button
                    ref={settingsCloseRef}
                    type="button"
                    className="modal-close"
                    aria-label="Close settings"
                    onClick={() => setSettingsVisible(false)}
                  >
                    ✕
                  </button>
                </div>
                <SettingsPanel visible={settingsPresence.open} />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default App;
