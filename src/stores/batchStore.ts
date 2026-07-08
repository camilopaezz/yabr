import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";

export type BatchStatus = "queued" | "processing" | "done" | "error" | "cancelled";

export type BatchItem = {
  id: string;
  inputPath: string;
  outputPath: string | null;
  status: BatchStatus;
  progress: number;
  stage: string | null;
  error: string | null;
};

export type BatchState = {
  items: BatchItem[];
};

export type BatchActions = {
  addItem: (item: BatchItem) => void;
  updateItem: (id: string, patch: Partial<BatchItem>) => void;
  removeItem: (id: string) => void;
  clear: () => void;
  markAllCancelled: () => void;
};

export const batchStore = createStore<BatchState & BatchActions>((set) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  updateItem: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  clear: () => set({ items: [] }),
  markAllCancelled: () =>
    set((state) => ({
      items: state.items.map((item) =>
        item.status === "queued" || item.status === "processing"
          ? { ...item, status: "cancelled", stage: null, error: null }
          : item,
      ),
    })),
}));

export function useBatchStore(): BatchState & BatchActions;
export function useBatchStore<T>(selector: (state: BatchState & BatchActions) => T): T;
export function useBatchStore<T>(
  selector?: (state: BatchState & BatchActions) => T,
): (BatchState & BatchActions) | T {
  return useStore(
    batchStore,
    selector ?? ((state) => state as unknown as T),
  );
}
