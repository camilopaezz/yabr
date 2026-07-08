import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";

type DragDropPayload = {
  paths: string[];
};

export type TauriFileDropState = {
  isDragging: boolean;
  paths: string[] | null;
};

export function useTauriFileDrop(): TauriFileDropState {
  const [isDragging, setIsDragging] = useState(false);
  const [paths, setPaths] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unsubs: (() => void)[] = [];

    const setup = async () => {
      const dragOverUnsub = await listen("tauri://drag-over", () => {
        if (!cancelled) setIsDragging(true);
      });
      const dragLeaveUnsub = await listen("tauri://drag-leave", () => {
        if (!cancelled) setIsDragging(false);
      });
      const dragDropUnsub = await listen<DragDropPayload>(
        "tauri://drag-drop",
        (event) => {
          if (cancelled) return;
          setIsDragging(false);
          setPaths(event.payload.paths);
        },
      );
      unsubs.push(dragOverUnsub, dragLeaveUnsub, dragDropUnsub);
    };

    setup();

    if (import.meta.env.DEV && import.meta.env.VITE_E2E === "1") {
      window.__yabrInjectDrop = (paths: string[]) => {
        setPaths(paths);
      };
    }

    return () => {
      cancelled = true;
      unsubs.forEach((unsub) => unsub());
    };
  }, []);

  return { isDragging, paths };
}
