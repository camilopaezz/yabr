import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  type MouseEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useState,
} from "react";
import copyIcon from "../assets/icons/titlebar/copy.svg?raw";
import minusIcon from "../assets/icons/titlebar/minus.svg?raw";
// Vendored Lucide SVGs (ISC) — see src/assets/icons/titlebar/README.md
import settingsIcon from "../assets/icons/titlebar/settings.svg?raw";
import squareIcon from "../assets/icons/titlebar/square.svg?raw";
import xIcon from "../assets/icons/titlebar/x.svg?raw";
import { epLabel } from "../lib/epLabel";
import { InlineSvg } from "./InlineSvg";

export type TitleBarProps = {
  ep: string | null;
  onOpenSettings: () => void;
  settingsButtonRef?: Ref<HTMLButtonElement>;
};

async function withWindow(
  fn: (win: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) {
  try {
    await fn(getCurrentWindow());
  } catch (err) {
    console.error("window control failed", err);
  }
}

export function TitleBar({
  ep,
  onOpenSettings,
  settingsButtonRef,
}: TitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  const refreshMaximized = useCallback(async () => {
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      // Browser / e2e without window plugin.
    }
  }, []);

  useEffect(() => {
    void refreshMaximized();
    let unlisten: (() => void) | undefined;
    getCurrentWindow()
      .onResized(() => {
        void refreshMaximized();
      })
      .then((fn) => {
        unlisten = fn;
      })
      .catch(() => {});
    return () => unlisten?.();
  }, [refreshMaximized]);

  const onDragMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    void withWindow((win) => win.startDragging());
  };

  const onDragDoubleClick = (e: MouseEvent) => {
    // Buttons only stop mousedown/click; ignore dblclick so maximize does not race.
    if ((e.target as HTMLElement).closest("button")) return;
    void withWindow(async (win) => {
      await win.toggleMaximize();
      setMaximized(await win.isMaximized());
    });
  };

  return (
    <header
      className="titlebar"
      onMouseDown={onDragMouseDown}
      onDoubleClick={onDragDoubleClick}
    >
      <div className="titlebar-left" data-tauri-drag-region>
        <span className="app-title" data-tauri-drag-region>
          yabr
        </span>
        <span
          className="ep-chip"
          title={ep ?? undefined}
          data-tauri-drag-region
        >
          {epLabel(ep)}
        </span>
      </div>

      <div className="titlebar-drag" data-tauri-drag-region aria-hidden />

      <div className="titlebar-right">
        <button
          ref={settingsButtonRef}
          type="button"
          className="btn-icon"
          aria-label="Settings"
          title="Settings"
          onClick={onOpenSettings}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <InlineSvg
            svg={settingsIcon}
            className="titlebar-icon-wrap"
            aria-hidden
          />
        </button>
        <WindowButton
          label="Minimize"
          onClick={() => void withWindow((win) => win.minimize())}
        >
          <InlineSvg
            svg={minusIcon}
            className="titlebar-icon-wrap"
            aria-hidden
          />
        </WindowButton>
        <WindowButton
          label={maximized ? "Restore" : "Maximize"}
          onClick={() =>
            void withWindow(async (win) => {
              await win.toggleMaximize();
              setMaximized(await win.isMaximized());
            })
          }
        >
          <InlineSvg
            svg={maximized ? copyIcon : squareIcon}
            className="titlebar-icon-wrap"
            aria-hidden
          />
        </WindowButton>
        <WindowButton
          label="Close"
          className="titlebar-close"
          onClick={() => void withWindow((win) => win.close())}
        >
          <InlineSvg svg={xIcon} className="titlebar-icon-wrap" aria-hidden />
        </WindowButton>
      </div>
    </header>
  );
}

function WindowButton({
  label,
  onClick,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn-icon titlebar-winbtn${className ? ` ${className}` : ""}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  );
}
