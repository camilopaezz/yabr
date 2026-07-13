import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

export async function withWindow(
  fn: (win: ReturnType<typeof getCurrentWindow>) => Promise<void>,
) {
  try {
    await fn(getCurrentWindow());
  } catch (err) {
    console.error("window control failed", err);
  }
}

export function onWindowDragMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  if ((e.target as HTMLElement).closest("button")) return;
  void withWindow((win) => win.startDragging());
}

export function onWindowDragDoubleClick(
  e: MouseEvent,
  onMaximizedChange?: (maximized: boolean) => void,
) {
  if ((e.target as HTMLElement).closest("button")) return;
  void withWindow(async (win) => {
    await win.toggleMaximize();
    if (onMaximizedChange) {
      onMaximizedChange(await win.isMaximized());
    }
  });
}