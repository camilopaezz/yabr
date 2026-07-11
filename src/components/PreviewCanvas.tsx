import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { readFile } from "@tauri-apps/plugin-fs";

export type PreviewCanvasProps = {
  inputPath: string | null;
  outputPath: string | null;
  /** When true, show comparison slider (typically status === "done"). */
  canCompare?: boolean;
  isDragging?: boolean;
};

async function loadImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const bytes = await readFile(path);
  const blob = new Blob([bytes], { type: "image/png" });
  return URL.createObjectURL(blob);
}

/**
 * Load a path into a blob URL. Keeps the previous URL visible until the next
 * one is ready, then revokes the prior URL (avoids broken-image flicker).
 */
function useObjectUrl(path: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  const displayedRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!path) {
      if (displayedRef.current) {
        URL.revokeObjectURL(displayedRef.current);
        displayedRef.current = null;
      }
      setUrl(null);
      return;
    }

    loadImageUrl(path)
      .then((next) => {
        if (cancelled) {
          if (next) URL.revokeObjectURL(next);
          return;
        }
        const prev = displayedRef.current;
        displayedRef.current = next;
        setUrl(next);
        if (prev && prev !== next) URL.revokeObjectURL(prev);
      })
      .catch(() => {
        // Keep previous image if reload fails.
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    return () => {
      if (displayedRef.current) {
        URL.revokeObjectURL(displayedRef.current);
        displayedRef.current = null;
      }
    };
  }, []);

  return url;
}

type CompareSliderProps = {
  inputUrl: string;
  outputUrl: string;
};

function CompareSlider({ inputUrl, outputUrl }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  // Keep drag state in a ref so pointermove does not re-bind listeners.
  const draggingRef = useRef(false);
  const positionRef = useRef(50);

  const setPositionBoth = useCallback((pct: number) => {
    const next = Math.max(0, Math.min(100, pct));
    positionRef.current = next;
    setPosition(next);
  }, []);

  const updateFromClientX = useCallback(
    (clientX: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      setPositionBoth(((clientX - rect.left) / rect.width) * 100);
    },
    [setPositionBoth],
  );

  useEffect(() => {
    const endDrag = () => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("is-slider-dragging");
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      updateFromClientX(e.clientX);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      document.body.classList.remove("is-slider-dragging");
    };
  }, [updateFromClientX]);

  const onPointerDown = (e: ReactPointerEvent) => {
    // Prevent native image/text selection while scrubbing.
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = true;
    document.body.classList.add("is-slider-dragging");
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some environments reject capture; window listeners still work.
    }
    updateFromClientX(e.clientX);
  };

  // clip-path reveals left `position`% of the before image — no pixel measure / resize thrash.
  const beforeClip = `inset(0 ${100 - position}% 0 0)`;

  return (
    <div
      ref={containerRef}
      className="compare-slider"
      onPointerDown={onPointerDown}
      role="slider"
      aria-label="Before and after comparison"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPositionBoth(positionRef.current - 2);
        if (e.key === "ArrowRight") setPositionBoth(positionRef.current + 2);
      }}
    >
      <img
        className="compare-img compare-img-after"
        src={outputUrl}
        alt=""
        draggable={false}
      />
      <img
        className="compare-img compare-img-before"
        src={inputUrl}
        alt=""
        draggable={false}
        style={{ clipPath: beforeClip }}
      />
      <div className="compare-handle" style={{ left: `${position}%` }} aria-hidden>
        <span className="compare-handle-knob" />
      </div>
      <div className="compare-labels" aria-hidden>
        <span>Before</span>
        <span>After</span>
      </div>
    </div>
  );
}

export function PreviewCanvas({
  inputPath,
  outputPath,
  canCompare = false,
  isDragging = false,
}: PreviewCanvasProps) {
  const inputUrl = useObjectUrl(inputPath);
  const outputUrl = useObjectUrl(canCompare ? outputPath : null);
  const showCompare = Boolean(canCompare && inputPath && outputPath && inputUrl && outputUrl);

  if (!inputPath) {
    return (
      <div className={`preview-canvas${isDragging ? " is-dragging" : ""}`}>
        <div className="preview-empty">
          <p className="preview-empty-title">
            {isDragging ? "Drop image here" : "Drop an image here"}
          </p>
          <p className="preview-empty-formats">PNG, JPG, WEBP, BMP</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`preview-canvas${isDragging ? " is-dragging" : ""}`}>
      <div className="preview-stage">
        {showCompare ? (
          <CompareSlider inputUrl={inputUrl!} outputUrl={outputUrl!} />
        ) : inputUrl ? (
          <div className="preview-image-frame">
            <img src={inputUrl} alt="Input" draggable={false} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
