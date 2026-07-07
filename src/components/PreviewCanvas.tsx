import { useEffect, useRef, useState } from "react";
import { readFile } from "@tauri-apps/plugin-fs";

export type PreviewCanvasProps = {
  inputPath: string | null;
  outputPath: string | null;
};

async function loadImageUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const bytes = await readFile(path);
  const blob = new Blob([bytes], { type: "image/png" });
  return URL.createObjectURL(blob);
}

function drawImageToCanvas(
  canvas: HTMLCanvasElement,
  url: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context not available"));
        return;
      }
      const maxWidth = canvas.clientWidth || img.width;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function PreviewCanvas({ inputPath, outputPath }: PreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showOutput, setShowOutput] = useState(true);
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;

    const render = async () => {
      const path = showOutput ? outputPath ?? inputPath : inputPath;
      if (!path) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        return;
      }

      try {
        const url = await loadImageUrl(path);
        if (!url || cancelled) {
          if (url) URL.revokeObjectURL(url);
          return;
        }
        objectUrlsRef.current.push(url);
        await drawImageToCanvas(canvas, url);
      } catch {
        // noop
      }
    };

    render();

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      objectUrlsRef.current = [];
    };
  }, [inputPath, outputPath, showOutput]);

  const canToggle = inputPath && outputPath;

  return (
    <div style={{ width: "100%" }}>
      <canvas
        ref={canvasRef}
        onClick={() => canToggle && setShowOutput((prev) => !prev)}
        style={{
          width: "100%",
          maxHeight: 360,
          borderRadius: 8,
          border: "1px solid rgba(128, 128, 128, 0.3)",
          cursor: canToggle ? "pointer" : "default",
          backgroundImage:
            "linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
          backgroundColor: "#fff",
        }}
      />
      {canToggle && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: "0.8rem",
            textAlign: "center",
            opacity: 0.7,
          }}
        >
          {showOutput ? "Showing result (click for original)" : "Showing original (click for result)"}
        </p>
      )}
    </div>
  );
}
